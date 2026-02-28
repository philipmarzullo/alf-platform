/**
 * Abstract base class for data connectors.
 * All connectors must implement: connect(), fetchTable(), disconnect(), testConnection().
 */
export default class BaseConnector {
  /**
   * @param {string} tenantId - UUID of the tenant this connector serves
   * @param {object} config - Connector-specific configuration (from sync_configs.config)
   * @param {object|null} credentials - Decrypted credentials (null for file_upload)
   */
  constructor(tenantId, config, credentials) {
    if (new.target === BaseConnector) {
      throw new Error('BaseConnector is abstract — use a concrete connector');
    }
    this.tenantId = tenantId;
    this.config = config || {};
    this.credentials = credentials;
  }

  /**
   * Establish connection to the data source.
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('connect() not implemented');
  }

  /**
   * Fetch rows for a target sf_* table.
   * Must return plain objects WITHOUT id or tenant_id — those are added by the upserter.
   * @param {string} targetTable - The sf_* table name to fetch data for
   * @returns {Promise<object[]>} Array of row objects
   */
  async fetchTable(targetTable) {
    throw new Error('fetchTable() not implemented');
  }

  /**
   * Close connection and release resources.
   * @returns {Promise<void>}
   */
  async disconnect() {
    // Default: no-op (override in connectors that hold connections)
  }

  /**
   * Test connectivity without fetching data.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    throw new Error('testConnection() not implemented');
  }
}
