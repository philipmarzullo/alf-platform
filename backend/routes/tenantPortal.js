import { Router } from 'express';
import { generateFullPortal } from '../lib/generateAll.js';

const router = Router();

/**
 * POST /api/tenant-portal/:tenantId/generate
 * Run full portal generation (workspaces → tools + dashboards).
 * Platform owner only.
 */
router.post('/:tenantId/generate', async (req, res) => {
  if (req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner only' });
  }

  const { tenantId } = req.params;

  try {
    const result = await generateFullPortal(req.supabase, tenantId);
    return res.json({
      success: true,
      workspaces: result.workspaces.length,
      agents: result.agents.length,
      tools: result.tools.length,
      domains: result.domains.length,
      result,
    });
  } catch (err) {
    console.error('[tenant-portal] generate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenant-portal/:tenantId/onboard
 * Create profile from industry template + confirm + generate full portal.
 * Platform owner only.
 */
router.post('/:tenantId/onboard', async (req, res) => {
  if (req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner only' });
  }

  const { tenantId } = req.params;
  const { industry_key } = req.body;

  if (!industry_key) {
    return res.status(400).json({ error: 'industry_key is required' });
  }

  try {
    // 1. Fetch industry template
    const { data: template, error: tplErr } = await req.supabase
      .from('industry_templates')
      .select('template_data')
      .eq('industry_key', industry_key)
      .single();

    if (tplErr || !template) {
      return res.status(404).json({ error: `Industry template not found: ${industry_key}` });
    }

    // 2. Create/update company profile with template data + confirmed status
    const profilePayload = {
      ...template.template_data,
      tenant_id: tenantId,
      profile_status: 'confirmed',
    };

    delete profilePayload.id;
    delete profilePayload.created_at;
    delete profilePayload.updated_at;

    const { data: existing } = await req.supabase
      .from('tenant_company_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let profileResult;
    if (existing) {
      profileResult = await req.supabase
        .from('tenant_company_profiles')
        .update(profilePayload)
        .eq('tenant_id', tenantId)
        .select()
        .single();
    } else {
      profileResult = await req.supabase
        .from('tenant_company_profiles')
        .insert(profilePayload)
        .select()
        .single();
    }

    if (profileResult.error) {
      throw new Error(`Failed to create profile: ${profileResult.error.message}`);
    }

    // 3. Generate full portal
    const result = await generateFullPortal(req.supabase, tenantId);

    return res.json({
      success: true,
      profile: profileResult.data,
      workspaces: result.workspaces.length,
      agents: result.agents.length,
      tools: result.tools.length,
      domains: result.domains.length,
    });
  } catch (err) {
    console.error('[tenant-portal] onboard error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
