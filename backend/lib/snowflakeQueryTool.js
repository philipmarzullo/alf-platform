/**
 * Snowflake Direct Query Tool — injected into Claude tool_use for snowflake_direct tenants.
 *
 * Gives agents full-column access to all 70 Wavelytics views with mandatory tenant isolation.
 * Non-Snowflake tenants never see this tool — routing is controlled by alf_tenants.snowflake_direct.
 */

// ── All 70 Wavelytics views ──
const ALLOWED_VIEWS = new Set([
  // Dimensions
  'DIM_EMPLOYEE', 'DIM_JOB', 'DIM_CUSTOMER', 'DIM_DATE', 'DIM_TIME',
  'DIM_HOURS_TYPE', 'DIM_LOOKUP', 'DIM_WORK_SCHEDULE_TYPE',
  'DIM_WORK_TICKET_STATUS', 'DIM_PAY_CODE', 'DIM_GL_ACCOUNT',
  'DIM_GL_ACCOUNT_SEGMENT', 'DIM_VENDOR', 'DIM_PURCHASE_ORDER',
  'DIM_INVOICE', 'DIM_INVENTORY_ITEM', 'DIM_EQUIPMENT',
  'DIM_INSURANCE_CLAIM', 'DIM_BENEFIT_PLAN', 'DIM_DEDUCTION',
  'DIM_TAX', 'DIM_DIRECT_DEPOSIT', 'DIM_ACCRUAL',
  'DIM_EMPLOYEE_CERTIFICATION', 'DIM_EMPLOYEE_REVIEW',
  'DIM_APPLICANT', 'DIM_POSITION', 'DIM_DEPARTMENT',
  'DIM_DIVISION', 'DIM_BRANCH', 'DIM_COMPANY',
  // Facts
  'FACT_TIMEKEEPING', 'FACT_GL_ENTRY', 'FACT_GL_BUDGET',
  'FACT_LABOR_BUDGET_TO_ACTUAL', 'FACT_JOB_DAILY',
  'FACT_WORK_SCHEDULE_TICKET', 'FACT_PAYROLL',
  'FACT_PAYROLL_DETAIL', 'FACT_PAYROLL_TAX',
  'FACT_PAYROLL_DEDUCTION', 'FACT_PAYROLL_ACCRUAL',
  'FACT_ACCOUNTS_PAYABLE', 'FACT_ACCOUNTS_RECEIVABLE',
  'FACT_PURCHASE_ORDER', 'FACT_PURCHASE_ORDER_DETAIL',
  'FACT_INVOICE', 'FACT_INVOICE_DETAIL',
  'FACT_INVENTORY_TRANSACTION', 'FACT_EQUIPMENT_COST',
  'FACT_INSURANCE_CLAIM', 'FACT_EMPLOYEE_BENEFIT',
  'FACT_EMPLOYEE_CERTIFICATION', 'FACT_EMPLOYEE_REVIEW',
  'FACT_APPLICANT', 'FACT_POSITION_BUDGET',
  'FACT_DIRECT_DEPOSIT', 'FACT_EMPLOYEE_ACCRUAL',
  'FACT_JOB_REVENUE', 'FACT_JOB_COST',
  'FACT_WORK_ORDER', 'FACT_WORK_ORDER_DETAIL',
  'FACT_INSPECTION', 'FACT_INSPECTION_DETAIL',
  'FACT_SUPPLY_REQUEST', 'FACT_SUPPLY_REQUEST_DETAIL',
  'FACT_EMPLOYEE_HISTORY', 'FACT_JOB_HISTORY',
  'FACT_CUSTOMER_HISTORY', 'FACT_BUDGET_DETAIL',
  // QBU dashboards
  'FACT_CHECKPOINT', 'FACT_CHECKPOINT_LINEITEM',
  'FACT_EMPLOYEE_WORKFORCE_DAILY', 'FACT_EMPLOYEE_STATUS_HISTORY',
  'DIM_WORK_SCHEDULE_TASK',
]);

// ── Tenant isolation categories ──
// Views that have JOB_COMPANY_NAME directly
const JOB_COMPANY_VIEWS = new Set(['DIM_JOB']);

