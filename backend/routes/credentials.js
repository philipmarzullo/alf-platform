import { Router } from 'express';
import { encryptCredential, decryptCredential, getKeyHint } from '../lib/credentials.js';

const router = Router();

// Service types only platform owners can manage (never exposed to tenant super-admins)
const PLATFORM_ONLY_SERVICES = ['anthropic'];

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
 * Guard: credential access with tenant scoping.
 * - platform_owner → full access to any tenant
 * - super-admin → own tenant only (tenant_id must match route param)
 * - all others → 403
 */
function requireCredentialAccess(req, res, next) {
  const role = req.user?.role;

  if (role === 'platform_owner') return next();

  if (role === 'super-admin') {
    const routeTenantId = req.params.tenantId;
    // For credential-ID routes, tenant check happens after fetching the credential
    if (!routeTenantId) return next();
    if (req.user.tenant_id === routeTenantId) return next();
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  return res.status(403).json({ error: 'Credential management access required' });
}

// All routes require credential access
router.use(requireCredentialAccess);

/**
 * Write an immutable audit log entry for credential operations.
 * Fire-and-forget — never blocks the response.
 */
function logCredentialAction(supabase, { tenantId, credentialId, serviceType, action, detail, user }) {
  supabase
    .from('credential_audit_logs')
    .insert({
      tenant_id: tenantId,
      credential_id: credentialId,
      service_type: serviceType,
      action,
      detail: detail || {},
      user_id: user.id,
      user_name: user.name || null,
    })
    .then(({ error }) => {
      if (error) console.warn('[credentials] Audit log failed:', error.message);
    });
}

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

    // Non-platform_owner users never see platform-only credentials
    const filtered = req.user.role === 'platform_owner'
      ? data
      : data.filter(c => !PLATFORM_ONLY_SERVICES.includes(c.service_type));

    res.json(filtered);
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

  if (PLATFORM_ONLY_SERVICES.includes(service_type) && req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Only platform owners can manage this service type' });
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

    logCredentialAction(req.supabase, {
      tenantId: req.params.tenantId,
      credentialId: data.id,
      serviceType: service_type,
      action: 'created',
      detail: { label: label || null, key_hint },
      user: req.user,
    });

    console.log(`[credentials] ${service_type} key saved for tenant ${req.params.tenantId} (hint: ...${key_hint})`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[credentials] Create error:', err.message);
    res.status(500).json({ error: 'Failed to save credential' });
  }
});

/**
 * Fetch a credential and verify the caller has access:
 * - platform_owner → always allowed
 * - super-admin → must own the tenant, credential must not be platform-only
 */
async function fetchAndAuthorize(req, res) {
  const { data: cred, error } = await req.supabase
    .from('tenant_api_credentials')
    .select('id, tenant_id, service_type, encrypted_key, credential_label, key_hint, is_active, created_at, updated_at')
    .eq('id', req.params.credentialId)
    .single();

  if (error || !cred) {
    res.status(404).json({ error: 'Credential not found' });
    return null;
  }

  if (req.user.role !== 'platform_owner') {
    if (PLATFORM_ONLY_SERVICES.includes(cred.service_type)) {
      res.status(403).json({ error: 'Only platform owners can manage this service type' });
      return null;
    }
    if (req.user.tenant_id !== cred.tenant_id) {
      res.status(403).json({ error: 'Access denied — wrong tenant' });
      return null;
    }
  }

  return cred;
}

/**
 * PUT /:credentialId — Update key, label, or status.
 * Body: { key?, label?, is_active? }
 */
router.put('/:credentialId', async (req, res) => {
  try {
    const cred = await fetchAndAuthorize(req, res);
    if (!cred) return; // response already sent

    const { key, label, is_active } = req.body;
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

    // Determine if this was a toggle vs a general update
    const isToggle = is_active !== undefined && !key && label === undefined;
    logCredentialAction(req.supabase, {
      tenantId: data.tenant_id,
      credentialId: data.id,
      serviceType: data.service_type,
      action: isToggle ? 'toggled' : 'updated',
      detail: {
        ...(is_active !== undefined && { is_active }),
        ...(key && { key_hint: updates.key_hint }),
        ...(label !== undefined && { label }),
      },
      user: req.user,
    });

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
    const cred = await fetchAndAuthorize(req, res);
    if (!cred) return;

    const { error } = await req.supabase
      .from('tenant_api_credentials')
      .delete()
      .eq('id', req.params.credentialId);

    if (error) throw error;

    logCredentialAction(req.supabase, {
      tenantId: cred.tenant_id,
      credentialId: cred.id,
      serviceType: cred.service_type,
      action: 'deleted',
      detail: { label: cred.credential_label, key_hint: cred.key_hint },
      user: req.user,
    });

    invalidateCredentialCache(cred.tenant_id);
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
    const cred = await fetchAndAuthorize(req, res);
    if (!cred) return;

    const testConfig = TEST_ENDPOINTS[cred.service_type];
    if (!testConfig) {
      return res.status(400).json({ error: `No test available for service type: ${cred.service_type}` });
    }

    const apiKey = decryptCredential(cred.encrypted_key);
    const fetchOpts = testConfig.buildRequest(apiKey);
    const response = await fetch(testConfig.url, fetchOpts);
    const body = await response.json();

    const testResult = response.ok
      ? { success: true, message: 'API key is valid' }
      : { success: false, message: body.error?.message || `API returned ${response.status}` };

    logCredentialAction(req.supabase, {
      tenantId: cred.tenant_id,
      credentialId: cred.id,
      serviceType: cred.service_type,
      action: 'tested',
      detail: { result: testResult.success ? 'success' : 'failure', message: testResult.message },
      user: req.user,
    });

    res.json(testResult);
  } catch (err) {
    console.error('[credentials] Test error:', err.message);
    res.status(500).json({ error: 'Failed to test credential' });
  }
});

/**
 * GET /:tenantId/audit-log — Recent credential activity for a tenant.
 */
router.get('/:tenantId/audit-log', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('credential_audit_logs')
      .select('id, credential_id, service_type, action, detail, user_name, created_at')
      .eq('tenant_id', req.params.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Non-platform_owner users don't see audit entries for platform-only services
    const filtered = req.user.role === 'platform_owner'
      ? data
      : data.filter(e => !PLATFORM_ONLY_SERVICES.includes(e.service_type));

    res.json(filtered);
  } catch (err) {
    console.error('[credentials] Audit log read error:', err.message);
    res.status(500).json({ error: 'Failed to load audit log' });
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
