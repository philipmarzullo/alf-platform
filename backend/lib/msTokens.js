import { createClient } from '@supabase/supabase-js';
import { encryptCredential, decryptCredential } from './credentials.js';

const MS_AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a valid Microsoft access token for a tenant.
 * Auto-refreshes if expired (with 5-min buffer).
 *
 * @param {string} tenantId
 * @returns {{ access_token: string, user_email: string, user_name: string, credential_id: string }}
 * @throws {Object} { status: 404, message } if no connection
 * @throws {Object} { status: 401, message } if refresh fails
 */
export async function getValidMsToken(tenantId) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: cred, error } = await supabase
    .from('tenant_api_credentials')
    .select('id, encrypted_key')
    .eq('tenant_id', tenantId)
    .eq('service_type', 'microsoft')
    .single();

  if (error || !cred) {
    const err = new Error('No Microsoft connection found');
    err.status = 404;
    throw err;
  }

  const tokenBlob = JSON.parse(decryptCredential(cred.encrypted_key));
  const obtainedAt = tokenBlob.obtained_at || 0;
  const expiresIn = tokenBlob.expires_in || 3600;
  const expiresAt = obtainedAt + expiresIn * 1000;

  // Token still valid (with buffer)
  if (Date.now() < expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return {
      access_token: tokenBlob.access_token,
      user_email: tokenBlob.user_email,
      user_name: tokenBlob.user_name,
      credential_id: cred.id,
    };
  }

  // Token expired or about to expire — refresh
  if (!tokenBlob.refresh_token) {
    const err = new Error('No refresh token available — reconnect required');
    err.status = 401;
    throw err;
  }

  const tokenRes = await fetch(`${MS_AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: tokenBlob.refresh_token,
      grant_type: 'refresh_token',
      scope: tokenBlob.scope || 'openid profile email offline_access User.Read Mail.Send',
    }),
  });

  const newTokens = await tokenRes.json();

  if (!tokenRes.ok || !newTokens.access_token) {
    console.error('[msTokens] Refresh failed:', newTokens.error_description || newTokens.error);
    const err = new Error('Token refresh failed — reconnect required');
    err.status = 401;
    throw err;
  }

  // Persist refreshed tokens
  const updatedBlob = JSON.stringify({
    ...tokenBlob,
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || tokenBlob.refresh_token,
    expires_in: newTokens.expires_in,
    scope: newTokens.scope || tokenBlob.scope,
    obtained_at: Date.now(),
  });

  await supabase
    .from('tenant_api_credentials')
    .update({ encrypted_key: encryptCredential(updatedBlob), updated_at: new Date().toISOString() })
    .eq('id', cred.id);

  console.log(`[msTokens] Refreshed token for tenant ${tenantId}`);

  return {
    access_token: newTokens.access_token,
    user_email: tokenBlob.user_email,
    user_name: tokenBlob.user_name,
    credential_id: cred.id,
  };
}
