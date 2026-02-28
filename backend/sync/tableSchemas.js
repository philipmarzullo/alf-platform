/**
 * Registry of sf_* table schemas for the sync layer.
 * Defines columns, required fields, natural keys, FK references, and sync order.
 * Sourced from migration 20260228000300_dashboards_sf_tables.sql.
 */

const TABLE_SCHEMAS = {
  sf_dim_date: {
    syncOrder: 0,
    columns: ['date_key', 'year', 'quarter', 'quarter_label', 'month', 'month_label', 'day_of_week', 'is_weekend'],
    required: ['date_key', 'year', 'quarter', 'quarter_label', 'month', 'month_label', 'day_of_week'],
    naturalKey: ['date_key'],
    tenantScoped: false,
    fks: {},
  },

  sf_dim_job: {
    syncOrder: 1,
    columns: ['job_name', 'location', 'supervisor', 'company', 'tier', 'sq_footage', 'is_active'],
    required: ['job_name', 'location'],
    naturalKey: ['tenant_id', 'job_name'],
    tenantScoped: true,
    fks: {},
  },

  sf_dim_employee: {
    syncOrder: 2,
    columns: ['employee_number', 'first_name', 'last_name', 'role', 'hire_date', 'job_id', 'hourly_rate'],
    required: ['employee_number', 'first_name', 'last_name', 'role'],
    naturalKey: ['tenant_id', 'employee_number'],
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
    },
  },

  sf_fact_labor_budget_actual: {
    syncOrder: 3,
    columns: ['job_id', 'period_start', 'period_end', 'budget_hours', 'actual_hours', 'budget_dollars', 'actual_dollars', 'ot_hours', 'ot_dollars'],
    required: ['job_id', 'period_start', 'period_end'],
    naturalKey: ['tenant_id', 'job_id', 'period_start', 'period_end'],
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
    },
  },

  sf_fact_job_daily: {
    syncOrder: 4,
    columns: ['job_id', 'date_key', 'audits', 'corrective_actions', 'recordable_incidents', 'good_saves', 'near_misses', 'trir', 'headcount'],
    required: ['job_id', 'date_key'],
    naturalKey: ['tenant_id', 'job_id', 'date_key'],
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
      date_key: { table: 'sf_dim_date', lookupColumn: 'date_key' },
    },
  },

  sf_fact_work_tickets: {
    syncOrder: 5,
    columns: ['job_id', 'date_key', 'category', 'status', 'priority', 'assigned_to', 'completed_at'],
    required: ['job_id', 'date_key', 'category', 'status'],
    naturalKey: null,  // no clean natural key — uses delete+insert
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
      date_key: { table: 'sf_dim_date', lookupColumn: 'date_key' },
    },
  },

  sf_fact_timekeeping: {
    syncOrder: 6,
    columns: ['employee_id', 'job_id', 'date_key', 'clock_in', 'clock_out', 'regular_hours', 'ot_hours', 'dt_hours', 'punch_status'],
    required: ['employee_id', 'job_id', 'date_key'],
    naturalKey: null,  // no clean natural key — uses delete+insert
    tenantScoped: true,
    fks: {
      employee_id: { table: 'sf_dim_employee', lookupColumn: 'employee_number' },
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
      date_key: { table: 'sf_dim_date', lookupColumn: 'date_key' },
    },
  },
};

/**
 * Returns table names sorted by sync order (dims first, then facts).
 */
export function getSyncOrder() {
  return Object.entries(TABLE_SCHEMAS)
    .sort(([, a], [, b]) => a.syncOrder - b.syncOrder)
    .map(([name]) => name);
}

/**
 * Get schema for a single table. Throws if unknown.
 */
export function getTableSchema(tableName) {
  const schema = TABLE_SCHEMAS[tableName];
  if (!schema) throw new Error(`Unknown sync table: ${tableName}`);
  return schema;
}

/**
 * List all valid target table names.
 */
export function getTableNames() {
  return Object.keys(TABLE_SCHEMAS);
}

export default TABLE_SCHEMAS;
