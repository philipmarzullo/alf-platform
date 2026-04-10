import { getTableSchema } from './tableSchemas.js';

const BATCH_SIZE = 2000;
const MAX_ERRORS_STORED = 100;

/**
 * Upsert rows into an sf_* table, scoped to a single tenant.
 *
 * @param {object} supabase - Supabase service-role client
 * @param {string} tenantId - UUID of the owning tenant
 * @param {string} table - sf_* table name
 * @param {object[]} rows - Raw rows (no id or tenant_id)
 * @returns {{ fetched: number, upserted: number, skipped: number, errors: object[] }}
 */
export async function upsertTable(supabase, tenantId, table, rows) {
  const schema = getTableSchema(table);
  const result = { fetched: rows.length, upserted: 0, skipped: 0, errors: [] };

  if (rows.length === 0) return result;

  // Build FK lookup caches for this table
  const fkCaches = await buildFkCaches(supabase, tenantId, schema);

  // Auto-insert missing dates into sf_dim_date
  if (schema.fks.date_key) {
    await ensureDates(supabase, rows);
  }

  // Validate and transform rows
  const validRows = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const transformed = transformRow(row(rows[i]), tenantId, schema, fkCaches);
      validRows.push(transformed);
    } catch (err) {
      result.skipped++;
      result.errors.push({ row: i, error: err.message, data: rows[i] });
    }
  }

  if (validRows.length === 0) return result;

  // Upsert strategy depends on whether table has a natural key
  if (schema.naturalKey) {
    const onConflict = schema.naturalKey.join(',');
    result.upserted = await batchUpsert(supabase, table, validRows, onConflict);
  } else {
    // No natural key (work_tickets, timekeeping): delete tenant rows, batch insert
    result.upserted = await deleteAndInsert(supabase, tenantId, table, validRows);
  }

  return result;
}

/**
 * Streaming variant of upsertTable that pulls rows from a connector in
 * batches and transforms/upserts them without ever holding the full table
 * in memory. Used by the runner for Snowflake (large fact tables like
 * FACT_TIMEKEEPING would OOM with the buffered path).
 *
 * The connector must implement `fetchTableBatched(table, onBatch, opts)`.
 *
 * Design notes:
 *   - FK caches are built once up front from Supabase state (dims were
 *     synced earlier in sync order) and reused for every batch.
 *   - For tables without a natural key we delete all tenant rows once up
 *     front, then insert streaming batches.
 *   - ensureDates runs per-batch; it's idempotent so re-calling is safe.
 *   - result.errors is capped at MAX_ERRORS_STORED and omits the raw row
 *     payload so a large table full of FK failures can't blow the heap.
 */
