/**
 * Schema Profile routes — cron and manual triggers for Snowflake schema profiling.
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { runSchemaProfile } from '../lib/snowflakeSchemaProfiler.js';

const router = Router();

// ── Manual refresh (authenticated) ──
router.post('/refresh', async (req, res) => {
  const tenantId = req.body.tenant_id || req.headers['x-tenant-id'];
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const stats = await runSchemaProfile(sb, tenantId);
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('[schema-profile] Manual refresh failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ── Cron refresh (CRON_SECRET auth) ──
export async function handleSchemaProfileRefresh(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Fetch all active tenants with snowflake_direct enabled
    const { data: tenants, error } = await sb
      .from('alf_tenants')
      .select('id, company_name')
      .eq('snowflake_direct', true)
      .eq('is_active', true);

    if (error) throw error;
    if (!tenants?.length) {
      return res.json({ ok: true, message: 'No Snowflake tenants found', results: [] });
    }

    console.log(`[schema-profile-cron] Refreshing ${tenants.length} tenants`);

    const results = [];
    for (const tenant of tenants) {
      try {
        const stats = await runSchemaProfile(sb, tenant.id);
        results.push({ tenant_id: tenant.id, name: tenant.company_name, status: 'ok', ...stats });
        console.log(`[schema-profile-cron] ${tenant.company_name}: ${stats.char_count} chars`);
      } catch (err) {
        results.push({ tenant_id: tenant.id, name: tenant.company_name, status: 'error', error: err.message });
        console.error(`[schema-profile-cron] ${tenant.company_name} failed:`, err.message);
      }
    }

    res.json({ ok: true, results });
  } catch (err) {
    console.error('[schema-profile-cron] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}
