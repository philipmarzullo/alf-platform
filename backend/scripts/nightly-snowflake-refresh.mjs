// ============================================================================
// nightly-snowflake-refresh.mjs
// ----------------------------------------------------------------------------
// Platform-wide Snowflake refresh. Runs every active tenant that has a
// snowflake sync_configs row through the full refresh pipeline:
//
//   1. runSync() — refreshes all sf_* mirror tables (operations, labor,
//                  quality, timekeeping, safety metrics dashboards).
//   2. enrichWcClaimsFromSnowflake() — authoritative job_name + VP from DIM_JOB.
//   3. validateWcClaimsWorkStatus() — WinTeam last-14d timekeeping check
//      for open wc_claims (maxAgeMinutes: 0 = always run).
//
// This is the safety net behind the Phase 1 page-load auto-refresh: even if
// nobody opens the portal for a week, the first morning load is still fresh.
//
// Per-tenant failures are logged but don't stop the run.
//
// ----------------------------------------------------------------------------
// DEPLOYMENT — Render cron service
// ----------------------------------------------------------------------------
// Configured via the Render dashboard (no render.yaml in this repo):
//
//   Service type:  Cron
//   Name:          snowflake-nightly-refresh
//   Runtime:       Node
//   Schedule:      0 8 * * *          # 08:00 UTC / 04:00 EDT / 03:00 EST
//   Build cmd:     cd backend && npm install
//   Start cmd:     cd backend && node --max-old-space-size=1536 scripts/nightly-snowflake-refresh.mjs
//   Env vars:      inherit from alf-backend env group
//                  (SUPABASE_URL, SUPABASE_SERVICE_KEY,
//                   CREDENTIAL_ENCRYPTION_KEY, etc.)
//
//   The --max-old-space-size flag gives Node room to hold a FACT_TIMEKEEPING-
//   sized result set in memory while upserting. Keep it below the Render
//   cron's container RAM ceiling to avoid OS OOM kills.
//
// Run locally:
//   cd backend && node scripts/nightly-snowflake-refresh.mjs
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runSync } from '../sync/runner.js';
import { enrichWcClaimsFromSnowflake } from './enrich-wc-claims-snowflake.mjs';
import { validateWcClaimsWorkStatus } from './validate-wc-claims-work-status.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Load every active tenant that has a snowflake sync_configs row. The cron
 * iterates this set in sequence — platform only has a handful of tenants
 * today, so we don't bother with parallelism.
 *
 * Two queries instead of a PostgREST join so we don't depend on the FK
 * relationship being declared in the API schema.
 */
async function loadTenantsToRefresh() {
  const { data: tenants, error: tenantsErr } = await supabase
    .from('alf_tenants')
    .select('id, slug')
    .eq('is_active', true);
  if (tenantsErr) throw new Error(`Failed to load alf_tenants: ${tenantsErr.message}`);
  if (!tenants || tenants.length === 0) return [];

  const { data: configs, error: configsErr } = await supabase
    .from('sync_configs')
    .select('id, tenant_id, connector_type, config, tables_to_sync')
    .eq('connector_type', 'snowflake')
    .in('tenant_id', tenants.map(t => t.id));
  if (configsErr) throw new Error(`Failed to load sync_configs: ${configsErr.message}`);

  const slugById = new Map(tenants.map(t => [t.id, t.slug]));
  return (configs || []).map(c => ({ ...c, _slug: slugById.get(c.tenant_id) || c.tenant_id }));
}

