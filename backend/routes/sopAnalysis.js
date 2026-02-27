import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { resolveApiKey } from '../lib/resolveApiKey.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANALYSIS_MODEL = 'claude-sonnet-4-20250514';

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

// ─── Prompts ────────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `You are an SOP automation analyst for facility services companies. You analyze Standard Operating Procedures and identify manual steps that could be automated.

RULES:
- Be specific to the facility services context (janitorial, grounds, MEP)
- NEVER suggest automating safety inspections, compliance sign-offs, or anything requiring human judgment on safety
- Prioritize practical, accessible tools (Zapier, Power Automate, Google Forms, Slack bots) over complex AI/ML solutions
- Be conservative with time estimates — underestimate rather than overestimate
- automation_score is 0-100: 0 = fully manual with no automation opportunity, 100 = fully automatable
- automation_readiness: "high" = mostly digital processes ready to automate, "medium" = some digital + some paper, "low" = mostly paper/verbal processes

Return ONLY valid JSON matching the schema below. No markdown, no explanation, just JSON.`;

const ANALYSIS_USER_PROMPT = (fileName, department, text) => `Analyze this SOP document and return structured JSON.

FILE: ${fileName}
DEPARTMENT: ${department}

SOP TEXT:
${text}

Return JSON matching this exact schema:
{
  "summary": "string — 1-2 sentence description of what this SOP covers",
  "manual_steps": [
    {
      "step_number": 1,
      "description": "string — what the step involves",
      "frequency": "daily|weekly|monthly|quarterly|as-needed",
      "current_effort_minutes": 15,
      "complexity": "low|medium|high"
    }
  ],
  "automation_candidates": [
    {
      "step_numbers": [1, 3],
      "description": "string — what would be automated",
      "method": "workflow-automation|integration|ai-assist|rpa|notification",
      "suggested_tools": ["Zapier", "Power Automate"],
      "effort_to_automate": "low|medium|high",
      "impact": "low|medium|high",
      "priority": "quick-win|medium-term|long-term",
      "estimated_time_saved_minutes_per_occurrence": 10
    }
  ],
  "quick_wins": ["string — one-liner easy wins"],
  "long_term_items": ["string — one-liner bigger projects"],
  "automation_score": 72,
  "automation_readiness": "high|medium|low"
}`;

const ROADMAP_SYSTEM_PROMPT = `You are a process automation strategist for facility services companies. You aggregate individual SOP analyses into a phased automation roadmap for a department.

RULES:
- Group related automation opportunities across SOPs
- Quick wins: low effort, high impact, achievable in 0-30 days
- Medium-term: moderate effort, 1-3 months
- Long-term: high effort or dependency-heavy, 3-6 months
- Be specific about dependencies between items
- Provide a realistic total monthly time saved estimate
- recommended_first_action should be immediately actionable

Return ONLY valid JSON matching the schema below. No markdown, no explanation, just JSON.`;

const ROADMAP_USER_PROMPT = (department, analyses) => `Generate a phased automation roadmap for the ${department} department based on these SOP analyses.

SOP ANALYSES:
${JSON.stringify(analyses, null, 2)}

Return JSON matching this exact schema:
{
  "department": "${department}",
  "total_sops_analyzed": ${analyses.length},
  "overall_automation_score": 68,
  "summary": "string — executive summary of automation opportunity",
  "phases": [
    {
      "phase": "quick-wins",
      "label": "Quick Wins (0-30 days)",
      "items": [
        { "description": "string", "source_sop": "file.pdf", "effort": "low", "impact": "high", "estimated_time_saved": "5 hrs/month" }
      ]
    },
    {
      "phase": "medium-term",
      "label": "Medium-Term (1-3 months)",
      "items": [...]
    },
    {
      "phase": "long-term",
      "label": "Long-Term (3-6 months)",
      "items": [...]
    }
  ],
  "dependencies": [
    { "item": "string", "depends_on": "string", "reason": "string" }
  ],
  "total_estimated_monthly_time_saved": "40 hours",
  "recommended_first_action": "string — start with..."
}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function callClaude(apiKey, systemPrompt, userPrompt, maxTokens) {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: maxTokens,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `Anthropic API error: ${response.status}`);
  }

  return data;
}

