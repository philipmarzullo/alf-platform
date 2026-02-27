import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { resolveApiKey } from '../lib/resolveApiKey.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANALYSIS_MODEL = 'claude-sonnet-4-20250514';

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

// ─── In-Memory Cache (5-min TTL) ────────────────────────────────────────────

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(tenantId, domain, filters) {
  return `dashboard:${tenantId}:${domain}:${JSON.stringify(filters)}`;
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

  const filters = {
    dateFrom: req.body.dateFrom || null,
    dateTo: req.body.dateTo || null,
    jobIds: req.body.jobIds || null,
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

  const filters = {
    dateFrom: req.query.dateFrom || null,
    dateTo: req.query.dateTo || null,
    jobIds: req.query.jobIds ? req.query.jobIds.split(',') : null,
  };

  const key = cacheKey(effectiveTenantId, domain, filters);
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
