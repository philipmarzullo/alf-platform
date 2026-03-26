#!/usr/bin/env node
/**
 * Copy key-pair auth from the Wavelytics snowflake credential to snowflake_alf.
 * Both use the same ALF_SERVICE user — just different database/schema targets.
 *
 * Usage:  cd backend && node scripts/seed-sf-alf-keypair.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { encryptCredential, decryptCredential, getKeyHint } from '../lib/credentials.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// 1. Read existing Wavelytics credential to get the private key
const { data: src, error: srcErr } = await supabase
  .from('alf_platform_credentials')
  .select('encrypted_key')
  .eq('service_type', 'snowflake')
  .single();

if (srcErr || !src) {
  console.error('Failed to read snowflake credential:', srcErr?.message);
  process.exit(1);
}

const srcCreds = JSON.parse(decryptCredential(src.encrypted_key));
if (!srcCreds.privateKey) {
  console.error('Source snowflake credential has no privateKey — run seed-sf-keypair.mjs first');
  process.exit(1);
}

console.log('Source credential OK — privateKey found for', srcCreds.username);

// 2. Build ALF_AAEFS credential with same key-pair
const alfCredential = JSON.stringify({
  account: 'ylnlssy-alf_production',
  username: 'ALF_SERVICE',
  privateKey: srcCreds.privateKey,
  warehouse: 'COMPUTE_WH',
  role: 'ALF_SERVICE_ROLE',
  database: 'ALF_AAEFS',
  schema: 'WAREHOUSE',
});

const encrypted_key = encryptCredential(alfCredential);
const key_hint = getKeyHint(alfCredential);

// 3. Upsert snowflake_alf credential
const { data, error } = await supabase
  .from('alf_platform_credentials')
  .update({
    encrypted_key,
    key_hint,
    is_active: true,
    updated_at: new Date().toISOString(),
  })
  .eq('service_type', 'snowflake_alf')
  .select('id, service_type, key_hint, is_active, updated_at')
  .single();

if (error) {
  console.error('Update failed:', error.message);
  // Maybe the row doesn't exist yet — try insert
  console.log('Attempting insert...');
  const { data: ins, error: insErr } = await supabase
    .from('alf_platform_credentials')
    .insert({
      service_type: 'snowflake_alf',
      encrypted_key,
      key_hint,
      is_active: true,
    })
    .select('id, service_type, key_hint, is_active')
    .single();

  if (insErr) {
    console.error('Insert also failed:', insErr.message);
    process.exit(1);
  }
  console.log('Credential inserted:', ins);
} else {
  console.log('Credential updated:', data);
}

// 4. Verify round-trip
const { data: verify } = await supabase
  .from('alf_platform_credentials')
  .select('encrypted_key')
  .eq('service_type', 'snowflake_alf')
  .single();

const decrypted = JSON.parse(decryptCredential(verify.encrypted_key));
console.log('\nVerified snowflake_alf credential:');
console.log('  account:', decrypted.account);
console.log('  username:', decrypted.username);
console.log('  has privateKey:', !!decrypted.privateKey);
console.log('  database:', decrypted.database);
console.log('  schema:', decrypted.schema);
console.log('  warehouse:', decrypted.warehouse);
console.log('  role:', decrypted.role);
