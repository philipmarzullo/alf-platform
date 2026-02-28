import { Router } from 'express';

const router = Router();

/**
 * Guard: only platform admins can export tenant data.
 */
function requirePlatformAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'super-admin' && role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }
  next();
}

router.use(requirePlatformAdmin);

/**
 * Paginate Supabase queries that may exceed the 1000-row API limit.
 */
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

/**
 * Tables to export, keyed by JSON property name.
 * Each entry: { table, select? }
 * All filtered by tenant_id = :tenantId
 */
const EXPORT_TABLES = [
  { key: 'profiles',              table: 'profiles',                select: 'id, name, email, role, department, dashboard_template_id, created_at' },
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
];

/**
 * GET /:tenantId/export
 *
 * Generates a full JSON snapshot of a tenant's data and streams it
 * as a downloadable file.
 */
router.get('/:tenantId/export', async (req, res) => {
  const { tenantId } = req.params;
  const sb = req.supabase;

  try {
    // 1. Fetch the tenant record
    const { data: tenant, error: tenantErr } = await sb
      .from('alf_tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // 2. Fetch all related tables in parallel
    const results = await Promise.all(
      EXPORT_TABLES.map(async ({ key, table, select }) => {
        try {
          const rows = await fetchAllRows(() =>
            sb.from(table).select(select || '*').eq('tenant_id', tenantId)
          );
          return { key, rows };
        } catch (err) {
          // Table might not exist yet — return empty with a note
          console.warn(`[backup] Skipping ${table}: ${err.message}`);
          return { key, rows: [], _skipped: err.message };
        }
      })
    );

    // 3. Assemble the export payload
    const payload = {
      exportedAt: new Date().toISOString(),
      tenant,
    };

    const summary = {};
    for (const { key, rows, _skipped } of results) {
      payload[key] = rows;
      summary[key] = _skipped ? `skipped: ${_skipped}` : rows.length;
    }
    payload._summary = summary;

    // 4. Send as downloadable JSON
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
 * GET /:tenantId/summary
 *
 * Returns row counts for each exportable table (for the Backup tab UI).
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

export default router;
