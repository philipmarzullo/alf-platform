import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { getTenantApiKey } from './credentials.js';
import { getPlatformApiKey } from './platformCredentials.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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
};

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

  if (!docs?.length) return null;

  const blocks = docs.map(d =>
    `--- ${d.doc_type.toUpperCase()}: ${d.file_name} (${d.department}) ---\n${d.extracted_text}`
  );

  return `\n\n=== TENANT KNOWLEDGE BASE ===\nThe following documents have been uploaded for this tenant. Use them as reference when answering questions. Follow SOPs exactly as documented.\n\n${blocks.join('\n\n')}`;
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

  // Resolve effective tenant: profile tenant_id, or body override for platform admins
  const PLATFORM_ROLES = ['super-admin', 'platform_owner'];
  let effectiveTenantId = req.tenantId;

  if (!effectiveTenantId && req.body.tenant_id && PLATFORM_ROLES.includes(req.user?.role)) {
    effectiveTenantId = req.body.tenant_id;
  }

  // Tenant-aware key lookup: tenant requests use stored keys, platform admin falls back to env
  let apiKey;
  let keySource;

  if (effectiveTenantId) {
    try {
      apiKey = await getTenantApiKey(req.supabase, effectiveTenantId, 'anthropic');
      keySource = 'tenant';
    } catch (err) {
      console.error('[claude] Tenant key lookup failed:', err.message);
    }
  }

  // No tenant context → try platform DB key, then env fallback
  if (!apiKey && !effectiveTenantId) {
    try {
      apiKey = await getPlatformApiKey(req.supabase, 'anthropic');
      keySource = 'platform_db';
    } catch (err) { /* silent — fall through to env */ }
    if (!apiKey) {
      apiKey = process.env.ANTHROPIC_API_KEY;
      keySource = 'env';
    }
  }

  if (!apiKey) {
    const msg = effectiveTenantId
      ? 'No API key configured for this tenant. Ask your platform admin to add one under Tenants > API Keys.'
      : 'AI service not configured (no ANTHROPIC_API_KEY in env)';
    console.error(`[claude] No API key — tenant: ${effectiveTenantId || 'platform'}`);
    return res.status(403).json({ error: msg });
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
