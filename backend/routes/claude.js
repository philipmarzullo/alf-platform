import { Router } from 'express';
import rateLimit from '../middleware/rateLimit.js';
import { getTenantApiKey } from './credentials.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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

  // No tenant context at all → env fallback
  if (!apiKey && !effectiveTenantId) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    keySource = 'env';
  }

  if (!apiKey) {
    const msg = effectiveTenantId
      ? 'No API key configured for this tenant. Ask your platform admin to add one under Tenants > API Keys.'
      : 'AI service not configured (no ANTHROPIC_API_KEY in env)';
    console.error(`[claude] No API key — tenant: ${effectiveTenantId || 'platform'}`);
    return res.status(403).json({ error: msg });
  }

  try {
    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        system: system || undefined,
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
