import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { resolveApiKey } from '../lib/resolveApiKey.js';
import { extractMemories } from './memory.js';

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

/**
 * Fetch operational data summaries from tenant_operational_context_queries.
 * Falls back to direct sf_* queries if no query rows exist (transition period).
 */
async function getOperationalContext(supabase, tenantId) {
  // Fetch configured queries
  const { data: queries } = await supabase
    .from('tenant_operational_context_queries')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order');

  if (!queries?.length) return null;

  // Validate source tables against tenant_data_sources allowlist
  const { data: dataSources } = await supabase
    .from('tenant_data_sources')
    .select('table_name')
    .eq('tenant_id', tenantId);

  const allowedTables = new Set((dataSources || []).map(ds => ds.table_name));

  const sections = [];

  for (const q of queries) {
    // Skip if source table isn't in discovered data sources (safety check)
    // Allow sf_* tables even without data_sources rows for backward compat
    if (!q.source_table.startsWith('sf_') && allowedTables.size > 0 && !allowedTables.has(q.source_table)) {
      continue;
    }

    try {
      let query = supabase
        .from(q.source_table)
        .select(q.select_columns.join(', '))
        .eq('tenant_id', tenantId);

      if (q.order_by) {
        const [col, dir] = q.order_by.split(' ');
        query = query.order(col, { ascending: dir !== 'desc' });
      }
      if (q.row_limit) {
        query = query.limit(q.row_limit);
      }

      const { data: rows, error } = await query;
      if (error || !rows?.length) continue;

      // Render based on summary_type
      if (q.summary_type === 'raw_table') {
        // Render as markdown table
        const cols = q.select_columns;
        const header = `| ${cols.join(' | ')} |`;
        const separator = `| ${cols.map(() => '---').join(' | ')} |`;
        const body = rows.map(r => `| ${cols.map(c => r[c] ?? '').join(' | ')} |`).join('\n');
        sections.push(`## ${q.label}\n${header}\n${separator}\n${body}`);
      } else {
        // For template type, pass raw rows — the label acts as section header
        // Build a simple summary: label + row count + raw data as markdown table
        const cols = q.select_columns;
        const header = `| ${cols.join(' | ')} |`;
        const separator = `| ${cols.map(() => '---').join(' | ')} |`;
        const body = rows.slice(0, 50).map(r => `| ${cols.map(c => r[c] ?? '').join(' | ')} |`).join('\n');
        sections.push(`## ${q.label} (${rows.length} rows)\n${header}\n${separator}\n${body}`);
      }
    } catch (err) {
      console.warn(`[claude] Op context query ${q.query_key} failed:`, err.message);
    }
  }

  if (sections.length === 0) return null;

  return `\n\n=== OPERATIONAL DATA ===
The following is a real-time summary of this tenant's operational data. Use it to answer questions about labor, quality, timekeeping, safety, budgets, and performance.\n\n${sections.join('\n\n')}`;
}

/**
 * Fetch extracted documents for a tenant + agent and build a context block.
 * Uses knowledge_scopes from tenant_agents DB instead of hardcoded map.
 */
