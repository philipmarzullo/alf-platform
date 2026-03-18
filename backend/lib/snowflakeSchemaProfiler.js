/**
 * Snowflake Schema Profiler — introspects Snowflake views and generates
 * a compact schema reference with actual categorical values.
 *
 * Output is cached in tenant_schema_profiles and injected into the analytics
 * agent's system prompt so it can write precise queries immediately.
 */

import SnowflakeConnector from '../sync/connectors/SnowflakeConnector.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';
import { ALLOWED_VIEWS } from './snowflakeQueryTool.js';

// ── Connector cache (same pattern as snowflakeDashboards.js) ──
const connectors = new Map();

async function getConnector(supabase, tenantId) {
  if (connectors.has(tenantId)) return connectors.get(tenantId);

  const { data: sc } = await supabase
    .from('sync_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('connector_type', 'snowflake')
    .single();

  if (!sc?.config) throw new Error('Snowflake not configured for this tenant');

  const credJson = await getPlatformApiKey(supabase, 'snowflake');
  if (!credJson) throw new Error('Snowflake platform credentials missing');
  const credentials = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;

  const connector = new SnowflakeConnector(tenantId, sc.config, credentials);
  await connector.connect();
  connectors.set(tenantId, { connector, config: sc.config });
  return { connector, config: sc.config };
}

// ── Which views to profile DISTINCT values for ──
// DIM tables + key FACT tables that have useful categorical columns
const PROFILE_DISTINCT_VIEWS = new Set([
  // All DIM tables
  ...[...ALLOWED_VIEWS].filter(v => v.startsWith('DIM_')),
  // Key fact tables with categorical columns the agent needs
  'FACT_CHECKPOINT', 'FACT_CHECKPOINT_LINEITEM',
  'FACT_WORK_SCHEDULE_TICKET', 'FACT_TIMEKEEPING',
  'FACT_EMPLOYEE_WORKFORCE_DAILY',
]);

// Column suffixes worth profiling for distinct values
const PROFILE_SUFFIXES = [
  '_LABEL', '_NAME', '_DESCRIPTION', '_TYPE', '_CODE', '_STATUS',
  '_FLAG', '_CATEGORY', '_CLASS', '_GROUP',
];

// Columns to SKIP profiling (too many values, PII, or IDs)
const SKIP_PROFILE_PATTERNS = [
  'EMPLOYEE_FIRST_NAME', 'EMPLOYEE_LAST_NAME', 'EMPLOYEE_NUMBER',
  'ADDRESS', 'EMAIL', 'PHONE', 'SSN', 'NOTES', 'COMMENT', 'DETAIL_TEXT',
  '_KEY', '_ID', '_TIMESTAMP', '_DATE',
];

// Columns to EXCLUDE entirely from the profile output (noise/metadata)
function shouldExcludeColumn(colName) {
  if (/CUSTOM_FIELD\d/.test(colName)) return true;
  if (colName.endsWith('_JSON')) return true;
  if (colName === 'TENANT_ID' || colName === 'TENANT_KEY') return true;
  if (colName.startsWith('SOURCE_RECORD_')) return true;
  if (colName.startsWith('WAREHOUSE_RECORD_')) return true;
  if (colName === 'DATA_AS_OF_TIMESTAMP') return true;
  if (colName === 'IS_DEFAULT_SEED_FLAG') return true;
  if (colName.endsWith('_UQ')) return true;
  // Skip internal surrogate keys (keep only main FK keys)
  const KEEP_KEYS = new Set(['JOB_KEY', 'PRIMARY_JOB_KEY', 'EMPLOYEE_KEY', 'DATE_KEY', 'CHECKPOINT_ID']);
  if (colName.endsWith('_KEY') && !KEEP_KEYS.has(colName) && !colName.endsWith('_DATE_KEY')) return true;
  return false;
}

// Reference views — no company filter needed
const REFERENCE_VIEWS = new Set([
  'DIM_DATE', 'DIM_TIME', 'DIM_HOURS_TYPE', 'DIM_LOOKUP',
  'DIM_WORK_SCHEDULE_TYPE', 'DIM_WORK_TICKET_STATUS',
  'DIM_PAY_CODE', 'DIM_GL_ACCOUNT', 'DIM_GL_ACCOUNT_SEGMENT',
  'DIM_BENEFIT_PLAN', 'DIM_DEDUCTION', 'DIM_TAX', 'DIM_ACCRUAL',
  'DIM_DEPARTMENT', 'DIM_DIVISION', 'DIM_BRANCH', 'DIM_COMPANY',
  'DIM_EMPLOYEE_CERTIFICATION', 'DIM_EMPLOYEE_REVIEW',
  'DIM_DIRECT_DEPOSIT', 'DIM_WORK_SCHEDULE_TASK',
]);

// Views with PRIMARY_JOB_KEY instead of JOB_KEY
const PRIMARY_JOB_KEY_VIEWS = new Set([
  'FACT_EMPLOYEE_WORKFORCE_DAILY', 'FACT_EMPLOYEE_STATUS_HISTORY',
]);

function shouldProfileColumn(colName) {
  // Skip if matches skip patterns
  if (SKIP_PROFILE_PATTERNS.some(pat => colName.includes(pat))) return false;
  // Profile if matches suffix patterns
  if (PROFILE_SUFFIXES.some(suf => colName.endsWith(suf))) return true;
  // Profile FLAG columns
  if (colName.endsWith('_FLAG')) return true;
  return false;
}

function formatType(dataType) {
  const t = (dataType || '').toUpperCase();
  if (t.includes('NUMBER') || t.includes('FLOAT') || t.includes('DECIMAL') || t.includes('INT')) return 'num';
  if (t === 'DATE') return 'date';
  if (t.includes('TIMESTAMP')) return 'ts';
  if (t.includes('BOOLEAN')) return '0/1';
  return null; // varchar/text — no annotation unless profiled
}

/**
 * Run the full schema profile for a tenant.
 * Returns the profile text string.
 */
export async function runSchemaProfile(supabase, tenantId) {
  const { connector, config } = await getConnector(supabase, tenantId);
  const fq = `${config.tenant_database}.${config.schema || 'PUBLIC'}`;
  const companyFilter = config.company_filter;

  console.log(`[schema-profiler] Starting profile for tenant ${tenantId} (${fq})`);

  // Step 1: Query INFORMATION_SCHEMA for all views and columns
  const infoSql = `
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION
    FROM ${config.tenant_database}.INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${config.schema || 'PUBLIC'}'
      AND TABLE_NAME IN (${[...ALLOWED_VIEWS].map(v => `'${v}'`).join(',')})
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `;

  const columns = await connector.queryView(infoSql, []);
  console.log(`[schema-profiler] Found ${columns.length} columns across views`);

  // Group columns by view
  const viewColumns = new Map();
  for (const col of columns) {
    const view = col.table_name;
    if (!viewColumns.has(view)) viewColumns.set(view, []);
    viewColumns.get(view).push({
      name: col.column_name,
      type: col.data_type,
    });
  }

  // Step 2: Profile categorical columns with DISTINCT queries
  // Build list of (view, column) pairs to profile
  const profilingTasks = [];
  for (const [view, cols] of viewColumns) {
    if (!PROFILE_DISTINCT_VIEWS.has(view)) continue;
    for (const col of cols) {
      if (shouldProfileColumn(col.name)) {
        profilingTasks.push({ view, column: col.name });
      }
    }
  }

  console.log(`[schema-profiler] Profiling ${profilingTasks.length} categorical columns`);

  // Run DISTINCT queries in parallel batches of 5
  const distinctValues = new Map(); // "VIEW.COLUMN" → string[]
  const BATCH_SIZE = 5;

  for (let i = 0; i < profilingTasks.length; i += BATCH_SIZE) {
    const batch = profilingTasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ view, column }) => {
        const isReference = REFERENCE_VIEWS.has(view);
        let sql;
        const binds = [];

        if (isReference) {
          sql = `SELECT DISTINCT "${column}" AS val FROM ${fq}.${view} WHERE "${column}" IS NOT NULL LIMIT 50`;
        } else {
          // Company-filtered
          binds.push(companyFilter);
          let filterClause;
          if (view === 'DIM_JOB') {
            filterClause = `JOB_COMPANY_NAME = :1`;
          } else if (view === 'DIM_EMPLOYEE') {
            filterClause = `EMPLOYEE_PRIMARY_JOB_NUMBER IN (SELECT JOB_NUMBER FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`;
          } else if (PRIMARY_JOB_KEY_VIEWS.has(view)) {
            filterClause = `PRIMARY_JOB_KEY IN (SELECT JOB_KEY FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`;
          } else {
            filterClause = `JOB_KEY IN (SELECT JOB_KEY FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`;
          }
          sql = `SELECT DISTINCT "${column}" AS val FROM ${fq}.${view} WHERE ${filterClause} AND "${column}" IS NOT NULL LIMIT 50`;
        }

        const rows = await connector.queryView(sql, binds);
        return { key: `${view}.${column}`, values: rows.map(r => String(r.val)) };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        distinctValues.set(result.value.key, result.value.values);
      }
      // Silently skip failures — column may not exist in this tenant's data
    }
  }

  console.log(`[schema-profiler] Profiled ${distinctValues.size} columns with values`);

  // Step 3: Format compact profile
  const lines = [];
  lines.push('=== SNOWFLAKE SCHEMA PROFILE ===');
  lines.push(`Database: ${fq} | Profiled: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Key Relationships');
  lines.push('- *_DATE_KEY → DIM_DATE (MD5 hashes, JOIN DIM_DATE and use d.CALENDAR_DATE for dates)');
  lines.push('- JOB_KEY → DIM_JOB | PRIMARY_JOB_KEY → DIM_JOB');
  lines.push('- EMPLOYEE_KEY → DIM_EMPLOYEE');
  lines.push('- Company filter is automatic — never add your own');
  lines.push('');
  lines.push('## Views');

  // Sort views: DIM first, then FACT
  const sortedViews = [...viewColumns.keys()].sort((a, b) => {
    const aIsDim = a.startsWith('DIM_');
    const bIsDim = b.startsWith('DIM_');
    if (aIsDim && !bIsDim) return -1;
    if (!aIsDim && bIsDim) return 1;
    return a.localeCompare(b);
  });

  for (const view of sortedViews) {
    const cols = viewColumns.get(view);
    const colParts = [];

    for (const col of cols) {
      // Skip noise/metadata columns
      if (shouldExcludeColumn(col.name)) continue;

      const key = `${view}.${col.name}`;
      const vals = distinctValues.get(key);
      let annotation = '';

      if (vals) {
        if (col.name.endsWith('_FLAG')) {
          annotation = '(0/1)';
        } else if (vals.length > 49) {
          annotation = `[*${vals.length}+ values]`;
        } else if (vals.length > 10) {
          const shown = vals.slice(0, 10).join('|');
          annotation = `[${shown}|...+${vals.length - 10}]`;
        } else if (vals.length > 0) {
          annotation = `[${vals.join('|')}]`;
        }
      } else {
        const typeAnn = formatType(col.type);
        if (typeAnn) annotation = `(${typeAnn})`;

        if (col.name.endsWith('_DATE_KEY')) {
          annotation = '(→DIM_DATE)';
        } else if (col.name === 'JOB_KEY' || col.name === 'PRIMARY_JOB_KEY') {
          annotation = '(→DIM_JOB)';
        } else if (col.name === 'EMPLOYEE_KEY') {
          annotation = '(→DIM_EMPLOYEE)';
        }
      }

      colParts.push(annotation ? `${col.name}${annotation}` : col.name);
    }

    lines.push('');
    lines.push(`${view}: ${colParts.join(', ')}`);
  }

  const profileText = lines.join('\n');

  // Step 4: Upsert into tenant_schema_profiles
  const { error } = await supabase
    .from('tenant_schema_profiles')
    .upsert({
      tenant_id: tenantId,
      profile_text: profileText,
      profile_meta: {
        view_count: viewColumns.size,
        column_count: columns.length,
        profiled_columns: distinctValues.size,
      },
      char_count: profileText.length,
    }, { onConflict: 'tenant_id' });

  if (error) {
    console.error(`[schema-profiler] Upsert failed:`, error.message);
    throw error;
  }

  console.log(`[schema-profiler] Profile saved — ${profileText.length} chars, ${viewColumns.size} views, ${columns.length} columns`);

  return {
    char_count: profileText.length,
    view_count: viewColumns.size,
    column_count: columns.length,
    profiled_columns: distinctValues.size,
  };
}
