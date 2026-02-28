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

// All columns returned from GET and upsert
const SELECT_COLS = 'id, tenant_id, agent_key, action_key, integration_type, execution_mode, risk_level, alf_recommended_mode, updated_by, updated_at, total_executions, total_approved_without_edit, auto_promote_eligible, auto_promote_threshold, last_executed_at, promoted_from, promoted_at';

/**
 * GET /:tenantId — List all automation preferences for a tenant.
 */
router.get('/:tenantId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('automation_preferences')
      .select(SELECT_COLS)
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
      .select(SELECT_COLS)
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

/**
 * POST /:tenantId/promote — Accept an auto-promotion recommendation.
 * Body: { agent_key, action_key, integration_type }
 * Changes mode from current → automated, records promoted_from/promoted_at, resets counters.
 */
router.post('/:tenantId/promote', async (req, res) => {
  const { agent_key, action_key, integration_type } = req.body;

  if (!agent_key || !action_key || !integration_type) {
    return res.status(400).json({ error: 'agent_key, action_key, and integration_type are required' });
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('automation_preferences')
      .select(SELECT_COLS)
      .eq('tenant_id', req.params.tenantId)
      .eq('agent_key', agent_key)
      .eq('action_key', action_key)
      .eq('integration_type', integration_type)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Preference not found' });
    }

    if (!existing.auto_promote_eligible) {
      return res.status(400).json({ error: 'Not eligible for auto-promotion' });
    }

    const previousMode = existing.execution_mode;

    const { data, error } = await supabase
      .from('automation_preferences')
      .update({
        execution_mode: 'automated',
        promoted_from: previousMode,
        promoted_at: new Date().toISOString(),
        auto_promote_eligible: false,
        total_approved_without_edit: 0,
        updated_by: req.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(SELECT_COLS)
      .single();

    if (error) throw error;

    // Audit log
    supabase
      .from('credential_audit_logs')
      .insert({
        tenant_id: req.params.tenantId,
        credential_id: null,
        service_type: 'automation_preference',
        action: 'auto_promoted',
        detail: { agent_key, action_key, integration_type, previous_mode: previousMode, new_mode: 'automated' },
        user_id: req.user.id,
        user_name: req.user.name || null,
      })
      .then(({ error: logErr }) => {
        if (logErr) console.warn('[automation-preferences] Audit log failed:', logErr.message);
      });

    console.log(`[automation-preferences] Auto-promoted ${agent_key}:${action_key} from ${previousMode} to automated`);
    res.json(data);
  } catch (err) {
    console.error('[automation-preferences] Promote error:', err.message);
    res.status(500).json({ error: 'Failed to promote' });
  }
});

/**
 * POST /:tenantId/dismiss-promotion — Dismiss an auto-promotion recommendation.
 * Body: { agent_key, action_key, integration_type }
 * Resets the counter and clears eligibility.
 */
router.post('/:tenantId/dismiss-promotion', async (req, res) => {
  const { agent_key, action_key, integration_type } = req.body;

  if (!agent_key || !action_key || !integration_type) {
    return res.status(400).json({ error: 'agent_key, action_key, and integration_type are required' });
  }

  try {
    const { data, error } = await supabase
      .from('automation_preferences')
      .update({
        auto_promote_eligible: false,
        total_approved_without_edit: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', req.params.tenantId)
      .eq('agent_key', agent_key)
      .eq('action_key', action_key)
      .eq('integration_type', integration_type)
      .select(SELECT_COLS)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[automation-preferences] Dismiss error:', err.message);
    res.status(500).json({ error: 'Failed to dismiss promotion' });
  }
});

export default router;

// ─── Exported utility — called by execution layer (future) ───────────────────

/**
 * Record an action execution and update tracking counters.
 * Called by the execution layer when an agent action is sent through an integration.
 *
 * @param {string} tenantId
 * @param {string} agentKey
 * @param {string} actionKey
 * @param {string} integrationType - e.g. 'microsoft_email'
 * @param {boolean} wasEdited - true if the user modified the output before sending
 */
export async function recordActionExecution(tenantId, agentKey, actionKey, integrationType, wasEdited) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Fetch current state
    const { data: pref, error: fetchErr } = await sb
      .from('automation_preferences')
      .select('id, total_executions, total_approved_without_edit, auto_promote_threshold, auto_promote_eligible')
      .eq('tenant_id', tenantId)
      .eq('agent_key', agentKey)
      .eq('action_key', actionKey)
      .eq('integration_type', integrationType)
      .maybeSingle();

    if (fetchErr || !pref) {
      console.warn(`[automation-preferences] No preference found for ${agentKey}:${actionKey}, skipping execution tracking`);
      return;
    }

    const newTotal = (pref.total_executions || 0) + 1;
    const newApproved = wasEdited ? 0 : (pref.total_approved_without_edit || 0) + 1;
    const eligible = !pref.auto_promote_eligible && newApproved >= (pref.auto_promote_threshold || 10);

    const updates = {
      total_executions: newTotal,
      total_approved_without_edit: newApproved,
      last_executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (eligible) {
      updates.auto_promote_eligible = true;
    }

    await sb
      .from('automation_preferences')
      .update(updates)
      .eq('id', pref.id);
  } catch (err) {
    console.error('[automation-preferences] recordActionExecution error:', err.message);
  }
}
