/**
 * Workflow Runs API
 *
 * Submit workflows, list/view runs, complete/reject stages,
 * cancel runs, reassign stages, configure stages, activate workflows.
 */

import { Router } from 'express';
import { submitWorkflow, advanceRun, cancelRun, reassignStage } from '../lib/workflowRuntime.js';

const router = Router();

const PLATFORM_ROLES = ['platform_owner'];
const ADMIN_ROLES = ['admin', 'super-admin', 'platform_owner'];

function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (ADMIN_ROLES.includes(role)) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

// =========================================================
// WORKFLOW SUBMISSION
// =========================================================

/**
 * POST /api/workflow-runs/:tenantId/submit
 *
 * Submit a new workflow run.
 * Body: { workflow_definition_id, input_data }
 */
router.post('/:tenantId/submit', async (req, res) => {
  const { tenantId } = req.params;
  const { workflow_definition_id, input_data } = req.body;

  if (!workflow_definition_id) {
    return res.status(400).json({ error: 'workflow_definition_id required' });
  }

  // Non-admin users can only submit for their own tenant
  if (!ADMIN_ROLES.includes(req.user?.role) && req.tenantId !== tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const result = await submitWorkflow(
      req.supabase,
      tenantId,
      workflow_definition_id,
      input_data || {},
      req.user.id,
      null // no trigger — manual submission
    );

    if (result.status === 'duplicate') {
      return res.status(409).json(result);
    }

    if (result.status === 'failed') {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('[workflow-runs] Submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit workflow' });
  }
});

// =========================================================
// LIST & VIEW RUNS
// =========================================================

/**
 * GET /api/workflow-runs/:tenantId/runs
 *
 * List workflow runs with filters.
 * Query: ?status=...&workflow_definition_id=...&assigned_to=...&limit=...&offset=...
 */