// Views joined to DIM_JOB via JOB_KEY
const JOB_KEY_VIEWS = new Set([
  'FACT_TIMEKEEPING', 'FACT_GL_ENTRY', 'FACT_GL_BUDGET',
  'FACT_LABOR_BUDGET_TO_ACTUAL', 'FACT_JOB_DAILY',
  'FACT_WORK_SCHEDULE_TICKET', 'FACT_PAYROLL', 'FACT_PAYROLL_DETAIL',
  'FACT_PAYROLL_TAX', 'FACT_PAYROLL_DEDUCTION', 'FACT_PAYROLL_ACCRUAL',
  'FACT_ACCOUNTS_PAYABLE', 'FACT_ACCOUNTS_RECEIVABLE',
  'FACT_PURCHASE_ORDER', 'FACT_PURCHASE_ORDER_DETAIL',
  'FACT_INVOICE', 'FACT_INVOICE_DETAIL',
  'FACT_INVENTORY_TRANSACTION', 'FACT_EQUIPMENT_COST',
  'FACT_INSURANCE_CLAIM', 'FACT_EMPLOYEE_BENEFIT',
  'FACT_EMPLOYEE_CERTIFICATION', 'FACT_EMPLOYEE_REVIEW',
  'FACT_POSITION_BUDGET', 'FACT_DIRECT_DEPOSIT', 'FACT_EMPLOYEE_ACCRUAL',
  'FACT_JOB_REVENUE', 'FACT_JOB_COST',
  'FACT_WORK_ORDER', 'FACT_WORK_ORDER_DETAIL',
  'FACT_INSPECTION', 'FACT_INSPECTION_DETAIL',
  'FACT_SUPPLY_REQUEST', 'FACT_SUPPLY_REQUEST_DETAIL',
  'FACT_EMPLOYEE_HISTORY', 'FACT_JOB_HISTORY',
  'FACT_CUSTOMER_HISTORY', 'FACT_BUDGET_DETAIL',
  'FACT_APPLICANT',
  'FACT_CHECKPOINT', 'FACT_CHECKPOINT_LINEITEM',
  'DIM_CUSTOMER', 'DIM_VENDOR', 'DIM_PURCHASE_ORDER',
  'DIM_INVOICE', 'DIM_INVENTORY_ITEM', 'DIM_EQUIPMENT',
  'DIM_INSURANCE_CLAIM', 'DIM_POSITION',
]);

// Views joined to DIM_JOB via PRIMARY_JOB_KEY
const PRIMARY_JOB_KEY_VIEWS = new Set([
  'FACT_EMPLOYEE_WORKFORCE_DAILY', 'FACT_EMPLOYEE_STATUS_HISTORY',
]);

// Views joined via employee primary job number
const EMPLOYEE_JOB_VIEWS = new Set(['DIM_EMPLOYEE']);

// Reference dims — shared data, no company filter needed
const REFERENCE_VIEWS = new Set([
  'DIM_DATE', 'DIM_TIME', 'DIM_HOURS_TYPE', 'DIM_LOOKUP',
  'DIM_WORK_SCHEDULE_TYPE', 'DIM_WORK_TICKET_STATUS',
  'DIM_PAY_CODE', 'DIM_GL_ACCOUNT', 'DIM_GL_ACCOUNT_SEGMENT',
  'DIM_BENEFIT_PLAN', 'DIM_DEDUCTION', 'DIM_TAX', 'DIM_ACCRUAL',
  'DIM_DEPARTMENT', 'DIM_DIVISION', 'DIM_BRANCH', 'DIM_COMPANY',
  'DIM_EMPLOYEE_CERTIFICATION', 'DIM_EMPLOYEE_REVIEW',
  'DIM_DIRECT_DEPOSIT', 'DIM_WORK_SCHEDULE_TASK',
]);

// Column name validation — alphanumeric + underscore only
const SAFE_COL = /^[A-Z_][A-Z0-9_]*$/i;

/**
 * Build a tenant-isolated SQL query for a Wavelytics view.
 * All user values go into the binds array — zero string interpolation.
 */
