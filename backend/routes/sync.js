import { Router } from 'express';
import multer from 'multer';
import { runSync } from '../sync/runner.js';
import TABLE_SCHEMAS, { getTableNames, getTableSchema } from '../sync/tableSchemas.js';

const router = Router();

// File upload: memory storage, 50MB limit, csv/xlsx/xls only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['csv', 'xlsx', 'xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .csv, .xlsx, and .xls files are accepted'));
    }
  },
});

// ─── Guards ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate tenantId URL param is a well-formed UUID.
 * Prevents garbage strings from reaching Supabase queries.
 */
function validateTenantId(req, res, next) {
  const { tenantId } = req.params;
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return res.status(400).json({ error: 'Invalid tenant ID format' });
  }
  next();
}

function requirePlatformAdmin(req, res, next) {
  const role = req.user?.role;
  const userTenantId = req.user?.tenant_id;
  const targetTenantId = req.params.tenantId;

  // Platform owner can manage any tenant
  if (role === 'platform_owner') return next();

  // Super-admin can only manage their own tenant
  if (role === 'super-admin' && userTenantId === targetTenantId) return next();

  return res.status(403).json({ error: 'Platform admin access required' });
}

function requireTenantAccess(req, res, next) {
  const role = req.user?.role;
  const userTenantId = req.user?.tenant_id;
  const targetTenantId = req.params.tenantId;

  // Platform owner can access any tenant
  if (role === 'platform_owner') return next();

  // Super-admin and regular users can only access their own tenant
  if (userTenantId === targetTenantId) return next();

  return res.status(403).json({ error: 'Access denied' });
}

// Apply UUID validation to all /:tenantId routes
router.param('tenantId', validateTenantId);

// ─── Schema Info Routes (before parameterized routes) ──────────────────

/**
 * GET /tables — List all target table schemas (for UI dropdowns).
 */
router.get('/tables', requirePlatformAdmin, async (req, res) => {
  const tables = {};
  for (const name of getTableNames()) {
    const schema = getTableSchema(name);
    tables[name] = {
      columns: schema.columns,
      required: schema.required,
      hasNaturalKey: !!schema.naturalKey,
      tenantScoped: schema.tenantScoped,
      syncOrder: schema.syncOrder,
    };
  }
  res.json(tables);
});

// ─── Sync Health Check ─────────────────────────────────────────────────

/**
 * GET /:tenantId/health — Sync health status for dashboards.
 * Any authenticated user in the tenant can read this.
 * Returns: { status, credential_active, last_sync_at, last_sync_status, connector_type }
 *
 * Status values:
 *   "no_source"  — no sync_config exists (tenant hasn't configured a data source)
 *   "inactive"   — credential is missing, inactive, or sync_config is deactivated
 *   "stale"      — last successful sync is older than 48 hours
 *   "healthy"    — credential active and recent sync exists
 */
