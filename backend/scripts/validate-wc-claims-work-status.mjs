// ============================================================================
// validate-wc-claims-work-status.mjs
// ----------------------------------------------------------------------------
// Validates wc_claims.work_status against actual WinTeam timekeeping for the
// last 14 days. Liberty's loss-run is the source of truth Jackie edits, but
// it's frequently stale — an employee can return to work weeks before Liberty
// updates the claim. WinTeam's FACT_TIMEKEEPING shows actual clock-in
// activity, so we can confirm or contradict each open claim's status.
//
// Strategy:
//   1. Pull all open claims for the tenant (with employee_id) from Supabase.
//   2. Single Snowflake query to FACT_TIMEKEEPING + DIM_EMPLOYEE + DIM_JOB
//      filtered to the company + last 14 days.
//   3. Build an in-memory map keyed by employee_number → array of rows.
//   4. For each claim, compute aggregates + classify the validation state.
//   5. Bulk-write the wt_* columns back to wc_claims.
//
// Idempotent. Safe to run repeatedly. Skips closed/non-reportable claims.
//
// Run:
//   cd backend
//   node scripts/validate-wc-claims-work-status.mjs
//
// Env overrides:
//   AA_TENANT_ID  (defaults to A&A UUID)
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import SnowflakeConnector from '../sync/connectors/SnowflakeConnector.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';

const AA_TENANT_ID = process.env.AA_TENANT_ID || '6acb59e5-05c9-4653-98ec-710906771dbb';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Mirrors the connector setup pattern in enrich-wc-claims-snowflake.mjs.
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

/** Normalize an employee_number for matching. */
function normEmp(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(/^0+/, '').toUpperCase();
  return s.length ? s : null;
}

/** Format a Date or date-string as YYYY-MM-DD. */
function toIsoDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Decide the validation state from raw aggregates + Liberty's work_status.
 *   confirmed → WinTeam agrees with Liberty
 *   mismatch  → WinTeam contradicts Liberty (likely stale)
 *   no_data   → no rows in WinTeam for this employee
 */
function classify(workStatus, hours) {
  const status = (workStatus || '').toLowerCase().trim();
  const isOow = /out of work/.test(status) || status === 'oow';
  // "FD" = Full Duty, "LD" = Light Duty (Liberty abbreviations). Match as
  // whole tokens so we don't fire on the letters in "refund" etc.
  const isActive = /\b(light|full|returned|fd|ld)\b/.test(status);

  if (hours === 0) {
    if (isOow) return 'confirmed';
    if (isActive) return 'mismatch';
    return 'confirmed';
  }
  // hours > 0
  if (isOow) return 'mismatch';
  return 'confirmed';
}