async function refreshTenant(syncConfig) {
  const tenantId = syncConfig.tenant_id;
  const slug = syncConfig._slug || tenantId;
  const t0 = Date.now();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[nightly-refresh] Tenant: ${slug} (${tenantId})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const result = {
    tenant_id: tenantId,
    slug,
    sync: null,
    enrich: null,
    validate: null,
    errors: [],
  };

  // ── Step 1: sync the sf_* mirror tables ───────────────────────────────
  //
  // HOTFIX 2026-04-09: only sync the two dim tables. The sf_fact_* tables
  // are full-history pulls (FACT_TIMEKEEPING is ~20M rows for A&A) which
  // OOM'd the cron repeatedly and, once we bought more RAM, just ran for
  // >1 hour with incorrect data because there's no incremental watermark
  // yet. Skipping facts entirely until the incremental-sync work lands.
  //
  // Dims stay in — they're small, change slowly, and are required as FK
  // targets for wc_claims enrichment and any future fact incrementals.
  // Enrich + validate below cover the wc_claims freshness SLA on their
  // own; the sf_fact_* dashboards still have whatever data was in them
  // from the last successful manual sync, and Phase 3's SyncHealthBanner
  // surfaces staleness at page-load time if anyone notices.
  //
  // Remove this override when the incremental sync path is ready.
  const dimOnlySyncConfig = {
    ...syncConfig,
    tables_to_sync: ['sf_dim_job', 'sf_dim_employee'],
  };

  try {
    console.log(`[nightly-refresh] 1/3 runSync → sf_dim_* only (facts skipped, see hotfix note)`);
    const syncResult = await runSync(supabase, dimOnlySyncConfig, { triggeredBy: 'scheduled' });
    result.sync = {
      status: syncResult.status,
      log_id: syncResult.logId,
      tables: Object.keys(syncResult.rowCounts || {}).length,
      errors: syncResult.errors?.length || 0,
    };
    const marker = syncResult.status === 'success' ? '✓' : '✗';
    console.log(`  ${marker} sync status=${syncResult.status} log_id=${syncResult.logId}`);
    if (syncResult.rowCounts && Object.keys(syncResult.rowCounts).length > 0) {
      for (const [table, counts] of Object.entries(syncResult.rowCounts)) {
        const parts = [];
        if (counts.fetched != null) parts.push(`fetched=${counts.fetched}`);
        if (counts.upserted != null) parts.push(`upserted=${counts.upserted}`);
        if (counts.skipped) parts.push(`skipped=${counts.skipped}`);
        if (counts.error) parts.push(`error="${counts.error}"`);
        console.log(`    - ${table}: ${parts.join(' ')}`);
      }
    }
    if (syncResult.errors && syncResult.errors.length > 0) {
      // Log the first handful of errors verbatim so we can diagnose what
      // went wrong without tailing the sync_logs table separately.
      const sample = syncResult.errors.slice(0, 5);
      for (const e of sample) {
        console.log(`    ! ${e.table || '(no table)'}: ${e.error || JSON.stringify(e)}`);
      }
      if (syncResult.errors.length > sample.length) {
        console.log(`    … +${syncResult.errors.length - sample.length} more errors (see sync_logs.errors)`);
      }
    }
    // A non-success status is a real failure even though runSync didn't
    // throw — count it toward the tenant's error tally so the cron summary
    // and exit code reflect reality.
    if (syncResult.status !== 'success') {
      result.errors.push({ step: 'sync', status: syncResult.status, errors: syncResult.errors });
    }
  } catch (err) {
    console.error(`  ✗ sync failed: ${err.message}`);
    result.errors.push({ step: 'sync', error: err.message });
  }

  // ── Step 2: enrich wc_claims job_name + VP ────────────────────────────
  try {
    console.log(`[nightly-refresh] 2/3 enrich wc_claims (job_name + VP)`);
    result.enrich = await enrichWcClaimsFromSnowflake({ tenantId });
    console.log(
      `  ✓ enrich matched=${result.enrich?.matched ?? 0} ` +
      `applied=${result.enrich?.applied ?? 0}`
    );
  } catch (err) {
    console.error(`  ✗ enrich failed: ${err.message}`);
    result.errors.push({ step: 'enrich', error: err.message });
  }

  // ── Step 3: validate wc_claims work status (WinTeam timekeeping) ──────
  try {
    console.log(`[nightly-refresh] 3/3 validate wc_claims work_status`);
    // maxAgeMinutes: 0 → always run, never dedup. This is the authoritative
    // nightly refresh; the dedup guard exists only for page-load auto-refresh.
    result.validate = await validateWcClaimsWorkStatus({ tenantId, maxAgeMinutes: 0 });
    console.log(
      `  ✓ validate checked=${result.validate?.checked ?? 0} ` +
      `confirmed=${result.validate?.confirmed ?? 0} ` +
      `mismatched=${result.validate?.mismatched ?? 0}`
    );
  } catch (err) {
    console.error(`  ✗ validate failed: ${err.message}`);
    result.errors.push({ step: 'validate', error: err.message });
  }

  const durationMs = Date.now() - t0;
  console.log(`[nightly-refresh] Tenant ${slug} done in ${(durationMs / 1000).toFixed(1)}s · ${result.errors.length} errors`);
  return { ...result, duration_ms: durationMs };
}

async function main() {
  const startedAt = Date.now();
  console.log(`[nightly-refresh] Starting at ${new Date().toISOString()}`);

  const configs = await loadTenantsToRefresh();
  console.log(`[nightly-refresh] ${configs.length} active snowflake tenants to refresh`);

  const summaries = [];
  for (const cfg of configs) {
    try {
      summaries.push(await refreshTenant(cfg));
    } catch (err) {
      // refreshTenant already catches per-step errors; this is belt-and-braces
      // for anything that escapes (e.g. bad config shape).
      console.error(`[nightly-refresh] Tenant ${cfg.tenant_id} crashed: ${err.message}`);
      summaries.push({ tenant_id: cfg.tenant_id, errors: [{ step: 'refreshTenant', error: err.message }] });
    }
  }

  const totalMs = Date.now() - startedAt;
  const totalErrors = summaries.reduce((n, s) => n + (s.errors?.length || 0), 0);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[nightly-refresh] DONE — ${summaries.length} tenants · ${totalErrors} errors · ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Exit non-zero if EVERY tenant failed, so Render flags the cron as errored.
  // Partial failures (some tenants ok, some broken) still exit 0 — the log
  // has the detail and we don't want a single bad tenant to hide successful
  // refreshes.
  if (summaries.length > 0 && summaries.every(s => (s.errors?.length || 0) > 0)) {
    process.exit(1);
  }
}

// CLI entry
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main().catch(err => {
    console.error('[nightly-refresh] FATAL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}

export { main as nightlySnowflakeRefresh };
