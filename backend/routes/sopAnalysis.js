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

// ─── Action Conversion Prompts ──────────────────────────────────────────────

const CLASSIFICATION_SYSTEM_PROMPT = `You are an automation action classifier for facility services companies. You classify roadmap items into categories based on whether an AI agent can handle them.

RULES:
- "agent": AI agent can fully produce the deliverable (emails, checklists, instructions, templates, WinTeam steps)
- "hybrid": Agent can draft/assist but a human must review, approve, or deploy (workflow configs, integration specs, template packages, policy changes)
- "manual": Requires human judgment, compliance authority, vendor coordination, system access agents don't have (VP approvals, union negotiations, safety sign-offs)
- Be conservative — when in doubt, classify as hybrid rather than agent
- agent_key must match one of the available agents for the department

Return ONLY valid JSON. No markdown, no explanation.`;

const CLASSIFICATION_USER_PROMPT = (item, department, sopAnalysis, agentKeys) => `Classify this automation roadmap item.

ROADMAP ITEM: ${JSON.stringify(item)}
DEPARTMENT: ${department}
SOURCE SOP ANALYSIS: ${JSON.stringify(sopAnalysis)}
AVAILABLE AGENT KEYS FOR THIS DEPARTMENT: ${JSON.stringify(agentKeys)}

Return JSON:
{
  "assignee_type": "agent|hybrid|manual",
  "agent_key": "hr|finance|ops|sales|purchasing|admin|null",
  "title": "string — concise action title",
  "skill_summary": "string — what the agent would do",
  "agent_skill_context": "string — relevant SOP excerpt for the agent"
}`;

const SKILL_GENERATION_SYSTEM_PROMPT = `You are creating a new skill for an AI agent at a facility services company. The agent already has access to the full SOP document. This skill teaches the agent to handle a specific automation task.

RULES:
- Be specific and actionable — the agent will use this prompt verbatim
- Reference SOP steps by number where possible
- Specify the expected output format clearly
- Include quality criteria so the agent knows what "good" looks like
- Note any human handoff points

Return ONLY valid JSON. No markdown, no explanation.`;

