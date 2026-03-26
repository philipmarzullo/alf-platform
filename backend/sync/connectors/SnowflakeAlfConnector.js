import snowflake from 'snowflake-sdk';
import { decryptCredential } from '../../lib/credentials.js';
import { createClient } from '@supabase/supabase-js';

/**
 * Snowflake connector for the Alf-owned ALF_AAEFS database.
 *
 * This is a SEPARATE connector from SnowflakeConnector.js (Wavelytics).
 * It connects to ALF_AAEFS.WAREHOUSE for the WinTeam ingestion pipeline.
 *
 * Credentials are stored in alf_platform_credentials with
 * service_type = 'snowflake_alf'. The stored JSON blob shape:
 * {
 *   "account":   "ylnlssy-ik29268",
 *   "username":  "ALF_SERVICE",
 *   "password":  "<password>",
 *   "database":  "ALF_AAEFS",
 *   "schema":    "WAREHOUSE",
 *   "role":      "ALF_SERVICE_ROLE",
 *   "warehouse": "COMPUTE_WH"
 * }
 */

snowflake.configure({ ocspFailOpen: true });

// In-memory credential cache (same pattern as platformCredentials.js)
let _credCache = null;
let _credCacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve credentials from alf_platform_credentials (service_type='snowflake_alf').
 * Caches decrypted result for 5 minutes.
 */
async function resolveCredentials() {
  if (_credCache && _credCacheExpiry > Date.now()) return _credCache;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data, error } = await supabase
    .from('alf_platform_credentials')
    .select('encrypted_key, is_active')
    .eq('service_type', 'snowflake_alf')
    .single();

  if (error || !data || !data.is_active) {
    _credCache = null;
    throw new Error(
      'No active snowflake_alf credential in alf_platform_credentials. ' +
      'Insert one with service_type=\'snowflake_alf\' containing the ALF_SERVICE JSON blob.'
    );
  }

  const json = decryptCredential(data.encrypted_key);
  const creds = JSON.parse(json);

  // Validate required fields
  for (const field of ['account', 'username', 'password', 'warehouse']) {
    if (!creds[field]) {
      throw new Error(`snowflake_alf credential missing required field: ${field}`);
    }
  }

  _credCache = creds;
  _credCacheExpiry = Date.now() + CACHE_TTL;
  return creds;
}

export default class SnowflakeAlfConnector {
  constructor() {
    this.connection = null;
    this.creds = null;
  }

  async connect() {
    this.creds = await resolveCredentials();

    const connOpts = {
      account: this.creds.account,
      username: this.creds.username,
      password: this.creds.password,
      database: this.creds.database || 'ALF_AAEFS',
      schema: this.creds.schema || 'WAREHOUSE',
      warehouse: this.creds.warehouse,
      role: this.creds.role || 'ALF_SERVICE_ROLE',
      application: 'Alf_Ingestion',
    };

    this.connection = snowflake.createConnection(connOpts);

    await new Promise((resolve, reject) => {
      this.connection.connect((err, conn) => {
        if (err) reject(new Error(`Snowflake ALF connect failed: ${err.message}`));
        else resolve(conn);
      });
    });
  }

  /**
   * Execute a SQL statement with optional binds.
   * Returns array of row objects.
   */
  async execute(sqlText, binds = []) {
    if (!this.connection) throw new Error('Not connected');

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          if (err) reject(new Error(`Snowflake ALF query failed: ${err.message}`));
          else resolve(rows || []);
        },
      });
    });
  }

  async disconnect() {
    if (this.connection) {
      await new Promise((resolve) => {
        this.connection.destroy((err) => {
          if (err) console.warn('[snowflake-alf] Disconnect warning:', err.message);
          resolve();
        });
      });
      this.connection = null;
    }
  }

  /**
   * Fetch jobs from ALF_AAEFS.WAREHOUSE.DIM_JOB.
   * Returns all jobs (active + inactive) with the last load timestamp.
   */
  async fetchJobs(limit = 15000) {
    const db = this.creds?.database || 'ALF_AAEFS';
    const schema = this.creds?.schema || 'WAREHOUSE';
    const rows = await this.execute(`
      SELECT
        Job_Number, Job_Name, Job_Status,
        Company_Name,
        Tier_1, Tier_3, Tier_8,
        Supervisor_Description,
        City, State,
        _loaded_at
      FROM ${db}.${schema}.DIM_JOB
      ORDER BY Job_Name
      LIMIT ?
    `, [limit]);
    return rows;
  }

  async testConnection() {
    try {
      await this.connect();
      const rows = await this.execute('SELECT CURRENT_DATABASE() AS DB, CURRENT_SCHEMA() AS SCHEMA');
      return { success: true, message: `Connected to ${rows[0]?.DB}.${rows[0]?.SCHEMA}` };
    } catch (err) {
      return { success: false, message: err.message };
    } finally {
      await this.disconnect();
    }
  }
}

/**
 * Invalidate the cached credentials (call after updating alf_platform_credentials).
 */
export function invalidateAlfCredCache() {
  _credCache = null;
  _credCacheExpiry = 0;
}
