import { Router } from 'express';
import { generateDashboardDomains, regenerateDashboardDomainKpis } from '../lib/generateDashboards.js';

const router = Router();

/** Platform owner guard */
function requirePlatformOwner(req, res, next) {
  if (req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }
  next();
}

router.use(requirePlatformOwner);

/**
 * POST /api/tenant-dashboard-domains/:tenantId/generate
 * Generate dashboard domains from profile + workspaces (full rebuild).
 */
router.post('/:tenantId/generate', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await generateDashboardDomains(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-dashboard-domains] generate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tenant-dashboard-domains/:tenantId
 * List all dashboard domains for a tenant.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const { data, error } = await req.supabase
      .from('tenant_dashboard_domains')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order');

    if (error) throw new Error(error.message);
    return res.json({ domains: data || [] });
  } catch (err) {
    console.error('[tenant-dashboard-domains] list error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant-dashboard-domains/:tenantId/:domainId
 * Update domain fields (name, description, kpi_definitions).
 */
router.put('/:tenantId/:domainId', async (req, res) => {
  const { tenantId, domainId } = req.params;
  const { name, description, kpi_definitions } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (kpi_definitions !== undefined) updates.kpi_definitions = kpi_definitions;

  try {
    const { data, error } = await req.supabase
      .from('tenant_dashboard_domains')
      .update(updates)
      .eq('id', domainId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ domain: data });
  } catch (err) {
    console.error('[tenant-dashboard-domains] update error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant-dashboard-domains/:tenantId/:domainId/toggle
 * Toggle domain active/inactive.
 */
router.patch('/:tenantId/:domainId/toggle', async (req, res) => {
  const { tenantId, domainId } = req.params;
  try {
    const { data: current, error: fetchErr } = await req.supabase
      .from('tenant_dashboard_domains')
      .select('is_active')
      .eq('id', domainId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const { data, error } = await req.supabase
      .from('tenant_dashboard_domains')
      .update({ is_active: !current.is_active })
      .eq('id', domainId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ domain: data });
  } catch (err) {
    console.error('[tenant-dashboard-domains] toggle error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant-dashboard-domains/:tenantId/regenerate-kpis
 * Regenerate KPI definitions from latest profile (non-destructive).
 */
router.post('/:tenantId/regenerate-kpis', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await regenerateDashboardDomainKpis(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-dashboard-domains] regenerate-kpis error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