const SKILL_GENERATION_USER_PROMPT = (action, sopContext) => `Generate a skill prompt for an AI agent.

TASK: ${action.title} — ${action.description}
RELEVANT SOP CONTEXT: ${action.agent_skill_context || sopContext || 'No specific SOP context available'}
DEPARTMENT: ${action.department}

Return JSON:
{
  "skill_prompt": "string — 200-400 word prompt that teaches the agent this skill",
  "suggested_action_label": "string — short label for this skill (e.g. 'Draft Benefits Reminder')",
  "suggested_action_description": "string — one-line description",
  "output_format": "email|checklist|instructions|template|report|other"
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

/**
 * Dual access control: platform admins pass through, tenant admins pass
 * if selfServicePipeline is enabled for the automation module.
 *
 * Sets req._isPlatformAdmin so routes can branch on caller type.
 */
async function requireAuthorizedUser(req, res) {
  // Platform admin — always allowed
  if (PLATFORM_ROLES.includes(req.user?.role)) {
    req._isPlatformAdmin = true;
    return true;
  }

  // Tenant user — must be admin + selfServicePipeline enabled
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super-admin';
  if (!isAdmin || !req.tenantId) {
    res.status(403).json({ error: 'Platform or tenant admin access required' });
    return false;
  }

  // Check module_config for selfServicePipeline
  const { data: tenant, error } = await req.supabase
    .from('alf_tenants')
    .select('module_config')
    .eq('id', req.tenantId)
    .single();

  if (error || !tenant) {
    res.status(403).json({ error: 'Unable to verify tenant configuration' });
    return false;
  }

  const automationActions = tenant.module_config?.automation?.actions || [];
  if (!automationActions.includes('selfServicePipeline')) {
    res.status(403).json({ error: 'Self-service pipeline is not enabled for your organization' });
    return false;
  }

  req._isPlatformAdmin = false;
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
  if (!(await requireAuthorizedUser(req, res))) return;

  const isPlatformAdmin = req._isPlatformAdmin;
  const tenant_id = isPlatformAdmin ? req.body.tenant_id : req.tenantId;
  const { document_ids } = req.body;
  const initiatedByType = isPlatformAdmin ? 'platform' : 'tenant';

  if (!tenant_id || !document_ids?.length) {
    return res.status(400).json({ error: 'Required: tenant_id, document_ids (non-empty array)' });
  }

  // Resolve API key — platform admins override tenant_id, tenant admins use own key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = isPlatformAdmin
      ? await resolveApiKey(req, { tenantIdOverride: tenant_id })
      : await resolveApiKey(req));
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
        initiated_by_type: initiatedByType,
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
          initiated_by_type: initiatedByType,
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
  if (!(await requireAuthorizedUser(req, res))) return;

  const isPlatformAdmin = req._isPlatformAdmin;
  const tenant_id = isPlatformAdmin ? req.body.tenant_id : req.tenantId;
  const { department } = req.body;
  const initiatedByType = isPlatformAdmin ? 'platform' : 'tenant';

  if (!tenant_id || !department) {
    return res.status(400).json({ error: 'Required: tenant_id, department' });
  }

  // Resolve API key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = isPlatformAdmin
      ? await resolveApiKey(req, { tenantIdOverride: tenant_id })
      : await resolveApiKey(req));
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
      initiated_by_type: initiatedByType,
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
        initiated_by_type: initiatedByType,
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

// ─── Phase 2: Action Conversion & Skill Generation ─────────────────────────

// Maps departments to their primary agent keys
const DEPT_AGENT_MAP = {
  hr: ['hr'],
  finance: ['finance'],
  purchasing: ['purchasing'],
  sales: ['sales'],
  ops: ['ops'],
  admin: ['admin'],
  general: ['admin'],
};

/**
 * POST /api/sop-analysis/convert-to-actions
 *
 * Convert a department roadmap into trackable automation actions.
 * Body: { tenant_id, roadmap_id }
 */
router.post('/convert-to-actions', rateLimit, async (req, res) => {
  if (!(await requireAuthorizedUser(req, res))) return;

  const isPlatformAdmin = req._isPlatformAdmin;
  const tenant_id = isPlatformAdmin ? req.body.tenant_id : req.tenantId;
  const { roadmap_id } = req.body;
  const initiatedByType = isPlatformAdmin ? 'platform' : 'tenant';

  if (!tenant_id || !roadmap_id) {
    return res.status(400).json({ error: 'Required: tenant_id, roadmap_id' });
  }

  // Resolve API key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = isPlatformAdmin
      ? await resolveApiKey(req, { tenantIdOverride: tenant_id })
      : await resolveApiKey(req));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  // Fetch roadmap
  const { data: roadmap, error: rmErr } = await req.supabase
    .from('dept_automation_roadmaps')
    .select('*')
    .eq('id', roadmap_id)
    .eq('tenant_id', tenant_id)
    .eq('status', 'completed')
    .single();

  if (rmErr || !roadmap) {
    return res.status(404).json({ error: 'Completed roadmap not found' });
  }

  // Fetch related SOP analyses for context
  const { data: sopAnalyses } = await req.supabase
    .from('sop_analyses')
    .select('id, document_id, analysis')
    .eq('tenant_id', tenant_id)
    .eq('department', roadmap.department)
    .eq('status', 'completed');

  const sopContext = sopAnalyses?.map(a => a.analysis) || [];
  const agentKeys = DEPT_AGENT_MAP[roadmap.department] || ['admin'];
  const actions = [];

  // Process each phase's items
  for (const phase of (roadmap.roadmap?.phases || [])) {
    const phaseKey = phase.phase === 'quick-wins' ? 'quick-win' : phase.phase;

    for (const item of (phase.items || [])) {
      try {
        const userPrompt = CLASSIFICATION_USER_PROMPT(item, roadmap.department, sopContext, agentKeys);
        const data = await callClaude(apiKey, CLASSIFICATION_SYSTEM_PROMPT, userPrompt, 1024);
        const classification = parseJsonResponse(data);

        const inputTokens = data.usage?.input_tokens || 0;
        const outputTokens = data.usage?.output_tokens || 0;

        console.log(`[sop-analysis] Classified: "${classification.title}" → ${classification.assignee_type} | tokens: ${inputTokens}+${outputTokens}`);

        // Insert action row
        const { data: actionRow, error: insertErr } = await req.supabase
          .from('automation_actions')
          .insert({
            tenant_id,
            department: roadmap.department,
            roadmap_id: roadmap.id,
            phase: phaseKey,
            title: classification.title || item.description?.slice(0, 100) || 'Untitled action',
            description: item.description || classification.skill_summary || '',
            source_sop: item.source_sop || null,
            assignee_type: classification.assignee_type || 'manual',
            status: classification.assignee_type === 'manual' ? 'manual' : 'planned',
            agent_key: classification.agent_key || null,
            agent_skill_context: classification.agent_skill_context || null,
            effort: item.effort || null,
            impact: item.impact || null,
            estimated_time_saved: item.estimated_time_saved || null,
            initiated_by_type: initiatedByType,
          })
          .select()
          .single();

        if (insertErr) {
          console.error('[sop-analysis] Action insert error:', insertErr.message);
          continue;
        }

        // Log usage
        req.supabase
          .from('alf_usage_logs')
          .insert({
            tenant_id,
            user_id: req.user.id,
            action: 'action_classification',
            agent_key: 'automation',
            tokens_input: inputTokens,
            tokens_output: outputTokens,
            model: ANALYSIS_MODEL,
            initiated_by_type: initiatedByType,
          })
          .then(({ error }) => {
            if (error) console.warn('[sop-analysis] Usage log failed:', error.message);
          });

        actions.push(actionRow);
      } catch (err) {
        console.error(`[sop-analysis] Classification failed for item:`, err.message);
        // Insert as manual fallback
        const { data: fallbackRow } = await req.supabase
          .from('automation_actions')
          .insert({
            tenant_id,
            department: roadmap.department,
            roadmap_id: roadmap.id,
            phase: phaseKey,
            title: item.description?.slice(0, 100) || 'Untitled action',
            description: item.description || '',
            source_sop: item.source_sop || null,
            assignee_type: 'manual',
            status: 'manual',
            effort: item.effort || null,
            impact: item.impact || null,
            estimated_time_saved: item.estimated_time_saved || null,
            initiated_by_type: initiatedByType,
          })
          .select()
          .single();

        if (fallbackRow) actions.push(fallbackRow);
      }
    }
  }

  res.json({ actions, count: actions.length });
});

/**
 * POST /api/sop-analysis/generate-skill
 *
 * Generate an agent skill prompt for an automation action.
 * Body: { tenant_id, action_id }
 */
router.post('/generate-skill', rateLimit, async (req, res) => {
  if (!(await requireAuthorizedUser(req, res))) return;

  const isPlatformAdmin = req._isPlatformAdmin;
  const tenant_id = isPlatformAdmin ? req.body.tenant_id : req.tenantId;
  const { action_id } = req.body;
  const initiatedByType = isPlatformAdmin ? 'platform' : 'tenant';

  if (!tenant_id || !action_id) {
    return res.status(400).json({ error: 'Required: tenant_id, action_id' });
  }

  // Resolve API key
  let apiKey, keySource;
  try {
    ({ apiKey, keySource } = isPlatformAdmin
      ? await resolveApiKey(req, { tenantIdOverride: tenant_id })
      : await resolveApiKey(req));
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  // Fetch the action
  const { data: action, error: actErr } = await req.supabase
    .from('automation_actions')
    .select('*')
    .eq('id', action_id)
    .eq('tenant_id', tenant_id)
    .single();

  if (actErr || !action) {
    return res.status(404).json({ error: 'Action not found' });
  }

  if (!['planned', 'ready_for_review'].includes(action.status)) {
    return res.status(400).json({ error: `Cannot generate skill for action with status: ${action.status}` });
  }

  // Update status to generating
  await req.supabase
    .from('automation_actions')
    .update({ status: 'skill_generating' })
    .eq('id', action_id);

  try {
    // Fetch source SOP context if available
    let sopContext = action.agent_skill_context || '';
    if (!sopContext && action.source_sop) {
      const { data: docs } = await req.supabase
        .from('tenant_documents')
        .select('extracted_text')
        .eq('tenant_id', tenant_id)
        .ilike('file_name', `%${action.source_sop}%`)
        .limit(1);

      if (docs?.[0]?.extracted_text) {
        sopContext = docs[0].extracted_text.slice(0, 3000);
      }
    }

    const userPrompt = SKILL_GENERATION_USER_PROMPT(action, sopContext);
    const data = await callClaude(apiKey, SKILL_GENERATION_SYSTEM_PROMPT, userPrompt, 2048);
    const skill = parseJsonResponse(data);
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    console.log(`[sop-analysis] Skill generated: "${action.title}" | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

    // Update action with generated skill
    const { data: updated, error: updateErr } = await req.supabase
      .from('automation_actions')
      .update({
        agent_skill_prompt: skill.skill_prompt,
        status: 'ready_for_review',
      })
      .eq('id', action_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Log usage
    req.supabase
      .from('alf_usage_logs')
      .insert({
        tenant_id,
        user_id: req.user.id,
        action: 'skill_generation',
        agent_key: 'automation',
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        model: ANALYSIS_MODEL,
        initiated_by_type: initiatedByType,
      })
      .then(({ error }) => {
        if (error) console.warn('[sop-analysis] Usage log failed:', error.message);
      });

    res.json({ action: updated, skill });
  } catch (err) {
    console.error('[sop-analysis] Skill generation failed:', err.message);

    await req.supabase
      .from('automation_actions')
      .update({ status: 'planned' })
      .eq('id', action_id);

    res.status(502).json({ error: 'Skill generation failed: ' + err.message });
  }
});

