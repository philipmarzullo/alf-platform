import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Guard: super-admin (own tenant) or platform_owner.
 */
function requireAccess(req, res, next) {
  const role = req.user?.role;
  if (role === 'platform_owner') return next();

  if (role === 'super-admin') {
    const routeTenantId = req.params.tenantId;
    if (req.user.tenant_id === routeTenantId) return next();
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  return res.status(403).json({ error: 'Automation preferences require admin access' });
}

router.use(requireAccess);

/**
 * GET /:tenantId — List all automation preferences for a tenant.
 */
router.get('/:tenantId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('automation_preferences')
      .select('id, tenant_id, agent_key, action_key, integration_type, execution_mode, risk_level, alf_recommended_mode, updated_by, updated_at')
      .eq('tenant_id', req.params.tenantId)
      .order('agent_key');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[automation-preferences] List error:', err.message);
    res.status(500).json({ error: 'Failed to list preferences' });
  }
});

/**
 * PUT /:tenantId — Upsert a single automation preference.
 * Body: { agent_key, action_key, integration_type, execution_mode, risk_level, alf_recommended_mode }
 */
router.put('/:tenantId', async (req, res) => {
  const { agent_key, action_key, integration_type, execution_mode, risk_level, alf_recommended_mode } = req.body;

  if (!agent_key || !action_key || !integration_type || !execution_mode) {
    return res.status(400).json({ error: 'agent_key, action_key, integration_type, and execution_mode are required' });
  }

  const validModes = ['draft', 'review', 'automated'];
  const validRisks = ['low', 'medium', 'high'];
  if (!validModes.includes(execution_mode)) {
    return res.status(400).json({ error: `execution_mode must be one of: ${validModes.join(', ')}` });
  }
  if (risk_level && !validRisks.includes(risk_level)) {
    return res.status(400).json({ error: `risk_level must be one of: ${validRisks.join(', ')}` });
  }

  try {
    // Fetch current value for audit log detail
    const { data: existing } = await supabase
      .from('automation_preferences')
      .select('execution_mode')
      .eq('tenant_id', req.params.tenantId)
      .eq('agent_key', agent_key)
      .eq('action_key', action_key)
      .eq('integration_type', integration_type)
      .maybeSingle();

    const oldMode = existing?.execution_mode || 'draft';

    const { data, error } = await supabase
      .from('automation_preferences')
      .upsert({
        tenant_id: req.params.tenantId,
        agent_key,
        action_key,
        integration_type,
        execution_mode,
        risk_level: risk_level || 'medium',
        alf_recommended_mode: alf_recommended_mode || 'review',
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,agent_key,action_key,integration_type' })
      .select('id, tenant_id, agent_key, action_key, integration_type, execution_mode, risk_level, alf_recommended_mode, updated_at')
      .single();

    if (error) throw error;

    // Audit log (fire-and-forget) — reuses credential_audit_logs table
    if (oldMode !== execution_mode) {
      supabase
        .from('credential_audit_logs')
        .insert({
          tenant_id: req.params.tenantId,
          credential_id: null,
          service_type: 'automation_preference',
          action: 'updated',
          detail: { agent_key, action_key, integration_type, old_mode: oldMode, new_mode: execution_mode, risk_level },
          user_id: req.user.id,
          user_name: req.user.name || null,
        })
        .then(({ error: logErr }) => {
          if (logErr) console.warn('[automation-preferences] Audit log failed:', logErr.message);
        });
    }

    res.json(data);
  } catch (err) {
    console.error('[automation-preferences] Upsert error:', err.message);
    res.status(500).json({ error: 'Failed to save preference' });
  }
});

export default router;
