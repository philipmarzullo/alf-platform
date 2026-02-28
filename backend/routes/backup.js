import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

// ──────────────────────────────────────────────
// Guard: platform admins only
// ──────────────────────────────────────────────
function requirePlatformAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'super-admin' && role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

router.use(requirePlatformAdmin);

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const EXPORT_TABLES = [
  { key: 'profiles',              table: 'profiles',                select: 'id, name, email, role, title, modules, active, tenant_id, dashboard_template_id, created_at' },
  { key: 'sites',                 table: 'tenant_sites' },
  { key: 'clientContacts',        table: 'client_contacts' },
  { key: 'documents',             table: 'tenant_documents' },
  { key: 'toolSubmissions',       table: 'tool_submissions' },
  { key: 'agentOverrides',        table: 'tenant_agent_overrides' },
  { key: 'sopAnalyses',           table: 'sop_analyses' },
  { key: 'automationRoadmaps',    table: 'dept_automation_roadmaps' },
  { key: 'automationActions',     table: 'automation_actions' },
  { key: 'dashboardConfigs',      table: 'dashboard_configs' },
  { key: 'userDashboardConfigs',  table: 'user_dashboard_configs' },
  { key: 'roleTemplates',         table: 'dashboard_role_templates' },
  { key: 'siteAssignments',       table: 'user_site_assignments' },
  { key: 'qbuSubmissions',        table: 'qbu_submissions' },
  { key: 'qbuIntakeData',         table: 'qbu_intake_data' },
  { key: 'qbuPhotos',             table: 'qbu_photos' },
  { key: 'qbuTestimonials',       table: 'qbu_testimonials' },
  { key: 'customTools',           table: 'tenant_custom_tools' },
];

const PLATFORM_TABLES = [
  { key: 'alf_tenants',            table: 'alf_tenants' },
  { key: 'alf_agent_definitions',  table: 'alf_agent_definitions' },
  { key: 'alf_platform_config',    table: 'alf_platform_config' },
  { key: 'alf_usage_logs',         table: 'alf_usage_logs' },
];

