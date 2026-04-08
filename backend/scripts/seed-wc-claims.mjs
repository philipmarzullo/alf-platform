// ============================================================================
// seed-wc-claims.mjs
// ----------------------------------------------------------------------------
// One-time seed of the wc_claims table for the A&A tenant from Jackie's Excel
// files. Merges three sources on claim_number:
//
//   1. Loss_Run_Detail (Liberty Mutual export) — financials, injury detail
//   2. Claim_Detail (Liberty dashboard helper sheet) — case manager contact
//   3. WC Claim Tracker → Open / Closed / Non-Reportable sheets — VP, claim
//      stage, next action, internal notes (the columns Liberty does not export)
//
// Liberty wins for financials. Tracker wins for VP, claim_stage, next_action,
// notes, claim_concerns. Case manager comes from Claim_Detail.
//
// Run:
//   cd backend
//   node scripts/seed-wc-claims.mjs                       # uses Desktop paths
//   LIBERTY=/path/x.xlsx TRACKER=/path/y.xlsx node scripts/seed-wc-claims.mjs
//
// Idempotent: upserts on (tenant_id, claim_number) so re-running merges into
// existing rows instead of duplicating. Preserves any in-app edits to fields
// the source files don't supply.
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// A&A tenant — hardcoded per Philip. If you need to seed a different tenant,
// override via the AA_TENANT_ID env var.
const AA_TENANT_ID = process.env.AA_TENANT_ID || '6acb59e5-05c9-4653-98ec-710906771dbb';
const HOME = process.env.HOME || '/Users/philip';

const LIBERTY_PATH = process.env.LIBERTY
  || path.join(HOME, 'Desktop', 'WC Claims Dashboard All Open Claims 2026.xlsx');
const TRACKER_PATH = process.env.TRACKER
  || path.join(HOME, 'Desktop', 'WC Claim Tracker.xlsx');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Excel serial date → ISO yyyy-mm-dd, or null. */
function excelDate(v) {
  if (v == null || v === '') return null;
  // Already a Date
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // ISO string
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  // Excel serial
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel epoch: 1899-12-30 UTC (handles 1900 leap-year bug)
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function intOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function bool(v) {
  if (v == null || v === '') return null;
  const s = String(v).toLowerCase();
  if (s.startsWith('1') || s.startsWith('y') || s.includes('yes')) return true;
  if (s.startsWith('0') || s.startsWith('n') || s.includes('no')) return false;
  return null;
}

/** Normalize a claim number for matching (uppercase, strip whitespace). */
function normalizeClaim(v) {
  if (!v) return null;
  return String(v).trim().toUpperCase().replace(/\s+/g, '');
}

/** Read a sheet as { headers, rows }, where rows are objects keyed by header label. */
function readSheet(filePath, sheetName, headerRow = 0) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[sheetName];
  if (!ws?.['!ref']) return { headers: [], rows: [] };
  const range = XLSX.utils.decode_range(ws['!ref']);

  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    headers.push(cell?.v != null ? String(cell.v).trim() : `__col${c}`);
  }

  const rows = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const row = {};
    let hasData = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const val = cell?.v;
      row[headers[c - range.s.c]] = val;
      if (val != null && val !== '') hasData = true;
    }
    if (hasData) rows.push(row);
  }
  return { headers, rows };
}

// ----------------------------------------------------------------------------
// Field mappers — one per source sheet → partial wc_claims row
// ----------------------------------------------------------------------------

function fromLossRun(r) {
  const status = str(r['Claim Status']);
  return {
    claim_number: normalizeClaim(r['Claim Number']),
    date_of_loss: excelDate(r['Date of Loss']),
    employee_id: intOrNull(r['Employee ID']),
    employee_name: str(r['Claimant Name']),
    date_of_birth: excelDate(r['Date of Birth']),
    date_of_hire: excelDate(r['Date of Hire']),
    gender: str(r['Gender']),
    job_number: intOrNull(r['Job Number']),
    job_name: str(r['Job Name']),
    accident_state: str(r['Accident State']),
    supervisor: str(r['Claimant Supervisor']),
    claim_status: status === 'O' ? 'Open' : status === 'C' ? 'Closed' : status,
    injury_cause: str(r['Cause Description']),
    catalyst: str(r['Catalyst Description']),
    nature_of_injury: str(r['Nature of Injury Description']),
    part_of_body: str(r['Part of Body Description']) || str(r['Part of Body']),
    accident_description: str(r['Accident Description']),
    lost_time_days: intOrNull(r['Paid Lost Time Days']),
    surgery_indicator: bool(r['Surgery Indicator']),
    litigation_status: str(r['Litigation Status']),
    incurred_medical: num(r['Incurred Medical']),
    incurred_indemnity: num(r['Incurred Indemnity']),
    incurred_expense: num(r['Incurred Expense']),
    total_incurred: num(r['Total Incurred']),
    paid_medical: num(r['Paid Medical']),
    paid_indemnity: num(r['Paid Indemnity']),
    paid_expense: num(r['Paid Expense']),
    total_paid: num(r['Total Paid']),
    outstanding_reserve: num(r['Outstanding Reserve']),
    claim_concerns: str(r['Claim concerns']),
    source: 'liberty_csv',
  };
}

