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

  // Query mode
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
    'Query Wavelytics WinTeam data warehouse views directly. Use this to answer questions about employees, jobs, timekeeping, labor budgets, GL entries, payroll, purchasing, and all other operational data. You can describe a view first to see its columns, then query it with filters.',
  input_schema: {
    type: 'object',
    properties: {
      view_name: {
        type: 'string',
        description:
          'Name of the Wavelytics view to query (e.g. DIM_EMPLOYEE, FACT_TIMEKEEPING, DIM_JOB). Use DESCRIBE first if unsure of available columns.',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Columns to SELECT. Omit to select all columns.',
      },
      filters: {
        type: 'object',
        description:
          'Filter conditions as key-value pairs. Values can be exact matches (string/number) or range objects like { "gte": "2024-01-01", "lte": "2024-12-31" }.',
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
    required: ['view_name'],
  },
};

export { SNOWFLAKE_QUERY_TOOL, executeSnowflakeQuery, buildSafeQuery, ALLOWED_VIEWS };