router.get('/:tenantId/health', requireTenantAccess, async (req, res) => {
  const tenantId = req.params.tenantId;
  const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

  try {
    // 1. Check for any sync config
    const { data: configs, error: cfgErr } = await req.supabase
      .from('sync_configs')
      .select('id, connector_type, is_active, last_sync_at, last_sync_status')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    if (cfgErr) throw cfgErr;

    if (!configs) {
      return res.json({ status: 'no_source', credential_active: false, last_sync_at: null });
    }

    const cfg = configs;

    // 2. Check credential status for this connector type
    const { data: cred } = await req.supabase
      .from('tenant_api_credentials')
      .select('is_active')
      .eq('tenant_id', tenantId)
      .eq('service_type', cfg.connector_type)
      .maybeSingle();

    const credentialActive = !!cred?.is_active;

    // 3. If config is deactivated or credential is missing/inactive → "inactive"
    if (!cfg.is_active || !credentialActive) {
      return res.json({
        status: 'inactive',
        credential_active: credentialActive,
        config_active: cfg.is_active,
        connector_type: cfg.connector_type,
        last_sync_at: cfg.last_sync_at,
      });
    }

    // 4. Get last successful sync
    const { data: lastSync } = await req.supabase
      .from('sync_logs')
      .select('completed_at, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSyncAt = lastSync?.completed_at || cfg.last_sync_at || null;
    const isStale = lastSyncAt && (Date.now() - new Date(lastSyncAt).getTime()) > STALE_THRESHOLD_MS;

    return res.json({
      status: isStale ? 'stale' : 'healthy',
      credential_active: true,
      connector_type: cfg.connector_type,
      last_sync_at: lastSyncAt,
    });
  } catch (err) {
    console.error('[sync] Health check error:', err.message);
    res.status(500).json({ error: 'Failed to check sync health' });
  }
});

// ─── Sync Config Routes ────────────────────────────────────────────────

/**
 * GET /:tenantId/configs — List sync configs for a tenant.
 */
router.get('/:tenantId/configs', requireTenantAccess, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('sync_configs')
      .select('*')
      .eq('tenant_id', req.params.tenantId)
      .order('connector_type');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[sync] List configs error:', err.message);
    res.status(500).json({ error: 'Failed to list sync configs' });
  }
});

/**
 * POST /:tenantId/configs — Create or upsert a sync config.
 * Body: { connector_type, label?, config?, tables_to_sync?, schedule?, is_active? }
 */