function fromClaimDetail(r) {
  return {
    claim_number: normalizeClaim(r['Claim Number']),
    case_manager: str(r['Case Manager']),
    case_manager_email: str(r['Case Manager Email']),
    case_manager_phone: str(r['Case Manager Phone Number']),
    work_status: str(r['WorkStatus']),
    ee_status: str(r['StatusClean']) || str(r['EE  Status']),
    rtw_date: excelDate(r['RTW Date']),
    restrictions: str(r['Restrictions/ Updates']),
    vp: str(r['VP']),
    notes: str(r['Notes']),
  };
}

function fromTrackerOpen(r) {
  return {
    claim_number: normalizeClaim(r['Claim Number']),
    date_of_loss: excelDate(r['Date of Loss']),
    employee_id: intOrNull(r['EE ID']),
    employee_name: str(r['Employee Name']),
    job_number: intOrNull(r['Job Number']),
    job_name: str(r['Job Name']),
    accident_state: str(r[' State']) || str(r['State']),
    // Open Claims sheet header is "VP " (trailing space) — try both
    vp: str(r['VP ']) || str(r['VP']),
    ee_status: str(r['EE Status']) || str(r['EE  Status']),
    work_status: str(r['EE Status']) || str(r['EE  Status']),
    rtw_date: excelDate(r['RTW Date']) || excelDate(r['RTW date']),
    restrictions: str(r['Restrictions/ Updates']),
    claim_age_days: intOrNull(r['Claim Age']),
    injury_cause: str(r['Injury Cause']),
    part_of_body: str(r['Body Part']),
    accident_description: str(r['Accident Description']),
    claim_stage: str(r['Claim Stage']),
    next_action: str(r['Next Action/ Update']),
    case_manager_email: str(r['Case Manager Email']),
    date_of_birth: excelDate(r['Date of Birth']),
    date_of_hire: excelDate(r['Date of Hire']),
    notes: str(r['Notes']),
    claim_concerns: str(r['Claim concerns']),
    claim_status: 'Open',
    source: 'tracker_xlsx',
  };
}

function fromTrackerClosed(r) {
  return {
    claim_number: normalizeClaim(r['Claim Number']),
    date_of_loss: excelDate(r['Date of Loss']),
    employee_id: intOrNull(r['EE ID']),
    employee_name: str(r['Employee Name']),
    supervisor: str(r['Supervisor']),
    job_number: intOrNull(r['Job Number']),
    job_name: str(r['Job Name']),
    // Closed Claims sheet header is " State" (leading space)
    accident_state: str(r[' State']) || str(r['State']),
    vp: str(r['VP']),
    ee_status: str(r['EE  Status']) || str(r['EE Status']),
    rtw_date: excelDate(r['RTW Date']),
    restrictions: str(r['Restrictions/ Updates']),
    next_action: str(r['Current Update']),
    date_of_birth: excelDate(r['Date of Birth']),
    part_of_body: str(r['Body Part']),
    date_of_hire: excelDate(r['Date of Hire']),
    accident_description: str(r['Accident Description']),
    case_manager_email: str(r['Case Manager Email']),
    case_manager: str(r['Case Manager']),
    case_manager_phone: str(r['Case Manager Phone Number']),
    claim_concerns: str(r['Claim concerns']),
    claim_status: 'Closed',
    source: 'tracker_xlsx',
  };
}

function fromTrackerNonReportable(r) {
  return {
    claim_number: normalizeClaim(r['Claim Number']) || `NR-${r['EE ID']}-${excelDate(r['Date of Loss'])}`,
    date_of_loss: excelDate(r['Date of Loss']),
    employee_id: intOrNull(r['EE ID']),
    employee_name: str(r['Employee Name']),
    job_number: intOrNull(r['Job Number']),
    job_name: str(r['Job Name']),
    accident_state: str(r['State']) || str(r[' State']),
    vp: str(r['VP']),
    ee_status: str(r['EE  Status']) || str(r['EE Status']),
    rtw_date: excelDate(r['RTW date']) || excelDate(r['RTW Date']),
    restrictions: str(r['Restrictions/ Updates']),
    claim_age_days: intOrNull(r['Claim Age']),
    injury_cause: str(r['Injury Cause']),
    part_of_body: str(r['Body Part']),
    accident_description: str(r['Accident Description']),
    claim_stage: str(r['Claim Stage']),
    next_action: str(r['Current Update']),
    case_manager: str(r['Case Manager']),
    date_of_birth: excelDate(r['Date of Birth']),
    date_of_hire: excelDate(r['Date of Hire']),
    notes: str(r['Notes']),
    claim_status: 'Non-Reportable',
    work_status: 'Non-Reportable',
    source: 'tracker_xlsx',
  };
}

