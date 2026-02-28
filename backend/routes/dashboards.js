import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { resolveApiKey } from '../lib/resolveApiKey.js';
import { getUserScopedJobIds, intersectJobIds } from '../lib/scopedJobs.js';
import { getUserTemplate } from '../lib/userTemplate.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANALYSIS_MODEL = 'claude-sonnet-4-20250514';

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

// ─── In-Memory Cache (5-min TTL) ────────────────────────────────────────────

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(tenantId, domain, filters, userId) {
  const userPart = userId ? `:u:${userId}` : '';
  return `dashboard:${tenantId}:${domain}${userPart}:${JSON.stringify(filters)}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Pagination Helper (Supabase API caps at 1000 rows) ─────────────────────

async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Named Query Objects ─────────────────────────────────────────────────────

export const DASHBOARD_QUERIES = {
  // Operations
  async WORK_TICKETS_SUMMARY(supabase, tenantId, filters) {
    return fetchAllRows(() => {
      let q = supabase
        .from('sf_fact_work_tickets')
        .select('id, job_id, date_key, category, status, priority, completed_at')
        .eq('tenant_id', tenantId);
      if (filters.dateFrom) q = q.gte('date_key', filters.dateFrom);
      if (filters.dateTo) q = q.lte('date_key', filters.dateTo);
      if (filters.jobIds?.length) q = q.in('job_id', filters.jobIds);
      return q;
    });
  },

  // Labor
  async LABOR_BUDGET_VS_ACTUAL(supabase, tenantId, filters) {
    let query = supabase
      .from('sf_fact_labor_budget_actual')
      .select('*')
      .eq('tenant_id', tenantId);

    if (filters.dateFrom) query = query.gte('period_start', filters.dateFrom);
    if (filters.dateTo) query = query.lte('period_end', filters.dateTo);
    if (filters.jobIds?.length) query = query.in('job_id', filters.jobIds);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Quality
  async QUALITY_METRICS(supabase, tenantId, filters) {
    let query = supabase
      .from('sf_fact_job_daily')
      .select('job_id, date_key, audits, corrective_actions')
      .eq('tenant_id', tenantId);

    if (filters.dateFrom) query = query.gte('date_key', filters.dateFrom);
    if (filters.dateTo) query = query.lte('date_key', filters.dateTo);
    if (filters.jobIds?.length) query = query.in('job_id', filters.jobIds);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Timekeeping
  async TIMEKEEPING_SUMMARY(supabase, tenantId, filters) {
    return fetchAllRows(() => {
      let q = supabase
        .from('sf_fact_timekeeping')
        .select('id, employee_id, job_id, date_key, regular_hours, ot_hours, dt_hours, punch_status')
        .eq('tenant_id', tenantId);
      if (filters.dateFrom) q = q.gte('date_key', filters.dateFrom);
      if (filters.dateTo) q = q.lte('date_key', filters.dateTo);
      if (filters.jobIds?.length) q = q.in('job_id', filters.jobIds);
      return q;
    });
  },

  // Safety
  async SAFETY_METRICS(supabase, tenantId, filters) {
    let query = supabase
      .from('sf_fact_job_daily')
      .select('job_id, date_key, recordable_incidents, good_saves, near_misses, trir, headcount')
      .eq('tenant_id', tenantId);

    if (filters.dateFrom) query = query.gte('date_key', filters.dateFrom);
    if (filters.dateTo) query = query.lte('date_key', filters.dateTo);
    if (filters.jobIds?.length) query = query.in('job_id', filters.jobIds);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Jobs (for filters)
  async JOBS(supabase, tenantId) {
    const { data, error } = await supabase
      .from('sf_dim_job')
      .select('id, job_name, location, tier, sq_footage')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('job_name');

    if (error) throw error;
    return data || [];
  },
};

// ─── Domain Data Dispatcher ──────────────────────────────────────────────────

async function getDomainData(supabase, tenantId, domain, filters) {
  const jobs = await DASHBOARD_QUERIES.JOBS(supabase, tenantId);

  switch (domain) {
    case 'operations': {
      const tickets = await DASHBOARD_QUERIES.WORK_TICKETS_SUMMARY(supabase, tenantId, filters);
      return { jobs, tickets };
    }
    case 'labor': {
      const labor = await DASHBOARD_QUERIES.LABOR_BUDGET_VS_ACTUAL(supabase, tenantId, filters);
      return { jobs, labor };
    }
    case 'quality': {
      const quality = await DASHBOARD_QUERIES.QUALITY_METRICS(supabase, tenantId, filters);
      return { jobs, quality };
    }
    case 'timekeeping': {
      const timekeeping = await DASHBOARD_QUERIES.TIMEKEEPING_SUMMARY(supabase, tenantId, filters);
      return { jobs, timekeeping };
    }
    case 'safety': {
      const safety = await DASHBOARD_QUERIES.SAFETY_METRICS(supabase, tenantId, filters);
      return { jobs, safety };
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}

// ─── Auth Helper ─────────────────────────────────────────────────────────────

function resolveEffectiveTenantId(req, paramTenantId) {
  if (PLATFORM_ROLES.includes(req.user?.role)) {
    return paramTenantId || req.tenantId;
  }
  return req.tenantId;
}

// ─── Action Plan Prompt ──────────────────────────────────────────────────────

const ACTION_PLAN_SYSTEM_PROMPT = `You are an operational performance analyst for facility services companies. You analyze dashboard metrics across operations, labor, quality, timekeeping, and safety domains to identify issues and generate prioritized action items.

RULES:
- Only cite metrics explicitly present in the provided data. NEVER fabricate, estimate, extrapolate, or round numbers beyond what the data shows.
- If a domain has insufficient data for a site (zero records, missing data), say so in the summary. Do not generate recommendations based on missing data.
- Identify 5-7 issues. Each MUST include: the specific metric that triggered it, the specific site name, and the raw numbers (e.g., "58% completion (232 of 400 tickets)" not just "low completion").
- Priority: critical = immediate safety/compliance risk, high = significant cost or performance impact, medium = improvement opportunity with clear ROI, low = minor optimization.
- suggested_owner_role must be a role title (e.g., "Operations VP", "Site Supervisor", "HR Manager"), never a person's name.
- Use active voice. Write like an operator: "Pull the OT report for White Plains and review shift assignments" not "It is recommended that overtime patterns be analyzed."
- Do not reference technology platforms unless they appear in the data.

Return ONLY valid JSON matching the schema below. No markdown, no explanation, just JSON.`;

const ACTION_PLAN_USER_PROMPT = (allData, jobs) => {
  const jobMap = {};
  for (const j of jobs) jobMap[j.id] = j.job_name;

  return `Analyze the following operational dashboard data and generate a prioritized action plan.

SITES:
${JSON.stringify(jobs, null, 2)}

OPERATIONS DATA (work tickets):
${JSON.stringify(summarizeTickets(allData.operations?.tickets || [], jobMap))}

LABOR DATA (budget vs actual):
${JSON.stringify(summarizeLabor(allData.labor?.labor || [], jobMap))}

QUALITY DATA (audits & corrective actions):
${JSON.stringify(summarizeQuality(allData.quality?.quality || [], jobMap))}

TIMEKEEPING DATA (punch status):
${JSON.stringify(summarizeTimekeeping(allData.timekeeping?.timekeeping || []))}

SAFETY DATA (incidents, TRIR, good saves):
${JSON.stringify(summarizeSafety(allData.safety?.safety || [], jobMap))}

Return JSON:
{
  "summary": "string — 2-3 sentence executive summary of operational health, noting any domains with insufficient data",
  "actions": [
    {
      "title": "string — concise action title in active voice",
      "description": "string — detailed recommendation citing specific metric + raw numbers + site name",
      "site_name": "string — affected site name or 'All Sites'",
      "priority": "critical|high|medium|low",
      "domain": "operations|labor|quality|timekeeping|safety",
      "suggested_owner_role": "string — role title like 'Operations VP' or 'Site Supervisor', never a person name",
      "metric_snapshot": { "key": "value pairs of the specific metrics that triggered this action" }
    }
  ]
}`;
};

// ─── Data Summarizers (for action plan prompt, keep token count reasonable) ──

function summarizeTickets(tickets, jobMap) {
  const bySite = {};
  for (const t of tickets) {
    const site = jobMap[t.job_id] || t.job_id;
    if (!bySite[site]) bySite[site] = { total: 0, completed: 0, categories: {} };
    bySite[site].total++;
    if (t.status === 'completed') bySite[site].completed++;
    bySite[site].categories[t.category] = (bySite[site].categories[t.category] || 0) + 1;
  }
  return { totalTickets: tickets.length, bySite };
}

function summarizeLabor(labor, jobMap) {
  const bySite = {};
  for (const r of labor) {
    const site = jobMap[r.job_id] || r.job_id;
    if (!bySite[site]) bySite[site] = { totalBudget: 0, totalActual: 0, totalOT: 0 };
    bySite[site].totalBudget += Number(r.budget_dollars) || 0;
    bySite[site].totalActual += Number(r.actual_dollars) || 0;
    bySite[site].totalOT += Number(r.ot_dollars) || 0;
  }
  return bySite;
}

function summarizeQuality(quality, jobMap) {
  const bySite = {};
  for (const r of quality) {
    const site = jobMap[r.job_id] || r.job_id;
    if (!bySite[site]) bySite[site] = { audits: 0, correctiveActions: 0 };
    bySite[site].audits += r.audits || 0;
    bySite[site].correctiveActions += r.corrective_actions || 0;
  }
  return bySite;
}

function summarizeTimekeeping(timekeeping) {
  const statuses = { accepted: 0, incomplete: 0, manual_edit: 0, exception: 0 };
  for (const r of timekeeping) {
    statuses[r.punch_status] = (statuses[r.punch_status] || 0) + 1;
  }
  return { totalPunches: timekeeping.length, statuses };
}

function summarizeSafety(safety, jobMap) {
  const bySite = {};
  for (const r of safety) {
    const site = jobMap[r.job_id] || r.job_id;
    if (!bySite[site]) bySite[site] = { recordables: 0, goodSaves: 0, nearMisses: 0, trirValues: [] };
    bySite[site].recordables += r.recordable_incidents || 0;
    bySite[site].goodSaves += r.good_saves || 0;
    bySite[site].nearMisses += r.near_misses || 0;
    if (r.trir) bySite[site].trirValues.push(Number(r.trir));
  }
  // Compute avg TRIR per site
  for (const site of Object.keys(bySite)) {
    const vals = bySite[site].trirValues;
    bySite[site].avgTRIR = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : null;
    delete bySite[site].trirValues;
  }
  return bySite;
}

// ─── Routes ──────────────────────────────────────────────────────────────────
// NOTE: Specific routes (action-plan, action-plans) MUST come before the
// generic /:domain route, otherwise Express matches "action-plans" as a domain.

/**
 * POST /api/dashboards/:tenantId/action-plan
 *
 * Generate action plan by pulling all 5 domains and calling Claude.
 */
router.post('/:tenantId/action-plan', rateLimit, async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Apply user site scoping to action plan generation
  const requestedJobIds = req.body.jobIds || null;
  const scopedJobIds = await getUserScopedJobIds(req.supabase, req.user.id, effectiveTenantId, req.user.role);
  const effectiveJobIds = intersectJobIds(scopedJobIds, requestedJobIds);

  const filters = {
    dateFrom: req.body.dateFrom || null,
    dateTo: req.body.dateTo || null,
    jobIds: effectiveJobIds,
  };

  // Resolve API key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = PLATFORM_ROLES.includes(req.user?.role)
      ? await resolveApiKey(req, { tenantIdOverride: effectiveTenantId })
      : await resolveApiKey(req));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  try {
    // Fetch all 5 domains
    const [operations, labor, quality, timekeeping, safety] = await Promise.all([
      getDomainData(req.supabase, effectiveTenantId, 'operations', filters),
      getDomainData(req.supabase, effectiveTenantId, 'labor', filters),
      getDomainData(req.supabase, effectiveTenantId, 'quality', filters),
      getDomainData(req.supabase, effectiveTenantId, 'timekeeping', filters),
      getDomainData(req.supabase, effectiveTenantId, 'safety', filters),
    ]);

    const allData = { operations, labor, quality, timekeeping, safety };
    const jobs = operations.jobs || [];

    const userPrompt = ACTION_PLAN_USER_PROMPT(allData, jobs);

    // Call Claude
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        system: ACTION_PLAN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 4096,
      }),
    });

    const claudeData = await response.json();
    if (!response.ok) {
      throw new Error(claudeData.error?.message || `Anthropic API error: ${response.status}`);
    }

    const inputTokens = claudeData.usage?.input_tokens || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    console.log(`[dashboards] Action plan OK | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

    // Parse response
    const text = claudeData.content?.[0]?.text || '';
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const plan = JSON.parse(cleaned);

    // Insert action items into automation_actions
    const insertedActions = [];
    for (const action of (plan.actions || [])) {
      // Map priority to phase for consistency with existing SOP-derived actions
      const phaseFromPriority = action.priority === 'critical' || action.priority === 'high'
        ? 'quick-win' : action.priority === 'medium' ? 'medium-term' : 'long-term';

      // Store suggested_owner_role in metric_snapshot alongside the metrics
      const snapshot = {
        ...(action.metric_snapshot || {}),
        suggested_owner_role: action.suggested_owner_role || null,
      };

      const { data: row, error: insertErr } = await req.supabase
        .from('automation_actions')
        .insert({
          tenant_id: effectiveTenantId,
          department: action.domain || 'ops',
          phase: phaseFromPriority,
          title: action.title,
          description: action.description,
          source: 'dashboard_action_plan',
          status: 'open',
          priority: action.priority || 'medium',
          site_name: action.site_name || null,
          metric_snapshot: snapshot,
          assignee_type: 'human',
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[dashboards] Action insert error:', insertErr.message);
      } else {
        insertedActions.push(row);
      }
    }

    // Log usage
    req.supabase
      .from('alf_usage_logs')
      .insert({
        tenant_id: effectiveTenantId,
        user_id: req.user.id,
        action: 'dashboard_action_plan',
        agent_key: 'actionPlan',
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        model: ANALYSIS_MODEL,
      })
      .then(({ error }) => {
        if (error) console.warn('[dashboards] Usage log failed:', error.message);
      });

    res.json({ summary: plan.summary, actions: insertedActions });
  } catch (err) {
    console.error('[dashboards] Action plan generation failed:', err.message);
    res.status(502).json({ error: 'Action plan generation failed: ' + err.message });
  }
});

