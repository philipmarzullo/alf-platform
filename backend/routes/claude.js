import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { resolveApiKey } from '../lib/resolveApiKey.js';
import { extractMemories } from './memory.js';
import { semanticSearch, hasEmbeddings } from '../lib/semanticSearch.js';
import { SNOWFLAKE_QUERY_TOOL, executeSnowflakeQuery } from '../lib/snowflakeQueryTool.js';
import SnowflakeConnector from '../sync/connectors/SnowflakeConnector.js';
import { getPlatformApiKey } from './platformCredentials.js';

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
async function getKnowledgeContext(supabase, tenantId, agentKey, userMessage) {
  // Fetch agent config from DB
  let { data: agentRow } = await supabase
    .from('tenant_agents')
    .select('knowledge_scopes, inject_operational_context')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .maybeSingle();

  // Fallback: if no agent row, check tenant_tools for tool→agent mapping
  // (e.g. tool_key='qbu' maps to agent_key='operations')
  if (!agentRow) {
    const { data: toolRow } = await supabase
      .from('tenant_tools')
      .select('agent_key')
      .eq('tenant_id', tenantId)
      .eq('tool_key', agentKey)
      .maybeSingle();

    if (toolRow?.agent_key && toolRow.agent_key !== agentKey) {
      const { data: mappedAgent } = await supabase
        .from('tenant_agents')
        .select('knowledge_scopes, inject_operational_context')
        .eq('tenant_id', tenantId)
        .eq('agent_key', toolRow.agent_key)
        .maybeSingle();

      if (mappedAgent) {
        agentRow = mappedAgent;
        console.log(`[claude] Tool fallback: ${agentKey} → ${toolRow.agent_key} knowledge_scopes`);
      }
    }
  }

  const departments = agentRow?.knowledge_scopes || [];
  if (!departments.length) return null;

  // Stash agent row on function scope for caller to use
  getKnowledgeContext._lastAgent = agentRow;

  let context = '';

  // Dual-path: semantic search when embeddings exist, keyword fallback otherwise
  let usedSemantic = false;
  if (userMessage) {
    try {
      const embeddingsExist = await hasEmbeddings(supabase, tenantId);
      if (embeddingsExist) {
        const semanticCtx = await semanticSearch(supabase, tenantId, userMessage);
        if (semanticCtx) {
          context += semanticCtx;
          usedSemantic = true;
          console.log(`[claude] Used semantic search for ${agentKey} — ${semanticCtx.length} chars`);
        }
      }
    } catch (err) {
      console.warn(`[claude] Semantic search failed, falling back to keywords:`, err.message);
    }
  }

  // Keyword fallback: fetch full documents by department match
  if (!usedSemantic) {
    const { data: docs } = await supabase
      .from('tenant_documents')
      .select('file_name, doc_type, department, extracted_text')
      .eq('tenant_id', tenantId)
      .eq('status', 'extracted')
      .in('department', departments)
      .order('doc_type')
      .limit(20);

    if (docs?.length) {
      const blocks = docs.map(d =>
        `--- ${d.doc_type.toUpperCase()}: ${d.file_name} (${d.department}) ---\n${d.extracted_text}`
      );
      context += `\n\n=== TENANT KNOWLEDGE BASE ===\nThe following documents have been uploaded for this tenant. Use them as reference when answering questions. Follow SOPs exactly as documented.\n\n${blocks.join('\n\n')}`;
    }
  }

  // Inject RFP Q&A library + verified facts for the rfp_builder agent
  if (agentKey === 'rfp_builder') {
    const [qaRes, factsRes] = await Promise.all([
      supabase
        .from('tenant_rfp_answers')
        .select('question, answer, category, tags, win_count, use_count')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('win_count', { ascending: false })
        .limit(50),
      supabase
        .from('tenant_rfp_facts')
        .select('fact_key, fact_value, category, source')
        .eq('tenant_id', tenantId),
    ]);

    const qaEntries = qaRes.data;
    const factEntries = factsRes.data;

    // Inject verified facts FIRST so the agent treats them as ground truth
    if (factEntries?.length) {
      const filled = factEntries.filter(f => f.fact_value && String(f.fact_value).trim());
      if (filled.length) {
        // Group by category for readability
        const grouped = {};
        for (const f of filled) {
          if (!grouped[f.category]) grouped[f.category] = [];
          grouped[f.category].push(f);
        }
        const blocks = Object.entries(grouped).map(([cat, rows]) => {
          const lines = rows.map(r => `  ${r.fact_key} = ${r.fact_value}`).join('\n');
          return `[${cat}]\n${lines}`;
        });
        context += '\n\n=== RFP VERIFIED FACTS ===\n';
        context += 'The following are tenant-verified facts. Treat them as ground truth — never invent values that contradict them. If a question requires a fact NOT in this list, mark the item as needs_data rather than guessing.\n\n';
        context += blocks.join('\n\n');
        console.log(`[claude] Injected ${filled.length} RFP facts for rfp_builder`);
      }
    }

    if (qaEntries?.length) {
      context += '\n\n=== RFP Q&A LIBRARY ===\n';
      context += 'The following are previously curated and approved Q&A pairs. Prefer these answers when the question matches or is similar. Adapt wording to fit the specific RFP context.\n\n';
      context += qaEntries.map(qa =>
        `[${qa.category}] Q: ${qa.question}\nA: ${qa.answer}${qa.win_count > 0 ? ` (used in ${qa.win_count} winning response${qa.win_count > 1 ? 's' : ''})` : ''}`
      ).join('\n\n');
      console.log(`[claude] Injected ${qaEntries.length} RFP Q&A entries for rfp_builder`);
    }
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

    // Look up SOP step assignments for each skill to inject routing context
    const skillStepAssignments = {};
    const { data: stepAssignments } = await supabase
      .from('tenant_sop_steps')
      .select(`
        automation_action_id,
        tenant_sop_assignments(assignment_type, assigned_to_role,
          profiles!assigned_to_user_id(name)
        )
      `)
      .eq('tenant_id', tenantId)
      .in('automation_action_id', skills.map(s => s.id))
      .not('automation_action_id', 'is', null);

    for (const sa of (stepAssignments || [])) {
      if (sa.tenant_sop_assignments?.length) {
        skillStepAssignments[sa.automation_action_id] = sa.tenant_sop_assignments;
      }
    }

    const skillBlocks = skills.map(s => {
      const mode = prefMap[s.id] || 'review'; // default to review if no pref set
      let modeInstruction = '';
      if (mode === 'draft') {
        modeInstruction = '\n[EXECUTION MODE: DRAFT] — Generate your output as a draft. Clearly label it "[DRAFT]" at the top. Explain that this is a draft for the user to review and edit before any action is taken. Do NOT present it as final or executed.';
      } else if (mode === 'review') {
        modeInstruction = '\n[EXECUTION MODE: REVIEW] — Generate your output and mark it "[PENDING REVIEW]" at the top. Include a brief summary of what will happen if approved. The user must approve before this takes effect.';
      }
      // 'automated' mode = no additional instruction, agent acts with full authority

      // Inject assignment routing awareness
      const assignments = skillStepAssignments[s.id] || [];
      let routingNote = '';
      if (assignments.length) {
        const reviewer = assignments.find(a => a.assignment_type === 'reviewer');
        const owner = assignments.find(a => a.assignment_type === 'owner');
        const targets = [];
        if (reviewer) {
          targets.push(`reviewer: ${reviewer.profiles?.name || reviewer.assigned_to_role || 'unspecified'}`);
        }
        if (owner) {
          targets.push(`owner: ${owner.profiles?.name || owner.assigned_to_role || 'unspecified'}`);
        }
        if (targets.length) {
          routingNote = `\n[ROUTING] After completing this task, output will be routed to ${targets.join(', ')}. Do not present output as final if a reviewer is assigned.`;
        }
      }

      return `### ${s.title}\n${s.agent_skill_prompt}${modeInstruction}${routingNote}`;
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
 * Resolve agent config (system prompt + model) from the database.
 * Checks tenant_agents first (if tenant_id provided), then alf_agent_definitions.
 */
async function resolveAgentFromDb(supabase, agentKey, tenantId) {
  if (tenantId) {
    const { data: tenantAgent } = await supabase
      .from('tenant_agents')
      .select('system_prompt, model')
      .eq('tenant_id', tenantId)
      .eq('agent_key', agentKey)
      .single();

    if (tenantAgent) return tenantAgent;
  }

  const { data: platformAgent } = await supabase
    .from('alf_agent_definitions')
    .select('system_prompt, model')
    .eq('agent_key', agentKey)
    .single();

  return platformAgent || null;
}

/**
 * POST /api/claude
 *
 * Proxies a Claude API call. When system prompt is not provided in the request,
 * resolves it from the database (tenant_agents → alf_agent_definitions fallback).
 *
 * Expected body: { messages, agent_key, tenant_id?, model?, system?, max_tokens?, page_context? }
 */
router.post('/', rateLimit, async (req, res) => {
  let { model, system, messages, max_tokens, agent_key, page_context } = req.body;

  // Basic validation
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing required field: messages' });
  }

  // Admin-only agent gate
  const ADMIN_ROLES = new Set(['admin', 'super-admin', 'platform_owner']);
  const userRole = req.user?.role;

  if (agent_key === 'analytics' && !ADMIN_ROLES.has(userRole)) {
    return res.status(403).json({ error: 'Analytics agent requires admin access' });
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

  // Resolve system prompt + model from DB when not provided by client
  if (!system && agent_key) {
    const agentConfig = await resolveAgentFromDb(req.supabase, agent_key, effectiveTenantId);
    if (agentConfig) {
      system = agentConfig.system_prompt || '';
      if (!model) model = agentConfig.model;
      console.log(`[claude] Resolved ${agent_key} from DB — ${system.length} char prompt`);
    }
  }

  // Apply page_context to system prompt
  if (page_context && system) {
    system += `\n\nCurrent page context: The user is currently viewing: ${page_context}. Use this context to give relevant, specific answers.`;
  }

  // Default model fallback
  if (!model) model = 'claude-sonnet-4-5-20250929';

  try {
    // Enrich system prompt with tenant knowledge docs
    let enrichedSystem = system || '';
    if (effectiveTenantId && agent_key) {
      // Extract last user message for semantic search
      const lastUserMessage = [...(messages || [])].reverse().find(m => m.role === 'user');
      const userQuery = typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content
        : lastUserMessage?.content?.[0]?.text || '';

      // Analytics agent uses Snowflake queries + dashboard context — skip heavy knowledge docs
      const skipKnowledge = agent_key === 'analytics';
      if (!skipKnowledge) {
        const knowledgeCtx = await getKnowledgeContext(req.supabase, effectiveTenantId, agent_key, userQuery);
        if (knowledgeCtx) {
          enrichedSystem = enrichedSystem + knowledgeCtx;
          console.log(`[claude] Injected knowledge for ${agent_key} — ${knowledgeCtx.length} chars`);
        }
      } else {
        // Still need to load agent row for inject_operational_context flag
        const { data: agentRow } = await req.supabase
          .from('tenant_agents')
          .select('knowledge_scopes, inject_operational_context')
          .eq('tenant_id', effectiveTenantId)
          .eq('agent_key', agent_key)
          .maybeSingle();
        getKnowledgeContext._lastAgent = agentRow;

        // Load cached schema profile for analytics agent
        const { data: profileRow } = await req.supabase
          .from('tenant_schema_profiles')
          .select('profile_text')
          .eq('tenant_id', effectiveTenantId)
          .maybeSingle();

        if (profileRow?.profile_text) {
          enrichedSystem += '\n\n' + profileRow.profile_text;
          console.log(`[claude] Injected schema profile — ${profileRow.profile_text.length} chars`);
        }
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

      // Inject connected integrations context
      const { data: tenantConns } = await req.supabase
        .from('tenant_connections')
        .select('connection_type, provider, capabilities')
        .eq('tenant_id', effectiveTenantId)
        .eq('status', 'connected');
      if (tenantConns?.length) {
        const caps = tenantConns.flatMap(c => c.capabilities || []);
        const parts = ['\n\n=== CONNECTED INTEGRATIONS ==='];
        if (caps.includes('can_send_email')) {
          parts.push('This tenant has email connected. Format email drafts with clear Subject: line and body.');
          parts.push('The user can send drafts directly via My Work.');
        }
        if (parts.length > 1) {
          enrichedSystem = enrichedSystem + parts.join('\n');
        }
      }
    }

    // ── Snowflake direct query setup ──
    let snowflakeDirect = false;
    let sfConfig = null;
    if (effectiveTenantId) {
      const { data: tRow } = await req.supabase
        .from('alf_tenants')
        .select('snowflake_direct')
        .eq('id', effectiveTenantId)
        .single();
      snowflakeDirect = tRow?.snowflake_direct || false;

      if (snowflakeDirect) {
        const { data: sc } = await req.supabase
          .from('sync_configs')
          .select('config')
          .eq('tenant_id', effectiveTenantId)
          .eq('connector_type', 'snowflake')
          .single();
        sfConfig = sc?.config;

        if (sfConfig) {
          const credJson = await getPlatformApiKey(req.supabase, 'snowflake');
          if (credJson) {
            sfConfig._credentials = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;
          }
        }
      }
    }

    const tools = snowflakeDirect && sfConfig && ADMIN_ROLES.has(userRole) ? [SNOWFLAKE_QUERY_TOOL] : [];
    let sfConnector = null;

    // Safety cap: truncate enriched system prompt if too large (~80K chars ≈ 20K tokens)
    const MAX_SYSTEM_CHARS = 80000;
    if (enrichedSystem.length > MAX_SYSTEM_CHARS) {
      console.warn(`[claude] System prompt too large (${enrichedSystem.length} chars), truncating to ${MAX_SYSTEM_CHARS}`);
      enrichedSystem = enrichedSystem.slice(0, MAX_SYSTEM_CHARS) + '\n\n[Context truncated due to size limits]';
    }

    console.log(`[claude] Final system prompt: ${enrichedSystem.length} chars | messages: ${JSON.stringify(messages).length} chars | tools: ${tools.length}`);

    try {
      let apiMessages = [...messages];
      let totalInput = 0, totalOutput = 0;
      let sfQueryCount = 0;
      let data;
      const MAX_ROUNDS = 5;

      for (let round = 0; round < MAX_ROUNDS; round++) {
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
            messages: apiMessages,
            max_tokens: max_tokens || 4096,
            ...(tools.length ? { tools } : {}),
          }),
        });

        data = await anthropicResponse.json();

        if (!anthropicResponse.ok) {
          console.error('[claude] Anthropic error:', data.error?.message || anthropicResponse.status);
          return res.status(anthropicResponse.status).json({
            error: data.error?.message || `Anthropic API error: ${anthropicResponse.status}`,
          });
        }

        totalInput += data.usage?.input_tokens || 0;
        totalOutput += data.usage?.output_tokens || 0;

        if (data.stop_reason !== 'tool_use') break;

        // Lazy-connect Snowflake on first tool_use
        if (!sfConnector && sfConfig) {
          sfConnector = new SnowflakeConnector(effectiveTenantId, sfConfig, sfConfig._credentials);
          await sfConnector.connect();
          console.log(`[claude] Snowflake connected for tenant ${effectiveTenantId}`);
        }

        // Execute tool calls, build results (cap each result to prevent context blowup)
        const MAX_TOOL_RESULT_CHARS = 15000;
        const toolResults = [];
        for (const block of data.content.filter(b => b.type === 'tool_use')) {
          console.log(`[claude] Tool call: ${block.name}(${JSON.stringify(block.input).slice(0, 200)})`);
          try {
            const result = await executeSnowflakeQuery(block.input, sfConnector, sfConfig);
            sfQueryCount++;
            let resultStr = JSON.stringify(result);
            if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
              const rowCount = Array.isArray(result) ? result.length : (result?.rows?.length || '?');
              resultStr = resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + `\n\n[Result truncated — ${rowCount} total rows. Use filters or GROUP BY to narrow results.]`;
              console.log(`[claude] Tool result truncated: ${resultStr.length} chars (was ${JSON.stringify(result).length})`);
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultStr });
          } catch (err) {
            console.warn(`[claude] Tool error: ${err.message}`);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: err.message }), is_error: true });
          }
        }

        apiMessages.push({ role: 'assistant', content: data.content });
        apiMessages.push({ role: 'user', content: toolResults });
        console.log(`[claude] Tool round ${round + 1} complete, continuing...`);
      }

      const inputTokens = totalInput;
      const outputTokens = totalOutput;
      console.log(`[claude] OK — ${model} | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}${sfConnector ? ' | snowflake_direct' : ''}`);

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
          snowflake_queries: sfQueryCount,
          snowflake_credits_est: sfQueryCount * 0.003,
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

      // Fire-and-forget: route agent output to user tasks for draft/review modes
      if (effectiveTenantId && agent_key && execution_context?.skills?.length) {
        const responseText = data.content?.[0]?.text || '';
        for (const skill of execution_context.skills) {
          // Automated mode: attempt email send if tenant has email connected
          if (skill.mode === 'automated') {
            const subjectLine = responseText.match(/^Subject:\s*(.+)$/m);
            const toLine = responseText.match(/^To:\s*(.+)$/m);
            if (subjectLine && toLine) {
              // Check for email connection
              const { data: emailConn } = await req.supabase
                .from('tenant_connections')
                .select('id')
                .eq('tenant_id', effectiveTenantId)
                .eq('connection_type', 'email')
                .eq('status', 'connected')
                .maybeSingle();
              if (emailConn) {
                // Fire-and-forget auto-send
                (async () => {
                  try {
                    const { getValidMsToken } = await import('../lib/msTokens.js');
                    const token = await getValidMsToken(effectiveTenantId);
                    const emailBody = responseText
                      .replace(/^Subject:\s*.+$/m, '')
                      .replace(/^To:\s*.+$/m, '')
                      .trim();
                    const toAddresses = toLine[1].split(',').map(e => e.trim()).filter(Boolean);
                    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token.access_token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        message: {
                          subject: subjectLine[1].trim(),
                          body: { contentType: 'HTML', content: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;">${emailBody.replace(/\n/g, '<br>')}</div>` },
                          toRecipients: toAddresses.map(e => ({ emailAddress: { address: e } })),
                        },
                        saveToSentItems: true,
                      }),
                    });
                    if (graphRes.ok) {
                      console.log(`[claude] Auto-sent email for skill "${skill.title}" to ${toAddresses.join(', ')}`);
                      const { recordActionExecution } = await import('./automationPreferences.js');
                      recordActionExecution(effectiveTenantId, agent_key, skill.skill_id, 'agent_skill', false);
                    } else {
                      console.warn(`[claude] Auto-send failed: ${graphRes.status}`);
                    }
                  } catch (err) {
                    console.warn('[claude] Automated email send failed:', err.message);
                  }
                })();
              }
            }
            continue;
          }
          // Check if the response mentions this skill's output markers
          const isDraft = responseText.includes('[DRAFT]') && skill.mode === 'draft';
          const isReview = responseText.includes('[PENDING REVIEW]') && skill.mode === 'review';
          if (!isDraft && !isReview) continue;

          // Look up SOP step assignments for this skill
          req.supabase
            .from('tenant_sop_steps')
            .select(`
              id,
              tenant_sop_assignments(id, assigned_to_user_id, assigned_to_role, assignment_type)
            `)
            .eq('tenant_id', effectiveTenantId)
            .eq('automation_action_id', skill.skill_id)
            .then(async ({ data: steps }) => {
              if (!steps?.length) return;
              for (const step of steps) {
                const assignments = step.tenant_sop_assignments || [];
                // Find reviewer or owner to route to
                const target = assignments.find(a => a.assignment_type === 'reviewer')
                  || assignments.find(a => a.assignment_type === 'owner');
                if (!target) continue;

                // Resolve user IDs from role if needed
                let userIds = [];
                if (target.assigned_to_user_id) {
                  userIds = [target.assigned_to_user_id];
                } else if (target.assigned_to_role) {
                  const { data: roleUsers } = await req.supabase
                    .from('profiles')
                    .select('id')
                    .eq('tenant_id', effectiveTenantId)
                    .eq('role', target.assigned_to_role);
                  userIds = (roleUsers || []).map(u => u.id);
                }

                // Create tasks for each target user
                for (const uid of userIds) {
                  await req.supabase
                    .from('tenant_user_tasks')
                    .insert({
                      tenant_id: effectiveTenantId,
                      user_id: uid,
                      sop_step_id: step.id,
                      sop_assignment_id: target.id,
                      source_type: 'agent_output',
                      source_reference_id: skill.skill_id,
                      title: `${isDraft ? 'Review draft' : 'Approve'}: ${skill.title}`,
                      description: `Agent produced ${isDraft ? 'a draft' : 'output pending review'} for "${skill.title}". Please review and take action.`,
                      agent_output: { text: responseText, model, agent_key },
                    });
                }
              }
            })
            .catch(err => {
              console.warn('[claude] Task routing failed:', err.message);
            });
        }
      }

      // Fire-and-forget memory extraction from agent conversations
      if (effectiveTenantId && agent_key && messages.length >= 4) {
        const responseText = data.content?.[0]?.text || '';
        if (responseText) {
          const dept = getKnowledgeContext._lastAgent?.knowledge_scopes?.[0] || 'general';
          const conversationText = messages
            .slice(-4)
            .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
            .join('\n\n');
          extractMemories(effectiveTenantId, conversationText, 'agent_interaction', null, dept);
        }
      }

      res.json({ ...data, execution_context });
    } finally {
      if (sfConnector) {
        await sfConnector.disconnect();
        console.log(`[claude] Snowflake disconnected`);
      }
    }
  } catch (err) {
    console.error('[claude] Proxy error:', err.message, err.stack);
    res.status(502).json({ error: `Failed to reach AI service: ${err.message}` });
  }
});

export default router;
