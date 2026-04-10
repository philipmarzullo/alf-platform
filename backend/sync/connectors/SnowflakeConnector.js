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
 * Build query templates with fully qualified Wavelytics WinTeam warehouse view names.
 * Column aliases map WinTeam naming → sf_* table columns.
 * :1 is the company_filter bind variable for tenant isolation.
 *
 * Each fact query now includes:
 *   - *_UQ AS source_uq — stable unique key for upsert (enables incremental)
 *   - SOURCE_RECORD_UPDATED_TIMESTAMP AS source_updated_at — watermark for
 *     incremental filtering (not available on FACT_WORK_SCHEDULE_TICKET,
 *     which uses date-range lookback instead)
 */
function buildQueryMap(fqPrefix) {
  const dj = `${fqPrefix}.DIM_JOB`;
  const de = `${fqPrefix}.DIM_EMPLOYEE`;
  const dd = `${fqPrefix}.DIM_DATE`;
  const flba = `${fqPrefix}.FACT_LABOR_BUDGET_TO_ACTUAL`;
  const fjd = `${fqPrefix}.FACT_JOB_DAILY`;
  const fwst = `${fqPrefix}.FACT_WORK_SCHEDULE_TICKET`;
  const ft = `${fqPrefix}.FACT_TIMEKEEPING`;

  return {
    sf_dim_job: `
      SELECT
        JOB_NAME                        AS job_name,
        JOB_LOCATION_LABEL              AS location,
        JOB_SUPERVISOR_DESCRIPTION      AS supervisor,
        JOB_COMPANY_NAME                AS company,
        JOB_TIER_01_CURRENT_VALUE_LABEL AS tier,
        NULL                            AS sq_footage,
        IS_JOB_ACTIVE_FLAG              AS is_active
      FROM ${dj}
      WHERE JOB_COMPANY_NAME = :1
    `,

    sf_dim_employee: `
      SELECT
        e.EMPLOYEE_NUMBER                 AS employee_number,
        e.EMPLOYEE_FIRST_NAME             AS first_name,
        e.EMPLOYEE_LAST_NAME              AS last_name,
        e.EMPLOYEE_TYPE_LABEL             AS role,
        e.EMPLOYEE_HIRE_DATE              AS hire_date,
        j.JOB_NAME                        AS job_name,
        NULL                              AS hourly_rate
      FROM ${de} e
      JOIN ${dj} j
        ON j.JOB_NUMBER = e.EMPLOYEE_PRIMARY_JOB_NUMBER
      WHERE j.JOB_COMPANY_NAME = :1
    `,

    // NOTE: All Wavelytics *_DATE_KEY columns are surrogate MD5 hashes,
    // not real dates. We join DIM_DATE to resolve them to CALENDAR_DATE
    // values that match our Supabase DATE columns.
    // Similarly, *_TIME_KEY columns are surrogate hashes with no DIM_TIME
    // view available — clock_in/clock_out are set to NULL.

    sf_fact_labor_budget_actual: `
      SELECT
        f.LABOR_BUDGET_UQ       AS source_uq,
        j.JOB_NAME              AS job_name,
        TO_CHAR(d.CALENDAR_DATE, 'YYYY-MM-DD') AS period_start,
        TO_CHAR(d.CALENDAR_DATE, 'YYYY-MM-DD') AS period_end,
        f.BUDGET_HOURS          AS budget_hours,
        f.ACTUAL_HOURS          AS actual_hours,
        f.BUDGET_DOLLAR_AMOUNT  AS budget_dollars,
        f.ACTUAL_DOLLAR_AMOUNT  AS actual_dollars,
        0                       AS ot_hours,
        0                       AS ot_dollars,
        f.SOURCE_RECORD_UPDATED_TIMESTAMP AS source_updated_at
      FROM ${flba} f
      JOIN ${dj} j ON j.JOB_KEY = f.JOB_KEY
      JOIN ${dd} d ON d.DATE_KEY = f.DATE_KEY
      WHERE j.JOB_COMPANY_NAME = :1
    `,

    sf_fact_job_daily: `
      SELECT
        f.JOB_DAILY_UQ                            AS source_uq,
        j.JOB_NAME                                AS job_name,
        TO_CHAR(d.CALENDAR_DATE, 'YYYY-MM-DD')    AS date_key,
        0                                         AS audits,
        0                                         AS corrective_actions,
        0                                         AS recordable_incidents,
        0                                         AS good_saves,
        0                                         AS near_misses,
        0                                         AS trir,
        f.SCHEDULE_POSITION_ACTUAL_TOTAL_NUMBER   AS headcount,
        f.SOURCE_RECORD_UPDATED_TIMESTAMP         AS source_updated_at
      FROM ${fjd} f
      JOIN ${dj} j ON j.JOB_KEY = f.JOB_KEY
      JOIN ${dd} d ON d.DATE_KEY = f.DATE_KEY
      WHERE j.JOB_COMPANY_NAME = :1
    `,

    sf_fact_work_tickets: `
      SELECT
        f.WORK_SCHEDULE_TICKET_UQ             AS source_uq,
        j.JOB_NAME                            AS job_name,
        TO_CHAR(d_sched.CALENDAR_DATE, 'YYYY-MM-DD') AS date_key,
        f.WORK_SCHEDULE_TYPE_LABEL            AS category,
        f.WORK_TICKET_STATUS_LABEL            AS status,
        NULL                                  AS priority,
        f.WORK_TICKET_SUPERVISOR_DESCRIPTION  AS assigned_to,
        TO_CHAR(d_comp.CALENDAR_DATE, 'YYYY-MM-DD') AS completed_at,
        f.DATA_AS_OF_TIMESTAMP                AS source_updated_at
      FROM ${fwst} f
      JOIN ${dj} j ON j.JOB_KEY = f.JOB_KEY
      JOIN ${dd} d_sched ON d_sched.DATE_KEY = f.WORK_TICKET_SCHEDULED_DATE_KEY
      LEFT JOIN ${dd} d_comp ON d_comp.DATE_KEY = f.WORK_TICKET_COMPLETED_DATE_KEY
      WHERE j.JOB_COMPANY_NAME = :1
    `,

    sf_fact_timekeeping: `
      SELECT
        f.TIMEKEEPING_UQ                AS source_uq,
        e.EMPLOYEE_NUMBER              AS employee_number,
        j.JOB_NAME                     AS job_name,
        TO_CHAR(d.CALENDAR_DATE, 'YYYY-MM-DD') AS date_key,
        NULL                           AS clock_in,
        NULL                           AS clock_out,
        f.TIMEKEEPING_REGULAR_HOURS    AS regular_hours,
        f.TIMEKEEPING_OVERTIME_HOURS   AS ot_hours,
        f.TIMEKEEPING_DOUBLETIME_HOURS AS dt_hours,
        NULL                           AS punch_status,
        f.SOURCE_RECORD_UPDATED_TIMESTAMP AS source_updated_at
      FROM ${ft} f
      JOIN ${de} e ON e.EMPLOYEE_KEY = f.EMPLOYEE_KEY
      JOIN ${dj} j ON j.JOB_KEY = f.JOB_KEY
      JOIN ${dd} d ON d.DATE_KEY = f.WORK_DATE_KEY
      WHERE j.JOB_COMPANY_NAME = :1
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

    // Validate credential shape — key-pair auth uses privateKey, legacy uses password
    const hasKeyPair = !!this.credentials.privateKey;
    const required = ['account', 'username', 'warehouse'];
    if (!hasKeyPair) required.push('password');
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

    const connOpts = {
      account: this.credentials.account,
      username: this.credentials.username,
      warehouse: this.credentials.warehouse,
      database,
      schema,
      role: this.credentials.role || 'ALF_SERVICE_ROLE',
      application: 'Alf_Platform',
      authenticator: hasKeyPair ? 'SNOWFLAKE_JWT' : 'SNOWFLAKE',
    };

    if (hasKeyPair) {
      connOpts.privateKey = this.credentials.privateKey;
    } else {
      connOpts.password = this.credentials.password;
    }

    this.connection = snowflake.createConnection(connOpts);

    await new Promise((resolve, reject) => {
      this.connection.connect((err, conn) => {
        if (err) reject(new Error(`Snowflake connect failed: ${err.message}`));
        else resolve(conn);
      });
    });
  }

  async fetchTable(targetTable) {
    // Thin wrapper that buffers a batched fetch into a single array. Kept
    // for backwards compatibility with non-streaming call sites. New code
    // (see runner.js) should prefer fetchTableBatched so rows never
    // accumulate in memory.
    const all = [];
    await this.fetchTableBatched(targetTable, async (batch) => {
      for (const row of batch) all.push(row);
    }, { batchSize: 1000 });
    return all;
  }

  /**
   * Memory-efficient streaming fetch. Streams rows from Snowflake and
   * invokes `onBatch(batch)` with every `batchSize` rows (plus a final
   * partial batch at end-of-stream). The stream is paused while `onBatch`
   * runs so downstream upserts apply back-pressure to the Snowflake SDK
   * and peak memory stays at O(batchSize) regardless of table size.
   *
   * Options:
   *   batchSize        — rows per batch (default 500)
   *   watermark        — ISO timestamp; if set, only rows updated after this
   *                      time are fetched (via watermarkColumn filter)
   *   watermarkColumn  — Snowflake column name for timestamp-based watermark
   *                      (e.g. 'SOURCE_RECORD_UPDATED_TIMESTAMP')
   *   lookbackDays     — alternative to watermark: pull rows where scheduled
   *                      date is within this many days of today (via DIM_DATE)
   *
   * Resolves with the total row count after the final batch is processed.
   */
  async fetchTableBatched(targetTable, onBatch, { batchSize = 500, watermark = null, watermarkColumn = null, lookbackDays = null } = {}) {
    if (!this.connection) throw new Error('Not connected');

    const queryTemplate = this.queryMap?.[targetTable];
    if (!queryTemplate) {
      throw new Error(`No Snowflake query mapped for table: ${targetTable}`);
    }

    // Build the final SQL with optional incremental filter
    let sqlText = queryTemplate;
    const binds = [this.config.company_filter];

    if (watermark && watermarkColumn) {
      // Timestamp-based incremental: only rows modified since the watermark
      binds.push(watermark);
      sqlText += `\n        AND f.${watermarkColumn} >= :${binds.length}`;
    } else if (lookbackDays && lookbackDays > 0) {
      // Date-range lookback: only rows scheduled within lookbackDays of today
      // Uses the d_sched alias added to the FACT_WORK_SCHEDULE_TICKET query
      sqlText += `\n        AND d_sched.CALENDAR_DATE >= DATEADD(day, -${Number(lookbackDays)}, CURRENT_DATE())`;
    }

    return await new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText,
        binds,
        streamResult: true,
        complete: (err, stmt) => {
          if (err) {
            reject(new Error(`Snowflake query failed (${targetTable}): ${err.message}`));
            return;
          }

          const stream = stmt.streamRows();
          let batch = [];
          let total = 0;
          let failed = false;

          const flush = async () => {
            if (batch.length === 0) return;
            const toProcess = batch;
            batch = [];
            await onBatch(toProcess);
          };

          stream.on('data', (row) => {
            if (failed) return;
            const normalized = {};
            for (const key in row) {
              normalized[key.toLowerCase()] = row[key];
            }
            batch.push(normalized);
            total += 1;

            if (batch.length >= batchSize) {
              stream.pause();
              flush()
                .then(() => {
                  if (!failed) stream.resume();
                })
                .catch((batchErr) => {
                  failed = true;
                  stream.destroy();
                  reject(batchErr);
                });
            }
          });

          stream.on('end', async () => {
            if (failed) return;
            try {
              await flush();
              resolve(total);
            } catch (flushErr) {
              reject(flushErr);
            }
          });

          stream.on('error', (streamErr) => {
            if (failed) return;
            failed = true;
            reject(new Error(`Snowflake stream error (${targetTable}): ${streamErr.message}`));
          });
        },
      });
    });
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

  /**
   * Execute an arbitrary SQL query against Snowflake.
   * Used by the agent querySnowflake tool for direct view access.
   */
  async queryView(sqlText, binds = []) {
    if (!this.connection) throw new Error('Not connected');
    const rows = await new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          if (err) reject(new Error(`Snowflake query failed: ${err.message}`));
          else resolve(rows || []);
        },
      });
    });
    return rows.map(row => this._normalizeRow(row));
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
