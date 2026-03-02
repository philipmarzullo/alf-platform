import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { resolveApiKey } from '../lib/resolveApiKey.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ──────────────────────────────────────────────
// Tenant limits cache (monthly usage enforcement)
// ──────────────────────────────────────────────

const tenantLimitsCache = new Map(); // tenantId → { maxCalls, isActive, fetchedAt }
const LIMITS_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getTenantLimits(supabase, tenantId) {
  const cached = tenantLimitsCache.get(tenantId);
  if (cached && Date.now() - cached.fetchedAt < LIMITS_CACHE_TTL) {
    return cached;
  }

  const { data, error } = await supabase
    .from('alf_tenants')
    .select('max_agent_calls_per_month, is_active')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    console.warn(`[claude] Tenant limits lookup failed for ${tenantId}:`, error?.message);
    return null;
  }

  const limits = {
    maxCalls: data.max_agent_calls_per_month,
    isActive: data.is_active,
    fetchedAt: Date.now(),
  };
  tenantLimitsCache.set(tenantId, limits);
  return limits;
}

/** Called by subscription.js on plan change to force re-fetch. */
export function invalidateTenantCache(tenantId) {
  tenantLimitsCache.delete(tenantId);
}

// Maps agent keys to departments for knowledge injection
const AGENT_DEPT_MAP = {
  hr: ['hr'],
  finance: ['finance'],
  purchasing: ['purchasing'],
  sales: ['sales'],
  ops: ['ops'],
  admin: ['admin', 'general'],
  qbu: ['general'],
  salesDeck: ['general'],
  actionPlan: ['ops', 'general'],
  analytics: ['ops', 'general'],
};

/**
 * Fetch operational data summaries from sf_* tables for the analytics agent.
 */