async function getKnowledgeContext(supabase, tenantId, agentKey) {
  // Fetch agent config from DB
  const { data: agentRow } = await supabase
    .from('tenant_agents')
    .select('knowledge_scopes, inject_operational_context')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .single();

  const departments = agentRow?.knowledge_scopes || [];
  if (!departments.length) return null;

  // Stash agent row on function scope for caller to use
  getKnowledgeContext._lastAgent = agentRow;

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

  // Inject active automation skills for this agent, respecting execution mode
  const { data: skills } = await supabase
    .from('automation_actions')
    .select('id, title, agent_skill_prompt')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .eq('status', 'active')
    .not('agent_skill_prompt', 'is', null);

  if (skills?.length) {
    // Fetch automation preferences for this agent's skills
    const { data: prefs } = await supabase
      .from('automation_preferences')
      .select('action_key, execution_mode')
      .eq('tenant_id', tenantId)
      .eq('agent_key', agentKey)
      .eq('integration_type', 'agent_skill');

    const prefMap = {};
    for (const p of (prefs || [])) prefMap[p.action_key] = p.execution_mode;

    context += '\n\n=== AUTOMATION SKILLS ===\n';
    context += 'You have the following enhanced capabilities based on SOP analysis:\n\n';

    const skillBlocks = skills.map(s => {
      const mode = prefMap[s.id] || 'review'; // default to review if no pref set
      let modeInstruction = '';
      if (mode === 'draft') {
        modeInstruction = '\n[EXECUTION MODE: DRAFT] — Generate your output as a draft. Clearly label it "[DRAFT]" at the top. Explain that this is a draft for the user to review and edit before any action is taken. Do NOT present it as final or executed.';
      } else if (mode === 'review') {
        modeInstruction = '\n[EXECUTION MODE: REVIEW] — Generate your output and mark it "[PENDING REVIEW]" at the top. Include a brief summary of what will happen if approved. The user must approve before this takes effect.';
      }
      // 'automated' mode = no additional instruction, agent acts with full authority
      return `### ${s.title}\n${s.agent_skill_prompt}${modeInstruction}`;
    });

    context += skillBlocks.join('\n\n');
    console.log(`[claude] Injected ${skills.length} skill(s) for ${agentKey} (modes: ${skills.map(s => prefMap[s.id] || 'review').join(', ')})`);
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
 * Fetch approved agent instructions (global + tenant-specific) for injection.
 */
async function getAgentInstructions(supabase, tenantId, agentKey) {
  const { data: instructions } = await supabase
    .from('agent_instructions')
    .select('instruction_text, extracted_text, tenant_id, source')
    .eq('agent_key', agentKey)
    .eq('status', 'approved')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('created_at');

  if (!instructions?.length) return null;

  const blocks = instructions.map(i => {
    const scope = i.tenant_id ? '[TENANT]' : '[GLOBAL]';
    let text = `${scope} ${i.instruction_text}`;
    if (i.extracted_text) {
      text += `\n[ATTACHED DOCUMENT]\n${i.extracted_text}`;
    }
    return text;
  });

  console.log(`[claude] Injected ${instructions.length} agent instruction(s) for ${agentKey}`);

  return `\n\n=== AGENT INSTRUCTIONS ===
The following are specific instructions for how you should behave. Follow them precisely.\n\n${blocks.join('\n\n')}`;
}

/**
 * Look up active skill execution modes for a tenant + agent.
 * Returns an array of { skill_id, title, mode } for frontend metadata.
 */
async function getSkillExecutionModes(supabase, tenantId, agentKey) {
  const { data: skills } = await supabase
    .from('automation_actions')
    .select('id, title')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .eq('status', 'active')
    .not('agent_skill_prompt', 'is', null);

  if (!skills?.length) return null;

  const { data: prefs } = await supabase
    .from('automation_preferences')
    .select('action_key, execution_mode')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .eq('integration_type', 'agent_skill');

  const prefMap = {};
  for (const p of (prefs || [])) prefMap[p.action_key] = p.execution_mode;

  return skills.map(s => ({
    skill_id: s.id,
    title: s.title,
    mode: prefMap[s.id] || 'review',
  }));
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

      // Inject operational data for agents with inject_operational_context flag
      const agentRow = getKnowledgeContext._lastAgent;
      if (agentRow?.inject_operational_context) {
        const opsCtx = await getOperationalContext(req.supabase, effectiveTenantId);
        if (opsCtx) {
          enrichedSystem = enrichedSystem + opsCtx;
          console.log(`[claude] Injected operational data for ${agent_key} — ${opsCtx.length} chars`);
        }
      }

      // Inject approved agent instructions (global + tenant-specific)
      const instructionsCtx = await getAgentInstructions(req.supabase, effectiveTenantId, agent_key);
      if (instructionsCtx) {
        enrichedSystem = enrichedSystem + instructionsCtx;
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

    // Attach skill execution modes so frontend can render mode-appropriate UI
    let execution_context = null;
    if (effectiveTenantId && agent_key) {
      const modes = await getSkillExecutionModes(req.supabase, effectiveTenantId, agent_key);
      if (modes?.length) execution_context = { skills: modes };
    }

    // Fire-and-forget memory extraction from agent conversations
    if (effectiveTenantId && agent_key && messages.length >= 4) {
      const responseText = data.content?.[0]?.text || '';
      if (responseText) {
        const dept = agentRow?.knowledge_scopes?.[0] || 'general';
        const conversationText = messages
          .slice(-4)
          .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
          .join('\n\n');
        extractMemories(effectiveTenantId, conversationText, 'agent_interaction', null, dept);
      }
    }

    res.json({ ...data, execution_context });
  } catch (err) {
    console.error('[claude] Proxy error:', err.message);
    res.status(502).json({ error: 'Failed to reach AI service' });
  }
});

export default router;
