#!/usr/bin/env node
/**
 * Verify RLS on alf_platform_credentials blocks anon/authenticated access.
 * Usage: node scripts/verify-rls.mjs
 */
import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// 1. Service role read (should work — bypasses RLS)
const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data: serviceData, error: serviceErr } = await serviceClient
  .from('alf_platform_credentials')
  .select('id, service_type, credential_label, is_active')
  .limit(5);

console.log('=== Service Role Read ===');
console.log('Rows:', serviceData?.length ?? 0);
if (serviceErr) console.log('Error:', serviceErr.message);
else serviceData.forEach(r => console.log(`  ${r.service_type}: ${r.credential_label} (active=${r.is_active})`));

// 2. Find anon key from frontend .env
let anonKey = null;
for (const envFile of ['../../.env.local', '../../.env']) {
  try {
    const envContent = fs.readFileSync(new URL(envFile, import.meta.url), 'utf8');
    const match = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
    if (match?.[1]?.trim()) { anonKey = match[1].trim(); break; }
  } catch {}
}

if (!anonKey) {
  console.log('\nCould not find VITE_SUPABASE_ANON_KEY — run verify-platform-creds-rls.sql in Supabase instead');
  process.exit(0);
}

// 3. Anon read (should return 0 rows or error if RLS is working)
console.log('\n=== Anon Role Read (RLS test) ===');
const anonClient = createClient(process.env.SUPABASE_URL, anonKey);
const { data: anonData, error: anonErr } = await anonClient
  .from('alf_platform_credentials')
  .select('id, service_type, encrypted_key')
  .limit(5);

console.log('Rows returned:', anonData?.length ?? 0);
if (anonErr) console.log('Error:', anonErr.message);

if (anonErr || (anonData && anonData.length === 0)) {
  console.log('\nRLS STATUS: SECURE — anon role cannot read platform credentials');
} else if (anonData && anonData.length > 0) {
  console.log('\nRLS STATUS: NOT SECURE — anon can read', anonData.length, 'rows!');
  console.log('Run verify-platform-creds-rls.sql in Supabase SQL Editor to fix.');
}
