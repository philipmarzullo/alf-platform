#!/usr/bin/env node
/**
 * CLI Runner — Seed Demo Tenants
 *
 * Usage: node backend/scripts/seedDemo.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
 * (loaded from backend/.env via dotenv).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { seedDemoTenants } from '../lib/demoSeed.js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('[seedDemo] Starting demo tenant seed...\n');

try {
  const credentials = await seedDemoTenants(supabase);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  DEMO CREDENTIALS');
  console.log('══════════════════════════════════════════════════════════\n');

  // Print credentials table
  const col = { tenant: 32, email: 38, role: 12, pw: 15 };
  const header = [
    'Tenant'.padEnd(col.tenant),
    'Email'.padEnd(col.email),
    'Role'.padEnd(col.role),
    'Password'.padEnd(col.pw),
  ].join(' | ');

  const separator = [
    '-'.repeat(col.tenant),
    '-'.repeat(col.email),
    '-'.repeat(col.role),
    '-'.repeat(col.pw),
  ].join('-+-');

  console.log(header);
  console.log(separator);

  for (const c of credentials) {
    console.log([
      `${c.tenant} (${c.plan})`.padEnd(col.tenant),
      c.email.padEnd(col.email),
      c.role.padEnd(col.role),
      c.password.padEnd(col.pw),
    ].join(' | '));
  }

  console.log('\n[seedDemo] Done! All demo tenants seeded successfully.');
  process.exit(0);
} catch (err) {
  console.error('\n[seedDemo] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
}