function parseJsonResponse(data) {
  const text = data.content?.[0]?.text || '';
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

function requirePlatformAdmin(req, res) {
  if (!PLATFORM_ROLES.includes(req.user?.role)) {
    res.status(403).json({ error: 'Platform admin access required' });
    return false;
  }
  return true;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * POST /api/sop-analysis/analyze
 *
 * Analyze one or more SOP documents.
 * Body: { tenant_id, document_ids: [uuid] }
 */
router.post('/analyze', rateLimit, async (req, res) => {
  if (!requirePlatformAdmin(req, res)) return;

  const { tenant_id, document_ids } = req.body;

  if (!tenant_id || !document_ids?.length) {
    return res.status(400).json({ error: 'Required: tenant_id, document_ids (non-empty array)' });
  }

  // Resolve API key for this tenant
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = await resolveApiKey(req, { tenantIdOverride: tenant_id }));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  // Fetch documents
  const { data: docs, error: docErr } = await req.supabase
    .from('tenant_documents')
    .select('id, file_name, department, extracted_text')
    .eq('tenant_id', tenant_id)
    .in('id', document_ids)
    .eq('status', 'extracted');

  if (docErr) {
    console.error('[sop-analysis] Doc fetch error:', docErr.message);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }

  if (!docs?.length) {
    return res.status(404).json({ error: 'No extracted documents found for the given IDs' });
  }

  const results = [];

  for (const doc of docs) {
    // Upsert a pending row
    const { data: row, error: upsertErr } = await req.supabase
      .from('sop_analyses')
      .upsert({
        tenant_id,
        document_id: doc.id,
        department: doc.department,
        status: 'analyzing',
        analysis: null,
        model: ANALYSIS_MODEL,
        tokens_input: 0,
        tokens_output: 0,
        analyzed_by: req.user.id,
        error_message: null,
      }, { onConflict: 'document_id' })
      .select()
      .single();

    if (upsertErr) {
      console.error('[sop-analysis] Upsert error:', upsertErr.message);
      results.push({ document_id: doc.id, status: 'failed', error: upsertErr.message });
      continue;
    }

    try {
      const userPrompt = ANALYSIS_USER_PROMPT(doc.file_name, doc.department, doc.extracted_text);
      const data = await callClaude(apiKey, ANALYSIS_SYSTEM_PROMPT, userPrompt, 4096);
      const analysis = parseJsonResponse(data);
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;

      console.log(`[sop-analysis] OK — ${doc.file_name} | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

      // Update with results
      await req.supabase
        .from('sop_analyses')
        .update({
          status: 'completed',
          analysis,
          tokens_input: inputTokens,
          tokens_output: outputTokens,
        })
        .eq('id', row.id);

      // Log usage
      req.supabase
        .from('alf_usage_logs')
        .insert({
          tenant_id,
          user_id: req.user.id,
          action: 'sop_analysis',
          agent_key: 'automation',
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          model: ANALYSIS_MODEL,
        })
        .then(({ error }) => {
          if (error) console.warn('[sop-analysis] Usage log failed:', error.message);
        });

      results.push({ document_id: doc.id, analysis_id: row.id, status: 'completed', analysis });
    } catch (err) {
      console.error(`[sop-analysis] Analysis failed for ${doc.file_name}:`, err.message);

      await req.supabase
        .from('sop_analyses')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', row.id);

      results.push({ document_id: doc.id, analysis_id: row.id, status: 'failed', error: err.message });
    }
  }

  res.json({ results });
});

/**
 * POST /api/sop-analysis/roadmap
 *
 * Generate a department automation roadmap from completed SOP analyses.
 * Body: { tenant_id, department }
 */
router.post('/roadmap', rateLimit, async (req, res) => {
  if (!requirePlatformAdmin(req, res)) return;

  const { tenant_id, department } = req.body;

  if (!tenant_id || !department) {
    return res.status(400).json({ error: 'Required: tenant_id, department' });
  }

  // Resolve API key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = await resolveApiKey(req, { tenantIdOverride: tenant_id }));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  // Fetch completed analyses for this department
  const { data: analyses, error: fetchErr } = await req.supabase
    .from('sop_analyses')
    .select('id, document_id, department, analysis')
    .eq('tenant_id', tenant_id)
    .eq('department', department)
    .eq('status', 'completed');

  if (fetchErr) {
    console.error('[sop-analysis] Fetch analyses error:', fetchErr.message);
    return res.status(500).json({ error: 'Failed to fetch analyses' });
  }

  if (!analyses?.length) {
    return res.status(404).json({ error: 'No completed analyses found for this department' });
  }

  // Upsert a pending roadmap row
  const analysisIds = analyses.map(a => a.id);
  const analysisPayloads = analyses.map(a => a.analysis);

  const { data: row, error: upsertErr } = await req.supabase
    .from('dept_automation_roadmaps')
    .upsert({
      tenant_id,
      department,
      status: 'generating',
      roadmap: null,
      sop_analysis_ids: analysisIds,
      model: ANALYSIS_MODEL,
      tokens_input: 0,
      tokens_output: 0,
      generated_by: req.user.id,
      error_message: null,
    }, { onConflict: 'tenant_id,department' })
    .select()
    .single();

  if (upsertErr) {
    console.error('[sop-analysis] Roadmap upsert error:', upsertErr.message);
    return res.status(500).json({ error: 'Failed to create roadmap record' });
  }

  try {
    const userPrompt = ROADMAP_USER_PROMPT(department, analysisPayloads);
    const data = await callClaude(apiKey, ROADMAP_SYSTEM_PROMPT, userPrompt, 8192);
    const roadmap = parseJsonResponse(data);
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    console.log(`[sop-analysis] Roadmap OK — ${department} | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

    await req.supabase
      .from('dept_automation_roadmaps')
      .update({
        status: 'completed',
        roadmap,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
      })
      .eq('id', row.id);

    // Log usage
    req.supabase
      .from('alf_usage_logs')
      .insert({
        tenant_id,
        user_id: req.user.id,
        action: 'roadmap_generation',
        agent_key: 'automation',
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        model: ANALYSIS_MODEL,
      })
      .then(({ error }) => {
        if (error) console.warn('[sop-analysis] Usage log failed:', error.message);
      });

    res.json({ roadmap_id: row.id, status: 'completed', roadmap });
  } catch (err) {
    console.error('[sop-analysis] Roadmap generation failed:', err.message);

    await req.supabase
      .from('dept_automation_roadmaps')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', row.id);

    res.status(502).json({ error: 'Roadmap generation failed: ' + err.message });
  }
});

/**
 * GET /api/sop-analysis/results
 *
 * Fetch analyses and roadmaps for a tenant.
 * Query: ?tenant_id=...&department=... (department optional)
 */
router.get('/results', async (req, res) => {
  const { tenant_id, department } = req.query;

  // Tenant users auto-scope to own tenant; platform admins can specify
  let effectiveTenantId = req.tenantId;
  if (tenant_id && PLATFORM_ROLES.includes(req.user?.role)) {
    effectiveTenantId = tenant_id;
  }

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  try {
    // Fetch analyses
    let analysisQuery = req.supabase
      .from('sop_analyses')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });

    if (department) {
      analysisQuery = analysisQuery.eq('department', department);
    }

    const { data: analyses, error: aErr } = await analysisQuery;
    if (aErr) throw aErr;

    // Fetch roadmaps
    let roadmapQuery = req.supabase
      .from('dept_automation_roadmaps')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false });

    if (department) {
      roadmapQuery = roadmapQuery.eq('department', department);
    }

    const { data: roadmaps, error: rErr } = await roadmapQuery;
    if (rErr) throw rErr;

    res.json({ analyses: analyses || [], roadmaps: roadmaps || [] });
  } catch (err) {
    console.error('[sop-analysis] Results fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

export default router;
