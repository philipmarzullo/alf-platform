import BaseConnector from './BaseConnector.js';

/**
 * Generic SQL connector stub.
 * Placeholder for future database connectors (MySQL, PostgreSQL, MSSQL).
 *
 * Config shape:
 * {
 *   host: string,
 *   port: number,
 *   database: string,
 *   driver: 'mysql' | 'postgres' | 'mssql',
 *   queries: { [sfTable]: 'SELECT ...' }  // custom queries per target table
 * }
 */
export default class SqlConnector extends BaseConnector {
  async connect() {
    throw new Error(
      'Generic SQL connector not yet implemented. ' +
      'Use file_upload for manual data loads or snowflake for Wavelytics integration.'
    );
  }

  async fetchTable() {
    throw new Error('Not connected');
  }

  async testConnection() {
    return { success: false, message: 'Generic SQL connector not yet implemented' };
  }
}