function buildSafeQuery(input, config) {
  const viewName = (input.view_name || '').toUpperCase();
  if (!ALLOWED_VIEWS.has(viewName)) {
    throw new Error(`View "${input.view_name}" is not in the allowed view list`);
  }

  const db = config.tenant_database;
  const schema = config.schema || 'PUBLIC';
  const fq = `${db}.${schema}`;
  const fqView = `${fq}.${viewName}`;
  const companyFilter = config.company_filter;

  // Validate columns
  const columns = input.columns?.length
    ? input.columns.map(c => {
        const col = c.toUpperCase();
        if (!SAFE_COL.test(col)) throw new Error(`Invalid column name: ${c}`);
        return col;
      })
    : ['*'];

  const selectClause = columns.join(', ');
  const binds = [];
  const conditions = [];

  // ── Mandatory company filter ──
  if (JOB_COMPANY_VIEWS.has(viewName)) {
    binds.push(companyFilter);
    conditions.push(`JOB_COMPANY_NAME = :${binds.length}`);
  } else if (JOB_KEY_VIEWS.has(viewName)) {
    binds.push(companyFilter);
    conditions.push(`JOB_KEY IN (SELECT JOB_KEY FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :${binds.length})`);
  } else if (PRIMARY_JOB_KEY_VIEWS.has(viewName)) {
    binds.push(companyFilter);
    conditions.push(`PRIMARY_JOB_KEY IN (SELECT JOB_KEY FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :${binds.length})`);
  } else if (EMPLOYEE_JOB_VIEWS.has(viewName)) {
    binds.push(companyFilter);
    conditions.push(`EMPLOYEE_PRIMARY_JOB_NUMBER IN (SELECT JOB_NUMBER FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :${binds.length})`);
  }
  // Reference views: no company filter

  // ── User filters ──
  if (input.filters && typeof input.filters === 'object') {
    for (const [key, value] of Object.entries(input.filters)) {
      const col = key.toUpperCase();
      if (!SAFE_COL.test(col)) throw new Error(`Invalid filter column: ${key}`);

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // LIKE filter: { like: "%pattern%" }
        if (value.like !== undefined) {
          binds.push(value.like);
          conditions.push(`${col} ILIKE :${binds.length}`);
        }
        // Range filter: { gte, lte }
        if (value.gte !== undefined) {
          binds.push(value.gte);
          conditions.push(`${col} >= :${binds.length}`);
        }
        if (value.lte !== undefined) {
          binds.push(value.lte);
          conditions.push(`${col} <= :${binds.length}`);
        }
      } else {
        // Exact match
        binds.push(value);
        conditions.push(`${col} = :${binds.length}`);
      }
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(input.row_limit || 200, 1), 2000);

  const sqlText = `SELECT ${selectClause} FROM ${fqView} ${whereClause} LIMIT ${limit}`;
  return { sqlText, binds, limit };
}

// ── Table reference regex — extracts table names from SQL ──
const TABLE_REF_RE = /\b(?:FROM|JOIN)\s+(?:[A-Z0-9_]+\.[A-Z0-9_]+\.)?([A-Z_][A-Z0-9_]*)\b/gi;

/**
 * Execute a raw SQL SELECT query with tenant isolation.
 * Validates all table references against ALLOWED_VIEWS, injects company filter
 * via a CTE wrapping DIM_JOB, and enforces a LIMIT.
 */
function buildRawSqlQuery(sql, config) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');

  // Block non-SELECT statements
  if (!/^\s*SELECT\b/i.test(trimmed) && !/^\s*WITH\b/i.test(trimmed)) {
    throw new Error('Only SELECT statements are allowed');
  }

  // Block dangerous keywords
  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|GRANT|REVOKE|EXEC|EXECUTE|CALL)\b/i;
  if (blocked.test(trimmed)) {
    throw new Error('Only SELECT statements are allowed');
  }

  // Extract and validate table references
  const tables = new Set();
  let match;
  const re = new RegExp(TABLE_REF_RE.source, 'gi');
  while ((match = re.exec(trimmed)) !== null) {
    tables.add(match[1].toUpperCase());
  }

  // Remove common false positives (CTE names, aliases)
  // We only block if a real table name doesn't match ALLOWED_VIEWS
  const invalidTables = [...tables].filter(t => !ALLOWED_VIEWS.has(t));
  if (invalidTables.length > 0) {
    throw new Error(`Tables not in allowed list: ${invalidTables.join(', ')}`);
  }

  if (tables.size === 0) {
    throw new Error('No valid table references found in SQL');
  }

  const db = config.tenant_database;
  const schema = config.schema || 'PUBLIC';
  const fq = `${db}.${schema}`;
  const companyFilter = config.company_filter;

  // Fully qualify bare table names
  let qualifiedSql = trimmed;
  for (const table of tables) {
    // Replace bare table name with fully qualified, but not if already qualified
    const bareRe = new RegExp(`(?<!\\.)\\b(${table})\\b(?!\\s*\\.)`, 'gi');
    qualifiedSql = qualifiedSql.replace(bareRe, `${fq}.${table}`);
  }

  // Inject company filter as CTE wrapping DIM_JOB
  const binds = [companyFilter];
  const cte = `WITH _tenant_jobs AS (SELECT * FROM ${fq}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`;

  // Replace DIM_JOB references with _tenant_jobs CTE
  qualifiedSql = qualifiedSql.replace(
    new RegExp(`${db}\\.${schema}\\.DIM_JOB\\b`, 'gi'),
    '_tenant_jobs'
  );

  // If user already has WITH clause, merge CTEs
  if (/^\s*WITH\b/i.test(qualifiedSql)) {
    qualifiedSql = qualifiedSql.replace(/^\s*WITH\b/i, `${cte},\n`);
  } else {
    qualifiedSql = `${cte}\n${qualifiedSql}`;
  }

  // Inject LIMIT if not present
  if (!/\bLIMIT\s+\d+/i.test(qualifiedSql)) {
    qualifiedSql += ' LIMIT 2000';
  }

  return { sqlText: qualifiedSql, binds };
}

