import { Router } from 'express';

const router = Router();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function requireTenantAccess(req, tenantId) {
  const role = req.user?.role;
  if (role === 'super-admin' || role === 'platform_owner') return true;
  return req.tenantId === tenantId;
}

function requireAdmin(req) {
  const role = req.user?.role;
  return ['super-admin', 'platform_owner', 'admin'].includes(role);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ──────────────────────────────────────────────
// CRUD Routes
// ──────────────────────────────────────────────

/**
 * GET /:tenantId
 * List active QBR templates for a tenant.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('qbr_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[qbrTemplates] List failed:', err.message);
    res.status(500).json({ error: 'Failed to list QBR templates' });
  }
});

/**
 * GET /:tenantId/all
 * List ALL QBR templates (including inactive). Admin only.
 */
router.get('/:tenantId/all', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('qbr_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[qbrTemplates] List all failed:', err.message);
    res.status(500).json({ error: 'Failed to list QBR templates' });
  }
});

/**
 * GET /:tenantId/:templateId
 * Get a single QBR template.
 */
router.get('/:tenantId/:templateId', async (req, res) => {
  const { tenantId, templateId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('qbr_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', templateId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'QBR template not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('[qbrTemplates] Get failed:', err.message);
    res.status(500).json({ error: 'Failed to get QBR template' });
  }
});

/**
 * POST /:tenantId
 * Create a new QBR template. Admin only.
 */
router.post('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, description, sections, cover_fields, pptx_settings, agent_instructions, is_default } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('qbr_templates')
      .insert({
        tenant_id: tenantId,
        name,
        description: description || null,
        sections: sections || [],
        cover_fields: cover_fields || {},
        pptx_settings: pptx_settings || {},
        agent_instructions: agent_instructions || null,
        is_default: is_default || false,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A template with this name already exists' });
      }
      throw error;
    }

    console.log(`[qbrTemplates] Created "${name}" for tenant ${tenantId}`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[qbrTemplates] Create failed:', err.message);
    res.status(500).json({ error: 'Failed to create QBR template' });
  }
});

/**
 * PUT /:tenantId/:templateId
 * Update a QBR template. Admin only.
 */
router.put('/:tenantId/:templateId', async (req, res) => {
  const { tenantId, templateId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, description, sections, cover_fields, pptx_settings, agent_instructions, is_default, is_active } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (sections !== undefined) updates.sections = sections;
  if (cover_fields !== undefined) updates.cover_fields = cover_fields;
  if (pptx_settings !== undefined) updates.pptx_settings = pptx_settings;
  if (agent_instructions !== undefined) updates.agent_instructions = agent_instructions;
  if (is_default !== undefined) updates.is_default = is_default;
  if (is_active !== undefined) updates.is_active = is_active;

  try {
    const { data, error } = await req.supabase
      .from('qbr_templates')
      .update(updates)
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'QBR template not found' });

    res.json(data);
  } catch (err) {
    console.error('[qbrTemplates] Update failed:', err.message);
    res.status(500).json({ error: 'Failed to update QBR template' });
  }
});

/**
 * DELETE /:tenantId/:templateId
 * Soft-delete (set is_active = false). Admin only.
 */
router.delete('/:tenantId/:templateId', async (req, res) => {
  const { tenantId, templateId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('qbr_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'QBR template not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('[qbrTemplates] Delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete QBR template' });
  }
});

/**
 * POST /:tenantId/:templateId/duplicate
 * Clone a template. Admin only.
 */
router.post('/:tenantId/:templateId/duplicate', async (req, res) => {
  const { tenantId, templateId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Fetch original
    const { data: original, error: fetchErr } = await req.supabase
      .from('qbr_templates')
      .select('*')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr || !original) {
      return res.status(404).json({ error: 'QBR template not found' });
    }

    // Find a unique name
    let copyName = `${original.name} (Copy)`;
    let attempt = 1;
    while (attempt < 10) {
      const { data: existing } = await req.supabase
        .from('qbr_templates')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', copyName)
        .maybeSingle();

      if (!existing) break;
      attempt++;
      copyName = `${original.name} (Copy ${attempt})`;
    }

    const { data, error } = await req.supabase
      .from('qbr_templates')
      .insert({
        tenant_id: tenantId,
        name: copyName,
        description: original.description,
        sections: original.sections,
        cover_fields: original.cover_fields,
        pptx_settings: original.pptx_settings,
        agent_instructions: original.agent_instructions,
        is_default: false,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[qbrTemplates] Duplicated "${original.name}" → "${copyName}" for tenant ${tenantId}`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[qbrTemplates] Duplicate failed:', err.message);
    res.status(500).json({ error: 'Failed to duplicate QBR template' });
  }
});

export default router;