const STORAGE_BUCKET = 'platform-backups';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Paginate Supabase queries that may exceed the 1000-row API limit. */
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** Build the full tenant export payload — reused by GET export and POST export. */
async function buildTenantPayload(sb, tenantId) {
  // Fetch tenant record
  const { data: tenant, error: tenantErr } = await sb
    .from('alf_tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (tenantErr || !tenant) throw new Error('Tenant not found');

  // Fetch all related tables in parallel
  const results = await Promise.all(
    EXPORT_TABLES.map(async ({ key, table, select }) => {
      try {
        const rows = await fetchAllRows(() =>
          sb.from(table).select(select || '*').eq('tenant_id', tenantId)
        );
        return { key, rows };
      } catch (err) {
        console.warn(`[backup] Skipping ${table}: ${err.message}`);
        return { key, rows: [], _skipped: err.message };
      }
    })
  );

  // Assemble payload
  const payload = { exportedAt: new Date().toISOString(), tenant };
  const summary = {};
  let totalRows = 0;

  for (const { key, rows, _skipped } of results) {
    payload[key] = rows;
    summary[key] = _skipped ? `skipped: ${_skipped}` : rows.length;
    if (!_skipped) totalRows += rows.length;
  }
  payload._summary = summary;

  return { payload, summary, totalRows, tenant };
}

/** Upload JSON to Supabase Storage. Returns file size in bytes. */
async function saveToStorage(sb, jsonPayload, storagePath) {
  const jsonStr = JSON.stringify(jsonPayload, null, 2);
  const buffer = Buffer.from(jsonStr, 'utf-8');

  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return buffer.length;
}

/** Insert a row into alf_backups. */
async function recordBackup(sb, { backupType, tenantId, userId, userName, storagePath, fileSize, rowCount, tableSummary }) {
  const { data, error } = await sb
    .from('alf_backups')
    .insert({
      backup_type: backupType,
      tenant_id: tenantId || null,
      triggered_by: userId || null,
      triggered_by_name: userName || null,
      storage_path: storagePath,
      file_size_bytes: fileSize,
      row_count: rowCount,
      table_summary: tableSummary,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record backup: ${error.message}`);
  return data;
}

/** Generate a signed download URL for a storage path. */
async function getSignedUrl(sb, storagePath) {
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error) return null;
  return data.signedUrl;
}

/** Format bytes for display. */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ──────────────────────────────────────────────
// Routes (ordered to avoid Express param conflicts)
// ──────────────────────────────────────────────

/**
 * GET /history
 * Query backup history. Optional filters: ?type=tenant|platform, ?tenantId=, ?limit=
 */
router.get('/history', async (req, res) => {
  const sb = req.supabase;
  const { type, tenantId, limit } = req.query;

  try {
    // Simple count first to verify data exists
    const { count, error: countErr } = await sb
      .from('alf_backups')
      .select('*', { count: 'exact', head: true });
    console.log(`[backup] History: ${count} total rows in alf_backups (countErr: ${countErr?.message || 'none'})`);

    let query = sb
      .from('alf_backups')
      .select('*, tenant:alf_tenants(name, slug)')
      .order('created_at', { ascending: false });

    if (type) query = query.eq('backup_type', type);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (limit) query = query.limit(parseInt(limit, 10));

    const { data, error } = await query;
    console.log(`[backup] History query returned ${data?.length || 0} rows, error: ${error?.message || 'none'}`);
    if (error) throw error;

    // Generate signed download URLs (catch per-row so one bad path doesn't kill the list)
    const rows = await Promise.all(
      (data || []).map(async (row) => {
        try {
          const downloadUrl = await getSignedUrl(sb, row.storage_path);
          return { ...row, downloadUrl };
        } catch {
          return { ...row, downloadUrl: null };
        }
      })
    );

    res.json(rows);
  } catch (err) {
    console.error('[backup] History failed:', err.message, err);
    res.status(500).json({ error: 'Failed to load backup history' });
  }
});

/**
 * DELETE /history/:backupId
 * Delete a backup record and its storage file.
 */
router.delete('/history/:backupId', async (req, res) => {
  const sb = req.supabase;
  const { backupId } = req.params;

  try {
    // Fetch the record
    const { data: backup, error: fetchErr } = await sb
      .from('alf_backups')
      .select('*')
      .eq('id', backupId)
      .single();

    if (fetchErr || !backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Delete from storage (ignore errors — file might already be gone)
    await sb.storage.from(STORAGE_BUCKET).remove([backup.storage_path]);

    // Delete the record
    const { error: deleteErr } = await sb
      .from('alf_backups')
      .delete()
      .eq('id', backupId);

    if (deleteErr) throw deleteErr;

    res.json({ success: true });
  } catch (err) {
    console.error('[backup] Delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

/**
 * Core platform export logic — shared by manual export and scheduled cron.
 * Returns { record, downloadUrl, fileSize, fileSizeFormatted, totalRows, tenantCount }.
 */
async function runPlatformExport(sb, { userId = null, userName = null } = {}) {
  // 1. Fetch all tenants
  const { data: tenants, error: tenantErr } = await sb
    .from('alf_tenants')
    .select('*');

  if (tenantErr) throw tenantErr;

  // 2. Build per-tenant payloads
  const tenantExports = {};
  let totalRows = 0;
  const tenantSummaries = {};

  for (const tenant of (tenants || [])) {
    try {
      const result = await buildTenantPayload(sb, tenant.id);
      tenantExports[tenant.slug || tenant.id] = result.payload;
      tenantSummaries[tenant.slug || tenant.id] = result.summary;
      totalRows += result.totalRows;
    } catch (err) {
      console.warn(`[backup] Skipping tenant ${tenant.name}: ${err.message}`);
      tenantExports[tenant.slug || tenant.id] = { error: err.message };
    }
  }

  // 3. Fetch platform tables
  const platformData = {};
  const platformSummary = {};

  for (const { key, table } of PLATFORM_TABLES) {
    try {
      const rows = await fetchAllRows(() => sb.from(table).select('*'));
      platformData[key] = rows;
      platformSummary[key] = rows.length;
      totalRows += rows.length;
    } catch (err) {
      console.warn(`[backup] Skipping platform table ${table}: ${err.message}`);
      platformData[key] = [];
      platformSummary[key] = `skipped: ${err.message}`;
    }
  }

  // 4. Assemble payload
  const now = new Date();
  const payload = {
    exportedAt: now.toISOString(),
    backupType: 'platform',
    tenantCount: (tenants || []).length,
    tenants: tenantExports,
    platform: platformData,
    _summary: {
      tenants: tenantSummaries,
      platform: platformSummary,
      totalRows,
    },
  };

  // 5. Save to storage
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const storagePath = `platform/full_backup_${dateStr}.json`;
  const fileSize = await saveToStorage(sb, payload, storagePath);

  // 6. Record in alf_backups
  const tableSummary = { tenants: tenantSummaries, platform: platformSummary };
  const record = await recordBackup(sb, {
    backupType: 'platform',
    tenantId: null,
    userId,
    userName: userName || 'scheduled',
    storagePath,
    fileSize,
    rowCount: totalRows,
    tableSummary,
  });

  // 7. Get download URL
  const downloadUrl = await getSignedUrl(sb, storagePath);

  return {
    record,
    downloadUrl,
    fileSize,
    fileSizeFormatted: formatBytes(fileSize),
    totalRows,
    tenantCount: (tenants || []).length,
  };
}

/**
 * Delete exports older than `days` days. Returns count deleted.
 */
async function purgeOldExports(sb, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: old, error: fetchErr } = await sb
    .from('alf_backups')
    .select('id, storage_path')
    .lt('created_at', cutoff);

  if (fetchErr || !old || old.length === 0) return 0;

  // Delete storage files
  const paths = old.map((b) => b.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await sb.storage.from(STORAGE_BUCKET).remove(paths);
  }

  // Delete records
  const ids = old.map((b) => b.id);
  await sb.from('alf_backups').delete().in('id', ids);

  return old.length;
}

/**
 * POST /platform/export
 * Full platform backup — all tenants + platform config tables.
 */
router.post('/platform/export', async (req, res) => {
  try {
    const result = await runPlatformExport(req.supabase, {
      userId: req.user?.id,
      userName: req.user?.name || req.user?.email,
    });

    res.json({ success: true, backup: result.record, ...result });
  } catch (err) {
    console.error('[backup] Platform export failed:', err.message);
    res.status(500).json({ error: 'Platform export failed', detail: err.message });
  }
});

/**
 * GET /:tenantId/summary
 * Returns row counts for each exportable table (unchanged from v1).
 */
router.get('/:tenantId/summary', async (req, res) => {
  const { tenantId } = req.params;
  const sb = req.supabase;

  try {
    const counts = {};
    await Promise.all(
      EXPORT_TABLES.map(async ({ key, table }) => {
        try {
          const { count, error } = await sb
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);
          counts[key] = error ? 0 : (count || 0);
        } catch {
          counts[key] = 0;
        }
      })
    );
    res.json({ tenantId, counts });
  } catch (err) {
    console.error('[backup] Summary failed:', err.message);
    res.status(500).json({ error: 'Summary failed' });
  }
});

/**
 * GET /:tenantId/export
 * Browser download — generates JSON and streams as attachment (unchanged from v1).
 */
router.get('/:tenantId/export', async (req, res) => {
  const { tenantId } = req.params;
  const sb = req.supabase;

  try {
    const { payload, tenant } = await buildTenantPayload(sb, tenantId);

    const slug = (tenant.slug || tenant.name || 'tenant').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${slug}_backup_${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[backup] Export failed:', err.message);
    res.status(500).json({ error: 'Export failed', detail: err.message });
  }
});

/**
 * POST /:tenantId/export
 * Save tenant backup to storage + record in alf_backups. Returns metadata + download URL.
 */
router.post('/:tenantId/export', async (req, res) => {
  const { tenantId } = req.params;
  const sb = req.supabase;

  try {
    const { payload, summary, totalRows, tenant } = await buildTenantPayload(sb, tenantId);

    const slug = (tenant.slug || tenant.name || 'tenant').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const storagePath = `tenants/${slug}/backup_${dateStr}.json`;

    const fileSize = await saveToStorage(sb, payload, storagePath);

    const record = await recordBackup(sb, {
      backupType: 'tenant',
      tenantId,
      userId: req.user?.id,
      userName: req.user?.name || req.user?.email,
      storagePath,
      fileSize,
      rowCount: totalRows,
      tableSummary: summary,
    });

    const downloadUrl = await getSignedUrl(sb, storagePath);

    res.json({
      success: true,
      backup: record,
      downloadUrl,
      fileSize,
      fileSizeFormatted: formatBytes(fileSize),
      totalRows,
    });
  } catch (err) {
    console.error('[backup] Save backup failed:', err.message);
    res.status(500).json({ error: 'Save backup failed', detail: err.message });
  }
});

// ──────────────────────────────────────────────
// Scheduled export — called by Render Cron Job
// ──────────────────────────────────────────────
// Mounted separately in server.js (outside auth middleware)
// Protected by CRON_SECRET bearer token
export async function handleScheduledExport(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    console.log('[backup-cron] Starting scheduled platform export...');
    const result = await runPlatformExport(sb, { userName: 'scheduled' });
    console.log(`[backup-cron] Export complete: ${result.fileSizeFormatted}, ${result.totalRows} rows`);

    // Purge exports older than 30 days
    const purged = await purgeOldExports(sb, 30);
    if (purged > 0) console.log(`[backup-cron] Purged ${purged} exports older than 30 days`);

    res.json({ success: true, ...result, purged });
  } catch (err) {
    console.error('[backup-cron] Scheduled export failed:', err.message);
    res.status(500).json({ error: 'Scheduled export failed', detail: err.message });
  }
}

export default router;
