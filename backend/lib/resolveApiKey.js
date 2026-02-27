import { getTenantApiKey } from '../routes/credentials.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

/**
 * Resolve the Anthropic API key for a request.
 *
 * Priority chain:
 *   1. Tenant stored key (encrypted in DB)
 *   2. Platform DB key
 *   3. ANTHROPIC_API_KEY env var
 *
 * The env fallback ensures local dev works without needing the production
 * encryption key — tenant keys stored via deployed Alf can't be decrypted
 * locally since environments use different CREDENTIAL_ENCRYPTION_KEYs.
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

  // 1. Try tenant-specific key (encrypted in DB)
  if (effectiveTenantId) {
    try {
      apiKey = await getTenantApiKey(req.supabase, effectiveTenantId, 'anthropic');
      if (apiKey) keySource = 'tenant';
    } catch (err) {
      console.error('[resolveApiKey] Tenant key lookup failed:', err.message);
    }
  }

  // 2. Try platform DB key
  if (!apiKey) {
    try {
      apiKey = await getPlatformApiKey(req.supabase, 'anthropic');
      if (apiKey) keySource = 'platform_db';
    } catch (err) { /* silent — fall through to env */ }
  }

  // 3. Env fallback (covers local dev where encryption keys don't match production)
  if (!apiKey && process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    keySource = 'env';
  }

  if (!apiKey) {
    const msg = effectiveTenantId
      ? 'No API key configured for this tenant. Ask your platform admin to add one under Tenants > API Keys, or set ANTHROPIC_API_KEY in the backend env.'
      : 'AI service not configured (no ANTHROPIC_API_KEY in env)';
    const error = new Error(msg);
    error.status = 403;
    throw error;
  }

  return { apiKey, keySource, effectiveTenantId };
}
