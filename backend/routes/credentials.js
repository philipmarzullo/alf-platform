import { Router } from 'express';
import { encryptCredential, decryptCredential, getKeyHint } from '../lib/credentials.js';

const router = Router();

// Service types that support test calls
const TEST_ENDPOINTS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    buildRequest(apiKey) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      };
    },
  },
};

/**
 * Guard: only platform admins (super-admin, platform_owner) can manage credentials.
 */
function requirePlatformAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'super-admin' && role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

// All routes require platform admin
router.use(requirePlatformAdmin);

/**
 * GET /:tenantId — List credentials for a tenant (masked).
 * Never returns encrypted_key.
 */
router.get('/:tenantId', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('tenant_api_credentials')
      .select('id, tenant_id, service_type, credential_label, key_hint, is_active, created_at, updated_at')
      .eq('tenant_id', req.params.tenantId)
      .order('service_type');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[credentials] List error:', err.message);
    res.status(500).json({ error: 'Failed to list credentials' });
  }
});

/**
 * POST /:tenantId — Add a credential (encrypts + stores).
 * Body: { service_type, key, label? }
 */
router.post('/:tenantId', async (req, res) => {
  const { service_type, key, label } = req.body;

  if (!service_type || !key) {
    return res.status(400).json({ error: 'service_type and key are required' });
  }

  try {
    const encrypted_key = encryptCredential(key);
    const key_hint = getKeyHint(key);

    const { data, error } = await req.supabase
      .from('tenant_api_credentials')
      .upsert({
        tenant_id: req.params.tenantId,
        service_type,
        credential_label: label || null,
        encrypted_key,
        key_hint,
        is_active: true,
        created_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,service_type' })
      .select('id, tenant_id, service_type, credential_label, key_hint, is_active, created_at, updated_at')
      .single();

    if (error) throw error;

    // Invalidate cache for this tenant
    invalidateCredentialCache(req.params.tenantId);

    console.log(`[credentials] ${service_type} key saved for tenant ${req.params.tenantId} (hint: ...${key_hint})`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[credentials] Create error:', err.message);
    res.status(500).json({ error: 'Failed to save credential' });
  }
});

/**
 * PUT /:credentialId — Update key, label, or status.
 * Body: { key?, label?, is_active? }
 */
router.put('/:credentialId', async (req, res) => {
  const { key, label, is_active } = req.body;

  try {
    const updates = { updated_at: new Date().toISOString() };

    if (key) {
      updates.encrypted_key = encryptCredential(key);
      updates.key_hint = getKeyHint(key);
    }
    if (label !== undefined) updates.credential_label = label;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await req.supabase
      .from('tenant_api_credentials')
      .update(updates)
      .eq('id', req.params.credentialId)
      .select('id, tenant_id, service_type, credential_label, key_hint, is_active, created_at, updated_at')
      .single();

    if (error) throw error;

    // Invalidate cache for this tenant
    invalidateCredentialCache(data.tenant_id);

    res.json(data);
  } catch (err) {
    console.error('[credentials] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update credential' });
  }
});

/**
 * DELETE /:credentialId — Remove a credential.
 */
router.delete('/:credentialId', async (req, res) => {
  try {
    // Get tenant_id before deleting for cache invalidation
    const { data: existing } = await req.supabase
      .from('tenant_api_credentials')
      .select('tenant_id')
      .eq('id', req.params.credentialId)
      .single();

    const { error } = await req.supabase
      .from('tenant_api_credentials')
      .delete()
      .eq('id', req.params.credentialId);

    if (error) throw error;

    if (existing?.tenant_id) invalidateCredentialCache(existing.tenant_id);

    res.json({ success: true });
  } catch (err) {
    console.error('[credentials] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

/**
 * POST /:credentialId/test — Decrypt and verify a key works.
 */
router.post('/:credentialId/test', async (req, res) => {
  try {
    const { data: cred, error } = await req.supabase
      .from('tenant_api_credentials')
      .select('encrypted_key, service_type')
      .eq('id', req.params.credentialId)
      .single();

    if (error || !cred) {
      return res.status(404).json({ error: 'Credential not found' });
    }

    const testConfig = TEST_ENDPOINTS[cred.service_type];
    if (!testConfig) {
      return res.status(400).json({ error: `No test available for service type: ${cred.service_type}` });
    }

    const apiKey = decryptCredential(cred.encrypted_key);
    const fetchOpts = testConfig.buildRequest(apiKey);
    const response = await fetch(testConfig.url, fetchOpts);
    const body = await response.json();

    if (response.ok) {
      res.json({ success: true, message: 'API key is valid' });
    } else {
      res.json({
        success: false,
        message: body.error?.message || `API returned ${response.status}`,
      });
    }
  } catch (err) {
    console.error('[credentials] Test error:', err.message);
    res.status(500).json({ error: 'Failed to test credential' });
  }
});

// ─── Credential cache (used by claude.js) ───

const credentialCache = new Map(); // tenantId -> { key, expiry }
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes

/**
 * Get the decrypted API key for a tenant + service type.
 * Used by claude.js for tenant-aware key lookup.
 * Caches results for 5 minutes with immediate invalidation on writes.
 */
export async function getTenantApiKey(supabase, tenantId, serviceType) {
  const cacheKey = `${tenantId}:${serviceType}`;
  const cached = credentialCache.get(cacheKey);

  if (cached && cached.expiry > Date.now()) {
    return cached.key;
  }

  const { data, error } = await supabase
    .from('tenant_api_credentials')
    .select('encrypted_key, is_active')
    .eq('tenant_id', tenantId)
    .eq('service_type', serviceType)
    .single();

  if (error || !data || !data.is_active) {
    credentialCache.delete(cacheKey);
    return null;
  }

  const key = decryptCredential(data.encrypted_key);
  credentialCache.set(cacheKey, { key, expiry: Date.now() + CACHE_TTL });
  return key;
}

/**
 * Invalidate all cached keys for a tenant.
 */
function invalidateCredentialCache(tenantId) {
  for (const [key] of credentialCache) {
    if (key.startsWith(`${tenantId}:`)) {
      credentialCache.delete(key);
    }
  }
}

export default router;
