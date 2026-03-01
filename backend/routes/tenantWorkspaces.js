import { Router } from 'express';
import { generateWorkspacesAndAgents, regenerateAgentPrompts } from '../lib/generatePortal.js';

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
 * POST /api/tenant-workspaces/:tenantId/generate
 * Generate workspaces + agents from company profile (full rebuild).
 */
router.post('/:tenantId/generate', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await generateWorkspacesAndAgents(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-workspaces] generate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tenant-workspaces/:tenantId
 * List all workspaces + agents for a tenant.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const [wsRes, agentsRes] = await Promise.all([
      req.supabase
        .from('tenant_workspaces')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order'),
      req.supabase
        .from('tenant_agents')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at'),
    ]);

    if (wsRes.error) throw new Error(wsRes.error.message);
    if (agentsRes.error) throw new Error(agentsRes.error.message);

    return res.json({
      workspaces: wsRes.data || [],
      agents: agentsRes.data || [],
    });
  } catch (err) {
    console.error('[tenant-workspaces] list error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant-workspaces/:tenantId/workspaces/:workspaceId
 * Update workspace fields (name, description, icon, dashboard_domains, sort_order).
 */
router.put('/:tenantId/workspaces/:workspaceId', async (req, res) => {
  const { tenantId, workspaceId } = req.params;
  const { name, description, icon, dashboard_domains, sort_order } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (dashboard_domains !== undefined) updates.dashboard_domains = dashboard_domains;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  try {
    const { data, error } = await req.supabase
      .from('tenant_workspaces')
      .update(updates)
      .eq('id', workspaceId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ workspace: data });
  } catch (err) {
    console.error('[tenant-workspaces] update workspace error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant-workspaces/:tenantId/workspaces/:workspaceId/toggle
 * Toggle workspace active/inactive.
 */
router.patch('/:tenantId/workspaces/:workspaceId/toggle', async (req, res) => {
  const { tenantId, workspaceId } = req.params;
  try {
    // Fetch current state
    const { data: current, error: fetchErr } = await req.supabase
      .from('tenant_workspaces')
      .select('is_active')
      .eq('id', workspaceId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const { data, error } = await req.supabase
      .from('tenant_workspaces')
      .update({ is_active: !current.is_active })
      .eq('id', workspaceId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ workspace: data });
  } catch (err) {
    console.error('[tenant-workspaces] toggle workspace error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant-workspaces/:tenantId/agents/:agentId
 * Update agent fields (name, system_prompt, model).
 */
router.put('/:tenantId/agents/:agentId', async (req, res) => {
  const { tenantId, agentId } = req.params;
  const { name, system_prompt, model } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (system_prompt !== undefined) updates.system_prompt = system_prompt;
  if (model !== undefined) updates.model = model;

  try {
    const { data, error } = await req.supabase
      .from('tenant_agents')
      .update(updates)
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ agent: data });
  } catch (err) {
    console.error('[tenant-workspaces] update agent error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant-workspaces/:tenantId/agents/:agentId/toggle
 * Toggle agent active/inactive.
 */
router.patch('/:tenantId/agents/:agentId/toggle', async (req, res) => {
  const { tenantId, agentId } = req.params;
  try {
    const { data: current, error: fetchErr } = await req.supabase
      .from('tenant_agents')
      .select('is_active')
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const { data, error } = await req.supabase
      .from('tenant_agents')
      .update({ is_active: !current.is_active })
      .eq('id', agentId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ agent: data });
  } catch (err) {
    console.error('[tenant-workspaces] toggle agent error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant-workspaces/:tenantId/regenerate-prompts
 * Regenerate all agent prompts from latest profile (non-destructive).
 */
router.post('/:tenantId/regenerate-prompts', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await regenerateAgentPrompts(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-workspaces] regenerate-prompts error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
