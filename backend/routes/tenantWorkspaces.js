import { Router } from 'express';
import {
  generateWorkspacesAndAgents,
  regenerateAgentPrompts,
  buildDepartmentPrompt,
  buildCompanyContext,
  buildSharedRules,
} from '../lib/generatePortal.js';

const router = Router();

/** Platform owner guard */
function requirePlatformOwner(req, res, next) {
  if (req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }
  next();
}

/** Admin guard — platform_owner, super-admin, or admin for own tenant */
function requireAdmin(req, res, next) {
  const role = req.user.role;
  const { tenantId } = req.params;
  if (role === 'platform_owner') return next();
  if (['super-admin', 'admin'].includes(role) && req.user.tenant_id === tenantId) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

/**
 * POST /api/tenant-workspaces/:tenantId/generate
 * Generate workspaces + agents from company profile (full rebuild).
 * Platform owner only.
 */
router.post('/:tenantId/generate', requirePlatformOwner, async (req, res) => {
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
 * POST /api/tenant-workspaces/:tenantId/regenerate-prompts
 * Regenerate all agent prompts from latest profile (non-destructive).
 * Platform owner only.
 */
router.post('/:tenantId/regenerate-prompts', requirePlatformOwner, async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await regenerateAgentPrompts(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-workspaces] regenerate-prompts error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tenant-workspaces/:tenantId
 * List all workspaces + agents for a tenant.
 * Admin access.
 */
router.get('/:tenantId', requireAdmin, async (req, res) => {
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
 * POST /api/tenant-workspaces/:tenantId/agents
 * Create a single agent. Admin access.
 * Accepts: name, agent_key, department, system_prompt, knowledge_scopes, workspace_id
 * If system_prompt not provided, auto-generates from company profile.
 */
router.post('/:tenantId/agents', requireAdmin, async (req, res) => {
  const { tenantId } = req.params;
  const { name, agent_key, department, system_prompt, knowledge_scopes, workspace_id } = req.body;

  if (!name || !agent_key) {
    return res.status(400).json({ error: 'name and agent_key are required' });
  }

  try {
    let finalPrompt = system_prompt;

    // Auto-generate system prompt from company profile if not provided
    if (!finalPrompt && department) {
      const [profileRes, tenantRes] = await Promise.all([
        req.supabase
          .from('tenant_company_profiles')
          .select('*')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        req.supabase
          .from('alf_tenants')
          .select('company_name')
          .eq('id', tenantId)
          .single(),
      ]);

      if (profileRes.data && tenantRes.data) {
        const profile = profileRes.data;
        const companyName = tenantRes.data.company_name;
        const dept = (profile.departments || []).find(d => d.key === department);

        if (dept) {
          finalPrompt = buildDepartmentPrompt(profile, dept, companyName);
        } else {
          // Build a generic department prompt for the new department
          finalPrompt = buildDepartmentPrompt(profile, { key: department, name: name.replace(/ Agent$/, '') }, companyName);
        }
      }
    }

    const agentRow = {
      tenant_id: tenantId,
      agent_key,
      name,
      workspace_id: workspace_id || null,
      system_prompt: finalPrompt || null,
      knowledge_scopes: knowledge_scopes || [department || agent_key],
      inject_operational_context: false,
    };

    const { data, error } = await req.supabase
      .from('tenant_agents')
      .insert(agentRow)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ agent: data });
  } catch (err) {
    console.error('[tenant-workspaces] create agent error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant-workspaces/:tenantId/agents/generate-prompt
 * Generate a system prompt for a department without creating the agent.
 * Useful for preview in Agent Factory UI.
 */
router.post('/:tenantId/agents/generate-prompt', requireAdmin, async (req, res) => {
  const { tenantId } = req.params;
  const { department, agent_name } = req.body;

  if (!department) {
    return res.status(400).json({ error: 'department is required' });
  }

  try {
    const [profileRes, tenantRes] = await Promise.all([
      req.supabase
        .from('tenant_company_profiles')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      req.supabase
        .from('alf_tenants')
        .select('company_name')
        .eq('id', tenantId)
        .single(),
    ]);

    if (!profileRes.data || !tenantRes.data) {
      return res.status(404).json({ error: 'Company profile not found' });
    }

    const profile = profileRes.data;
    const companyName = tenantRes.data.company_name;
    const dept = (profile.departments || []).find(d => d.key === department)
      || { key: department, name: agent_name || department };

    const prompt = buildDepartmentPrompt(profile, dept, companyName);
    return res.json({ system_prompt: prompt });
  } catch (err) {
    console.error('[tenant-workspaces] generate-prompt error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant-workspaces/:tenantId/workspaces/:workspaceId
 * Update workspace fields (name, description, icon, dashboard_domains, sort_order).
 * Admin access.
 */
router.put('/:tenantId/workspaces/:workspaceId', requireAdmin, async (req, res) => {
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
 * Toggle workspace active/inactive. Admin access.
 */
router.patch('/:tenantId/workspaces/:workspaceId/toggle', requireAdmin, async (req, res) => {
  const { tenantId, workspaceId } = req.params;
  try {
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
 * Update agent fields (name, system_prompt, model, knowledge_scopes).
 * Admin access.
 */
router.put('/:tenantId/agents/:agentId', requireAdmin, async (req, res) => {
  const { tenantId, agentId } = req.params;
  const { name, system_prompt, model, knowledge_scopes } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (system_prompt !== undefined) updates.system_prompt = system_prompt;
  if (model !== undefined) updates.model = model;
  if (knowledge_scopes !== undefined) updates.knowledge_scopes = knowledge_scopes;

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
 * Toggle agent active/inactive. Admin access.
 */
router.patch('/:tenantId/agents/:agentId/toggle', requireAdmin, async (req, res) => {
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

export default router;