/** Merge two partial rows: target wins for non-empty fields in target. */
function merge(base, overlay) {
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v == null) continue;
    if (typeof v === 'number' && v === 0 && out[k]) continue;
    if (typeof v === 'string' && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log('[seed-wc-claims] Starting…');
  console.log('  Liberty file:', LIBERTY_PATH);
  console.log('  Tracker file:', TRACKER_PATH);

  if (!fs.existsSync(LIBERTY_PATH)) throw new Error(`Liberty file not found: ${LIBERTY_PATH}`);
  if (!fs.existsSync(TRACKER_PATH)) throw new Error(`Tracker file not found: ${TRACKER_PATH}`);

  // Hardcoded A&A tenant
  console.log(`  Tenant: ${AA_TENANT_ID}`);

  // Read source sheets
  const lossRun = readSheet(LIBERTY_PATH, 'Loss_Run_Detail', 0);
  const claimDetail = readSheet(LIBERTY_PATH, 'Claim_Detail', 0);
  const trackerOpen = readSheet(TRACKER_PATH, 'Open Claims', 1);     // header on row 2 (idx 1)
  const trackerClosed = readSheet(TRACKER_PATH, 'Closed Claims', 0);
  const trackerNR = readSheet(TRACKER_PATH, 'Non-Reportable', 0);
  console.log(`  Loaded: ${lossRun.rows.length} loss-run | ${claimDetail.rows.length} claim-detail | ${trackerOpen.rows.length} open | ${trackerClosed.rows.length} closed | ${trackerNR.rows.length} non-reportable`);

  // Build map keyed by normalized claim number
  const map = new Map();

  // 1. Liberty loss run (financials base)
  for (const r of lossRun.rows) {
    const mapped = fromLossRun(r);
    if (!mapped.claim_number) continue;
    map.set(mapped.claim_number, mapped);
  }

  // 2. Liberty claim detail (case manager)
  for (const r of claimDetail.rows) {
    const mapped = fromClaimDetail(r);
    if (!mapped.claim_number) continue;
    const existing = map.get(mapped.claim_number);
    if (existing) {
      map.set(mapped.claim_number, merge(existing, mapped));
    } else {
      // Claim_Detail without a Loss_Run row — add as standalone
      map.set(mapped.claim_number, { ...mapped, source: 'liberty_csv' });
    }
  }

  // 3. Tracker Open Claims (VP, stage, next action, notes — overlay)
  for (const r of trackerOpen.rows) {
    const mapped = fromTrackerOpen(r);
    if (!mapped.claim_number) continue;
    const existing = map.get(mapped.claim_number);
    if (existing) {
      map.set(mapped.claim_number, merge(existing, mapped));
    } else {
      map.set(mapped.claim_number, mapped);
    }
  }

  // 4. Tracker Closed Claims
  for (const r of trackerClosed.rows) {
    const mapped = fromTrackerClosed(r);
    if (!mapped.claim_number) continue;
    const existing = map.get(mapped.claim_number);
    if (existing) {
      map.set(mapped.claim_number, merge(existing, mapped));
    } else {
      map.set(mapped.claim_number, mapped);
    }
  }

  // 5. Tracker Non-Reportable
  for (const r of trackerNR.rows) {
    const mapped = fromTrackerNonReportable(r);
    if (!mapped.claim_number) continue;
    map.set(mapped.claim_number, merge(map.get(mapped.claim_number) || {}, mapped));
  }

  const rows = [...map.values()]
    .filter(r => r.claim_number) // upsert needs a non-null conflict target
    .map(r => ({ ...r, tenant_id: AA_TENANT_ID }));
  console.log(`  Merged ${rows.length} unique claims`);

  // Upsert in batches of 100 on (tenant_id, claim_number)
  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: upErr } = await supabase
      .from('wc_claims')
      .upsert(batch, { onConflict: 'tenant_id,claim_number', ignoreDuplicates: false });
    if (upErr) {
      console.error('  Upsert error on batch', i, '-', upErr.message);
      console.error('  Sample row:', JSON.stringify(batch[0], null, 2));
      throw upErr;
    }
    upserted += batch.length;
    process.stdout.write(`  Upserted ${upserted}/${rows.length}\r`);
  }
  console.log(`\n[seed-wc-claims] Done — ${upserted} claims upserted.`);

  // Quick summary
  const open = rows.filter(r => r.claim_status === 'Open').length;
  const closed = rows.filter(r => r.claim_status === 'Closed').length;
  const nr = rows.filter(r => r.claim_status === 'Non-Reportable').length;
  const totalIncurred = rows.reduce((s, r) => s + (r.total_incurred || 0), 0);
  console.log(`  Status: ${open} open | ${closed} closed | ${nr} non-reportable`);
  console.log(`  Total incurred: $${totalIncurred.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
}

main().catch(err => {
  console.error('[seed-wc-claims] FAILED:', err.message);
  process.exit(1);
});
