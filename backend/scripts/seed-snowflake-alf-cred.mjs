#!/usr/bin/env node

/**
 * One-time script: Insert (or update) the snowflake_alf credential
 * into alf_platform_credentials.
 *
 * Usage:
 *   cd backend
 *   SNOWFLAKE_ALF_PASSWORD=<password> node scripts/seed-snowflake-alf-cred.mjs
 *
 * The JSON blob stored (encrypted) in alf_platform_credentials:
 * {
 *   "account":   "ylnlssy-ik29268",
 *   "username":  "ALF_SERVICE",
 *   "password":  "<from SNOWFLAKE_ALF_PASSWORD env>",
 *   "database":  "ALF_AAEFS",
 *   "schema":    "WAREHOUSE",
 *   "role":      "ALF_SERVICE_ROLE",
 *   "warehouse": "COMPUTE_WH"
 * }
 *
 * Requires in .env: SUPABASE_URL, SUPABASE_SERVICE_KEY, CREDENTIAL_ENCRYPTION_KEY
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { encryptCredential, getKeyHint } from '../lib/credentials.js';

const password = process.env.SNOWFLAKE_ALF_PASSWORD;
if (!password) {
  console.error('Set SNOWFLAKE_ALF_PASSWORD env var before running this script.');
  console.error('  SNOWFLAKE_ALF_PASSWORD=<password> node scripts/seed-snowflake-alf-cred.mjs');
  process.exit(1);
}

const credentialJson = JSON.stringify({
  account: 'ylnlssy-ik29268',
  username: 'ALF_SERVICE',
  password,
  database: 'ALF_AAEFS',
  schema: 'WAREHOUSE',
  role: 'ALF_SERVICE_ROLE',
  warehouse: 'COMPUTE_WH',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const encrypted_key = encryptCredential(credentialJson);
  const key_hint = getKeyHint(password);

  const { data, error } = await supabase
    .from('alf_platform_credentials')
    .upsert({
      service_type: 'snowflake_alf',
      credential_label: 'ALF_SERVICE @ ALF_AAEFS (WinTeam ingestion)',
      encrypted_key,
      key_hint,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'service_type' })
    .select('id, service_type, credential_label, key_hint, is_active')
    .single();

  if (error) {
    console.error('Failed to upsert credential:', error.message);
    process.exit(1);
  }

  console.log('Credential saved:');
  console.log(`  service_type: ${data.service_type}`);
  console.log(`  label:        ${data.credential_label}`);
  console.log(`  hint:         ...${data.key_hint}`);
  console.log(`  active:       ${data.is_active}`);
  console.log(`  id:           ${data.id}`);
  console.log('\nThe snowflake_alf credential is now ready for the ingestion pipeline.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
