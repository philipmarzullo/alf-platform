import snowflake from 'snowflake-sdk';
import BaseConnector from './BaseConnector.js';

/**
 * Snowflake connector — platform-owned, per-tenant database.
 *
 * Platform credentials (from alf_platform_credentials, service_type='snowflake'):
 * { account, username, password, warehouse, role }
 *
 * Config (from sync_configs.config):
 * {
 *   company_filter: string,        // REQUIRED — filters dim_job.company
 *   tenant_database: string,       // OPTIONAL — auto-derived from tenant slug if omitted
 *   schema: string                 // OPTIONAL — defaults to PUBLIC
 * }
 */

// Disable ocsp checks to avoid network issues in non-browser environments
snowflake.configure({ ocspFailOpen: true });

/**
 * View name mapping: sf_* target table → Snowflake view name.
 * Queries use fully qualified names built at runtime from config:
 *   {tenant_database}.{schema}.{view_name}
 */
const VIEW_MAP = {
  sf_dim_job:                  'DIM_JOB',
  sf_dim_employee:             'DIM_EMPLOYEE',
  sf_fact_labor_budget_actual: 'FACT_LABOR_BUDGET_TO_ACTUAL',
  sf_fact_job_daily:           'FACT_JOB_DAILY',
  sf_fact_work_tickets:        'FACT_WORK_SCHEDULE_TICKET',
  sf_fact_timekeeping:         'FACT_TIMEKEEPING',
};

/**
 * Build query templates with fully qualified view names.
 * :db is replaced with {database}.{schema} prefix at execution time.
 * :1 is the company_filter bind variable for tenant isolation.
 */
function buildQueryMap(fqPrefix) {
  return {
    sf_dim_job: `
      SELECT
        job_name,
        location,
        supervisor,
        company,
        tier,
        sq_footage,
        is_active
      FROM ${fqPrefix}.DIM_JOB
      WHERE is_active = TRUE
        AND company = :1
    `,

    sf_dim_employee: `
      SELECT
        e.employee_number,
        e.first_name,
        e.last_name,
        e.role,
        e.hire_date,
        j.job_name,
        e.hourly_rate
      FROM ${fqPrefix}.DIM_EMPLOYEE e
      LEFT JOIN ${fqPrefix}.DIM_JOB j ON e.job_id = j.job_id
      WHERE j.company = :1
    `,

    sf_fact_labor_budget_actual: `
      SELECT
        j.job_name,
        f.period_start,
        f.period_end,
        f.budget_hours,
        f.actual_hours,
        f.budget_dollars,
        f.actual_dollars,
        f.ot_hours,
        f.ot_dollars
      FROM ${fqPrefix}.FACT_LABOR_BUDGET_TO_ACTUAL f
      JOIN ${fqPrefix}.DIM_JOB j ON f.job_id = j.job_id
      WHERE j.company = :1
    `,

    sf_fact_job_daily: `
      SELECT
        j.job_name,
        f.date_key,
        f.audits,
        f.corrective_actions,
        f.recordable_incidents,
        f.good_saves,
        f.near_misses,
        f.trir,
        f.headcount
      FROM ${fqPrefix}.FACT_JOB_DAILY f
      JOIN ${fqPrefix}.DIM_JOB j ON f.job_id = j.job_id
      WHERE j.company = :1
    `,

    sf_fact_work_tickets: `
      SELECT
        j.job_name,
        f.date_key,
        f.category,
        f.status,
        f.priority,
        f.assigned_to,
        f.completed_at
      FROM ${fqPrefix}.FACT_WORK_SCHEDULE_TICKET f
      JOIN ${fqPrefix}.DIM_JOB j ON f.job_id = j.job_id
      WHERE j.company = :1
    `,

    sf_fact_timekeeping: `
      SELECT
        e.employee_number,
        j.job_name,
        f.date_key,
        f.clock_in,
        f.clock_out,
        f.regular_hours,
        f.ot_hours,
        f.dt_hours,
        f.punch_status
      FROM ${fqPrefix}.FACT_TIMEKEEPING f
      JOIN ${fqPrefix}.DIM_EMPLOYEE e ON f.employee_id = e.employee_id
      JOIN ${fqPrefix}.DIM_JOB j ON f.job_id = j.job_id
      WHERE j.company = :1
    `,
  };
}