async function getOperationalContext(supabase, tenantId) {
  const sections = [];

  // Jobs summary
  const { data: jobs } = await supabase
    .from('sf_dim_job')
    .select('id, job_name, job_status, region, service_type, contract_value_monthly')
    .eq('tenant_id', tenantId);

  if (jobs?.length) {
    const active = jobs.filter(j => j.job_status === 'active');
    const totalContractValue = active.reduce((s, j) => s + (j.contract_value_monthly || 0), 0);
    const regions = [...new Set(active.map(j => j.region).filter(Boolean))];
    const serviceTypes = [...new Set(active.map(j => j.service_type).filter(Boolean))];

    sections.push(`## Jobs (${active.length} active / ${jobs.length} total)
Monthly contract value: $${totalContractValue.toLocaleString()}
Regions: ${regions.join(', ') || 'N/A'}
Service types: ${serviceTypes.join(', ') || 'N/A'}

Active jobs:
${active.map(j => `- ${j.job_name} | ${j.region || 'N/A'} | ${j.service_type || 'N/A'} | $${(j.contract_value_monthly || 0).toLocaleString()}/mo`).join('\n')}`);
  }

  // Employees summary
  const { data: employees } = await supabase
    .from('sf_dim_employee')
    .select('id, employment_status, department, job_title, hourly_rate')
    .eq('tenant_id', tenantId);

  if (employees?.length) {
    const active = employees.filter(e => e.employment_status === 'active');
    const byDept = {};
    for (const e of active) {
      const d = e.department || 'Unknown';
      byDept[d] = (byDept[d] || 0) + 1;
    }
    const avgRate = active.length > 0
      ? (active.reduce((s, e) => s + (e.hourly_rate || 0), 0) / active.length).toFixed(2)
      : 'N/A';

    sections.push(`## Employees (${active.length} active / ${employees.length} total)
Avg hourly rate: $${avgRate}
By department: ${Object.entries(byDept).map(([d, c]) => `${d}: ${c}`).join(', ')}`);
  }

  // Labor budget summary (recent months)
  const { data: labor } = await supabase
    .from('sf_fact_labor_budget_actual')
    .select('date_key, budget_hours, actual_hours, budget_cost, actual_cost, overtime_hours, overtime_cost')
    .eq('tenant_id', tenantId)
    .order('date_key', { ascending: false })
    .limit(200);

  if (labor?.length) {
    // Aggregate by month
    const byMonth = {};
    for (const r of labor) {
      const month = r.date_key?.slice(0, 7) || 'unknown';
      if (!byMonth[month]) byMonth[month] = { budget_hours: 0, actual_hours: 0, budget_cost: 0, actual_cost: 0, overtime_hours: 0, overtime_cost: 0 };
      byMonth[month].budget_hours += r.budget_hours || 0;
      byMonth[month].actual_hours += r.actual_hours || 0;
      byMonth[month].budget_cost += r.budget_cost || 0;
      byMonth[month].actual_cost += r.actual_cost || 0;
      byMonth[month].overtime_hours += r.overtime_hours || 0;
      byMonth[month].overtime_cost += r.overtime_cost || 0;
    }

    const months = Object.keys(byMonth).sort().reverse().slice(0, 6);
    sections.push(`## Labor Budget vs Actual (last ${months.length} months)
${months.map(m => {
  const d = byMonth[m];
  const variance = d.actual_cost - d.budget_cost;
  return `${m}: Budget $${d.budget_cost.toLocaleString()} / Actual $${d.actual_cost.toLocaleString()} (${variance >= 0 ? '+' : ''}$${variance.toLocaleString()}) | OT: ${d.overtime_hours.toFixed(0)} hrs ($${d.overtime_cost.toLocaleString()})`;
}).join('\n')}`);
  }

  // Timekeeping summary
  const { data: timekeeping } = await supabase
    .from('sf_fact_timekeeping')
    .select('date_key, regular_hours, overtime_hours, double_time_hours, total_hours, pay_type')
    .eq('tenant_id', tenantId)
    .order('date_key', { ascending: false })
    .limit(500);

  if (timekeeping?.length) {
    const totalRegular = timekeeping.reduce((s, r) => s + (r.regular_hours || 0), 0);
    const totalOT = timekeeping.reduce((s, r) => s + (r.overtime_hours || 0), 0);
    const totalDT = timekeeping.reduce((s, r) => s + (r.double_time_hours || 0), 0);
    const totalHours = timekeeping.reduce((s, r) => s + (r.total_hours || 0), 0);
    const otPct = totalHours > 0 ? ((totalOT / totalHours) * 100).toFixed(1) : '0';

    sections.push(`## Timekeeping Summary (${timekeeping.length} recent records)
Regular: ${totalRegular.toFixed(0)} hrs | OT: ${totalOT.toFixed(0)} hrs (${otPct}%) | DT: ${totalDT.toFixed(0)} hrs
Total: ${totalHours.toFixed(0)} hours`);
  }

  // Work tickets summary
  const { data: tickets } = await supabase
    .from('sf_fact_work_tickets')
    .select('ticket_status, priority, quality_score, category')
    .eq('tenant_id', tenantId);

  if (tickets?.length) {
    const byStatus = {};
    const byPriority = {};
    const byCategory = {};
    let totalScore = 0, scoreCount = 0;
    for (const t of tickets) {
      byStatus[t.ticket_status] = (byStatus[t.ticket_status] || 0) + 1;
      if (t.priority) byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      if (t.quality_score != null) { totalScore += t.quality_score; scoreCount++; }
    }
    const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : 'N/A';

    sections.push(`## Work Tickets (${tickets.length} total)
By status: ${Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(', ')}
By priority: ${Object.entries(byPriority).map(([p, c]) => `${p}: ${c}`).join(', ')}
Top categories: ${Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => `${c}: ${n}`).join(', ')}
Avg quality score: ${avgScore}`);
  }

  // Job daily summary
  const { data: daily } = await supabase
    .from('sf_fact_job_daily')
    .select('date_key, headcount, hours_worked, quality_score, safety_incidents, revenue, cost')
    .eq('tenant_id', tenantId)
    .order('date_key', { ascending: false })
    .limit(200);

  if (daily?.length) {
    const byMonth = {};
    for (const r of daily) {
      const month = r.date_key?.slice(0, 7) || 'unknown';
      if (!byMonth[month]) byMonth[month] = { headcount: 0, hours: 0, quality: 0, qualityN: 0, incidents: 0, revenue: 0, cost: 0, days: 0 };
      const m = byMonth[month];
      m.headcount += r.headcount || 0;
      m.hours += r.hours_worked || 0;
      if (r.quality_score != null) { m.quality += r.quality_score; m.qualityN++; }
      m.incidents += r.safety_incidents || 0;
      m.revenue += r.revenue || 0;
      m.cost += r.cost || 0;
      m.days++;
    }

    const months = Object.keys(byMonth).sort().reverse().slice(0, 4);
    sections.push(`## Job Daily Performance (last ${months.length} months)
${months.map(m => {
  const d = byMonth[m];
  const avgQ = d.qualityN > 0 ? (d.quality / d.qualityN).toFixed(1) : 'N/A';
  return `${m}: ${d.hours.toFixed(0)} hrs | Quality: ${avgQ} | Safety incidents: ${d.incidents} | Revenue: $${d.revenue.toLocaleString()} | Cost: $${d.cost.toLocaleString()}`;
}).join('\n')}`);
  }

  if (sections.length === 0) return null;

  return `\n\n=== OPERATIONAL DATA (sf_* tables) ===
The following is a real-time summary of this tenant's operational data. Use it to answer questions about labor, quality, timekeeping, safety, budgets, and performance.\n\n${sections.join('\n\n')}`;
}

/**
 * Fetch extracted documents for a tenant + agent and build a context block.
 */
