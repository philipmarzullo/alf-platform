import { Router } from 'express';
import { TIER_REGISTRY, TIER_ORDER, getTierDefaults } from '../data/tierRegistry.js';
import { invalidateTenantCache } from './claude.js';

const router = Router();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Caller belongs to the tenant or is a platform admin. */
function requireTenantAccess(req, tenantId) {
  const role = req.user?.role;
  if (role === 'super-admin' || role === 'platform_owner') return true;
  return req.tenantId === tenantId;
}

/** Caller is a platform admin (super-admin or platform_owner). */
function requirePlatformAdmin(req) {
  const role = req.user?.role;
  return role === 'super-admin' || role === 'platform_owner';
}

// ──────────────────────────────────────────────
// GET /:tenantId/subscription
// Current subscription status + usage
// ──────────────────────────────────────────────

router.get('/:tenantId/subscription', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Fetch tenant record
    const { data: tenant, error: tenantErr } = await req.supabase
      .from('alf_tenants')
      .select('plan, is_active, max_users, max_agent_calls_per_month, enabled_modules')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Count agent calls this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resetsAt = nextMonth.toISOString();

    const { count: agentCallsUsed, error: countErr } = await req.supabase
      .from('alf_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('action', 'agent_call')
      .gte('created_at', firstOfMonth);

    if (countErr) {
      console.error('[subscription] Usage count failed:', countErr.message);
    }

    // Count active users
    const { count: activeUserCount, error: userErr } = await req.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('active', true);

    if (userErr) {
      console.error('[subscription] User count failed:', userErr.message);
    }

    const tier = TIER_REGISTRY[tenant.plan] || null;

    res.json({
      plan: tenant.plan,
      plan_label: tier?.label || tenant.plan || 'Unknown',
      is_active: tenant.is_active,
      usage: {
        agent_calls: {
          used: agentCallsUsed || 0,
          limit: tenant.max_agent_calls_per_month,
          resets_at: resetsAt,
        },
        users: {
          active: activeUserCount || 0,
          limit: tenant.max_users,
        },
      },
      enabled_modules: tenant.enabled_modules,
    });
  } catch (err) {
    console.error('[subscription] GET failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// ──────────────────────────────────────────────
// PUT /:tenantId/subscription
// Change tier (platform admin only)
// ──────────────────────────────────────────────

router.put('/:tenantId/subscription', async (req, res) => {
  const { tenantId } = req.params;
  if (!requirePlatformAdmin(req)) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  const { plan } = req.body;
  if (!plan || !TIER_REGISTRY[plan]) {
    return res.status(400).json({ error: `Invalid plan. Must be one of: ${Object.keys(TIER_REGISTRY).join(', ')}` });
  }

  try {
    // Fetch current tenant config
    const { data: tenant, error: fetchErr } = await req.supabase
      .from('alf_tenants')
      .select('plan, enabled_modules, module_config')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const defaults = getTierDefaults(plan);
    const currentPlan = tenant.plan;
    const currentOrder = TIER_ORDER[currentPlan] ?? -1;
    const newOrder = TIER_ORDER[plan];
    const isUpgrade = newOrder > currentOrder;

    let moduleConfig;

    if (isUpgrade) {
      // Upgrade: merge existing config + add new modules from tier defaults
      moduleConfig = { ...(tenant.module_config || {}) };
      for (const mod of defaults.modules) {
        if (!moduleConfig[mod]) {
          moduleConfig[mod] = defaults.moduleConfig[mod];
        }
      }
    } else {
      // Downgrade: rebuild config with only new tier's modules,
      // preserving existing page/action config where overlap exists
      moduleConfig = {};
      const existingConfig = tenant.module_config || {};
      for (const mod of defaults.modules) {
        moduleConfig[mod] = existingConfig[mod] || defaults.moduleConfig[mod];
      }
    }

    const { error: updateErr } = await req.supabase
      .from('alf_tenants')
      .update({
        plan,
        max_users: defaults.maxUsers,
        max_agent_calls_per_month: defaults.maxAgentCalls,
        enabled_modules: defaults.modules,
        module_config: moduleConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) throw updateErr;

    // Invalidate cached limits so enforcement picks up the change immediately
    invalidateTenantCache(tenantId);

    console.log(`[subscription] ${tenantId}: ${currentPlan} → ${plan} (${isUpgrade ? 'upgrade' : 'downgrade'})`);

    res.json({
      success: true,
      plan,
      plan_label: TIER_REGISTRY[plan].label,
      enabled_modules: defaults.modules,
      max_users: defaults.maxUsers,
      max_agent_calls_per_month: defaults.maxAgentCalls,
    });
  } catch (err) {
    console.error('[subscription] PUT failed:', err.message);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// ──────────────────────────────────────────────
// POST /:tenantId/subscription/cancel
// Cancel subscription (platform admin only)
// ──────────────────────────────────────────────

router.post('/:tenantId/subscription/cancel', async (req, res) => {
  const { tenantId } = req.params;
  if (!requirePlatformAdmin(req)) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  try {
    const { error } = await req.supabase
      .from('alf_tenants')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) throw error;

    // Invalidate cache so enforcement blocks calls immediately
    invalidateTenantCache(tenantId);

    console.log(`[subscription] ${tenantId}: cancelled`);
    res.json({ success: true, is_active: false });
  } catch (err) {
    console.error('[subscription] Cancel failed:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