/**
 * POST /api/sop-analysis/activate-skill
 *
 * Activate an agent skill — push it into tenant_agent_overrides.
 * Body: { tenant_id, action_id }
 */
router.post('/activate-skill', rateLimit, async (req, res) => {
  if (!(await requireAuthorizedUser(req, res))) return;

  const isPlatformAdmin = req._isPlatformAdmin;
  const tenant_id = isPlatformAdmin ? req.body.tenant_id : req.tenantId;
  const { action_id } = req.body;

  if (!tenant_id || !action_id) {
    return res.status(400).json({ error: 'Required: tenant_id, action_id' });
  }

  // Fetch the action
  const { data: action, error: actErr } = await req.supabase
    .from('automation_actions')
    .select('*')
    .eq('id', action_id)
    .eq('tenant_id', tenant_id)
    .single();

  if (actErr || !action) {
    return res.status(404).json({ error: 'Action not found' });
  }

  if (action.status !== 'ready_for_review') {
    return res.status(400).json({ error: `Cannot activate action with status: ${action.status}` });
  }

  if (!action.agent_skill_prompt || !action.agent_key) {
    return res.status(400).json({ error: 'Action must have agent_skill_prompt and agent_key to activate' });
  }

  try {
    // Fetch or create tenant_agent_overrides row
    const { data: existing } = await req.supabase
      .from('tenant_agent_overrides')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('agent_key', action.agent_key)
      .single();

    const skillBlock = `\n\n<!-- SKILL:${action.id} -->\n### ${action.title}\n${action.agent_skill_prompt}\n<!-- /SKILL:${action.id} -->`;

    if (existing) {
      // Append skill to existing prompt additions
      const currentAdditions = existing.custom_prompt_additions || '';
      await req.supabase
        .from('tenant_agent_overrides')
        .update({
          custom_prompt_additions: currentAdditions + skillBlock,
        })
        .eq('id', existing.id);
    } else {
      // Create new override row
      await req.supabase
        .from('tenant_agent_overrides')
        .insert({
          tenant_id,
          agent_key: action.agent_key,
          custom_prompt_additions: skillBlock,
          is_enabled: true,
        });
    }

    // Update action status
    const { data: updated, error: updateErr } = await req.supabase
      .from('automation_actions')
      .update({ status: 'active' })
      .eq('id', action_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    console.log(`[sop-analysis] Skill activated: "${action.title}" → ${action.agent_key} agent`);

    res.json({ action: updated });
  } catch (err) {
    console.error('[sop-analysis] Skill activation failed:', err.message);
    res.status(500).json({ error: 'Skill activation failed: ' + err.message });
  }
});

/**
 * GET /api/sop-analysis/actions
 *
 * Fetch automation actions for a tenant.
 * Query: ?tenant_id=...&department=...&status=...
 */
router.get('/actions', async (req, res) => {
  const { tenant_id, department, status } = req.query;

  let effectiveTenantId = req.tenantId;
  if (tenant_id && PLATFORM_ROLES.includes(req.user?.role)) {
    effectiveTenantId = tenant_id;
  }

  if (!effectiveTenantId) {
    return res.status(400).json({ error: 'tenant_id required' });
  }

  try {
    let query = req.supabase
      .from('automation_actions')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: true });

    if (department) query = query.eq('department', department);
    if (status) query = query.eq('status', status);

    const { data: actions, error: err } = await query;
    if (err) throw err;

    res.json({ actions: actions || [] });
  } catch (err) {
    console.error('[sop-analysis] Actions fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch actions' });
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
