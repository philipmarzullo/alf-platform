import { Router } from 'express';
import { extractMemories } from './memory.js';
import { advanceRun } from '../lib/workflowRuntime.js';

const router = Router();

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];
const ADMIN_ROLES = ['admin', 'super-admin', 'platform_owner'];

/**
 * GET /api/user-tasks
 *
 * Fetch tasks for the current user (or all tasks for a tenant if admin).
 * Query: ?tenant_id=...&status=...&user_id=...
 */
router.get('/', async (req, res) => {
  const { tenant_id, status, user_id, limit } = req.query;

  let effectiveTenantId = req.tenantId;
  if (tenant_id && PLATFORM_ROLES.includes(req.user?.role)) {
    effectiveTenantId = tenant_id;
  }

  try {
    let query = req.supabase
      .from('tenant_user_tasks')
      .select(`
        *,
        tenant_sop_steps(step_number, step_description, classification, department,
          tenant_documents!inner(file_name, title)
        ),
        assignee:profiles!user_id(name, email),
        completer:profiles!completed_by(name)
      `)
      .order('created_at', { ascending: false });

    // Scope: admins can see all tasks for a tenant, users see only their own
    if (ADMIN_ROLES.includes(req.user?.role) && effectiveTenantId) {
      query = query.eq('tenant_id', effectiveTenantId);
      if (user_id) query = query.eq('user_id', user_id);
    } else {
      query = query.eq('user_id', req.user.id);
    }

    if (status) query = query.eq('status', status);
    if (limit) query = query.limit(parseInt(limit, 10));

    const { data, error } = await query;
    if (error) throw error;

    res.json({ tasks: data || [] });
  } catch (err) {
    console.error('[user-tasks] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * GET /api/user-tasks/my-work
 *
 * Aggregated "My Work" view for the current user.
 * Returns { agent_handling[], waiting_for_you[], completed[] }.
 */
router.get('/my-work', async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'No tenant context' });
  }

  try {
    // 1. Waiting for you — pending/in_progress tasks
    const { data: waitingTasks, error: waitErr } = await req.supabase
      .from('tenant_user_tasks')
      .select(`
        *,
        tenant_sop_steps(step_number, step_description, classification, department,
          tenant_documents!inner(file_name, title)
        )
      `)
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (waitErr) throw waitErr;

    // 2. Completed — recent
    const { data: completedTasks, error: compErr } = await req.supabase
      .from('tenant_user_tasks')
      .select(`
        *,
        tenant_sop_steps(step_number, step_description, classification, department,
          tenant_documents!inner(file_name, title)
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20);

    if (compErr) throw compErr;

    // 3. Agent is handling — active automated steps in user's departments
    // Find user's department memberships via their assignments
    const { data: userAssignments } = await req.supabase
      .from('tenant_sop_assignments')
      .select('tenant_sop_steps(department)')
      .eq('tenant_id', tenantId)
      .eq('assigned_to_user_id', userId);

    const userDepts = [...new Set(
      (userAssignments || [])
        .map(a => a.tenant_sop_steps?.department)
        .filter(Boolean)
    )];

    let agentHandling = [];
    if (userDepts.length) {
      const { data: autoSteps, error: autoErr } = await req.supabase
        .from('tenant_sop_steps')
        .select(`
          id, step_number, step_description, department,
          tenant_documents!inner(file_name, title),
          automation_actions(id, title, status, agent_key)
        `)
        .eq('tenant_id', tenantId)
        .eq('classification', 'automated')
        .in('department', userDepts)
        .not('automation_action_id', 'is', null);

      if (autoErr) throw autoErr;

      // Only include steps with active automation actions
      agentHandling = (autoSteps || []).filter(
        s => s.automation_actions?.status === 'active'
      );
    }

    res.json({
      agent_handling: agentHandling,
      waiting_for_you: waitingTasks || [],
      completed: completedTasks || [],
    });
  } catch (err) {
    console.error('[user-tasks] My work error:', err.message);
    res.status(500).json({ error: 'Failed to load My Work view' });
  }
});

/**
 * POST /api/user-tasks
 *
 * Create a task (usually called by the system/agent, but also by admins).
 * Body: { tenant_id, user_id, sop_step_id?, sop_assignment_id?, source_type,
 *         source_reference_id?, title, description?, agent_output?, due_date? }
 */
router.post('/', async (req, res) => {
  const {
    tenant_id, user_id, sop_step_id, sop_assignment_id,
    source_type, source_reference_id, title, description,
    agent_output, due_date,
  } = req.body;

  const tenantId = PLATFORM_ROLES.includes(req.user?.role) ? tenant_id : req.tenantId;

  if (!tenantId || !user_id || !source_type || !title) {
    return res.status(400).json({ error: 'Required: tenant_id, user_id, source_type, title' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_user_tasks')
      .insert({
        tenant_id: tenantId,
        user_id,
        sop_step_id: sop_step_id || null,
        sop_assignment_id: sop_assignment_id || null,
        source_type,
        source_reference_id: source_reference_id || null,
        title,
        description: description || null,
        agent_output: agent_output || null,
        due_date: due_date || null,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ task: data });
  } catch (err) {
    console.error('[user-tasks] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PUT /api/user-tasks/:id
 *
 * Update task status, notes, etc.
 * Body: { status?, outcome_notes?, edits_applied? }
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, outcome_notes, edits_applied } = req.body;

  const updates = {};
  if (status) updates.status = status;
  if (outcome_notes !== undefined) updates.outcome_notes = outcome_notes;
  if (edits_applied !== undefined) updates.edits_applied = edits_applied;

  // Set completion metadata
  if (status === 'completed' || status === 'dismissed') {
    updates.completed_at = new Date().toISOString();
    updates.completed_by = req.user.id;
  }

  try {
    const { data: task, error } = await req.supabase
      .from('tenant_user_tasks')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        tenant_sop_steps(step_number, step_description, classification, department)
      `)
      .single();

    if (error) throw error;

    // If this task is linked to a workflow stage, advance the run
    if (status === 'completed' && task.workflow_run_id && task.workflow_step_run_id) {
      const humanOutput = outcome_notes ? { notes: outcome_notes, edits_applied: !!edits_applied } : null;
      advanceRun(req.supabase, task.workflow_run_id, task.workflow_step_run_id, humanOutput, req.user.id)
        .catch(err => console.error('[user-tasks] Advance run error:', err.message));
    }

    // On completion/dismissal, write to tenant_memory for feedback loop
    if (status === 'completed' || status === 'dismissed') {
      const tenantId = task.tenant_id;
      const dept = task.tenant_sop_steps?.department || 'general';

      if (status === 'completed') {
        const editNote = task.edits_applied ? ' (with edits)' : ' (no edits)';
        const memContent = `Task completed${editNote}: "${task.title}". ${outcome_notes || ''}`.trim();
        extractMemories(tenantId, memContent, 'task_completion', task.id, dept);
      }

      if (status === 'dismissed') {
        // Check if this step has a pattern of dismissals
        const { count } = await req.supabase
          .from('tenant_user_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('sop_step_id', task.sop_step_id)
          .eq('status', 'dismissed');

        if (count >= 3) {
          const memContent = `SOP step repeatedly dismissed (${count}x): "${task.tenant_sop_steps?.step_description || task.title}". Consider reclassifying or updating the SOP.`;
          extractMemories(tenantId, memContent, 'task_completion', task.sop_step_id, dept);
        }
      }
    }

    res.json({ task });
  } catch (err) {
    console.error('[user-tasks] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * GET /api/user-tasks/stats?tenant_id=...
 *
 * Task completion stats for admins.
 */
router.get('/stats', async (req, res) => {
  const tenantId = req.query.tenant_id && PLATFORM_ROLES.includes(req.user?.role)
    ? req.query.tenant_id
    : req.tenantId;

  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  try {
    const { data: tasks, error } = await req.supabase
      .from('tenant_user_tasks')
      .select('status, edits_applied, sop_step_id')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    const all = tasks || [];
    const stats = {
      total: all.length,
      pending: all.filter(t => t.status === 'pending').length,
      in_progress: all.filter(t => t.status === 'in_progress').length,
      completed: all.filter(t => t.status === 'completed').length,
      dismissed: all.filter(t => t.status === 'dismissed').length,
      completed_with_edits: all.filter(t => t.status === 'completed' && t.edits_applied).length,
      completed_without_edits: all.filter(t => t.status === 'completed' && !t.edits_applied).length,
    };

    res.json(stats);
  } catch (err) {
    console.error('[user-tasks] Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
