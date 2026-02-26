import { Router } from 'express';
import { encryptCredential, decryptCredential, getKeyHint } from '../lib/credentials.js';

const router = Router();

// Service types that support test calls (same as tenant credentials)
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
 * Guard: only platform admins can manage platform credentials.
 */
function requirePlatformAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'super-admin' && role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

router.use(requirePlatformAdmin);

/**
 * GET / — List all platform credentials (masked).
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('alf_platform_credentials')
      .select('id, service_type, credential_label, key_hint, is_active, created_at, updated_at')
      .order('service_type');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[platform-credentials] List error:', err.message);
    res.status(500).json({ error: 'Failed to list platform credentials' });
  }
});

/**
 * POST / — Add or update a platform credential.
 * Body: { service_type, key, label? }
 */
router.post('/', async (req, res) => {
  const { service_type, key, label } = req.body;

  if (!service_type || !key) {
    return res.status(400).json({ error: 'service_type and key are required' });
  }

  try {
    const encrypted_key = encryptCredential(key);
    const key_hint = getKeyHint(key);

    const { data, error } = await req.supabase
      .from('alf_platform_credentials')
      .upsert({
        service_type,
        credential_label: label || null,
        encrypted_key,
        key_hint,
        is_active: true,
        created_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'service_type' })
      .select('id, service_type, credential_label, key_hint, is_active, created_at, updated_at')
      .single();

    if (error) throw error;

    // Invalidate cache
    invalidatePlatformCache(service_type);

    console.log(`[platform-credentials] ${service_type} key saved (hint: ...${key_hint})`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[platform-credentials] Create error:', err.message);
    res.status(500).json({ error: 'Failed to save platform credential' });
  }
});

/**
 * POST /:id/test — Decrypt and verify a platform key.
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { data: cred, error } = await req.supabase
      .from('alf_platform_credentials')
      .select('encrypted_key, service_type')
      .eq('id', req.params.id)
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
    console.error('[platform-credentials] Test error:', err.message);
    res.status(500).json({ error: 'Failed to test credential' });
  }
});

/**
 * DELETE /:id — Remove a platform credential.
 */
router.delete('/:id', async (req, res) => {
  try {
    // Get service_type before deleting for cache invalidation
    const { data: existing } = await req.supabase
      .from('alf_platform_credentials')
      .select('service_type')
      .eq('id', req.params.id)
      .single();

    const { error } = await req.supabase
      .from('alf_platform_credentials')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    if (existing?.service_type) invalidatePlatformCache(existing.service_type);

    res.json({ success: true });
  } catch (err) {
    console.error('[platform-credentials] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

// ─── Cache for platform credentials (used by claude.js) ───

const platformCredentialCache = new Map(); // serviceType -> { key, expiry }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the decrypted platform API key for a service type.
 * Used by claude.js as a fallback before env vars.
 */
export async function getPlatformApiKey(supabase, serviceType) {
  const cached = platformCredentialCache.get(serviceType);
  if (cached && cached.expiry > Date.now()) {
    return cached.key;
  }

  const { data, error } = await supabase
    .from('alf_platform_credentials')
    .select('encrypted_key, is_active')
    .eq('service_type', serviceType)
    .single();

  if (error || !data || !data.is_active) {
    platformCredentialCache.delete(serviceType);
    return null;
  }

  const key = decryptCredential(data.encrypted_key);
  platformCredentialCache.set(serviceType, { key, expiry: Date.now() + CACHE_TTL });
  return key;
}

function invalidatePlatformCache(serviceType) {
  platformCredentialCache.delete(serviceType);
}

export default router;