/**
 * GET /api/dashboards/:tenantId/action-plans
 *
 * List action plan items for a tenant.
 */
router.get('/:tenantId/action-plans', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data: actions, error } = await req.supabase
      .from('automation_actions')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('source', 'dashboard_action_plan')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ actions: actions || [] });
  } catch (err) {
    console.error('[dashboards] Action plans fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch action plans' });
  }
});

/**
 * PATCH /api/dashboards/:tenantId/action-plans/:actionId
 *
 * Update action plan item status.
 */
router.patch('/:tenantId/action-plans/:actionId', async (req, res) => {
  const { tenantId, actionId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { status } = req.body;
  const validStatuses = ['open', 'in_progress', 'completed', 'dismissed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const { data: updated, error } = await req.supabase
      .from('automation_actions')
      .update({ status })
      .eq('id', actionId)
      .eq('tenant_id', effectiveTenantId)
      .eq('source', 'dashboard_action_plan')
      .select()
      .single();

    if (error) throw error;
    if (!updated) return res.status(404).json({ error: 'Action not found' });

    res.json({ action: updated });
  } catch (err) {
    console.error('[dashboards] Action update error:', err.message);
    res.status(500).json({ error: 'Failed to update action' });
  }
});

// ─── Dashboard Template Apply ────────────────────────────────────────────────

/**
 * POST /api/dashboards/:tenantId/apply-template
 *
 * Write all dashboard configs from a template. Platform-owner only.
 * Body: { configs: { home: {...}, operations: {...}, ... } }
 */
router.post('/:tenantId/apply-template', async (req, res) => {
  const { tenantId } = req.params;

  if (!PLATFORM_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const { configs } = req.body;
  if (!configs || typeof configs !== 'object') {
    return res.status(400).json({ error: 'configs object required' });
  }

  const validKeys = ['home', 'operations', 'labor', 'quality', 'timekeeping', 'safety'];

  try {
    const rows = Object.entries(configs)
      .filter(([key]) => validKeys.includes(key))
      .map(([key, config]) => ({
        tenant_id: tenantId,
        dashboard_key: key,
        config,
        updated_by: req.user?.id || null,
      }));

    if (rows.length === 0) {
      return res.json({ applied: 0 });
    }

    const { error } = await req.supabase
      .from('dashboard_configs')
      .upsert(rows, { onConflict: 'tenant_id,dashboard_key' });

    if (error) throw error;

    // Invalidate any cached dashboard data for this tenant
    for (const [key] of cache) {
      if (key.startsWith(`dashboard:${tenantId}:`)) cache.delete(key);
    }

    res.json({ applied: rows.length });
  } catch (err) {
    console.error('[dashboards] Template apply error:', err.message);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

// ─── Dashboard Config Recommendations ────────────────────────────────────────

const RECOMMEND_SYSTEM_PROMPT = `You are a dashboard configuration advisor for an operations platform. You analyze a tenant's actual data across 5 domains (operations, labor, quality, timekeeping, safety) and their current dashboard config to recommend improvements.

Your job is to suggest:
1. Label renames that better match this tenant's data (e.g., if they have no "tickets" but have "work orders", suggest renaming)
2. KPIs or charts to hide if the underlying data is empty or sparse (zero rows, all nulls)
3. Reordering KPIs so the most relevant ones appear first based on data volume/variance
4. Home dashboard hero metric labels that match the tenant's business

RULES:
- Only recommend changes backed by the data summary provided. Never guess.
- If a domain has no data at all, recommend hiding that entire dashboard's KPIs/charts.
- Keep recommendations actionable and specific.
- Return ONLY valid JSON matching the schema below. No markdown, no explanation.

Return JSON:
{
  "recommendations": [
    {
      "dashboard": "operations|labor|quality|timekeeping|safety|home",
      "type": "rename|hide|reorder|show",
      "target": "kpi|chart|heroMetric|section",
      "targetId": "string — the id of the KPI/chart/metric",
      "currentLabel": "string — current label or null",
      "suggestedLabel": "string — new label or null (for rename)",
      "suggestedVisible": true|false,
      "reason": "string — brief explanation citing actual data"
    }
  ],
  "summary": "string — 2-3 sentence overview of recommendations"
}`;

function buildRecommendPrompt(allData, jobs, currentConfigs) {
  const jobMap = {};
  for (const j of jobs) jobMap[j.id] = j.job_name;

  return `Analyze this tenant's dashboard data and current configuration, then recommend improvements.

SITES:
${JSON.stringify(jobs.map(j => ({ id: j.id, name: j.job_name })), null, 2)}

DATA SUMMARY:
- Operations: ${(allData.operations?.tickets || []).length} tickets across ${Object.keys(groupBySite(allData.operations?.tickets || [], jobMap)).length} sites
- Labor: ${(allData.labor?.labor || []).length} records
- Quality: ${(allData.quality?.quality || []).length} records
- Timekeeping: ${(allData.timekeeping?.timekeeping || []).length} punch records
- Safety: ${(allData.safety?.safety || []).length} records

OPERATIONS BREAKDOWN:
${JSON.stringify(summarizeTickets(allData.operations?.tickets || [], jobMap))}

LABOR BREAKDOWN:
${JSON.stringify(summarizeLabor(allData.labor?.labor || [], jobMap))}

QUALITY BREAKDOWN:
${JSON.stringify(summarizeQuality(allData.quality?.quality || [], jobMap))}

TIMEKEEPING BREAKDOWN:
${JSON.stringify(summarizeTimekeeping(allData.timekeeping?.timekeeping || []))}

SAFETY BREAKDOWN:
${JSON.stringify(summarizeSafety(allData.safety?.safety || [], jobMap))}

CURRENT DASHBOARD CONFIGS (null = using default labels):
${JSON.stringify(currentConfigs, null, 2)}

Based on this data profile and current config, recommend specific changes.`;
}

function groupBySite(items, jobMap) {
  const result = {};
  for (const item of items) {
    const site = jobMap[item.job_id] || item.job_id || 'unknown';
    result[site] = (result[site] || 0) + 1;
  }
  return result;
}

/**
 * POST /api/dashboards/:tenantId/config/recommend
 *
 * AI-powered dashboard config recommendations. Platform-owner only.
 * Fetches tenant data + current configs, calls Claude, returns suggestions.
 */
router.post('/:tenantId/config/recommend', rateLimit, async (req, res) => {
  const { tenantId } = req.params;

  if (!PLATFORM_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  // Resolve API key — use tenant's key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = await resolveApiKey(req, { tenantIdOverride: tenantId }));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const filters = {
    dateFrom: req.body.dateFrom || null,
    dateTo: req.body.dateTo || null,
    jobIds: null,
  };

  try {
    // Fetch all 5 domains + current configs in parallel
    const [operations, labor, quality, timekeeping, safety, configRes] = await Promise.all([
      getDomainData(req.supabase, tenantId, 'operations', filters),
      getDomainData(req.supabase, tenantId, 'labor', filters),
      getDomainData(req.supabase, tenantId, 'quality', filters),
      getDomainData(req.supabase, tenantId, 'timekeeping', filters),
      getDomainData(req.supabase, tenantId, 'safety', filters),
      req.supabase.from('dashboard_configs').select('dashboard_key, config').eq('tenant_id', tenantId),
    ]);

    const allData = { operations, labor, quality, timekeeping, safety };
    const jobs = operations.jobs || [];

    // Build current config map
    const currentConfigs = {};
    for (const row of (configRes.data || [])) {
      currentConfigs[row.dashboard_key] = row.config;
    }

    const userPrompt = buildRecommendPrompt(allData, jobs, currentConfigs);

    // Call Claude
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        system: RECOMMEND_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 4096,
      }),
    });

    const claudeData = await response.json();
    if (!response.ok) {
      throw new Error(claudeData.error?.message || `Anthropic API error: ${response.status}`);
    }

    const inputTokens = claudeData.usage?.input_tokens || 0;
    const outputTokens = claudeData.usage?.output_tokens || 0;
    console.log(`[dashboards] Recommend OK | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

    // Parse response
    const text = claudeData.content?.[0]?.text || '';
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const result = JSON.parse(cleaned);

    // Log usage
    req.supabase
      .from('alf_usage_logs')
      .insert({
        tenant_id: tenantId,
        user_id: req.user.id,
        action: 'dashboard_config_recommend',
        agent_key: 'admin',
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        model: ANALYSIS_MODEL,
      })
      .then(({ error }) => {
        if (error) console.warn('[dashboards] Usage log failed:', error.message);
      });

    res.json(result);
  } catch (err) {
    console.error('[dashboards] Recommend failed:', err.message);
    res.status(502).json({ error: 'Recommendation generation failed: ' + err.message });
  }
});

// ─── Home Summary (Aggregated sf_* data for home dashboard) ─────────────────

/**
 * GET /api/dashboards/:tenantId/home-summary
 *
 * Returns aggregated metrics from all 5 sf_* domains for the home dashboard.
 * Single call replaces the old mock-based computeDashboard().
 */
router.get('/:tenantId/home-summary', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // No date filtering by default — show all available data
  const requestedJobIds = req.query.jobIds ? req.query.jobIds.split(',') : null;

  // Apply user site scoping — intersect with any explicit filter
  const scopedJobIds = await getUserScopedJobIds(req.supabase, req.user.id, effectiveTenantId, req.user.role);
  const effectiveJobIds = intersectJobIds(scopedJobIds, requestedJobIds);

  const filters = {
    dateFrom: req.query.dateFrom || null,
    dateTo: req.query.dateTo || null,
    jobIds: effectiveJobIds,
  };

  // Include userId in cache key when user has site scoping
  const userId = scopedJobIds ? req.user.id : null;
  const key = cacheKey(effectiveTenantId, 'home-summary', filters, userId);
  const cached = getCached(key);
  if (cached) return res.json(cached);

  try {
    // Fetch all domains in parallel
    const [jobs, tickets, labor, quality, timekeeping, safety] = await Promise.all([
      DASHBOARD_QUERIES.JOBS(req.supabase, effectiveTenantId),
      DASHBOARD_QUERIES.WORK_TICKETS_SUMMARY(req.supabase, effectiveTenantId, filters),
      DASHBOARD_QUERIES.LABOR_BUDGET_VS_ACTUAL(req.supabase, effectiveTenantId, filters),
      DASHBOARD_QUERIES.QUALITY_METRICS(req.supabase, effectiveTenantId, filters),
      DASHBOARD_QUERIES.TIMEKEEPING_SUMMARY(req.supabase, effectiveTenantId, filters),
      DASHBOARD_QUERIES.SAFETY_METRICS(req.supabase, effectiveTenantId, filters),
    ]);

    // --- Hero metrics ---
    const totalProperties = jobs.length;

    const totalTickets = tickets.length;
    const completedTickets = tickets.filter(t => t.status === 'completed').length;
    const openTickets = totalTickets - completedTickets;
    const completionRate = totalTickets ? +(completedTickets / totalTickets * 100).toFixed(1) : 0;

    const totalBudget = labor.reduce((s, r) => s + (r.budget_dollars || 0), 0);
    const totalActual = labor.reduce((s, r) => s + (r.actual_dollars || 0), 0);
    const laborVariance = totalBudget ? +((totalActual - totalBudget) / totalBudget * 100).toFixed(1) : 0;
    const totalOtHours = labor.reduce((s, r) => s + (r.ot_hours || 0), 0);

    const totalAudits = quality.reduce((s, r) => s + (r.audits || 0), 0);
    const totalCAs = quality.reduce((s, r) => s + (r.corrective_actions || 0), 0);
    const caRatio = totalAudits ? +(totalCAs / totalAudits * 100).toFixed(1) : 0;

    const totalPunches = timekeeping.length;
    const acceptedPunches = timekeeping.filter(t => t.punch_status === 'accepted').length;
    const acceptanceRate = totalPunches ? +(acceptedPunches / totalPunches * 100).toFixed(1) : 0;

    const recordableIncidents = safety.reduce((s, r) => s + (r.recordable_incidents || 0), 0);
    const goodSaves = safety.reduce((s, r) => s + (r.good_saves || 0), 0);
    const trirs = safety.filter(r => r.trir != null).map(r => r.trir);
    const avgTrir = trirs.length ? +(trirs.reduce((s, v) => s + v, 0) / trirs.length).toFixed(3) : null;

    // --- Per-domain summaries (for workspace cards) ---
    const domains = {
      operations: {
        hasData: tickets.length > 0,
        stats: [
          `${totalTickets.toLocaleString()} total tickets`,
          `${completedTickets.toLocaleString()} completed (${completionRate}%)`,
          `${openTickets.toLocaleString()} open`,
        ],
      },
      labor: {
        hasData: labor.length > 0,
        stats: [
          `$${Math.round(totalBudget).toLocaleString()} budget`,
          `$${Math.round(totalActual).toLocaleString()} actual (${laborVariance > 0 ? '+' : ''}${laborVariance}%)`,
          `${totalOtHours.toLocaleString()} OT hours`,
        ],
      },
      quality: {
        hasData: quality.length > 0,
        stats: [
          `${totalAudits.toLocaleString()} audits`,
          `${totalCAs.toLocaleString()} corrective actions`,
          `${caRatio}% CA ratio`,
        ],
      },
      timekeeping: {
        hasData: timekeeping.length > 0,
        stats: [
          `${totalPunches.toLocaleString()} punches`,
          `${acceptanceRate}% accepted`,
          `${(totalPunches - acceptedPunches).toLocaleString()} exceptions`,
        ],
      },
      safety: {
        hasData: safety.length > 0,
        stats: [
          `${recordableIncidents} recordable incidents`,
          `${goodSaves} good saves`,
          avgTrir != null ? `${avgTrir} avg TRIR` : 'No TRIR data',
        ],
      },
    };

    // --- Attention items (anomalies from sf_* data) ---
    const attentionItems = [];
    let taskId = 0;

    // Operations: sites with low completion rate
    const jobMap = {};
    for (const j of jobs) jobMap[j.id] = j.job_name;

    const ticketsBySite = {};
    for (const t of tickets) {
      const site = t.job_id;
      if (!ticketsBySite[site]) ticketsBySite[site] = { total: 0, completed: 0 };
      ticketsBySite[site].total++;
      if (t.status === 'completed') ticketsBySite[site].completed++;
    }
    for (const [jobId, counts] of Object.entries(ticketsBySite)) {
      const rate = counts.total ? (counts.completed / counts.total * 100) : 100;
      if (rate < 80 && counts.total >= 10) {
        attentionItems.push({
          id: ++taskId,
          priority: rate < 60 ? 'high' : 'medium',
          dept: 'operations',
          description: `${Math.round(rate)}% completion rate — ${jobMap[jobId] || 'Unknown site'}`,
          detail: `${counts.completed} of ${counts.total} tickets completed`,
          actionLabel: 'Review',
        });
      }
    }

    // Labor: sites over budget by >10%
    const laborBySite = {};
    for (const r of labor) {
      if (!laborBySite[r.job_id]) laborBySite[r.job_id] = { budget: 0, actual: 0 };
      laborBySite[r.job_id].budget += r.budget_dollars || 0;
      laborBySite[r.job_id].actual += r.actual_dollars || 0;
    }
    for (const [jobId, totals] of Object.entries(laborBySite)) {
      if (!totals.budget) continue;
      const var_pct = (totals.actual - totals.budget) / totals.budget * 100;
      if (var_pct > 10) {
        attentionItems.push({
          id: ++taskId,
          priority: var_pct > 20 ? 'high' : 'medium',
          dept: 'labor',
          description: `Budget +${Math.round(var_pct)}% over — ${jobMap[jobId] || 'Unknown site'}`,
          detail: `$${Math.round(totals.actual - totals.budget).toLocaleString()} over budget`,
          actionLabel: 'Review',
        });
      }
    }

    // Quality: sites with high CA ratio
    const qualBySite = {};
    for (const r of quality) {
      if (!qualBySite[r.job_id]) qualBySite[r.job_id] = { audits: 0, cas: 0 };
      qualBySite[r.job_id].audits += r.audits || 0;
      qualBySite[r.job_id].cas += r.corrective_actions || 0;
    }
    for (const [jobId, totals] of Object.entries(qualBySite)) {
      if (!totals.audits) continue;
      const ratio = totals.cas / totals.audits * 100;
      if (ratio > 40) {
        attentionItems.push({
          id: ++taskId,
          priority: ratio > 60 ? 'high' : 'medium',
          dept: 'quality',
          description: `${Math.round(ratio)}% CA ratio — ${jobMap[jobId] || 'Unknown site'}`,
          detail: `${totals.cas} corrective actions from ${totals.audits} audits`,
          actionLabel: 'Investigate',
        });
      }
    }

    // Safety: recordable incidents by site
    const safetyBySite = {};
    for (const r of safety) {
      if (!safetyBySite[r.job_id]) safetyBySite[r.job_id] = { recordable: 0 };
      safetyBySite[r.job_id].recordable += r.recordable_incidents || 0;
    }
    for (const [jobId, totals] of Object.entries(safetyBySite)) {
      if (totals.recordable >= 3) {
        attentionItems.push({
          id: ++taskId,
          priority: 'high',
          dept: 'safety',
          description: `${totals.recordable} recordable incidents — ${jobMap[jobId] || 'Unknown site'}`,
          detail: 'Review safety protocols',
          actionLabel: 'Investigate',
        });
      }
    }

    // Sort: high first
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    attentionItems.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    const result = {
      hero: {
        totalProperties,
        totalTickets,
        openTickets,
        completionRate,
        totalBudget,
        totalActual,
        laborVariance,
        totalOtHours,
        totalAudits,
        totalCAs,
        caRatio,
        totalPunches,
        acceptanceRate,
        recordableIncidents,
        goodSaves,
        avgTrir,
      },
      domains,
      attentionItems,
      hasData: tickets.length > 0 || labor.length > 0 || quality.length > 0,
    };

    setCache(key, result);
    res.json(result);
  } catch (err) {
    console.error('[dashboards] Home summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch home summary' });
  }
});

// ─── User Dashboard Config (Per-User Overrides + 3-Tier Resolution) ─────────

const VALID_DASHBOARD_KEYS = ['home', 'operations', 'labor', 'quality', 'timekeeping', 'safety'];

/**
 * GET /api/dashboards/:tenantId/user-config
 *
 * Returns all dashboard configs resolved through 3-tier chain:
 * user_dashboard_configs → dashboard_configs → registry defaults.
 * Response: { configs: { home: {...}, ... }, sources: { home: 'user'|'tenant'|'default', ... } }
 */
router.get('/:tenantId/user-config', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);
  const userId = req.user?.id;

  if (!effectiveTenantId || !userId) {
    return res.status(400).json({ error: 'tenant_id and authenticated user required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Fetch tenant configs + user configs in parallel
    const [tenantRes, userRes] = await Promise.all([
      req.supabase.from('dashboard_configs').select('dashboard_key, config').eq('tenant_id', effectiveTenantId),
      req.supabase.from('user_dashboard_configs').select('dashboard_key, config').eq('tenant_id', effectiveTenantId).eq('user_id', userId),
    ]);

    if (tenantRes.error) throw tenantRes.error;
    if (userRes.error) throw userRes.error;

    const tenantMap = {};
    for (const row of (tenantRes.data || [])) tenantMap[row.dashboard_key] = row.config;

    const userMap = {};
    for (const row of (userRes.data || [])) userMap[row.dashboard_key] = row.config;

    // Build merged configs + source indicators
    const configs = {};
    const sources = {};

    for (const key of VALID_DASHBOARD_KEYS) {
      if (userMap[key]) {
        configs[key] = userMap[key];
        sources[key] = 'user';
      } else if (tenantMap[key]) {
        configs[key] = tenantMap[key];
        sources[key] = 'tenant';
      } else {
        sources[key] = 'default';
        // No config — frontend will use registry defaults
      }
    }

    res.json({ configs, sources });
  } catch (err) {
    console.error('[dashboards] User config fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user dashboard configs' });
  }
});

/**
 * PUT /api/dashboards/:tenantId/user-config/:dashboardKey
 *
 * Save a per-user config override.
 */
router.put('/:tenantId/user-config/:dashboardKey', async (req, res) => {
  const { tenantId, dashboardKey } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);
  const userId = req.user?.id;

  if (!effectiveTenantId || !userId) {
    return res.status(400).json({ error: 'tenant_id and authenticated user required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!VALID_DASHBOARD_KEYS.includes(dashboardKey)) {
    return res.status(400).json({ error: `Invalid dashboard key. Must be one of: ${VALID_DASHBOARD_KEYS.join(', ')}` });
  }

  const config = req.body.config;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config object required in request body' });
  }

  try {
    const { data, error } = await req.supabase
      .from('user_dashboard_configs')
      .upsert({
        user_id: userId,
        tenant_id: effectiveTenantId,
        dashboard_key: dashboardKey,
        config,
      }, {
        onConflict: 'user_id,tenant_id,dashboard_key',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ config: data.config, source: 'user' });
  } catch (err) {
    console.error('[dashboards] User config save error:', err.message);
    res.status(500).json({ error: 'Failed to save user dashboard config' });
  }
});

/**
 * DELETE /api/dashboards/:tenantId/user-config/:dashboardKey
 *
 * Reset user override — falls back to tenant defaults.
 */
router.delete('/:tenantId/user-config/:dashboardKey', async (req, res) => {
  const { tenantId, dashboardKey } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);
  const userId = req.user?.id;

  if (!effectiveTenantId || !userId) {
    return res.status(400).json({ error: 'tenant_id and authenticated user required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!VALID_DASHBOARD_KEYS.includes(dashboardKey)) {
    return res.status(400).json({ error: `Invalid dashboard key. Must be one of: ${VALID_DASHBOARD_KEYS.join(', ')}` });
  }

  try {
    const { error } = await req.supabase
      .from('user_dashboard_configs')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', effectiveTenantId)
      .eq('dashboard_key', dashboardKey);

    if (error) throw error;

    res.json({ deleted: true, dashboardKey });
  } catch (err) {
    console.error('[dashboards] User config delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete user dashboard config' });
  }
});

// ─── Dashboard Shares ───────────────────────────────────────────────────────

/**
 * POST /api/dashboards/:tenantId/shares
 *
 * Admin shares a dashboard view with a non-admin user.
 */
router.post('/:tenantId/shares', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role);
  const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin && !isPlatform) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { dashboardKey, sharedWith } = req.body;
  if (!dashboardKey || !sharedWith) {
    return res.status(400).json({ error: 'dashboardKey and sharedWith (user ID) required' });
  }

  if (!VALID_DASHBOARD_KEYS.includes(dashboardKey)) {
    return res.status(400).json({ error: `Invalid dashboard key` });
  }

  try {
    const { data, error } = await req.supabase
      .from('dashboard_shares')
      .upsert({
        tenant_id: effectiveTenantId,
        dashboard_key: dashboardKey,
        shared_by: req.user.id,
        shared_with: sharedWith,
        permissions: 'view',
      }, {
        onConflict: 'tenant_id,dashboard_key,shared_with',
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ share: data });
  } catch (err) {
    console.error('[dashboards] Share create error:', err.message);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

/**
 * GET /api/dashboards/:tenantId/shares
 *
 * Admins see shares they created; regular users see shares directed at them.
 */
router.get('/:tenantId/shares', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);
  const userId = req.user?.id;

  if (!effectiveTenantId || !userId) {
    return res.status(400).json({ error: 'tenant_id and authenticated user required' });
  }

  try {
    const isAdmin = ['admin', 'super-admin'].includes(req.user?.role) || PLATFORM_ROLES.includes(req.user?.role);

    let query;
    if (isAdmin) {
      // Admins see all shares for the tenant
      query = req.supabase
        .from('dashboard_shares')
        .select('*, shared_with_profile:profiles!dashboard_shares_shared_with_fkey(id, full_name, email)')
        .eq('tenant_id', effectiveTenantId);
    } else {
      // Regular users see only shares directed at them
      query = req.supabase
        .from('dashboard_shares')
        .select('*')
        .eq('tenant_id', effectiveTenantId)
        .eq('shared_with', userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ shares: data || [] });
  } catch (err) {
    console.error('[dashboards] Shares fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
});

/**
 * DELETE /api/dashboards/:tenantId/shares/:shareId
 *
 * Revoke a share. Only the admin who created it (or platform owner) can revoke.
 */
router.delete('/:tenantId/shares/:shareId', async (req, res) => {
  const { tenantId, shareId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role);
  const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin && !isPlatform) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    let query = req.supabase
      .from('dashboard_shares')
      .delete()
      .eq('id', shareId)
      .eq('tenant_id', effectiveTenantId);

    // Non-platform admins can only delete their own shares
    if (!isPlatform) {
      query = query.eq('shared_by', req.user.id);
    }

    const { error } = await query;
    if (error) throw error;

    res.json({ deleted: true });
  } catch (err) {
    console.error('[dashboards] Share delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete share' });
  }
});

// ─── Dashboard Config CRUD ───────────────────────────────────────────────────

/**
 * GET /api/dashboards/:tenantId/config
 *
 * Get all dashboard configs for a tenant.
 */
router.get('/:tenantId/config', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('dashboard_configs')
      .select('*')
      .eq('tenant_id', effectiveTenantId);

    if (error) throw error;

    // Return as a map: { operations: {...config}, labor: {...config}, ... }
    const configMap = {};
    for (const row of (data || [])) {
      configMap[row.dashboard_key] = row.config;
    }

    res.json({ configs: configMap });
  } catch (err) {
    console.error('[dashboards] Config fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard configs' });
  }
});

/**
 * GET /api/dashboards/:tenantId/config/:dashboardKey
 *
 * Get a single dashboard config.
 */
router.get('/:tenantId/config/:dashboardKey', async (req, res) => {
  const { tenantId, dashboardKey } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('dashboard_configs')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .eq('dashboard_key', dashboardKey)
      .maybeSingle();

    if (error) throw error;

    res.json({ config: data?.config || null });
  } catch (err) {
    console.error('[dashboards] Config fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard config' });
  }
});

/**
 * PUT /api/dashboards/:tenantId/config/:dashboardKey
 *
 * Create or update a dashboard config. Requires admin role.
 */
router.put('/:tenantId/config/:dashboardKey', async (req, res) => {
  const { tenantId, dashboardKey } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  // Only admins and platform owners can write configs
  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role);
  const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin && !isPlatform) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!isPlatform && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const validKeys = ['home', 'operations', 'labor', 'quality', 'timekeeping', 'safety'];
  if (!validKeys.includes(dashboardKey)) {
    return res.status(400).json({ error: `Invalid dashboard key. Must be one of: ${validKeys.join(', ')}` });
  }

  const config = req.body.config;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'config object required in request body' });
  }

  try {
    const { data, error } = await req.supabase
      .from('dashboard_configs')
      .upsert({
        tenant_id: effectiveTenantId,
        dashboard_key: dashboardKey,
        config,
        updated_by: req.user?.id || null,
      }, {
        onConflict: 'tenant_id,dashboard_key',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ config: data.config });
  } catch (err) {
    console.error('[dashboards] Config save error:', err.message);
    res.status(500).json({ error: 'Failed to save dashboard config' });
  }
});

// ─── Metric Catalog (User's tier + allowed domains) ──────────────────────────

/**
 * GET /api/dashboards/:tenantId/metric-catalog
 *
 * Returns the user's metric tier, allowed domains, template name, and default hero metrics.
 * Used by RBACContext on the frontend.
 */
router.get('/:tenantId/metric-catalog', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const template = await getUserTemplate(req.supabase, req.user.id, effectiveTenantId, req.user.role);
    res.json({
      metricTier: template.metric_tier,
      allowedDomains: template.allowed_domains,
      templateName: template.name,
      defaultHeroMetrics: template.default_hero_metrics,
    });
  } catch (err) {
    console.error('[dashboards] Metric catalog error:', err.message);
    res.status(500).json({ error: 'Failed to fetch metric catalog' });
  }
});

// ─── Role Templates CRUD ─────────────────────────────────────────────────────

/**
 * GET /api/dashboards/:tenantId/role-templates
 * List all role templates for a tenant. Any authenticated user can read.
 */
router.get('/:tenantId/role-templates', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('dashboard_role_templates')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[dashboards] Role templates list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch role templates' });
  }
});

/**
 * POST /api/dashboards/:tenantId/role-templates
 * Create a new role template. Admin only.
 */
router.post('/:tenantId/role-templates', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role);
  const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin && !isPlatform) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!isPlatform && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, description, metric_tier, allowed_domains, default_hero_metrics, is_default } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const validTiers = ['operational', 'managerial', 'financial'];
  if (metric_tier && !validTiers.includes(metric_tier)) {
    return res.status(400).json({ error: `metric_tier must be one of: ${validTiers.join(', ')}` });
  }

  try {
    // If is_default, clear existing defaults first
    if (is_default) {
      await req.supabase
        .from('dashboard_role_templates')
        .update({ is_default: false })
        .eq('tenant_id', effectiveTenantId)
        .eq('is_default', true);
    }

    const { data, error } = await req.supabase
      .from('dashboard_role_templates')
      .insert({
        tenant_id: effectiveTenantId,
        name: name.trim(),
        description: description?.trim() || null,
        metric_tier: metric_tier || 'operational',
        allowed_domains: allowed_domains || ['operations', 'labor', 'quality', 'timekeeping', 'safety'],
        default_hero_metrics: default_hero_metrics || null,
        is_default: is_default || false,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Template "${name}" already exists for this tenant` });
    }
    console.error('[dashboards] Role template create error:', err.message);
    res.status(500).json({ error: 'Failed to create role template' });
  }
});

