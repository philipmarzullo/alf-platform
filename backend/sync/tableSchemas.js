/**
 * Registry of sf_* table schemas for the sync layer.
 * Defines columns, required fields, natural keys, FK references, and sync order.
 *
 * Natural keys: every fact table now uses source_uq (the Wavelytics *_UQ column)
 * as a stable unique identifier, enabling upsert-based incremental sync instead
 * of the old delete-and-insert path.
 *
 * Watermark: tables with a `watermarkColumn` support incremental sync via
 * SOURCE_RECORD_UPDATED_TIMESTAMP filtering.
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
    watermarkColumn: 'SOURCE_RECORD_UPDATED_TIMESTAMP',
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
    watermarkColumn: 'SOURCE_RECORD_UPDATED_TIMESTAMP',
  },

  sf_fact_labor_budget_actual: {
    syncOrder: 3,
    columns: ['source_uq', 'job_id', 'period_start', 'period_end', 'budget_hours', 'actual_hours', 'budget_dollars', 'actual_dollars', 'ot_hours', 'ot_dollars', 'source_updated_at'],
    required: ['source_uq', 'job_id', 'period_start', 'period_end'],
    naturalKey: ['tenant_id', 'source_uq'],
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
    },
    watermarkColumn: 'SOURCE_RECORD_UPDATED_TIMESTAMP',
  },

  sf_fact_job_daily: {
    syncOrder: 4,
    columns: ['source_uq', 'job_id', 'date_key', 'audits', 'corrective_actions', 'recordable_incidents', 'good_saves', 'near_misses', 'trir', 'headcount', 'source_updated_at'],
    required: ['source_uq', 'job_id', 'date_key'],
    naturalKey: ['tenant_id', 'source_uq'],
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
      date_key: { table: 'sf_dim_date', lookupColumn: 'date_key' },
    },
    watermarkColumn: 'SOURCE_RECORD_UPDATED_TIMESTAMP',
  },

  sf_fact_work_tickets: {
    syncOrder: 5,
    columns: ['source_uq', 'job_id', 'date_key', 'category', 'status', 'priority', 'assigned_to', 'completed_at', 'source_updated_at'],
    required: ['source_uq', 'job_id', 'date_key', 'category', 'status'],
    naturalKey: ['tenant_id', 'source_uq'],
    tenantScoped: true,
    fks: {
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
      date_key: { table: 'sf_dim_date', lookupColumn: 'date_key' },
    },
    // No SOURCE_RECORD_UPDATED_TIMESTAMP — uses date-range lookback instead
    watermarkColumn: null,
    lookbackDays: 90,
  },

  sf_fact_timekeeping: {
    syncOrder: 6,
    columns: ['source_uq', 'employee_id', 'job_id', 'date_key', 'clock_in', 'clock_out', 'regular_hours', 'ot_hours', 'dt_hours', 'punch_status', 'source_updated_at'],
    required: ['source_uq', 'employee_id', 'job_id', 'date_key'],
    naturalKey: ['tenant_id', 'source_uq'],
    tenantScoped: true,
    fks: {
      employee_id: { table: 'sf_dim_employee', lookupColumn: 'employee_number' },
      job_id: { table: 'sf_dim_job', lookupColumn: 'job_name' },
      date_key: { table: 'sf_dim_date', lookupColumn: 'date_key' },
    },
    watermarkColumn: 'SOURCE_RECORD_UPDATED_TIMESTAMP',
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