export async function validateWcClaimsWorkStatus({ tenantId = AA_TENANT_ID } = {}) {
  const startedAt = Date.now();
  console.log('[validate-wc-claims] Starting…');
  console.log(`  Tenant: ${tenantId}`);

  // ── 1. Fetch open claims with an employee_id ────────────────────────────
  const { data: claims, error: claimsErr } = await supabase
    .from('wc_claims')
    .select('id, claim_number, employee_id, employee_name, job_name, work_status, ee_status, claim_status')
    .eq('tenant_id', tenantId)
    .eq('claim_status', 'Open');
  if (claimsErr) throw new Error(`Failed to fetch wc_claims: ${claimsErr.message}`);

  console.log(`  Loaded ${claims.length} open claims`);
  const targetClaims = claims.filter(c => c.employee_id != null && String(c.employee_id).trim() !== '');
  console.log(`  ${targetClaims.length} have employee_id, ${claims.length - targetClaims.length} skipped (no employee_id)`);

  // ── 2. Connect to Snowflake & pull last-14d timekeeping ─────────────────
  const { connector, config } = await getConnector(tenantId);
  const fqPrefix = `${config.tenant_database}.${config.schema || 'PUBLIC'}`;
  const ftFq = `${fqPrefix}.FACT_TIMEKEEPING`;
  const deFq = `${fqPrefix}.DIM_EMPLOYEE`;
  const djFq = `${fqPrefix}.DIM_JOB`;
  const ddFq = `${fqPrefix}.DIM_DATE`;

  console.log(`  Snowflake: ${ftFq}`);
  console.log(`  Company filter: ${config.company_filter}`);

  // FACT_TIMEKEEPING.WORK_DATE_KEY is a hex surrogate key, so we join to
  // DIM_DATE to get the actual CALENDAR_DATE and filter on it.
  const sql = `
    SELECT
      e.EMPLOYEE_NUMBER              AS employee_number,
      j.JOB_NAME                     AS job_name,
      d.CALENDAR_DATE                AS work_date,
      f.TIMEKEEPING_REGULAR_HOURS    AS reg_hours,
      f.TIMEKEEPING_OVERTIME_HOURS   AS ot_hours,
      f.TIMEKEEPING_DOUBLETIME_HOURS AS dt_hours
    FROM ${ftFq} f
    JOIN ${deFq} e ON e.EMPLOYEE_KEY = f.EMPLOYEE_KEY
    JOIN ${djFq} j ON j.JOB_KEY = f.JOB_KEY
    JOIN ${ddFq} d ON d.DATE_KEY = f.WORK_DATE_KEY
    WHERE j.JOB_COMPANY_NAME = :1
      AND d.CALENDAR_DATE >= DATEADD(day, -14, CURRENT_DATE())
  `;
  const tkRows = await connector.queryView(sql, [config.company_filter]);
  console.log(`  Pulled ${tkRows.length} timekeeping rows from last 14 days`);

  // ── 3a. Pull the set of valid EMPLOYEE_NUMBERs for this company ─────────
  // Important: an employee who exists in DIM_EMPLOYEE but has no rows in
  // FACT_TIMEKEEPING over the last 14 days is NOT "no_data" — they're
  // simply at zero hours (which is exactly what an OOW claimant should
  // look like). We only mark employees as "no_data" when they can't be
  // found in DIM_EMPLOYEE at all.
  const empSql = `
    SELECT DISTINCT e.EMPLOYEE_NUMBER AS employee_number
    FROM ${deFq} e
    JOIN ${djFq} j
      ON j.JOB_NUMBER = e.EMPLOYEE_PRIMARY_JOB_NUMBER
    WHERE j.JOB_COMPANY_NAME = :1
  `;
  const empRows = await connector.queryView(empSql, [config.company_filter]);
  const validEmpSet = new Set();
  for (const r of empRows) {
    const key = normEmp(r.employee_number);
    if (key) validEmpSet.add(key);
  }
  console.log(`  Loaded ${validEmpSet.size} employees in DIM_EMPLOYEE for the company`);

  // ── 3b. Build map: employee_number → timekeeping rows ──────────────────
  const tkMap = new Map();
  for (const r of tkRows) {
    const key = normEmp(r.employee_number);
    if (!key) continue;
    if (!tkMap.has(key)) tkMap.set(key, []);
    tkMap.get(key).push(r);
  }
  console.log(`  ${tkMap.size} employees with timekeeping in last 14 days`);

  // ── 4. Walk claims, compute patches ─────────────────────────────────────
  const stats = { checked: 0, confirmed: 0, mismatched: 0, no_data: 0 };
  const checkedAt = new Date().toISOString();

  // First, mark all skipped open claims (no employee_id) as no_data so they
  // get a friendly tooltip rather than appearing unchecked forever.
  const skipped = claims.filter(c => !c.employee_id || String(c.employee_id).trim() === '');

  let applied = 0;
  let failed = 0;

  for (const c of targetClaims) {
    const key = normEmp(c.employee_id);
    const rows = key ? tkMap.get(key) : null;
    const employeeExists = key ? validEmpSet.has(key) : false;

    let patch;
    if (!employeeExists) {
      // Not in DIM_EMPLOYEE at all → truly no data
      stats.no_data++;
      patch = {
        wt_validation_state: 'no_data',
        wt_last_clocked_day: null,
        wt_hours_last_14d: null,
        wt_days_worked_last_14d: null,
        wt_jobs_worked_last_14d: null,
        wt_validation_checked_at: checkedAt,
      };
    } else {
      // Employee exists — aggregate whatever timekeeping we have (may be 0)
      let totalHours = 0;
      const dayKeys = new Set();
      const jobs = new Set();
      let lastDay = null;
      for (const r of rows || []) {
        const h = Number(r.reg_hours || 0) + Number(r.ot_hours || 0) + Number(r.dt_hours || 0);
        totalHours += h;
        const day = toIsoDate(r.work_date);
        if (day) {
          dayKeys.add(day);
          if (lastDay == null || day > lastDay) lastDay = day;
        }
        if (r.job_name) jobs.add(r.job_name);
      }
      const state = classify(c.work_status || c.ee_status, totalHours);
      if (state === 'confirmed') stats.confirmed++;
      else if (state === 'mismatch') stats.mismatched++;

      patch = {
        wt_validation_state: state,
        wt_last_clocked_day: lastDay,
        wt_hours_last_14d: Number(totalHours.toFixed(2)),
        wt_days_worked_last_14d: dayKeys.size,
        wt_jobs_worked_last_14d: jobs.size > 0 ? [...jobs].sort().join(', ') : null,
        wt_validation_checked_at: checkedAt,
      };
    }

    stats.checked++;

    const { error: upErr } = await supabase
      .from('wc_claims')
      .update(patch)
      .eq('id', c.id);
    if (upErr) {
      failed++;
      console.error(`  Update failed for claim ${c.claim_number || c.id}: ${upErr.message}`);
      continue;
    }
    applied++;
  }

  // Mark skipped (no employee_id) claims as no_data with a null last_clocked.
  for (const c of skipped) {
    stats.checked++;
    stats.no_data++;
    const { error: upErr } = await supabase
      .from('wc_claims')
      .update({
        wt_validation_state: 'no_data',
        wt_last_clocked_day: null,
        wt_hours_last_14d: null,
        wt_days_worked_last_14d: null,
        wt_jobs_worked_last_14d: null,
        wt_validation_checked_at: checkedAt,
      })
      .eq('id', c.id);
    if (upErr) {
      failed++;
      console.error(`  Update failed for claim ${c.claim_number || c.id}: ${upErr.message}`);
      continue;
    }
    applied++;
  }

  try { connector.destroy?.(); } catch {}

  const durationMs = Date.now() - startedAt;
  console.log(
    `[validate-wc-claims] Validated ${stats.checked} open claims · ` +
    `${stats.confirmed} confirmed · ${stats.mismatched} mismatched · ` +
    `${stats.no_data} no_data · runtime ${(durationMs / 1000).toFixed(1)}s`
  );
  if (failed > 0) console.warn(`  ${failed} updates failed`);

  return {
    checked: stats.checked,
    confirmed: stats.confirmed,
    mismatched: stats.mismatched,
    no_data: stats.no_data,
    applied,
    failed,
    duration_ms: durationMs,
  };
}

// CLI runner
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  validateWcClaimsWorkStatus().catch(err => {
    console.error('[validate-wc-claims] FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
