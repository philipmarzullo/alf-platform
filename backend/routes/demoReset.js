/**
 * Demo Reset Route
 *
 * POST /api/tenants/:tenantId/demo-reset
 * Platform admin only. Resets volatile data for a demo tenant while
 * preserving tenants, profiles, users, workspaces, agents, tools, and domains.
 */

import { Router } from 'express';
import { DEMO_SLUGS, DEMO_TENANTS } from '../data/demoTenants.js';
import { seedOperationalData, seedKnowledgeDocs } from '../lib/demoSeed.js';
import { seedAutomationInsights } from '../lib/seedAutomationData.js';

const router = Router();

// Tables to clear on reset (volatile / demo-generated data)
const VOLATILE_TABLES = [
  'alf_usage_logs',
  'tool_submissions',
  'qbu_submissions',
  'qbu_intake_data',
  'qbu_photos',
  'qbu_testimonials',
  'automation_preferences',
  'sop_analyses',
  'dept_automation_roadmaps',
  'automation_actions',
  'tenant_agent_overrides',
  'tenant_memory',
  'tenant_custom_tools',
  'sync_configs',
];

router.post('/:tenantId/demo-reset', async (req, res) => {
  // Platform admin only
  if (req.user.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform admin only' });
  }

  const { tenantId } = req.params;

  try {
    // Fetch tenant and validate it's a demo tenant
    const { data: tenant, error: fetchErr } = await req.supabase
      .from('alf_tenants')
      .select('id, slug, company_name, plan')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (!DEMO_SLUGS.has(tenant.slug)) {
      return res.status(400).json({ error: `Tenant "${tenant.slug}" is not a demo tenant` });
    }

    console.log(`[demo-reset] Starting reset for ${tenant.company_name} (${tenant.slug})`);

    // Find the tenant definition for this slug
    const tenantDef = DEMO_TENANTS.find(t => t.slug === tenant.slug);
    if (!tenantDef) {
      return res.status(500).json({ error: 'Tenant definition not found' });
    }

    // 1. Clear volatile tables
    const cleared = [];
    for (const table of VOLATILE_TABLES) {
      const { error } = await req.supabase
        .from(table)
        .delete()
        .eq('tenant_id', tenantId);
      if (error) {
        // Some tables may not exist or have no data — warn but continue
        console.warn(`[demo-reset] Clear ${table}: ${error.message}`);
      } else {
        cleared.push(table);
      }
    }
    console.log(`[demo-reset] Cleared ${cleared.length} volatile tables`);

    // 2. Restore operational data (sf_* tables)
    await seedOperationalData(req.supabase, tenantId, tenantDef);

    // 3. Restore knowledge docs
    if (tenantDef.knowledgeDocs.length > 0) {
      await seedKnowledgeDocs(req.supabase, tenantId, tenantDef.knowledgeDocs);
    }

    // 4. Restore automation / intelligence data
    await seedAutomationInsights(req.supabase, tenantId, tenantDef);

    // 5. Restore sync config (suppresses "Connect data source" banner)
    await req.supabase.from('sync_configs').insert({
      tenant_id: tenantId,
      connector_type: 'file_upload',
      is_active: true,
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'success',
    });
    await req.supabase.from('tenant_api_credentials').upsert({
      tenant_id: tenantId,
      service_type: 'file_upload',
      credential_label: 'Demo Seed Data',
      encrypted_key: 'demo_seed_not_a_real_key',
      key_hint: 'demo****',
      is_active: true,
    }, { onConflict: 'tenant_id,service_type' });

    console.log(`[demo-reset] Reset complete for ${tenant.company_name}`);

    res.json({
      success: true,
      tenant: tenant.company_name,
      cleared_tables: cleared,
      message: `Demo reset complete. Operational data and knowledge docs restored.`,
    });
  } catch (err) {
    console.error('[demo-reset] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
