import { getSyncOrder, getTableSchema } from './tableSchemas.js';
import { upsertTable, upsertTableStream } from './upserter.js';
import FileUploadConnector from './connectors/FileUploadConnector.js';
import SnowflakeConnector from './connectors/SnowflakeConnector.js';
import SqlConnector from './connectors/SqlConnector.js';
import { getTenantApiKey } from '../routes/credentials.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';

const CONNECTOR_MAP = {
  file_upload: FileUploadConnector,
  snowflake: SnowflakeConnector,
  generic_sql: SqlConnector,
};

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/**
 * Run a sync operation: connect → fetch → upsert → log.
 *
 * @param {object} supabase - Supabase service-role client
 * @param {object} syncConfig - Config object with tenant_id, connector_type, config, tables_to_sync, etc.
 * @param {object} options
 * @param {string} [options.triggeredBy='manual'] - Who triggered: 'manual', 'scheduled', 'upload'
 * @param {string} [options.userId] - Auth user id (for created_by)
 * @param {string} [options.fileName] - Original filename (for file_upload)
 * @returns {{ logId: string, status: string, rowCounts: object, errors: object[] }}
 */
export async function runSync(supabase, syncConfig, options = {}) {
  const { triggeredBy = 'manual', userId = null, fileName = null } = options;
  const { tenant_id: tenantId, connector_type: connectorType, config, tables_to_sync } = syncConfig;

  const startedAt = new Date();

  // 1. Create sync_logs entry (status: running)
  const { data: logEntry, error: logError } = await supabase
    .from('sync_logs')
    .insert({
      tenant_id: tenantId,
      sync_config_id: syncConfig.id || null,
      connector_type: connectorType,
      status: 'running',
      started_at: startedAt.toISOString(),
      triggered_by: triggeredBy,
      file_name: fileName,
      created_by: userId,
    })
    .select('id')
    .single();

  if (logError) {
    console.error('[sync:runner] Failed to create log entry:', logError.message);
    throw new Error('Failed to initialize sync log');
  }

  const logId = logEntry.id;
  const rowCounts = {};
  const errors = [];
  let connector = null;

  try {
    // 2. Resolve connector class
    const ConnectorClass = CONNECTOR_MAP[connectorType];
    if (!ConnectorClass) throw new Error(`Unknown connector type: ${connectorType}`);

    // 3. Resolve credentials
    let credentials = null;
    if (connectorType !== 'file_upload') {
      if (ConnectorClass.usesPlatformCredentials) {
        // Platform-owned connector — use alf_platform_credentials
        const credJson = await getPlatformApiKey(supabase, connectorType);
        if (credJson) {
          try {
            credentials = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;
          } catch {
            credentials = credJson;
          }
        }
      } else {
        // Tenant-owned connector — use tenant_api_credentials
        const credJson = await getTenantApiKey(supabase, tenantId, connectorType);
        if (credJson) {
          try {
            credentials = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;
          } catch {
            credentials = credJson;
          }
        }
      }
    }

    // 4. Auto-derive tenant_database for platform connectors if not set
    const effectiveConfig = { ...config };
    if (ConnectorClass.usesPlatformCredentials && !effectiveConfig.tenant_database) {
      const { data: tenant } = await supabase
        .from('alf_tenants')
        .select('slug')
        .eq('id', tenantId)
        .single();

      if (tenant?.slug) {
        effectiveConfig.tenant_database = `ALF_${tenant.slug.toUpperCase()}`;
        console.log(`[sync:runner] Auto-derived tenant_database: ${effectiveConfig.tenant_database}`);
      } else {
        throw new Error('Cannot auto-derive tenant_database — tenant slug not found');
      }
    }

    // 5. Instantiate connector
    connector = new ConnectorClass(tenantId, effectiveConfig, credentials);

    // 6. Connect
    await connector.connect();

    // 7. Determine tables to sync
    const allTables = getSyncOrder();
    const tablesToSync = (tables_to_sync && tables_to_sync.length > 0)
      ? allTables.filter(t => tables_to_sync.includes(t))
      : allTables;

    // For file_upload, only sync the target table
    const effectiveTables = connectorType === 'file_upload'
      ? tablesToSync.filter(t => t === config.targetTable)
      : tablesToSync;

    // 8. Fetch and upsert each table in sync order
    // Connectors that implement fetchTableBatched (Snowflake) get the
    // streaming path so large fact tables don't OOM. Others fall back to
    // the classic buffered path.
    const supportsStreaming = typeof connector.fetchTableBatched === 'function';

    // Load watermarks for incremental sync (Snowflake only)
    const watermarks = syncConfig.sync_watermarks || {};
    const updatedWatermarks = { ...watermarks };

    for (const table of effectiveTables) {
      let rows = null;
      const tableStart = Date.now();
      console.log(`[sync:runner] Starting ${table}...`);
      try {
        let result;
        if (supportsStreaming) {
          // Resolve incremental options from schema + stored watermarks
          const tableSchema = getTableSchema(table);
          const streamOpts = {};
          if (tableSchema.watermarkColumn && watermarks[table]) {
            streamOpts.watermark = watermarks[table];
            streamOpts.watermarkColumn = tableSchema.watermarkColumn;
          } else if (tableSchema.lookbackDays && watermarks[table]) {
            // Table has been seeded before — use lookback window
            streamOpts.lookbackDays = tableSchema.lookbackDays;
          }
          // If no watermark stored yet → full pull (seed)

          result = await upsertTableStream(supabase, tenantId, table, connector, streamOpts);

          // Save the new high-watermark for next run
          if (result.maxWatermark) {
            updatedWatermarks[table] = result.maxWatermark;
          }
        } else {
          rows = await fetchWithRetry(connector, table);
          if (rows.length === 0) {
            rowCounts[table] = { fetched: 0, upserted: 0, skipped: 0 };
            continue;
          }
          result = await upsertTable(supabase, tenantId, table, rows);
        }
        rowCounts[table] = result;
        const tableElapsed = ((Date.now() - tableStart) / 1000).toFixed(1);
        console.log(`[sync:runner] Finished ${table} in ${tableElapsed}s — fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped || 0}`);

        if (result.errors.length > 0) {
          errors.push(...result.errors.map(e => ({ table, ...e })));
        }
      } catch (err) {
        errors.push({ table, error: err.message });
        rowCounts[table] = { fetched: 0, upserted: 0, error: err.message };
      } finally {
        // Release the buffered rows reference (classic path only) so the
        // GC can reclaim memory before starting the next table.
        rows = null;
      }
    }

    // Persist updated watermarks so the next run can be incremental
    if (syncConfig.id && Object.keys(updatedWatermarks).length > 0) {
      await supabase
        .from('sync_configs')
        .update({ sync_watermarks: updatedWatermarks })
        .eq('id', syncConfig.id);
    }
  } catch (err) {
    errors.push({ error: err.message });
  } finally {
    // 9. Always disconnect
    if (connector) {
      try { await connector.disconnect(); } catch { /* ignore */ }
    }
  }

  // 10. Determine final status
  const completedAt = new Date();
  const durationMs = completedAt - startedAt;
  const tableResults = Object.values(rowCounts);
  const hasErrors = errors.length > 0;
  const hasSuccess = tableResults.some(r => (r.upserted || 0) > 0);

  let status;
  if (!hasErrors) status = 'success';
  else if (hasSuccess) status = 'partial';
  else status = 'error';

  // 11. Update sync_logs
  await supabase
    .from('sync_logs')
    .update({
      status,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      row_counts: rowCounts,
      errors: errors.length > 0 ? errors : [],
    })
    .eq('id', logId);

  // 12. Update sync_configs.last_sync_at if config exists
  if (syncConfig.id) {
    await supabase
      .from('sync_configs')
      .update({
        last_sync_at: completedAt.toISOString(),
        last_sync_status: status,
        updated_at: completedAt.toISOString(),
      })
      .eq('id', syncConfig.id);
  }

  return { logId, status, rowCounts, errors };
}

/**
 * Fetch table data with retry (3 attempts, exponential backoff).
 */
async function fetchWithRetry(connector, table) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await connector.fetchTable(table);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`[sync:runner] Fetch ${table} attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return [];
}