export default class SnowflakeConnector extends BaseConnector {
  /** Runner checks this to resolve platform creds instead of tenant creds */
  static usesPlatformCredentials = true;

  constructor(tenantId, config, credentials) {
    super(tenantId, config, credentials);
    this.connection = null;
    this.queryMap = null;
  }

  async connect() {
    if (!this.credentials) {
      throw new Error('Snowflake platform credentials not configured');
    }

    // company_filter is required — prevents pulling data for other tenants
    if (!this.config.company_filter) {
      throw new Error(
        'Snowflake sync requires company_filter in config. ' +
        'Set this to the company name in dim_job that identifies this tenant\'s data.'
      );
    }

    if (!this.config.tenant_database) {
      throw new Error('tenant_database must be set in config or auto-derived from tenant slug');
    }

    // Validate credential shape
    const required = ['account', 'username', 'password', 'warehouse'];
    for (const field of required) {
      if (!this.credentials[field]) {
        throw new Error(`Snowflake credential missing required field: ${field}`);
      }
    }

    const database = this.config.tenant_database;
    const schema = this.config.schema || 'PUBLIC';

    // Build fully qualified query map: DATABASE.SCHEMA.VIEW
    const fqPrefix = `${database}.${schema}`;
    this.queryMap = buildQueryMap(fqPrefix);

    this.connection = snowflake.createConnection({
      account: this.credentials.account,
      username: this.credentials.username,
      password: this.credentials.password,
      warehouse: this.credentials.warehouse,
      database,
      schema,
      role: this.credentials.role || 'ALF_SERVICE_ROLE',
      application: 'Alf_Platform',
    });

    await new Promise((resolve, reject) => {
      this.connection.connect((err, conn) => {
        if (err) reject(new Error(`Snowflake connect failed: ${err.message}`));
        else resolve(conn);
      });
    });
  }

  async fetchTable(targetTable) {
    if (!this.connection) throw new Error('Not connected');

    const queryTemplate = this.queryMap?.[targetTable];
    if (!queryTemplate) {
      throw new Error(`No Snowflake query mapped for table: ${targetTable}`);
    }

    const rows = await new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: queryTemplate,
        binds: [this.config.company_filter],
        complete: (err, stmt, rows) => {
          if (err) reject(new Error(`Snowflake query failed (${targetTable}): ${err.message}`));
          else resolve(rows);
        },
      });
    });

    return rows.map(row => this._normalizeRow(row));
  }

  /**
   * Snowflake returns UPPER_CASE column names by default.
   * Normalize to lowercase to match sf_* table schemas.
   */
  _normalizeRow(row) {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  async disconnect() {
    if (this.connection) {
      await new Promise((resolve) => {
        this.connection.destroy((err) => {
          if (err) console.warn('[snowflake] Disconnect warning:', err.message);
          resolve();
        });
      });
      this.connection = null;
    }
  }

  async testConnection() {
    try {
      await this.connect();
      // Verify we can query the database
      const dbName = await new Promise((resolve, reject) => {
        this.connection.execute({
          sqlText: 'SELECT CURRENT_DATABASE() AS DB',
          complete: (err, stmt, rows) => {
            if (err) reject(err);
            else resolve(rows[0]?.DB || 'unknown');
          },
        });
      });
      return { success: true, message: `Connected to ${dbName}` };
    } catch (err) {
      return { success: false, message: err.message };
    } finally {
      await this.disconnect();
    }
  }
}

export { VIEW_MAP, buildQueryMap };
