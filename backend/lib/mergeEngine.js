/**
 * Generic MERGE engine — drives CSV → Snowflake upserts from tenant_ingestion_configs.
 *
 * Fully config-driven: no table-specific code. The column_mapping jsonb in
 * tenant_ingestion_configs controls which CSV columns map to which Snowflake columns.
 */

const BATCH_SIZE = 1000;

/**
 * Ensure the _INGESTION_LOG table exists in the target database/schema.
 * Called once per connector session; uses CREATE TABLE IF NOT EXISTS.
 */
async function ensureIngestionLogTable(connector, database, schema) {
  const fqTable = `${database}.${schema}._INGESTION_LOG`;
  await connector.execute(`
    CREATE TABLE IF NOT EXISTS ${fqTable} (
      id NUMBER AUTOINCREMENT PRIMARY KEY,
      tenant_id VARCHAR(64),
      config_key VARCHAR(128),
      source_file VARCHAR(512),
      rows_processed NUMBER DEFAULT 0,
      rows_upserted NUMBER DEFAULT 0,
      rows_failed NUMBER DEFAULT 0,
      status VARCHAR(32) DEFAULT 'running',
      error_message VARCHAR(4096),
      started_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
      completed_at TIMESTAMP_NTZ
    )
  `);
}

/**
 * Write a log entry to _INGESTION_LOG. Returns the log row id.
 */
async function writeLogEntry(connector, database, schema, entry) {
  const fqTable = `${database}.${schema}._INGESTION_LOG`;
  const rows = await connector.execute(`
    INSERT INTO ${fqTable}
      (tenant_id, config_key, source_file, rows_processed, rows_upserted, rows_failed, status, error_message, started_at, completed_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  `, [
    entry.tenant_id,
    entry.config_key,
    entry.source_file,
    entry.rows_processed,
    entry.rows_upserted,
    entry.rows_failed,
    entry.status,
    entry.error_message || null,
    entry.started_at,
    entry.completed_at || null,
  ]);
  return rows;
}

/**
 * Escape a Snowflake string value for use in a VALUES clause.
 * Returns NULL for null/undefined, otherwise a single-quoted escaped string.
 */
function escapeValue(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Build and execute a MERGE statement for a batch of rows.
 *
 * @param {object} connector - SnowflakeAlfConnector instance (connected)
 * @param {object} config - tenant_ingestion_configs row
 * @param {object[]} rows - parsed CSV rows (raw, with CSV column names as keys)
 * @returns {{ upserted: number, failed: number }}
 */
async function mergeBatch(connector, config, rows) {
  const { snowflake_database, snowflake_schema, snowflake_table, primary_key_column, column_mapping } = config;
  const fqTable = `${snowflake_database}.${snowflake_schema}.${snowflake_table}`;

  // column_mapping: { csvCol: sfCol, ... }
  const csvCols = Object.keys(column_mapping);
  const sfCols = csvCols.map(c => column_mapping[c]);

  // Build VALUES rows: each row is (col1, col2, ..., colN)
  const valueRows = rows.map(row => {
    const vals = csvCols.map(csvCol => escapeValue(row[csvCol]));
    return `(${vals.join(', ')})`;
  });

  // Build column list for the source SELECT
  const sourceColDefs = sfCols.map((col, i) => `COLUMN${i + 1} AS ${col}`).join(', ');

  // Build MERGE
  const pkCol = column_mapping[primary_key_column] || primary_key_column;
  const updateCols = sfCols
    .filter(c => c !== pkCol)
    .map(c => `target.${c} = source.${c}`)
    .join(',\n        ');
  const insertCols = [...sfCols, '_loaded_at'].join(', ');
  const insertVals = [...sfCols.map(c => `source.${c}`), 'CURRENT_TIMESTAMP()'].join(', ');

  const sql = `
    MERGE INTO ${fqTable} AS target
    USING (
      SELECT ${sourceColDefs}
      FROM VALUES ${valueRows.join(',\n        ')}
    ) AS source
    ON target.${pkCol} = source.${pkCol}
    WHEN MATCHED THEN UPDATE SET
        ${updateCols},
        _loaded_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT
        (${insertCols})
        VALUES (${insertVals})
  `;

  const result = await connector.execute(sql);

  // Snowflake MERGE returns a result set with "number of rows inserted" and "number of rows updated"
  let inserted = 0;
  let updated = 0;
  if (result && result.length > 0) {
    inserted = result[0]['number of rows inserted'] || 0;
    updated = result[0]['number of rows updated'] || 0;
  }

  return { upserted: inserted + updated, failed: rows.length - (inserted + updated) };
}

/**
 * Run the full MERGE pipeline for a CSV upload.
 *
 * @param {object} connector - SnowflakeAlfConnector instance (connected)
 * @param {object} config - tenant_ingestion_configs row from Supabase
 * @param {object[]} csvRows - parsed CSV rows (array of objects with CSV column names)
 * @param {string} tenantId - tenant UUID
 * @param {string} sourceFile - original filename
 * @returns {{ success, rows_processed, rows_upserted, rows_failed, table, duration_ms }}
 */
export async function runMerge(connector, config, csvRows, tenantId, sourceFile) {
  const startedAt = new Date();
  const database = config.snowflake_database || 'ALF_AAEFS';
  const schema = config.snowflake_schema || 'WAREHOUSE';

  // Ensure log table exists
  await ensureIngestionLogTable(connector, database, schema);

  let totalUpserted = 0;
  let totalFailed = 0;
  let errorMessage = null;

  try {
    // Process in batches
    for (let i = 0; i < csvRows.length; i += BATCH_SIZE) {
      const batch = csvRows.slice(i, i + BATCH_SIZE);
      const result = await mergeBatch(connector, config, batch);
      totalUpserted += result.upserted;
      totalFailed += result.failed;
    }
  } catch (err) {
    errorMessage = err.message;
    // Any rows not yet processed count as failed
    const processedSoFar = totalUpserted + totalFailed;
    totalFailed += csvRows.length - processedSoFar;
  }

  const completedAt = new Date();
  const status = errorMessage ? 'error' : (totalFailed > 0 ? 'partial' : 'success');

  // Write ingestion log
  await writeLogEntry(connector, database, schema, {
    tenant_id: tenantId,
    config_key: config.config_key,
    source_file: sourceFile,
    rows_processed: csvRows.length,
    rows_upserted: totalUpserted,
    rows_failed: totalFailed,
    status,
    error_message: errorMessage,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
  });

  return {
    success: status !== 'error',
    rows_processed: csvRows.length,
    rows_upserted: totalUpserted,
    rows_failed: totalFailed,
    table: `${database}.${schema}.${config.snowflake_table}`,
    duration_ms: completedAt - startedAt,
    status,
    error_message: errorMessage,
  };
}

/**
 * Fetch recent ingestion logs for a tenant.
 */
export async function fetchIngestionLogs(connector, database, schema, tenantId, limit = 50) {
  const fqTable = `${database}.${schema}._INGESTION_LOG`;

  // Ensure the table exists before querying
  await ensureIngestionLogTable(connector, database, schema);

  const rows = await connector.execute(`
    SELECT *
    FROM ${fqTable}
    WHERE tenant_id = ?
    ORDER BY completed_at DESC
    LIMIT ?
  `, [tenantId, limit]);

  return rows;
}