/**
 * Execute a Snowflake query tool call from Claude.
 */
async function executeSnowflakeQuery(input, connector, config) {
  const db = config.tenant_database;
  const schema = config.schema || 'PUBLIC';

  // DESCRIBE mode — return column metadata
  if (input.describe) {
    const viewName = (input.view_name || '').toUpperCase();
    if (!ALLOWED_VIEWS.has(viewName)) {
      throw new Error(`View "${input.view_name}" is not in the allowed view list`);
    }
    const fqView = `${db}.${schema}.${viewName}`;
    const rows = await connector.queryView(`DESCRIBE VIEW ${fqView}`);
    return {
      view: viewName,
      columns: rows.map(r => ({ name: r.name, type: r.type })),
    };
  }

  // Raw SQL mode
  if (input.sql) {
    const { sqlText, binds } = buildRawSqlQuery(input.sql, config);
    const rows = await connector.queryView(sqlText, binds);
    return {
      rows,
      row_count: rows.length,
      truncated: rows.length >= 2000,
    };
  }

  // Structured query mode
  const { sqlText, binds, limit } = buildSafeQuery(input, config);
  const rows = await connector.queryView(sqlText, binds);

  return {
    rows,
    row_count: rows.length,
    truncated: rows.length >= limit,
  };
}

// ── Claude tool schema ──
const SNOWFLAKE_QUERY_TOOL = {
  name: 'querySnowflake',
  description:
    'Query Wavelytics data warehouse. Two modes:\n\n' +
    '1. **Raw SQL** (preferred for JOINs, GROUP BY, subqueries): Pass a `sql` parameter with a SELECT statement. ' +
    'All tables must be from the allowed view list. DIM_JOB is automatically filtered to the tenant\'s company. ' +
    'Reference DIM_JOB in JOINs for tenant isolation on fact tables (via JOB_KEY). LIMIT 2000 auto-applied.\n\n' +
    '2. **Structured query**: Pass `view_name` + `filters` for simple single-table lookups.\n\n' +
    'Your system prompt includes a SCHEMA PROFILE with all view columns, data types, sample values, and Key Lookups (job names, VP codes). Use it to write precise queries.',
  input_schema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description:
          'Raw SQL SELECT statement. Supports JOINs, GROUP BY, subqueries, CASE, window functions. ' +
          'Use bare table names (e.g. DIM_JOB, FACT_TIMEKEEPING) — they are auto-qualified. ' +
          'DIM_JOB is auto-filtered to the tenant\'s company. ' +
          'Use ILIKE for partial string matching. Do NOT add company filters yourself.',
      },
      view_name: {
        type: 'string',
        description:
          'Name of the view to query (structured mode). Use `sql` instead for JOINs or GROUP BY.',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Columns to SELECT (structured mode only).',
      },
      filters: {
        type: 'object',
        description:
          'Filter conditions (structured mode). Values: exact match (string/number), range { "gte": ..., "lte": ... }, or pattern { "like": "%text%" } for ILIKE matching.',
        additionalProperties: true,
      },
      row_limit: {
        type: 'integer',
        description: 'Max rows to return. Default 200, max 2000.',
      },
      describe: {
        type: 'boolean',
        description: 'Set to true to return column names and types instead of data.',
      },
    },
  },
};

export { SNOWFLAKE_QUERY_TOOL, executeSnowflakeQuery, buildSafeQuery, ALLOWED_VIEWS };
