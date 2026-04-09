// ============================================================================
// enrich-wc-claims-snowflake.mjs
// ----------------------------------------------------------------------------
// Enriches wc_claims rows with authoritative job_name and VP from the WinTeam
// DIM_JOB table in Snowflake. Joins on wc_claims.job_number → DIM_JOB.JOB_NUMBER
// for the A&A tenant.
//
// Strategy:
//   1. Pull all active DIM_JOB rows for A&A from Snowflake in one query
//      (the dim is small — a few thousand rows max).
//   2. Build an in-memory map keyed by JOB_NUMBER.
//   3. Walk wc_claims rows for the tenant, look up each job_number, and
//      patch job_name + vp where the dim has a hit.
//
// Idempotent. Safe to run after every Liberty seed, or on a nightly cron.
//
// Run:
//   cd backend
//   node scripts/enrich-wc-claims-snowflake.mjs
//
// Env overrides:
//   AA_TENANT_ID         (defaults to A&A UUID)
//   AAEFS_VP_TIER_COL    (defaults to JOB_TIER_08_CURRENT_VALUE_LABEL)
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import SnowflakeConnector from '../sync/connectors/SnowflakeConnector.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';

const AA_TENANT_ID = process.env.AA_TENANT_ID || '6acb59e5-05c9-4653-98ec-710906771dbb';
// JOB_TIER_08 = VP per describe-ops-kpi-views3.mjs verification (2026-03-17).
// Override if A&A re-tiers their job hierarchy in WinTeam.
const VP_TIER_COL = process.env.AAEFS_VP_TIER_COL || 'JOB_TIER_08_CURRENT_VALUE_LABEL';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Pulls the Snowflake connector + tenant config exactly the way
 * snowflakeDashboards.js does, so we share credentials and config sources.
 */
