#!/usr/bin/env node
/**
 * One-time script: encrypt and insert Snowflake service account credentials
 * into alf_platform_credentials. Run from backend/ directory.
 *
 * Usage: node scripts/seed-snowflake-cred.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { encryptCredential, getKeyHint } from '../lib/credentials.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const credential = JSON.stringify({
  account: 'ylnlssy-alf_production',
  username: 'ALF_SERVICE',
  password: 'ZiqBqzMZmiMxXgWTdo0SvRZfrqCWU37N2Ejkg9h/BkI=',
  warehouse: 'COMPUTE_WH',
  role: 'ALF_SERVICE_ROLE',
});

const encrypted_key = encryptCredential(credential);
const key_hint = getKeyHint(credential);

console.log('Encrypted key length:', encrypted_key.length);
console.log('Key hint:', key_hint);

const { data, error } = await supabase
  .from('alf_platform_credentials')
  .upsert({
    service_type: 'snowflake',
    credential_label: 'Alf Snowflake Service Account',
    encrypted_key,
    key_hint,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'service_type' })
  .select('id, service_type, credential_label, key_hint, is_active, created_at, updated_at')
  .single();

if (error) {
  console.error('Insert failed:', error.message);
  process.exit(1);
}

console.log('Credential stored:', data);

// Verify round-trip decryption
import { decryptCredential } from '../lib/credentials.js';
const decrypted = decryptCredential(encrypted_key);
const parsed = JSON.parse(decrypted);
console.log('Decryption verified — username:', parsed.username, 'account:', parsed.account);