router.post('/:tenantId/configs', requirePlatformAdmin, async (req, res) => {
  const { connector_type, label, config, tables_to_sync, schedule, is_active } = req.body;

  if (!connector_type) {
    return res.status(400).json({ error: 'connector_type is required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('sync_configs')
      .upsert({
        tenant_id: req.params.tenantId,
        connector_type,
        label: label || 'Default Sync',
        config: config || {},
        tables_to_sync: tables_to_sync || [],
        schedule: schedule || null,
        is_active: is_active !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,connector_type' })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[sync] Create config error:', err.message);
    res.status(500).json({ error: 'Failed to create sync config' });
  }
});

/**
 * PUT /:tenantId/configs/:configId — Update a sync config.
 * Body: { label?, config?, tables_to_sync?, schedule?, is_active? }
 */
router.put('/:tenantId/configs/:configId', requirePlatformAdmin, async (req, res) => {
  const { label, config, tables_to_sync, schedule, is_active } = req.body;

  try {
    const updates = { updated_at: new Date().toISOString() };
    if (label !== undefined) updates.label = label;
    if (config !== undefined) updates.config = config;
    if (tables_to_sync !== undefined) updates.tables_to_sync = tables_to_sync;
    if (schedule !== undefined) updates.schedule = schedule;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await req.supabase
      .from('sync_configs')
      .update(updates)
      .eq('id', req.params.configId)
      .eq('tenant_id', req.params.tenantId)
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[sync] Update config error:', err.message);
    res.status(500).json({ error: 'Failed to update sync config' });
  }
});

/**
 * DELETE /:tenantId/configs/:configId — Delete a sync config.
 */
router.delete('/:tenantId/configs/:configId', requirePlatformAdmin, async (req, res) => {
  try {
    const { error } = await req.supabase
      .from('sync_configs')
      .delete()
      .eq('id', req.params.configId)
      .eq('tenant_id', req.params.tenantId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[sync] Delete config error:', err.message);
    res.status(500).json({ error: 'Failed to delete sync config' });
  }
});

// ─── Sync Execution Routes ─────────────────────────────────────────────

/**
 * POST /:tenantId/test-connection — Test a connector's connectivity.
 * Body: { connector_type, config? }
 */
router.post('/:tenantId/test-connection', requirePlatformAdmin, async (req, res) => {
  const { connector_type, config } = req.body;

  if (!connector_type) {
    return res.status(400).json({ error: 'connector_type is required' });
  }

  try {
    // Dynamically import the connector
    const connectorMap = {
      file_upload: (await import('../sync/connectors/FileUploadConnector.js')).default,
      snowflake: (await import('../sync/connectors/SnowflakeConnector.js')).default,
      generic_sql: (await import('../sync/connectors/SqlConnector.js')).default,
    };

    const ConnectorClass = connectorMap[connector_type];
    if (!ConnectorClass) {
      return res.status(400).json({ error: `Unknown connector type: ${connector_type}` });
    }

    // For Snowflake, resolve credentials
    let credentials = null;
    if (connector_type !== 'file_upload') {
      const { getTenantApiKey } = await import('./credentials.js');
      const credJson = await getTenantApiKey(req.supabase, req.params.tenantId, connector_type);
      if (credJson) {
        try { credentials = JSON.parse(credJson); } catch { credentials = credJson; }
      }
    }

    const connector = new ConnectorClass(req.params.tenantId, config || {}, credentials);
    const result = await connector.testConnection();
    res.json(result);
  } catch (err) {
    console.error('[sync] Test connection error:', err.message);
    res.json({ success: false, message: err.message });
  }
});

/**
 * POST /:tenantId/run — Trigger a manual sync for a tenant.
 * Body: { config_id? } — if omitted, uses the first active config
 */
router.post('/:tenantId/run', requirePlatformAdmin, async (req, res) => {
  const { config_id } = req.body;

  try {
    let syncConfig;

    if (config_id) {
      const { data, error } = await req.supabase
        .from('sync_configs')
        .select('*')
        .eq('id', config_id)
        .eq('tenant_id', req.params.tenantId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Sync config not found' });
      }
      syncConfig = data;
    } else {
      const { data, error } = await req.supabase
        .from('sync_configs')
        .select('*')
        .eq('tenant_id', req.params.tenantId)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'No active sync config found for this tenant' });
      }
      syncConfig = data;
    }

    const result = await runSync(req.supabase, syncConfig, {
      triggeredBy: 'manual',
      userId: req.user.id,
    });

    res.json(result);
  } catch (err) {
    console.error('[sync] Run error:', err.message);
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

/**
 * POST /:tenantId/upload — Upload a CSV or Excel file for ingestion.
 * Form fields: file (multipart), target_table (string)
 */
router.post('/:tenantId/upload', requirePlatformAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const targetTable = req.body.target_table;
  if (!targetTable) {
    return res.status(400).json({ error: 'target_table is required' });
  }

  // Validate target table exists
  const validTables = getTableNames();
  if (!validTables.includes(targetTable)) {
    return res.status(400).json({ error: `Invalid target table: ${targetTable}. Valid: ${validTables.join(', ')}` });
  }

  try {
    const syncConfig = {
      tenant_id: req.params.tenantId,
      connector_type: 'file_upload',
      config: {
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        targetTable,
        column_map: req.body.column_map ? JSON.parse(req.body.column_map) : null,
      },
      tables_to_sync: [targetTable],
    };

    const result = await runSync(req.supabase, syncConfig, {
      triggeredBy: 'upload',
      userId: req.user.id,
      fileName: req.file.originalname,
    });

    res.json(result);
  } catch (err) {
    console.error('[sync] Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ─── Sync Log Routes ───────────────────────────────────────────────────

/**
 * GET /:tenantId/logs — Recent sync logs for a tenant.
 */
router.get('/:tenantId/logs', requireTenantAccess, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  try {
    const { data, error } = await req.supabase
      .from('sync_logs')
      .select('*')
      .eq('tenant_id', req.params.tenantId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[sync] List logs error:', err.message);
    res.status(500).json({ error: 'Failed to list sync logs' });
  }
});

/**
 * GET /:tenantId/logs/:logId — Single sync log detail.
 */
router.get('/:tenantId/logs/:logId', requireTenantAccess, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('sync_logs')
      .select('*')
      .eq('id', req.params.logId)
      .eq('tenant_id', req.params.tenantId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Log not found' });
    res.json(data);
  } catch (err) {
    console.error('[sync] Get log error:', err.message);
    res.status(500).json({ error: 'Failed to get sync log' });
  }
});

export default router;