router.get('/:tenantId/runs', async (req, res) => {
  const { tenantId } = req.params;
  const { status, workflow_definition_id, limit = 50, offset = 0 } = req.query;

  try {
    let query = req.supabase
      .from('workflow_runs')
      .select(`
        *,
        workflow_definitions(name, department, status),
        workflow_triggers(trigger_type),
        submitter:profiles!triggered_by_user(name, email)
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);
    if (workflow_definition_id) query = query.eq('workflow_definition_id', workflow_definition_id);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ runs: data || [], total: count });
  } catch (err) {
    console.error('[workflow-runs] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

/**
 * GET /api/workflow-runs/:tenantId/runs/:runId
 *
 * Full run detail with all stage runs.
 */
router.get('/:tenantId/runs/:runId', async (req, res) => {
  const { tenantId, runId } = req.params;

  try {
    const { data: run, error: runErr } = await req.supabase
      .from('workflow_runs')
      .select(`
        *,
        workflow_definitions(name, department, description, status),
        workflow_triggers(trigger_type, event_source),
        submitter:profiles!triggered_by_user(name, email)
      `)
      .eq('id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (runErr) throw runErr;

    // Fetch stage runs with stage definitions
    const { data: stageRuns, error: stageErr } = await req.supabase
      .from('workflow_stage_runs')
      .select(`
        *,
        workflow_stages(name, description, classification, agent_key, sla_hours, stage_number),
        assignee:profiles!assigned_to(name, email),
        editor:profiles!edited_by(name)
      `)
      .eq('workflow_run_id', runId)
      .order('stage_number');

    if (stageErr) throw stageErr;

    res.json({ run, stages: stageRuns || [] });
  } catch (err) {
    console.error('[workflow-runs] Detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch run detail' });
  }
});

// =========================================================
// STAGE ACTIONS
// =========================================================

/**
 * PATCH /api/workflow-runs/:tenantId/runs/:runId/stages/:stageRunId/complete
 *
 * Complete a stage (human approves/submits).
 * Body: { output?, notes? }
 */
router.patch('/:tenantId/runs/:runId/stages/:stageRunId/complete', async (req, res) => {
  const { tenantId, runId, stageRunId } = req.params;
  const { output, notes } = req.body;

  try {
    // Verify stage belongs to this run and tenant
    const { data: stageRun, error } = await req.supabase
      .from('workflow_stage_runs')
      .select('id, status, assigned_to, workflow_run_id')
      .eq('id', stageRunId)
      .eq('workflow_run_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !stageRun) {
      return res.status(404).json({ error: 'Stage run not found' });
    }

    if (stageRun.status !== 'awaiting_human') {
      return res.status(400).json({ error: `Stage is ${stageRun.status}, not awaiting_human` });
    }

    // Check permissions: assigned user or admin
    if (stageRun.assigned_to !== req.user.id && !ADMIN_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Not assigned to this stage' });
    }

    const humanOutput = output || notes ? { output, notes } : null;
    await advanceRun(req.supabase, runId, stageRunId, humanOutput, req.user.id);

    // Also complete the linked task if exists
    const { data: updatedStageRun } = await req.supabase
      .from('workflow_stage_runs')
      .select('task_id')
      .eq('id', stageRunId)
      .single();

    if (updatedStageRun?.task_id) {
      await req.supabase.from('tenant_user_tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: req.user.id,
        outcome_notes: notes || null,
      }).eq('id', updatedStageRun.task_id);
    }

    res.json({ success: true, message: 'Stage completed, workflow advancing' });
  } catch (err) {
    console.error('[workflow-runs] Complete stage error:', err.message);
    res.status(500).json({ error: 'Failed to complete stage' });
  }
});

/**
 * PATCH /api/workflow-runs/:tenantId/runs/:runId/stages/:stageRunId/reject
 *
 * Reject at a stage (deny an approval, stop workflow).
 * Body: { reason }
 */
router.patch('/:tenantId/runs/:runId/stages/:stageRunId/reject', async (req, res) => {
  const { tenantId, runId, stageRunId } = req.params;
  const { reason } = req.body;

  try {
    const { data: stageRun, error } = await req.supabase
      .from('workflow_stage_runs')
      .select('id, status, assigned_to')
      .eq('id', stageRunId)
      .eq('workflow_run_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !stageRun) {
      return res.status(404).json({ error: 'Stage run not found' });
    }

    if (stageRun.status !== 'awaiting_human') {
      return res.status(400).json({ error: `Stage is ${stageRun.status}, not awaiting_human` });
    }

    if (stageRun.assigned_to !== req.user.id && !ADMIN_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Not assigned to this stage' });
    }

    // Mark stage as failed with rejection reason
    await req.supabase.from('workflow_stage_runs').update({
      status: 'failed',
      error_message: `Rejected: ${reason || 'No reason provided'}`,
      human_edited_output: { decision: 'rejected', reason },
      edited_by: req.user.id,
      edited_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq('id', stageRunId);

    // Cancel the entire run (rejection stops the workflow)
    await cancelRun(req.supabase, runId);

    // Complete the linked task
    const { data: sr } = await req.supabase
      .from('workflow_stage_runs')
      .select('task_id')
      .eq('id', stageRunId)
      .single();

    if (sr?.task_id) {
      await req.supabase.from('tenant_user_tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: req.user.id,
        outcome_notes: `Rejected: ${reason || ''}`,
      }).eq('id', sr.task_id);
    }

    res.json({ success: true, message: 'Stage rejected, workflow cancelled' });
  } catch (err) {
    console.error('[workflow-runs] Reject stage error:', err.message);
    res.status(500).json({ error: 'Failed to reject stage' });
  }
});

/**
 * PATCH /api/workflow-runs/:tenantId/runs/:runId/cancel
 *
 * Cancel a workflow run. Admin or original submitter only.
 */
router.patch('/:tenantId/runs/:runId/cancel', async (req, res) => {
  const { tenantId, runId } = req.params;

  try {
    const { data: run, error } = await req.supabase
      .from('workflow_runs')
      .select('id, triggered_by_user, status')
      .eq('id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'cancelled') {
      return res.status(400).json({ error: `Run is already ${run.status}` });
    }

    // Only admin or original submitter can cancel
    if (run.triggered_by_user !== req.user.id && !ADMIN_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Only admins or the submitter can cancel' });
    }

    await cancelRun(req.supabase, runId);
    res.json({ success: true, message: 'Workflow cancelled' });
  } catch (err) {
    console.error('[workflow-runs] Cancel error:', err.message);
    res.status(500).json({ error: 'Failed to cancel workflow' });
  }
});

/**
 * PATCH /api/workflow-runs/:tenantId/runs/:runId/stages/:stageRunId/reassign
 *
 * Reassign a stage to a different user. Admin only.
 * Body: { user_id }
 */
router.patch('/:tenantId/runs/:runId/stages/:stageRunId/reassign', requireAdmin, async (req, res) => {
  const { tenantId, runId, stageRunId } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id required' });
  }

  try {
    const { data: stageRun } = await req.supabase
      .from('workflow_stage_runs')
      .select('id, status')
      .eq('id', stageRunId)
      .eq('workflow_run_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (!stageRun) {
      return res.status(404).json({ error: 'Stage run not found' });
    }

    if (stageRun.status !== 'awaiting_human') {
      return res.status(400).json({ error: 'Can only reassign stages awaiting human action' });
    }

    await reassignStage(req.supabase, stageRunId, user_id);
    res.json({ success: true, message: 'Stage reassigned' });
  } catch (err) {
    console.error('[workflow-runs] Reassign error:', err.message);
    res.status(500).json({ error: 'Failed to reassign stage' });
  }
});

// =========================================================
// STAGE CONFIGURATION (Admin)
// =========================================================

/**
 * GET /api/workflow-runs/:tenantId/definitions/:defId/stages
 *
 * Get stage configuration for a workflow definition.
 */
router.get('/:tenantId/definitions/:defId/stages', async (req, res) => {
  const { tenantId, defId } = req.params;

  try {
    const { data: stages, error } = await req.supabase
      .from('workflow_stages')
      .select(`
        *,
        workflow_stage_steps(
          id, step_order,
          tenant_sop_steps(id, step_number, step_description, classification, department)
        )
      `)
      .eq('workflow_definition_id', defId)
      .eq('tenant_id', tenantId)
      .order('stage_number');

    if (error) throw error;

    res.json({ stages: stages || [] });
  } catch (err) {
    console.error('[workflow-runs] Get stages error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stages' });
  }
});

/**
 * POST /api/workflow-runs/:tenantId/definitions/:defId/configure-stages
 *
 * Configure (create/replace) stages for a workflow definition.
 * Body: { stages: [{ stage_number, name, description, classification, agent_key, routing_rule, sla_hours, sop_step_ids }] }
 */
router.post('/:tenantId/definitions/:defId/configure-stages', requireAdmin, async (req, res) => {
  const { tenantId, defId } = req.params;
  const { stages } = req.body;

  if (!stages?.length) {
    return res.status(400).json({ error: 'stages array required' });
  }

  try {
    // Verify workflow definition exists
    const { data: def } = await req.supabase
      .from('workflow_definitions')
      .select('id')
      .eq('id', defId)
      .eq('tenant_id', tenantId)
      .single();

    if (!def) {
      return res.status(404).json({ error: 'Workflow definition not found' });
    }

    // Delete existing stages (cascade deletes stage_steps)
    await req.supabase
      .from('workflow_stages')
      .delete()
      .eq('workflow_definition_id', defId);

    // Insert new stages
    const stageInserts = stages.map(s => ({
      tenant_id: tenantId,
      workflow_definition_id: defId,
      stage_number: s.stage_number,
      name: s.name,
      description: s.description || null,
      classification: s.classification || 'automated',
      agent_key: s.agent_key || null,
      routing_rule: s.routing_rule || {},
      sla_hours: s.sla_hours || null,
    }));

    const { data: insertedStages, error: insertErr } = await req.supabase
      .from('workflow_stages')
      .insert(stageInserts)
      .select('id, stage_number');

    if (insertErr) throw insertErr;

    // Map stages to their SOP steps
    const stageStepInserts = [];
    for (const stage of stages) {
      if (!stage.sop_step_ids?.length) continue;

      const dbStage = insertedStages.find(s => s.stage_number === stage.stage_number);
      if (!dbStage) continue;

      for (let i = 0; i < stage.sop_step_ids.length; i++) {
        stageStepInserts.push({
          workflow_stage_id: dbStage.id,
          sop_step_id: stage.sop_step_ids[i],
          step_order: i,
        });
      }
    }

    if (stageStepInserts.length) {
      const { error: stepErr } = await req.supabase
        .from('workflow_stage_steps')
        .insert(stageStepInserts);
      if (stepErr) throw stepErr;
    }

    res.json({ success: true, stages_created: insertedStages.length });
  } catch (err) {
    console.error('[workflow-runs] Configure stages error:', err.message);
    res.status(500).json({ error: 'Failed to configure stages' });
  }
});

/**
 * POST /api/workflow-runs/:tenantId/definitions/:defId/activate
 *
 * Activate a workflow definition. Validates stages and assignments.
 */
router.post('/:tenantId/definitions/:defId/activate', requireAdmin, async (req, res) => {
  const { tenantId, defId } = req.params;

  try {
    // Check stages exist
    const { data: stages, error: stageErr } = await req.supabase
      .from('workflow_stages')
      .select('id, stage_number, classification, agent_key')
      .eq('workflow_definition_id', defId)
      .eq('tenant_id', tenantId);

    if (stageErr) throw stageErr;

    if (!stages?.length) {
      return res.status(400).json({
        error: 'Cannot activate: no stages configured',
        details: 'Configure stages before activating',
      });
    }

    // Validate: automated/hybrid stages need agent_key
    const warnings = [];
    for (const s of stages) {
      if ((s.classification === 'automated' || s.classification === 'hybrid') && !s.agent_key) {
        warnings.push(`Stage ${s.stage_number} is ${s.classification} but has no agent_key`);
      }
    }

    // Activate
    const { error: updateErr } = await req.supabase
      .from('workflow_definitions')
      .update({
        status: 'active',
        activated_at: new Date().toISOString(),
        activated_by: req.user.id,
      })
      .eq('id', defId)
      .eq('tenant_id', tenantId);

    if (updateErr) throw updateErr;

    res.json({
      success: true,
      stages: stages.length,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (err) {
    console.error('[workflow-runs] Activate error:', err.message);
    res.status(500).json({ error: 'Failed to activate workflow' });
  }
});

export default router;