async function getConnector(tenantId) {
  const { data: sc, error } = await supabase
    .from('sync_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('connector_type', 'snowflake')
    .single();
  if (error || !sc?.config) {
    throw new Error(`Snowflake not configured for tenant ${tenantId}: ${error?.message || 'no config'}`);
  }

  const credJson = await getPlatformApiKey(supabase, 'snowflake');
  if (!credJson) throw new Error('Snowflake platform credentials missing');
  const credentials = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;

  const connector = new SnowflakeConnector(tenantId, sc.config, credentials);
  await connector.connect();
  return { connector, config: sc.config };
}

/** Normalize a job_number for matching. WinTeam stores them as numbers but
 *  some Excel sources hand us strings; uppercase + strip whitespace + lead 0s. */
function normJob(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(/^0+/, '').toUpperCase();
  return s.length ? s : null;
}

async function main({ tenantId = AA_TENANT_ID } = {}) {
  console.log('[enrich-wc-claims] Starting…');
  console.log(`  Tenant: ${tenantId}`);
  console.log(`  VP tier column: ${VP_TIER_COL}`);

  // ── 1. Fetch all wc_claims rows for the tenant ──────────────────────────
  const { data: claims, error: claimsErr } = await supabase
    .from('wc_claims')
    .select('id, claim_number, job_number, job_name, vp')
    .eq('tenant_id', tenantId);
  if (claimsErr) throw new Error(`Failed to fetch wc_claims: ${claimsErr.message}`);
  console.log(`  Loaded ${claims.length} claims from Supabase`);

  const claimsWithJob = claims.filter(c => c.job_number != null);
  console.log(`  ${claimsWithJob.length} have a job_number, ${claims.length - claimsWithJob.length} do not`);

  if (claimsWithJob.length === 0) {
    console.log('[enrich-wc-claims] Nothing to enrich.');
    return { matched: 0, unmatched: 0, applied: 0 };
  }

  // ── 2. Connect to Snowflake and pull DIM_JOB for the tenant ─────────────
  const { connector, config } = await getConnector(tenantId);
  const fqPrefix = `${config.tenant_database}.${config.schema || 'PUBLIC'}`;
  const dimJobFq = `${fqPrefix}.DIM_JOB`;

  console.log(`  Snowflake source: ${dimJobFq}`);
  console.log(`  Company filter: ${config.company_filter}`);

  const dimJobSql = `
    SELECT
      JOB_NUMBER                  AS job_number,
      JOB_NAME                    AS job_name,
      ${VP_TIER_COL}              AS vp
    FROM ${dimJobFq}
    WHERE JOB_COMPANY_NAME = :1
  `;

  const dimRows = await connector.queryView(dimJobSql, [config.company_filter]);
  console.log(`  Pulled ${dimRows.length} DIM_JOB rows from Snowflake`);

  // Build lookup: normalized job_number → { job_name, vp }
  const dimMap = new Map();
  for (const r of dimRows) {
    const k = normJob(r.JOB_NUMBER ?? r.job_number);
    if (!k) continue;
    dimMap.set(k, {
      job_name: r.JOB_NAME ?? r.job_name ?? null,
      vp: r.VP ?? r.vp ?? null,
    });
  }
  console.log(`  Indexed ${dimMap.size} unique job_numbers from DIM_JOB`);

  // ── 3. Walk claims, build patch list ────────────────────────────────────
  const patches = [];
  const stats = { matched: 0, unmatched: 0, jobNameChanged: 0, vpChanged: 0, noChange: 0 };
  const unmatchedJobs = new Set();

  for (const c of claimsWithJob) {
    const key = normJob(c.job_number);
    const dim = dimMap.get(key);
    if (!dim) {
      stats.unmatched++;
      unmatchedJobs.add(c.job_number);
      continue;
    }
    stats.matched++;

    const newName = dim.job_name;
    const newVp = dim.vp;
    const nameChanged = newName != null && newName !== c.job_name;
    const vpChanged   = newVp != null && newVp !== c.vp;

    if (!nameChanged && !vpChanged) {
      stats.noChange++;
      continue;
    }
    if (nameChanged) stats.jobNameChanged++;
    if (vpChanged) stats.vpChanged++;

    const patch = { id: c.id };
    if (nameChanged) patch.job_name = newName;
    if (vpChanged) patch.vp = newVp;
    patches.push(patch);
  }

  console.log(`  Match: ${stats.matched} matched, ${stats.unmatched} unmatched`);
  console.log(`  Diffs: ${stats.jobNameChanged} job_name updates, ${stats.vpChanged} vp updates, ${stats.noChange} unchanged`);

  if (unmatchedJobs.size > 0 && unmatchedJobs.size <= 30) {
    console.log(`  Unmatched job_numbers: ${[...unmatchedJobs].sort().join(', ')}`);
  } else if (unmatchedJobs.size > 30) {
    console.log(`  Unmatched job_numbers (first 30): ${[...unmatchedJobs].slice(0, 30).join(', ')} … (+${unmatchedJobs.size - 30} more)`);
  }

  // ── 4. Apply patches ────────────────────────────────────────────────────
  let applied = 0;
  if (patches.length === 0) {
    console.log('[enrich-wc-claims] No updates needed — already in sync.');
  } else {
    console.log(`  Applying ${patches.length} updates…`);
    for (const p of patches) {
      const { id, ...fields } = p;
      const { error: upErr } = await supabase
        .from('wc_claims')
        .update(fields)
        .eq('id', id);
      if (upErr) {
        console.error(`  Update failed for claim ${id}: ${upErr.message}`);
        continue;
      }
      applied++;
    }
    console.log(`[enrich-wc-claims] Done — ${applied}/${patches.length} updates applied.`);
  }

  // ── 5. Cleanup ──────────────────────────────────────────────────────────
  try { connector.destroy?.(); } catch {}

  return {
    matched: stats.matched,
    unmatched: stats.unmatched,
    jobNameChanged: stats.jobNameChanged,
    vpChanged: stats.vpChanged,
    applied,
  };
}

// Export so seed-wc-claims.mjs can call us in-process after seeding.
export { main as enrichWcClaimsFromSnowflake };

// Run as a standalone CLI when invoked directly.
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main().catch(err => {
    console.error('[enrich-wc-claims] FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