export async function upsertTableStream(supabase, tenantId, table, connector, { batchSize = BATCH_SIZE, watermark = null, watermarkColumn = null, lookbackDays = null } = {}) {
  const schema = getTableSchema(table);
  const result = { fetched: 0, upserted: 0, skipped: 0, errors: [], maxWatermark: null };

  const fkCaches = await buildFkCaches(supabase, tenantId, schema);

  // For tables without a natural key we delete once up front, then stream
  // inserts in batches. With the source_uq migration, all fact tables now
  // have natural keys — this path is kept as a fallback for future tables.
  if (!schema.naturalKey) {
    const { error: delError } = await supabase
      .from(table)
      .delete()
      .eq('tenant_id', tenantId);
    if (delError) {
      throw new Error(`Delete before insert failed on ${table}: ${delError.message}`);
    }
  }

  const onConflict = schema.naturalKey ? schema.naturalKey.join(',') : null;

  const total = await connector.fetchTableBatched(table, async (batch) => {
    result.fetched += batch.length;

    if (schema.fks.date_key) {
      await ensureDates(supabase, batch);
    }

    // Transform in place: write the transformed row back into the same
    // slot, advance a write cursor, then truncate to drop skipped rows.
    // This keeps peak memory at ~1x batch size instead of 2x.
    //
    // IMPORTANT: do the transform in a local var first, THEN assign + bump
    // the write cursor. Writing `batch[writeIdx++] = transformRow(...)` is
    // buggy because the LHS is evaluated first — if transformRow throws,
    // writeIdx has already advanced but the slot was never written, so the
    // raw Snowflake row (with its `job_name` etc.) survives the truncate
    // and gets sent to PostgREST, which rejects it.
    let writeIdx = 0;
    for (let i = 0; i < batch.length; i++) {
      try {
        const transformed = transformRow(row(batch[i]), tenantId, schema, fkCaches);
        batch[writeIdx] = transformed;
        writeIdx++;

        // Track the highest watermark timestamp across all batches
        if (transformed.source_updated_at) {
          const ts = transformed.source_updated_at instanceof Date
            ? transformed.source_updated_at.toISOString()
            : String(transformed.source_updated_at);
          if (!result.maxWatermark || ts > result.maxWatermark) {
            result.maxWatermark = ts;
          }
        }
      } catch (err) {
        result.skipped++;
        if (result.errors.length < MAX_ERRORS_STORED) {
          result.errors.push({ error: err.message });
        }
      }
    }
    batch.length = writeIdx;

    if (batch.length === 0) return;

    // Deduplicate within the batch by natural key. Some views (e.g. DIM_JOB)
    // can return duplicate display names; PostgreSQL's ON CONFLICT rejects a
    // batch where two rows share the same conflict key.
    if (onConflict) {
      const keyFields = onConflict.split(',');
      const seen = new Map();
      for (const row of batch) {
        const key = keyFields.map(f => row[f]).join('\x00');
        seen.set(key, row);  // last occurrence wins
      }
      if (seen.size < batch.length) {
        result.skipped += batch.length - seen.size;
        const deduped = Array.from(seen.values());
        batch.length = 0;
        for (const row of deduped) batch.push(row);
      }
    }

    if (batch.length === 0) return;

    const { error: opError } = schema.naturalKey
      ? await supabase.from(table).upsert(batch, { onConflict })
      : await supabase.from(table).insert(batch);

    if (opError) {
      throw new Error(`Batch ${schema.naturalKey ? 'upsert' : 'insert'} failed on ${table}: ${opError.message}`);
    }

    result.upserted += batch.length;
  }, { batchSize, watermark, watermarkColumn, lookbackDays });

  // total is the raw count emitted by the connector; result.fetched should
  // match it. Trust the connector's count as the authoritative total.
  if (typeof total === 'number') result.fetched = total;

  return result;
}

// ─── Internal helpers ───────────────────────────────────────────────────

/**
 * Passthrough — ensures row is plain object (handles csv-parse output).
 */
function row(r) {
  return typeof r === 'object' && r !== null ? r : {};
}

/**
 * Build lookup caches for foreign keys: { lookupValue → uuid }
 *
 * IMPORTANT: PostgREST / supabase-js returns a maximum of 1000 rows per
 * request by default. A naive `.select()` here silently truncates the
 * cache, causing every FK lookup past the first 1000 rows to miss. For
 * tenants with thousands of jobs or employees that cascades into a mass
 * skip during upsert (and used to blow the heap via Error-stack churn).
 *
 * Paginate explicitly via `.range(from, to)` until a short page signals
 * end of data.
 */
const FK_CACHE_PAGE_SIZE = 1000;

async function buildFkCaches(supabase, tenantId, schema) {
  const caches = {};

  for (const [fkCol, ref] of Object.entries(schema.fks)) {
    if (fkCol === 'date_key') {
      // date_key is its own PK, no lookup needed
      caches[fkCol] = null;
      continue;
    }

    const lookupCol = ref.lookupColumn;
    const refSchema = getTableSchema(ref.table);
    const cache = new Map();

    let from = 0;
    while (true) {
      let query = supabase
        .from(ref.table)
        .select(`id, ${lookupCol}`)
        .range(from, from + FK_CACHE_PAGE_SIZE - 1);

      if (refSchema.tenantScoped) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw new Error(`FK cache build failed for ${ref.table}: ${error.message}`);

      const rows = data || [];
      for (const row of rows) {
        cache.set(String(row[lookupCol]), row.id);
      }

      // Short page = end of data. Also break if the server returned
      // nothing so we don't loop forever on an unexpected empty result.
      if (rows.length < FK_CACHE_PAGE_SIZE) break;
      from += FK_CACHE_PAGE_SIZE;
    }

    caches[fkCol] = cache;
  }

  return caches;
}

/**
 * Ensure all date_key values referenced in rows exist in sf_dim_date.
 */