async function getKnowledgeContext(supabase, tenantId, agentKey) {
  const departments = AGENT_DEPT_MAP[agentKey];
  if (!departments) return null;

  const { data: docs } = await supabase
    .from('tenant_documents')
    .select('file_name, doc_type, department, extracted_text')
    .eq('tenant_id', tenantId)
    .eq('status', 'extracted')
    .in('department', departments)
    .order('doc_type')
    .limit(20);

  let context = '';

  if (docs?.length) {
    const blocks = docs.map(d =>
      `--- ${d.doc_type.toUpperCase()}: ${d.file_name} (${d.department}) ---\n${d.extracted_text}`
    );
    context += `\n\n=== TENANT KNOWLEDGE BASE ===\nThe following documents have been uploaded for this tenant. Use them as reference when answering questions. Follow SOPs exactly as documented.\n\n${blocks.join('\n\n')}`;
  }

  // Inject active automation skills for this agent
  const { data: skills } = await supabase
    .from('automation_actions')
    .select('title, agent_skill_prompt')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .eq('status', 'active')
    .not('agent_skill_prompt', 'is', null);

  if (skills?.length) {
    context += '\n\n=== AUTOMATION SKILLS ===\n';
    context += 'You have the following enhanced capabilities based on SOP analysis:\n\n';
    context += skills.map(s => `### ${s.title}\n${s.agent_skill_prompt}`).join('\n\n');
    console.log(`[claude] Injected ${skills.length} automation skill(s) for ${agentKey}`);
  }

  // Fetch tenant operational memory
  const depts = [...departments, 'general'];
  const { data: memories } = await supabase
    .from('tenant_memory')
    .select('content, memory_type, department')
    .eq('tenant_id', tenantId)
    .in('department', depts)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('relevance_score', { ascending: false })
    .limit(10);

  if (memories?.length) {
    context += '\n\n=== TENANT OPERATIONAL MEMORY ===\n';
    context += 'Key operational insights about this tenant:\n\n';
    context += memories.map(m => `- [${m.memory_type}] ${m.content}`).join('\n');
    console.log(`[claude] Injected ${memories.length} operational memories for ${agentKey}`);
  }

  return context || null;
}

/**
 * POST /api/claude
 *
 * Proxies a Claude API call. The frontend sends the same payload it used to send
 * directly to Anthropic, but now the API key is injected server-side.
 *
 * Expected body: { model, system, messages, max_tokens, agent_key? }
 */
router.post('/', rateLimit, async (req, res) => {
  const { model, system, messages, max_tokens, agent_key } = req.body;

  // Basic validation
  if (!model || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing required fields: model, messages' });
  }

  // Resolve API key (tenant → platform DB → env fallback)
  let apiKey, keySource, effectiveTenantId;
  try {
    ({ apiKey, keySource, effectiveTenantId } = await resolveApiKey(req));
  } catch (err) {
    console.error(`[claude] No API key — tenant: ${req.tenantId || 'platform'}`);
    return res.status(err.status || 403).json({ error: err.message });
  }

  // ── Monthly usage enforcement ──
  if (effectiveTenantId) {
    const limits = await getTenantLimits(req.supabase, effectiveTenantId);

    if (limits && !limits.isActive) {
      return res.status(403).json({ error: 'Subscription inactive' });
    }

    if (limits && limits.maxCalls) {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      const { count, error: countErr } = await req.supabase
        .from('alf_usage_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', effectiveTenantId)
        .eq('action', 'agent_call')
        .gte('created_at', firstOfMonth);

      if (!countErr && count >= limits.maxCalls) {
        return res.status(429).json({
          error: 'Monthly agent call limit reached',
          limit: limits.maxCalls,
          used: count,
          resets_at: resetsAt,
        });
      }
    }
  }

  try {
    // Enrich system prompt with tenant knowledge docs
    let enrichedSystem = system || '';
    if (effectiveTenantId && agent_key) {
      const knowledgeCtx = await getKnowledgeContext(req.supabase, effectiveTenantId, agent_key);
      if (knowledgeCtx) {
        enrichedSystem = enrichedSystem + knowledgeCtx;
        console.log(`[claude] Injected knowledge for ${agent_key} — ${knowledgeCtx.length} chars`);
      }

      // Inject operational data for analytics agent
      if (agent_key === 'analytics') {
        const opsCtx = await getOperationalContext(req.supabase, effectiveTenantId);
        if (opsCtx) {
          enrichedSystem = enrichedSystem + opsCtx;
          console.log(`[claude] Injected operational data for analytics — ${opsCtx.length} chars`);
        }
      }
    }

    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        system: enrichedSystem || undefined,
        messages,
        max_tokens: max_tokens || 4096,
      }),
    });

    const data = await anthropicResponse.json();

    // If Anthropic returned an error, forward it
    if (!anthropicResponse.ok) {
      console.error('[claude] Anthropic error:', data.error?.message || anthropicResponse.status);
      return res.status(anthropicResponse.status).json({
        error: data.error?.message || `Anthropic API error: ${anthropicResponse.status}`,
      });
    }

    // Log usage asynchronously — don't block the response
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    console.log(`[claude] OK — ${model} | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

    req.supabase
      .from('alf_usage_logs')
      .insert({
        tenant_id: effectiveTenantId || null,
        user_id: req.user.id,
        action: 'agent_call',
        agent_key: agent_key || null,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        model,
      })
      .then(({ error }) => {
        if (error) console.warn('[claude] Usage log failed:', error.message);
      });

    res.json(data);
  } catch (err) {
    console.error('[claude] Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to reach AI service' });
  }
});

export default router;
