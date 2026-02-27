import { getTenantApiKey } from '../routes/credentials.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

/**
 * Resolve the Anthropic API key for a request.
 *
 * Priority: tenant stored key → platform DB key → env fallback.
 * Platform admins can pass tenant_id in the body to act on behalf of a tenant.
 *
 * Returns { apiKey, keySource, effectiveTenantId } or throws with a user-facing message.
 */
export async function resolveApiKey(req, { tenantIdOverride } = {}) {
  let effectiveTenantId = tenantIdOverride || req.tenantId;

  // Platform admins can specify a tenant_id in the body
  if (!effectiveTenantId && req.body?.tenant_id && PLATFORM_ROLES.includes(req.user?.role)) {
    effectiveTenantId = req.body.tenant_id;
  }

  let apiKey;
  let keySource;

  // Try tenant-specific key first
  if (effectiveTenantId) {
    try {
      apiKey = await getTenantApiKey(req.supabase, effectiveTenantId, 'anthropic');
      keySource = 'tenant';
    } catch (err) {
      console.error('[resolveApiKey] Tenant key lookup failed:', err.message);
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
    const error = new Error(msg);
    error.status = 403;
    throw error;
  }

  return { apiKey, keySource, effectiveTenantId };
}