async function ensureDates(supabase, rows) {
  const dateKeys = new Set();
  for (const r of rows) {
    if (r.date_key) dateKeys.add(String(r.date_key));
  }

  if (dateKeys.size === 0) return;

  // Check which dates already exist
  const { data: existing } = await supabase
    .from('sf_dim_date')
    .select('date_key')
    .in('date_key', [...dateKeys]);

  const existingSet = new Set((existing || []).map(d => String(d.date_key)));
  const missing = [...dateKeys].filter(dk => !existingSet.has(dk));

  if (missing.length === 0) return;

  // Build date dimension rows for missing dates
  const dateRows = missing.map(dk => {
    const d = new Date(dk);
    if (isNaN(d.getTime())) return null;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      date_key: dk,
      year: d.getFullYear(),
      quarter: Math.floor(d.getMonth() / 3) + 1,
      quarter_label: `Q${Math.floor(d.getMonth() / 3) + 1}`,
      month: d.getMonth() + 1,
      month_label: months[d.getMonth()],
      day_of_week: d.getDay(),
      is_weekend: d.getDay() === 0 || d.getDay() === 6,
    };
  }).filter(Boolean);

  if (dateRows.length > 0) {
    const { error } = await supabase
      .from('sf_dim_date')
      .upsert(dateRows, { onConflict: 'date_key' });
    if (error) {
      console.warn('[upserter] Failed to auto-insert dates:', error.message);
    }
  }
}

/**
 * Transform a single row: add tenant_id, resolve FK names → UUIDs, validate required fields.
 */
function transformRow(row, tenantId, schema, fkCaches) {
  const out = {};

  // Add tenant_id for tenant-scoped tables
  if (schema.tenantScoped) {
    out.tenant_id = tenantId;
  }

  // Copy allowed columns, resolve FKs
  for (const col of schema.columns) {
    const fkRef = schema.fks[col];

    if (fkRef && fkRef.lookupColumn && fkCaches[col]) {
      // FK column: resolve name → UUID
      const lookupValue = row[fkRef.lookupColumn] ?? row[col];
      if (lookupValue == null) {
        out[col] = null;
        continue;
      }

      const cache = fkCaches[col];
      const uuid = cache.get(String(lookupValue));
      if (!uuid) {
        // Only throw for required FK fields. Optional FK misses get null —
        // e.g. employee.job_id when the job is inactive (not in dim_job).
        if (schema.required.includes(col)) {
          throw new Error(`FK lookup failed: ${col} = "${lookupValue}" not found in ${fkRef.table}`);
        }
        out[col] = null;
        continue;
      }
      out[col] = uuid;
    } else if (col === 'date_key') {
      // date_key is passed through as-is (it's its own PK)
      out[col] = row[col] ?? null;
    } else {
      // Regular column
      out[col] = row[col] ?? null;
    }
  }

  // Check required fields
  for (const req of schema.required) {
    const fkRef = schema.fks[req];
    // For FK fields, we resolve to the FK column, not the lookup column
    const value = out[req];
    if (value == null || value === '') {
      // For FK fields, also check the lookup column in the original row
      if (fkRef) {
        const lookupVal = row[fkRef.lookupColumn];
        if (lookupVal != null && lookupVal !== '') continue;
      }
      throw new Error(`Missing required field: ${req}`);
    }
  }

  return out;
}

/**
 * Batch upsert with onConflict clause (for tables with natural keys).
 */
async function batchUpsert(supabase, table, rows, onConflict) {
  let total = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from(table)
      .upsert(batch, { onConflict })
      .select('id');

    if (error) {
      throw new Error(`Upsert batch failed on ${table} (rows ${i}-${i + batch.length}): ${error.message}`);
    }

    total += data?.length ?? batch.length;
  }

  return total;
}

/**
 * Delete all tenant rows for a table, then batch insert (for tables without natural keys).
 */
async function deleteAndInsert(supabase, tenantId, table, rows) {
  // Delete existing tenant rows
  const { error: delError } = await supabase
    .from(table)
    .delete()
    .eq('tenant_id', tenantId);

  if (delError) {
    throw new Error(`Delete before insert failed on ${table}: ${delError.message}`);
  }

  // Batch insert
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from(table)
      .insert(batch)
      .select('id');

    if (error) {
      throw new Error(`Insert batch failed on ${table} (rows ${i}-${i + batch.length}): ${error.message}`);
    }

    total += data?.length ?? batch.length;
  }

  return total;
}
