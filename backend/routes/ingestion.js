import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import SnowflakeAlfConnector from '../sync/connectors/SnowflakeAlfConnector.js';
import { runMerge, fetchIngestionLogs } from '../lib/mergeEngine.js';

const router = Router();

// CSV upload: memory storage, 50MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (ext === 'csv') cb(null, true);
    else cb(new Error('Only .csv files are accepted for ingestion'));
  },
});

// ─── Guards ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (role === 'platform_owner') return next();
  if (role === 'super-admin' && userTenantId === targetTenantId) return next();
  return res.status(403).json({ error: 'Platform admin access required' });
}

function requireTenantAccess(req, res, next) {
  const role = req.user?.role;
  const userTenantId = req.user?.tenant_id;
  const targetTenantId = req.params.tenantId;
  if (role === 'platform_owner') return next();
  if (userTenantId === targetTenantId) return next();
  return res.status(403).json({ error: 'Access denied' });
}

router.param('tenantId', validateTenantId);

// ─── POST /:tenantId/upload — CSV upload + MERGE into Snowflake ─────────

router.post('/:tenantId/upload', requirePlatformAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const tenantId = req.params.tenantId;
  const fileName = req.file.originalname;

  let connector;
  try {
    // 1. Find matching ingestion config by filename pattern (case-insensitive includes)
    const { data: configs, error: cfgErr } = await req.supabase
      .from('tenant_ingestion_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return res.status(404).json({ error: 'No active ingestion configs found for this tenant' });
    }

    const fileNameLower = fileName.toLowerCase();
    const matchedConfig = configs.find(c =>
      fileNameLower.includes(c.csv_filename_pattern.toLowerCase())
    );

    if (!matchedConfig) {
      const patterns = configs.map(c => c.csv_filename_pattern).join(', ');
      return res.status(400).json({
        error: `Filename "${fileName}" does not match any configured pattern. Expected patterns: ${patterns}`,
      });
    }

    // 2. Parse CSV
    const csvText = req.file.buffer.toString('utf-8');
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty (no data rows)' });
    }

    // 3. Validate CSV columns match column_mapping keys
    const expectedCols = Object.keys(matchedConfig.column_mapping);
    const actualCols = Object.keys(rows[0]);
    const missing = expectedCols.filter(c => !actualCols.includes(c));
    if (missing.length > 0) {
      return res.status(400).json({
        error: `CSV is missing expected columns: ${missing.join(', ')}`,
        expected: expectedCols,
        actual: actualCols,
      });
    }

    // 4. Connect to ALF Snowflake and run MERGE
    connector = new SnowflakeAlfConnector();
    await connector.connect();

    const result = await runMerge(connector, matchedConfig, rows, tenantId, fileName);

    console.log(
      `[ingestion] ${matchedConfig.config_key}: ${result.rows_upserted}/${result.rows_processed} rows → ${result.table} (${result.duration_ms}ms)`
    );

    res.json(result);
  } catch (err) {
    console.error('[ingestion] Upload error:', err.message);
    res.status(500).json({ error: 'Ingestion failed', details: err.message });
  } finally {
    if (connector) await connector.disconnect();
  }
});

// ─── GET /:tenantId/logs — Recent ingestion logs ────────────────────────

router.get('/:tenantId/logs', requireTenantAccess, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  let connector;

  try {
    connector = new SnowflakeAlfConnector();
    await connector.connect();

    const logs = await fetchIngestionLogs(
      connector, 'ALF_AAEFS', 'WAREHOUSE', req.params.tenantId, limit
    );

    res.json(logs);
  } catch (err) {
    console.error('[ingestion] Logs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch ingestion logs', details: err.message });
  } finally {
    if (connector) await connector.disconnect();
  }
});

// ─── GET /:tenantId/jobs — Jobs from ALF_AAEFS.WAREHOUSE.DIM_JOB ─────────

router.get('/:tenantId/jobs', requireTenantAccess, async (req, res) => {
  let connector;
  try {
    connector = new SnowflakeAlfConnector();
    await connector.connect();
    const rows = await connector.fetchJobs();

    // Snowflake returns UPPER_CASE keys — normalize to snake_case
    let lastLoadedAt = null;
    const jobs = rows.map(r => {
      const loadedAt = r._LOADED_AT || r._loaded_at;
      if (loadedAt && (!lastLoadedAt || loadedAt > lastLoadedAt)) lastLoadedAt = loadedAt;
      const status = String(r.JOB_STATUS ?? r.Job_Status ?? '');
      return {
        job_number: r.JOB_NUMBER ?? r.Job_Number,
        job_name: r.JOB_NAME ?? r.Job_Name,
        job_status: status === '1' ? 'Active' : status === '0' ? 'Inactive' : status,
        company_name: r.COMPANY_NAME ?? r.Company_Name,
        region: r.TIER_1 ?? r.Tier_1,
        manager: r.TIER_3 ?? r.Tier_3,
        vp: r.TIER_8 ?? r.Tier_8,
        supervisor: r.SUPERVISOR_DESCRIPTION ?? r.Supervisor_Description,
        city: r.CITY ?? r.City,
        state: r.STATE ?? r.State,
      };
    });

    res.json({
      count: jobs.length,
      last_loaded_at: lastLoadedAt,
      jobs,
    });
  } catch (err) {
    console.error('[ingestion] Jobs error:', err.message, err.stack?.split('\n')[1]);
    res.status(500).json({ error: 'Failed to fetch jobs', details: err.message });
  } finally {
    if (connector) await connector.disconnect();
  }
});

// ─── GET /:tenantId/configs — Active ingestion configs ──────────────────

router.get('/:tenantId/configs', requireTenantAccess, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('tenant_ingestion_configs')
      .select('*')
      .eq('tenant_id', req.params.tenantId)
      .eq('is_active', true)
      .order('config_key');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[ingestion] Configs error:', err.message);
    res.status(500).json({ error: 'Failed to list ingestion configs' });
  }
});

export default router;
