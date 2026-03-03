import { Router } from 'express';
import { generateTools, regenerateToolPrompts, TOOL_DEFS, INTAKE_SCHEMAS, buildToolPrompt } from '../lib/generateTools.js';

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
 * POST /api/tenant-tools/:tenantId/generate
 * Generate tools from company profile (full rebuild).
 */
router.post('/:tenantId/generate', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await generateTools(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-tools] generate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tenant-tools/:tenantId
 * List all tools for a tenant.
 * Auto-backfills any catalog tools missing from tenant_tools so the
 * admin always sees the full tool catalog regardless of tier.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const { data, error } = await req.supabase
      .from('tenant_tools')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order');

    if (error) throw new Error(error.message);
    let tools = data || [];

    // Auto-backfill missing catalog tools
    const existingKeys = new Set(tools.map(t => t.tool_key));
    const missingDefs = TOOL_DEFS.filter(def => !existingKeys.has(def.tool_key));

    if (missingDefs.length > 0) {
      const [profileRes, tenantRes, wsRes] = await Promise.all([
        req.supabase.from('tenant_company_profiles').select('*').eq('tenant_id', tenantId).maybeSingle(),
        req.supabase.from('alf_tenants').select('company_name').eq('id', tenantId).single(),
        req.supabase.from('tenant_workspaces').select('id, department_key').eq('tenant_id', tenantId),
      ]);

      const profile = profileRes.data;
      const companyName = tenantRes.data?.company_name || '';
      const wsMap = {};
      (wsRes.data || []).forEach(ws => { wsMap[ws.department_key] = ws.id; });

      const newRows = missingDefs.map(def => ({
        tenant_id: tenantId,
        tool_key: def.tool_key,
        name: def.name,
        description: def.description,
        icon: def.icon,
        workspace_id: wsMap[def.dept_key] || wsMap[def.fallback_dept_key] || null,
        agent_key: def.agent_key,
        intake_schema: INTAKE_SCHEMAS[def.tool_key] || [],
        system_prompt: profile ? buildToolPrompt(def.tool_key, profile, companyName) : '',
        output_format: def.output_format,
        max_tokens: def.max_tokens,
        sort_order: def.sort_order,
      }));

      const { data: inserted } = await req.supabase.from('tenant_tools').insert(newRows).select();
      if (inserted) {
        tools = [...tools, ...inserted].sort((a, b) => a.sort_order - b.sort_order);
      }
      console.log(`[tenant-tools] Backfilled ${missingDefs.length} tool(s) for tenant ${tenantId}: ${missingDefs.map(d => d.tool_key).join(', ')}`);
    }

    return res.json({ tools });
  } catch (err) {
    console.error('[tenant-tools] list error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/tenant-tools/:tenantId/:toolId
 * Update tool fields.
 */
router.put('/:tenantId/:toolId', async (req, res) => {
  const { tenantId, toolId } = req.params;
  const { name, description, system_prompt, intake_schema, max_tokens } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (system_prompt !== undefined) updates.system_prompt = system_prompt;
  if (intake_schema !== undefined) updates.intake_schema = intake_schema;
  if (max_tokens !== undefined) updates.max_tokens = max_tokens;

  try {
    const { data, error } = await req.supabase
      .from('tenant_tools')
      .update(updates)
      .eq('id', toolId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ tool: data });
  } catch (err) {
    console.error('[tenant-tools] update error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenant-tools/:tenantId/:toolId/toggle
 * Toggle tool active/inactive.
 */
router.patch('/:tenantId/:toolId/toggle', async (req, res) => {
  const { tenantId, toolId } = req.params;
  try {
    const { data: current, error: fetchErr } = await req.supabase
      .from('tenant_tools')
      .select('is_active')
      .eq('id', toolId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const { data, error } = await req.supabase
      .from('tenant_tools')
      .update({ is_active: !current.is_active })
      .eq('id', toolId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json({ tool: data });
  } catch (err) {
    console.error('[tenant-tools] toggle error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant-tools/:tenantId/regenerate-prompts
 * Regenerate all tool prompts from latest profile (non-destructive).
 */
router.post('/:tenantId/regenerate-prompts', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const result = await regenerateToolPrompts(req.supabase, tenantId);
    return res.json(result);
  } catch (err) {
    console.error('[tenant-tools] regenerate-prompts error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