/**
 * PUT /api/dashboards/:tenantId/role-templates/:id
 * Update an existing role template. Admin only.
 */
router.put('/:tenantId/role-templates/:id', async (req, res) => {
  const { tenantId, id } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role);
  const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin && !isPlatform) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!isPlatform && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, description, metric_tier, allowed_domains, default_hero_metrics, is_default } = req.body;
  const updates = {};

  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (metric_tier !== undefined) {
    const validTiers = ['operational', 'managerial', 'financial'];
    if (!validTiers.includes(metric_tier)) {
      return res.status(400).json({ error: `metric_tier must be one of: ${validTiers.join(', ')}` });
    }
    updates.metric_tier = metric_tier;
  }
  if (allowed_domains !== undefined) updates.allowed_domains = allowed_domains;
  if (default_hero_metrics !== undefined) updates.default_hero_metrics = default_hero_metrics;
  if (is_default !== undefined) updates.is_default = is_default;

  try {
    // If setting as default, clear existing defaults first
    if (is_default) {
      await req.supabase
        .from('dashboard_role_templates')
        .update({ is_default: false })
        .eq('tenant_id', effectiveTenantId)
        .eq('is_default', true);
    }

    const { data, error } = await req.supabase
      .from('dashboard_role_templates')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Template not found' });
    res.json(data);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Template name already exists for this tenant` });
    }
    console.error('[dashboards] Role template update error:', err.message);
    res.status(500).json({ error: 'Failed to update role template' });
  }
});

/**
 * DELETE /api/dashboards/:tenantId/role-templates/:id
 * Delete a role template. Admin only.
 */
router.delete('/:tenantId/role-templates/:id', async (req, res) => {
  const { tenantId, id } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role);
  const isPlatform = PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin && !isPlatform) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!isPlatform && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { error } = await req.supabase
      .from('dashboard_role_templates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', effectiveTenantId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[dashboards] Role template delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete role template' });
  }
});

// ─── Site Assignments CRUD ───────────────────────────────────────────────────

/**
 * GET /api/dashboards/:tenantId/site-assignments
 * Regular users: own assignments. Admins: all tenant assignments.
 */
router.get('/:tenantId/site-assignments', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const isAdmin = ['admin', 'super-admin'].includes(req.user?.role) || PLATFORM_ROLES.includes(req.user?.role);

    let query = req.supabase
      .from('user_site_assignments')
      .select('id, user_id, job_id, assigned_by, created_at')
      .eq('tenant_id', effectiveTenantId);

    // Non-admins only see their own assignments
    if (!isAdmin) {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query.order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[dashboards] Site assignments list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch site assignments' });
  }
});

/**
 * GET /api/dashboards/:tenantId/site-assignments/:userId
 * Admin only: get assignments for a specific user.
 */
router.get('/:tenantId/site-assignments/:userId', async (req, res) => {
  const { tenantId, userId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role) || PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('user_site_assignments')
      .select('id, user_id, job_id, assigned_by, created_at')
      .eq('tenant_id', effectiveTenantId)
      .eq('user_id', userId)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[dashboards] User site assignments error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user site assignments' });
  }
});

/**
 * PUT /api/dashboards/:tenantId/site-assignments/:userId
 * Admin only: bulk-set assignments. Body: { jobIds: [...] }
 * Deletes existing assignments and inserts new ones.
 */
router.put('/:tenantId/site-assignments/:userId', async (req, res) => {
  const { tenantId, userId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  const isAdmin = ['admin', 'super-admin'].includes(req.user?.role) || PLATFORM_ROLES.includes(req.user?.role);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { jobIds } = req.body;
  if (!Array.isArray(jobIds)) {
    return res.status(400).json({ error: 'jobIds must be an array' });
  }

  try {
    // Delete existing assignments
    const { error: deleteError } = await req.supabase
      .from('user_site_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', effectiveTenantId);

    if (deleteError) throw deleteError;

    // Insert new assignments (skip if empty — means "all sites")
    if (jobIds.length > 0) {
      const rows = jobIds.map(jobId => ({
        user_id: userId,
        tenant_id: effectiveTenantId,
        job_id: jobId,
        assigned_by: req.user.id,
      }));

      const { error: insertError } = await req.supabase
        .from('user_site_assignments')
        .insert(rows);

      if (insertError) throw insertError;
    }

    res.json({ ok: true, count: jobIds.length });
  } catch (err) {
    console.error('[dashboards] Site assignments update error:', err.message);
    res.status(500).json({ error: 'Failed to update site assignments' });
  }
});

// ─── Operational Intelligence (Command Center Section 3) ────────────────────

/**
 * GET /api/dashboards/:tenantId/ops-intelligence
 *
 * Returns counts for the Command Center's Operational Intelligence section:
 * active agents, deployed skills (SOPs), and completed automations.
 */
router.get('/:tenantId/ops-intelligence', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const key = cacheKey(effectiveTenantId, 'ops-intelligence', {});
  const cached = getCached(key);
  if (cached) return res.json(cached);

  try {
    // Fetch all counts in parallel
    const [agentsRes, sopsRes, automationsRes] = await Promise.all([
      req.supabase
        .from('alf_agent_definitions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      req.supabase
        .from('sop_analyses')
        .select('id, status')
        .eq('tenant_id', effectiveTenantId),
      req.supabase
        .from('automation_actions')
        .select('id, status')
        .eq('tenant_id', effectiveTenantId),
    ]);

    // Total agents (platform-wide, all active)
    const totalAgentsRes = await req.supabase
      .from('alf_agent_definitions')
      .select('id', { count: 'exact', head: true });

    const activeAgents = agentsRes.count || 0;
    const totalAgents = totalAgentsRes.count || 0;

    const sops = sopsRes.data || [];
    const deployedSkills = sops.filter(s => s.status === 'completed').length;
    const totalSkills = sops.length;

    const automations = automationsRes.data || [];
    const automationsCompleted = automations.filter(a => a.status === 'completed').length;
    const automationsTotal = automations.length;

    const result = {
      activeAgents,
      totalAgents,
      deployedSkills,
      totalSkills,
      automationsCompleted,
      automationsTotal,
    };

    setCache(key, result);
    res.json(result);
  } catch (err) {
    console.error('[dashboards] Ops intelligence error:', err.message);
    res.status(500).json({ error: 'Failed to fetch ops intelligence' });
  }
});

// ─── Generic Domain Data (MUST be last — catches :tenantId/:domain) ──────────

/**
 * GET /api/dashboards/:tenantId/:domain
 *
 * Fetch dashboard data for one domain.
 * Query params: dateFrom, dateTo, jobIds (comma-separated)
 * NOTE: This generic route MUST be defined LAST — after all specific routes.
 */
router.get('/:tenantId/:domain', async (req, res) => {
  const { tenantId, domain } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  // Tenant users can only access their own data
  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const validDomains = ['operations', 'labor', 'quality', 'timekeeping', 'safety'];
  if (!validDomains.includes(domain)) {
    return res.status(400).json({ error: `Invalid domain. Must be one of: ${validDomains.join(', ')}` });
  }

  // Apply user site scoping
  const requestedJobIds = req.query.jobIds ? req.query.jobIds.split(',') : null;
  const scopedJobIds = await getUserScopedJobIds(req.supabase, req.user.id, effectiveTenantId, req.user.role);
  const effectiveJobIds = intersectJobIds(scopedJobIds, requestedJobIds);

  const filters = {
    dateFrom: req.query.dateFrom || null,
    dateTo: req.query.dateTo || null,
    jobIds: effectiveJobIds,
  };

  const userId = scopedJobIds ? req.user.id : null;
  const key = cacheKey(effectiveTenantId, domain, filters, userId);
  const cached = getCached(key);
  if (cached) {
    return res.json(cached);
  }

  try {
    const data = await getDomainData(req.supabase, effectiveTenantId, domain, filters);
    setCache(key, data);
    res.json(data);
  } catch (err) {
    console.error(`[dashboards] ${domain} fetch error:`, err.message);
    res.status(500).json({ error: `Failed to fetch ${domain} data` });
  }
});

export default router;
