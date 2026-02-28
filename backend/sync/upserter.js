import { getTableSchema } from './tableSchemas.js';

const BATCH_SIZE = 500;

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

// ─── Internal helpers ───────────────────────────────────────────────────

/**
 * Passthrough — ensures row is plain object (handles csv-parse output).
 */
function row(r) {
  return typeof r === 'object' && r !== null ? r : {};
}

/**
 * Build lookup caches for foreign keys: { lookupValue → uuid }
 */
async function buildFkCaches(supabase, tenantId, schema) {
  const caches = {};

  for (const [fkCol, ref] of Object.entries(schema.fks)) {
    if (fkCol === 'date_key') {
      // date_key is its own PK, no lookup needed
      caches[fkCol] = null;
      continue;
    }

    const lookupCol = ref.lookupColumn;
    let query = supabase.from(ref.table).select(`id, ${lookupCol}`);

    // Scope to tenant if the ref table is tenant-scoped
    const refSchema = getTableSchema(ref.table);
    if (refSchema.tenantScoped) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`FK cache build failed for ${ref.table}: ${error.message}`);

    caches[fkCol] = new Map();
    for (const row of data || []) {
      caches[fkCol].set(String(row[lookupCol]), row.id);
    }
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
        throw new Error(`FK lookup failed: ${col} = "${lookupValue}" not found in ${fkRef.table}`);
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
