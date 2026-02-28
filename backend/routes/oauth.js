import { Router } from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptCredential, decryptCredential } from '../lib/credentials.js';
import auth from '../middleware/auth.js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Microsoft OAuth constants
const MS_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const MS_SCOPES = 'openid profile email offline_access User.Read';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── HMAC-signed stateless state param ───────────────────────────────────────

function getSigningKey() {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function createSignedState(payload) {
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const hmac = crypto.createHmac('sha256', getSigningKey()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(hmac)}`;
}

function verifySignedState(state) {
  const dotIdx = state.indexOf('.');
  if (dotIdx === -1) return null;

  const payloadB64 = state.slice(0, dotIdx);
  const sigB64 = state.slice(dotIdx + 1);

  const expectedHmac = crypto.createHmac('sha256', getSigningKey()).update(payloadB64).digest();
  const actualHmac = fromBase64url(sigB64);

  if (expectedHmac.length !== actualHmac.length) return null;
  if (!crypto.timingSafeEqual(expectedHmac, actualHmac)) return null;

  try {
    const payload = JSON.parse(fromBase64url(payloadB64).toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fire-and-forget audit log entry (mirrors logCredentialAction in credentials.js) */
function logOAuthAction({ tenantId, credentialId, serviceType, action, detail, user }) {
  supabase
    .from('credential_audit_logs')
    .insert({
      tenant_id: tenantId,
      credential_id: credentialId || null,
      service_type: serviceType,
      action,
      detail: detail || {},
      user_id: user.id,
      user_name: user.name || null,
    })
    .then(({ error }) => {
      if (error) console.warn('[oauth] Audit log failed:', error.message);
    });
}

/** Look up tenant's portal URL for post-callback redirect */
async function getPortalUrl(tenantId) {
  const { data } = await supabase
    .from('alf_tenants')
    .select('portal_url')
    .eq('id', tenantId)
    .single();
  return data?.portal_url || null;
}

/** Role gate — super-admin or platform_owner only */
function requireOAuthAccess(req, res, next) {
  const role = req.user?.role;
  if (role === 'platform_owner' || role === 'super-admin') return next();
  return res.status(403).json({ error: 'OAuth management requires admin access' });
}

// ─── GET /microsoft/authorize ────────────────────────────────────────────────
// Browser navigates here directly (not fetch), so JWT comes via query param.

router.get('/microsoft/authorize', async (req, res) => {
  const { tenantId, token } = req.query;

  if (!tenantId || !token) {
    return res.status(400).json({ error: 'tenantId and token are required' });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Microsoft OAuth not configured on server' });
  }

  try {
    // Validate JWT the same way auth.js does, but from query param
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, role, tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'platform_owner' && profile.role !== 'super-admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (profile.role === 'super-admin' && profile.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Access denied — wrong tenant' });
    }

    // Build HMAC-signed state
    const state = createSignedState({
      tenantId,
      userId: profile.id,
      userName: profile.name,
      exp: Date.now() + STATE_TTL_MS,
      nonce: crypto.randomBytes(8).toString('hex'),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: MS_SCOPES,
      state,
      prompt: 'consent', // ensures refresh_token is always returned
      response_mode: 'query',
    });

    const authUrl = `${MS_AUTHORITY}/authorize?${params.toString()}`;
    console.log(`[oauth] Redirecting user ${profile.id} to Microsoft login for tenant ${tenantId}`);
    res.redirect(authUrl);
  } catch (err) {
    console.error('[oauth] Authorize error:', err.message);
    res.status(500).json({ error: 'Authorization failed' });
  }
});

// ─── GET /microsoft/callback ─────────────────────────────────────────────────
// Unauthenticated — Microsoft redirects here with ?code=...&state=...

router.get('/microsoft/callback', async (req, res) => {
  const { code, state, error: msError, error_description } = req.query;

  // Microsoft denied consent or user cancelled
  if (msError) {
    console.warn(`[oauth] Microsoft error: ${msError} — ${error_description}`);
    const payload = state ? verifySignedState(state) : null;
    const portalUrl = payload ? await getPortalUrl(payload.tenantId) : null;
    if (portalUrl) {
      return res.redirect(`${portalUrl}/admin/connections?oauth_error=${encodeURIComponent(msError)}`);
    }
    return res.status(400).json({ error: msError, description: error_description });
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  // Verify HMAC signature + expiry
  const payload = verifySignedState(state);
  if (!payload) {
    return res.status(400).json({ error: 'Invalid or expired state parameter' });
  }

  const { tenantId, userId, userName } = payload;
  let portalUrl;

  try {
    portalUrl = await getPortalUrl(tenantId);

    // Exchange authorization code for tokens
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

    const tokenRes = await fetch(`${MS_AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: MS_SCOPES,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[oauth] Token exchange failed:', tokenData.error_description || tokenData.error);
      if (portalUrl) {
        return res.redirect(`${portalUrl}/admin/connections?oauth_error=token_exchange_failed`);
      }
      return res.status(400).json({ error: 'Token exchange failed' });
    }

    // Get user info from Graph /me (non-fatal if it fails)
    let msUser = { email: 'unknown', name: 'Unknown' };
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        msUser = {
          email: meData.mail || meData.userPrincipalName || 'unknown',
          name: meData.displayName || 'Unknown',
        };
      }
    } catch (graphErr) {
      console.warn('[oauth] Graph /me failed (non-fatal):', graphErr.message);
    }

    // Encrypt full token blob
    const tokenBlob = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      obtained_at: Date.now(),
      user_email: msUser.email,
      user_name: msUser.name,
    });

    const encryptedKey = encryptCredential(tokenBlob);

    // Upsert into tenant_api_credentials (one microsoft row per tenant)
    const { data: cred, error: dbError } = await supabase
      .from('tenant_api_credentials')
      .upsert({
        tenant_id: tenantId,
        service_type: 'microsoft',
        credential_label: `Microsoft 365 — ${msUser.email}`,
        encrypted_key: encryptedKey,
        key_hint: msUser.email,
        is_active: true,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,service_type' })
      .select('id')
      .single();

    if (dbError) {
      console.error('[oauth] DB upsert failed:', dbError.message);
      if (portalUrl) {
        return res.redirect(`${portalUrl}/admin/connections?oauth_error=server_error`);
      }
      return res.status(500).json({ error: 'Failed to save connection' });
    }

    logOAuthAction({
      tenantId,
      credentialId: cred?.id,
      serviceType: 'microsoft',
      action: 'connected',
      detail: { email: msUser.email, name: msUser.name },
      user: { id: userId, name: userName },
    });

    console.log(`[oauth] Microsoft connected for tenant ${tenantId} (${msUser.email})`);

    if (portalUrl) {
      return res.redirect(`${portalUrl}/admin/connections?oauth_success=microsoft`);
    }
    res.json({ success: true, email: msUser.email });
  } catch (err) {
    console.error('[oauth] Callback error:', err.message);
    if (portalUrl) {
      return res.redirect(`${portalUrl}/admin/connections?oauth_error=server_error`);
    }
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// ─── POST /microsoft/refresh ─────────────────────────────────────────────────

router.post('/microsoft/refresh', auth, requireOAuthAccess, async (req, res) => {
  const tenantId = req.body.tenantId || req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  if (req.user.role === 'super-admin' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  try {
    const { data: cred, error } = await supabase
      .from('tenant_api_credentials')
      .select('id, encrypted_key')
      .eq('tenant_id', tenantId)
      .eq('service_type', 'microsoft')
      .single();

    if (error || !cred) {
      return res.status(404).json({ error: 'No Microsoft connection found' });
    }

    const tokenBlob = JSON.parse(decryptCredential(cred.encrypted_key));

    if (!tokenBlob.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available — reconnect required' });
    }

    const tokenRes = await fetch(`${MS_AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        refresh_token: tokenBlob.refresh_token,
        grant_type: 'refresh_token',
        scope: MS_SCOPES,
      }),
    });

    const newTokens = await tokenRes.json();

    if (!tokenRes.ok || !newTokens.access_token) {
      return res.status(400).json({
        error: 'Token refresh failed',
        detail: newTokens.error_description || newTokens.error,
      });
    }

    const updatedBlob = JSON.stringify({
      ...tokenBlob,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token || tokenBlob.refresh_token,
      expires_in: newTokens.expires_in,
      obtained_at: Date.now(),
    });

    await supabase
      .from('tenant_api_credentials')
      .update({ encrypted_key: encryptCredential(updatedBlob), updated_at: new Date().toISOString() })
      .eq('id', cred.id);

    logOAuthAction({
      tenantId,
      credentialId: cred.id,
      serviceType: 'microsoft',
      action: 'refreshed',
      detail: {},
      user: req.user,
    });

    res.json({ success: true, expires_in: newTokens.expires_in });
  } catch (err) {
    console.error('[oauth] Refresh error:', err.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── POST /microsoft/disconnect ──────────────────────────────────────────────

router.post('/microsoft/disconnect', auth, requireOAuthAccess, async (req, res) => {
  const tenantId = req.body.tenantId || req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  if (req.user.role === 'super-admin' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  try {
    const { data: cred } = await supabase
      .from('tenant_api_credentials')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('service_type', 'microsoft')
      .single();

    if (!cred) {
      return res.status(404).json({ error: 'No Microsoft connection found' });
    }

    const { error } = await supabase
      .from('tenant_api_credentials')
      .delete()
      .eq('id', cred.id);

    if (error) throw error;

    logOAuthAction({
      tenantId,
      credentialId: cred.id,
      serviceType: 'microsoft',
      action: 'disconnected',
      detail: {},
      user: req.user,
    });

    console.log(`[oauth] Microsoft disconnected for tenant ${tenantId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[oauth] Disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ─── GET /microsoft/status ───────────────────────────────────────────────────
// Returns connection state without exposing tokens.

router.get('/microsoft/status', auth, requireOAuthAccess, async (req, res) => {
  const tenantId = req.query.tenantId || req.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  if (req.user.role === 'super-admin' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  try {
    const { data: cred } = await supabase
      .from('tenant_api_credentials')
      .select('id, encrypted_key, key_hint, is_active, updated_at')
      .eq('tenant_id', tenantId)
      .eq('service_type', 'microsoft')
      .single();

    if (!cred) {
      return res.json({ connected: false });
    }

    let tokenValid = false;
    let expiresAt = null;
    let userEmail = cred.key_hint;
    let userName = null;

    try {
      const tokenBlob = JSON.parse(decryptCredential(cred.encrypted_key));
      const obtainedAt = tokenBlob.obtained_at || 0;
      const expiresIn = tokenBlob.expires_in || 3600;
      expiresAt = new Date(obtainedAt + expiresIn * 1000).toISOString();
      tokenValid = Date.now() < obtainedAt + expiresIn * 1000;
      userEmail = tokenBlob.user_email || cred.key_hint;
      userName = tokenBlob.user_name || null;
    } catch {
      // Decryption failed — treat as invalid
    }

    res.json({
      connected: true,
      user_email: userEmail,
      user_name: userName,
      token_valid: tokenValid,
      expires_at: expiresAt,
      is_active: cred.is_active,
    });
  } catch (err) {
    console.error('[oauth] Status error:', err.message);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;
