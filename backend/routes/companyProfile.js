import { Router } from 'express';
import { generateFullPortal } from '../lib/generateAll.js';

const router = Router();

/**
 * GET /api/company-profile/:tenantId
 * Read company profile. Tenant users can read own, platform owner reads any.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  // Access check: platform_owner can read any, tenant users can read own
  if (req.user.role !== 'platform_owner' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_company_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('[company-profile] GET error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // Return null if no profile exists yet (not an error)
    return res.json({ profile: data });
  } catch (err) {
    console.error('[company-profile] GET exception:', err.message);
    return res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

/**
 * PUT /api/company-profile/:tenantId
 * Create or update company profile. Super-admin for own, platform owner for any.
 */
router.put('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  // Access check: platform_owner or super-admin for own tenant
  if (
    req.user.role !== 'platform_owner' &&
    !(req.user.role === 'super-admin' && req.user.tenant_id === tenantId)
  ) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const profileData = req.body;

  // Remove fields that shouldn't be set directly
  delete profileData.id;
  delete profileData.created_at;
  delete profileData.updated_at;

  try {
    // Check if profile exists
    const { data: existing } = await req.supabase
      .from('tenant_company_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let result;

    if (existing) {
      // Update
      result = await req.supabase
        .from('tenant_company_profiles')
        .update(profileData)
        .eq('tenant_id', tenantId)
        .select()
        .single();
    } else {
      // Insert
      result = await req.supabase
        .from('tenant_company_profiles')
        .insert({ ...profileData, tenant_id: tenantId })
        .select()
        .single();
    }

    if (result.error) {
      console.error('[company-profile] PUT error:', result.error.message);
      return res.status(500).json({ error: result.error.message });
    }

    return res.json({ profile: result.data });
  } catch (err) {
    console.error('[company-profile] PUT exception:', err.message);
    return res.status(500).json({ error: 'Failed to save company profile' });
  }
});

/**
 * PATCH /api/company-profile/:tenantId/status
 * Update profile_status (draft → confirmed → enriched).
 */
router.patch('/:tenantId/status', async (req, res) => {
  const { tenantId } = req.params;
  const { profile_status } = req.body;

  if (!['draft', 'confirmed', 'enriched'].includes(profile_status)) {
    return res.status(400).json({ error: 'Invalid status. Must be draft, confirmed, or enriched.' });
  }

  // Access check
  if (
    req.user.role !== 'platform_owner' &&
    !(req.user.role === 'super-admin' && req.user.tenant_id === tenantId)
  ) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_company_profiles')
      .update({ profile_status })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('[company-profile] PATCH status error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // Auto-generate portal on first confirmation/enrichment if no workspaces exist
    let auto_generated = false;
    let generation_result = null;

    if (profile_status === 'confirmed' || profile_status === 'enriched') {
      const { count } = await req.supabase
        .from('tenant_workspaces')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if ((count || 0) === 0) {
        try {
          generation_result = await generateFullPortal(req.supabase, tenantId);
          auto_generated = true;
        } catch (genErr) {
          console.error('[company-profile] auto-generate failed:', genErr.message);
          // Non-fatal — profile status still updated
        }
      }
    }

    return res.json({ profile: data, auto_generated, generation_result });
  } catch (err) {
    console.error('[company-profile] PATCH status exception:', err.message);
    return res.status(500).json({ error: 'Failed to update profile status' });
  }
});

/**
 * PATCH /api/company-profile/:tenantId/checklist
 * Update individual onboarding_checklist items (merge into existing).
 */
router.patch('/:tenantId/checklist', async (req, res) => {
  const { tenantId } = req.params;
  const updates = req.body; // e.g. { profile_confirmed: true }

  // Access check
  if (
    req.user.role !== 'platform_owner' &&
    !(req.user.role === 'super-admin' && req.user.tenant_id === tenantId)
  ) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Fetch current checklist
    const { data: current, error: fetchErr } = await req.supabase
      .from('tenant_company_profiles')
      .select('onboarding_checklist')
      .eq('tenant_id', tenantId)
      .single();

    if (fetchErr) {
      console.error('[company-profile] PATCH checklist fetch error:', fetchErr.message);
      return res.status(500).json({ error: fetchErr.message });
    }

    const merged = { ...(current.onboarding_checklist || {}), ...updates };

    const { data, error } = await req.supabase
      .from('tenant_company_profiles')
      .update({ onboarding_checklist: merged })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('[company-profile] PATCH checklist error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ profile: data });
  } catch (err) {
    console.error('[company-profile] PATCH checklist exception:', err.message);
    return res.status(500).json({ error: 'Failed to update onboarding checklist' });
  }
});

export default router;
