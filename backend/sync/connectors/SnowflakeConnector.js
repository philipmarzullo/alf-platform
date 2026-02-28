import BaseConnector from './BaseConnector.js';

/**
 * Snowflake connector skeleton.
 * Maps sf_* tables to Wavelytics Data Factory queries.
 * Will become functional when A&A Snowflake credentials arrive (~March 2026).
 *
 * Credentials shape (from tenant_api_credentials, service_type='snowflake'):
 * {
 *   account: string,
 *   username: string,
 *   password: string,
 *   warehouse: string,
 *   database: string,
 *   schema: string,
 *   role: string
 * }
 *
 * Config shape (from sync_configs.config):
 * {
 *   company_filter: string   // REQUIRED — filters dim_job.company to scope data to this tenant
 * }
 */

/**
 * Query templates with :company_filter placeholder.
 * Every query filters through dim_job.company to ensure tenant isolation at the source.
 * The placeholder is replaced with a parameterized bind variable at execution time.
 */
const TABLE_QUERY_MAP = {
  sf_dim_job: `
    SELECT
      job_name,
      location,
      supervisor,
      company,
      tier,
      sq_footage,
      is_active
    FROM dim_job
    WHERE is_active = TRUE
      AND company = :company_filter
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
    FROM dim_employee e
    LEFT JOIN dim_job j ON e.job_id = j.job_id
    WHERE j.company = :company_filter
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
    FROM fact_labor_budget_to_actual f
    JOIN dim_job j ON f.job_id = j.job_id
    WHERE j.company = :company_filter
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
    FROM fact_job_daily f
    JOIN dim_job j ON f.job_id = j.job_id
    WHERE j.company = :company_filter
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
    FROM fact_work_schedule_ticket f
    JOIN dim_job j ON f.job_id = j.job_id
    WHERE j.company = :company_filter
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
    FROM fact_timekeeping f
    JOIN dim_employee e ON f.employee_id = e.employee_id
    JOIN dim_job j ON f.job_id = j.job_id
    WHERE j.company = :company_filter
  `,
};

export default class SnowflakeConnector extends BaseConnector {
  constructor(tenantId, config, credentials) {
    super(tenantId, config, credentials);
    this.connection = null;
  }

  async connect() {
    if (!this.credentials) {
      throw new Error('Snowflake credentials not configured for this tenant');
    }

    // company_filter is required — prevents pulling data for other tenants
    if (!this.config.company_filter) {
      throw new Error(
        'Snowflake sync requires company_filter in config. ' +
        'Set this to the company name in dim_job that identifies this tenant\'s data.'
      );
    }

    // Validate credential shape
    const required = ['account', 'username', 'password', 'warehouse', 'database'];
    for (const field of required) {
      if (!this.credentials[field]) {
        throw new Error(`Snowflake credential missing required field: ${field}`);
      }
    }

    // Skeleton: real connection will use snowflake-sdk
    // const snowflake = await import('snowflake-sdk');
    // this.connection = snowflake.createConnection({ ... });
    // await new Promise((resolve, reject) => this.connection.connect((err, conn) => err ? reject(err) : resolve(conn)));

    throw new Error(
      'Snowflake connector not yet active — install snowflake-sdk and configure credentials to enable. ' +
      'Expected availability: when A&A Snowflake environment is provisioned.'
    );
  }

  async fetchTable(targetTable) {
    if (!this.connection) throw new Error('Not connected');

    const queryTemplate = TABLE_QUERY_MAP[targetTable];
    if (!queryTemplate) {
      throw new Error(`No Snowflake query mapped for table: ${targetTable}`);
    }

    // Replace :company_filter with bind variable for parameterized execution.
    // snowflake-sdk uses ? for positional binds.
    const query = queryTemplate.replace(':company_filter', '?');
    const binds = [this.config.company_filter];

    // Skeleton: execute parameterized query and return rows
    // const rows = await new Promise((resolve, reject) => {
    //   this.connection.execute({
    //     sqlText: query,
    //     binds,
    //     complete: (err, stmt, rows) => err ? reject(err) : resolve(rows)
    //   });
    // });
    // return rows.map(row => this._normalizeRow(row));

    void query;
    void binds;
    return [];
  }

  async disconnect() {
    if (this.connection) {
      // await new Promise(resolve => this.connection.destroy(resolve));
      this.connection = null;
    }
  }

  async testConnection() {
    try {
      await this.connect();
      return { success: true, message: 'Snowflake connection successful' };
    } catch (err) {
      return { success: false, message: err.message };
    } finally {
      await this.disconnect();
    }
  }
}

export { TABLE_QUERY_MAP };
