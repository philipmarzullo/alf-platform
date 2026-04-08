// ============================================================================
// seed-wc-claims-lifetime.mjs
// ----------------------------------------------------------------------------
// Seeds wc_claims_lifetime_summary for the A&A tenant from the historical
// dashboard report (AA_Claims Dashboard Report with Charts Since 2008.xlsx).
//
// That file is a pre-built executive summary, not a row-per-claim source —
// it has aggregate metrics, by-year time series, top-N frequency lists, and
// 15 historical high-cost claim records. We park all of it in a single JSONB
// row per tenant so the Safety dashboard's "Since 2008" panel can render the
// lifetime picture without us needing 354 historical claim rows we don't have.
//
// Idempotent. Re-run any time the dashboard report is refreshed.
//
// Run:
//   cd backend
//   node scripts/seed-wc-claims-lifetime.mjs
//
// Override the source file path:
//   LIFETIME_FILE=/path/to/file.xlsx node scripts/seed-wc-claims-lifetime.mjs
// ============================================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const AA_TENANT_ID = process.env.AA_TENANT_ID || '6acb59e5-05c9-4653-98ec-710906771dbb';
const HOME = process.env.HOME || '/Users/philip';

const FILE_PATH = process.env.LIFETIME_FILE
  || path.join(HOME, 'Desktop', 'AA_Claims Dashboard Report with Charts Since 2008.xlsx');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function readSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws?.['!ref']) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

// ----------------------------------------------------------------------------
// Parsers — one per sheet
// ----------------------------------------------------------------------------

/** Metrics sheet → { total_claims, total_incurred, average_claim_cost, highest_claim_cost } */
function parseMetrics(wb) {
  const rows = readSheet(wb, 'Metrics');
  const map = {};
  for (const r of rows) {
    const key = String(r['Metric'] || '').trim();
    if (key) map[key] = r['Value'];
  }
  return {
    total_claims: num(map['Total Claims']),
    total_incurred: num(map['Total Incurred Cost']),
    average_claim_cost: num(map['Average Claim Cost']),
    highest_claim_cost: num(map['Highest Claim Cost']),
  };
}

/** Claims by Year + Cost by Year → merged time series */
function parseTimeSeries(wb) {
  const claimsRows = readSheet(wb, 'Claims by Year');
  const costRows = readSheet(wb, 'Cost by Year');

  const byYear = new Map();
  for (const r of claimsRows) {
    const y = num(r['Year']);
    if (y == null) continue;
    byYear.set(y, { year: y, count: num(r['Claims']) || 0, incurred: 0 });
  }
  for (const r of costRows) {
    const y = num(r['Year']);
    if (y == null) continue;
    const existing = byYear.get(y) || { year: y, count: 0, incurred: 0 };
    existing.incurred = num(r['Total Incurred']) || 0;
    byYear.set(y, existing);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/** Top Sites → [{ job_name, count }] */
function parseTopSites(wb) {
  const rows = readSheet(wb, 'Top Sites');
  return rows
    .map(r => ({
      job_name: String(r['Job Name'] || '').trim(),
      count: num(r['Claims']) || 0,
    }))
    .filter(r => r.job_name);
}

/** Top Injury Types → [{ name, count }] */
function parseTopInjuryTypes(wb) {
  const rows = readSheet(wb, 'Top Injury Types');
  return rows
    .map(r => ({
      name: String(r['Nature of Injury Description'] || '').trim(),
      count: num(r['Claims']) || 0,
    }))
    .filter(r => r.name);
}

/** Top Cost Claims → [{ claim_number, claimant, job_name, injury, total_incurred }] */
function parseTopCostClaims(wb) {
  const rows = readSheet(wb, 'Top Cost Claims');
  return rows
    .map(r => ({
      claim_number: String(r['Claim Number'] || '').trim().toUpperCase().replace(/\s+/g, ''),
      claimant: String(r['Claimant Name'] || '').trim(),
      job_name: String(r['Job Name'] || '').trim(),
      injury: String(r['Nature of Injury Description'] || '').trim(),
      total_incurred: num(r['Total Incurred']) || 0,
    }))
    .filter(r => r.claim_number);
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  console.log('[seed-wc-claims-lifetime] Starting…');
  console.log('  Source file:', FILE_PATH);
  console.log('  Tenant:', AA_TENANT_ID);

  if (!fs.existsSync(FILE_PATH)) {
    throw new Error(`Source file not found: ${FILE_PATH}`);
  }

  const buf = fs.readFileSync(FILE_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });

  const metrics = parseMetrics(wb);
  const claimsByYear = parseTimeSeries(wb);
  const topSites = parseTopSites(wb);
  const topInjuryTypes = parseTopInjuryTypes(wb);
  const topCostClaims = parseTopCostClaims(wb);

  console.log('  Parsed:');
  console.log(`    metrics: total=${metrics.total_claims} incurred=$${(metrics.total_incurred || 0).toLocaleString()}`);
  console.log(`    claims_by_year: ${claimsByYear.length} years`);
  console.log(`    top_sites: ${topSites.length}`);
  console.log(`    top_injury_types: ${topInjuryTypes.length}`);
  console.log(`    top_cost_claims: ${topCostClaims.length}`);

  const years = claimsByYear.map(r => r.year).filter(y => Number.isFinite(y));
  const periodStart = years.length ? Math.min(...years) : null;
  const periodEnd = years.length ? Math.max(...years) : null;

  const row = {
    tenant_id: AA_TENANT_ID,
    as_of_date: new Date().toISOString().slice(0, 10),
    period_start_year: periodStart,
    period_end_year: periodEnd,
    total_claims: metrics.total_claims,
    total_incurred: metrics.total_incurred,
    average_claim_cost: metrics.average_claim_cost,
    highest_claim_cost: metrics.highest_claim_cost,
    claims_by_year: claimsByYear,
    top_sites: topSites,
    top_injury_types: topInjuryTypes,
    top_cost_claims: topCostClaims,
    source_file: path.basename(FILE_PATH),
    source: 'historical_dashboard',
  };

  const { error } = await supabase
    .from('wc_claims_lifetime_summary')
    .upsert(row, { onConflict: 'tenant_id', ignoreDuplicates: false });

  if (error) {
    console.error('  Upsert failed:', error.message);
    throw error;
  }

  console.log('[seed-wc-claims-lifetime] Done — lifetime summary upserted.');
}

main().catch(err => {
  console.error('[seed-wc-claims-lifetime] FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
