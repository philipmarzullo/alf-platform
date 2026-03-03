import { Router } from 'express';

const router = Router();

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

function resolveTenanId(req) {
  const { tenant_id } = req.query.tenant_id ? req.query : req.body;
  if (tenant_id && PLATFORM_ROLES.includes(req.user?.role)) return tenant_id;
  return req.tenantId;
}

/**
 * GET /api/sop-assignments?tenant_id=...&sop_step_id=...
 *
 * Fetch assignments, optionally filtered by step.
 */
router.get('/', async (req, res) => {
  const tenantId = resolveTenanId(req);
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  try {
    let query = req.supabase
      .from('tenant_sop_assignments')
      .select(`
        *,
        profiles!assigned_to_user_id(id, name, email, role),
        assigner:profiles!assigned_by(name),
        tenant_sop_steps(id, step_number, step_description, classification, department)
      `)
      .eq('tenant_id', tenantId)
      .order('assigned_at', { ascending: false });

    if (req.query.sop_step_id) {
      query = query.eq('sop_step_id', req.query.sop_step_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ assignments: data || [] });
  } catch (err) {
    console.error('[sop-assignments] Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

/**
 * POST /api/sop-assignments
 *
 * Create an assignment for a step.
 * Body: { tenant_id, sop_step_id, assigned_to_user_id?, assigned_to_role?, assignment_type }
 */
router.post('/', async (req, res) => {
  const { tenant_id, sop_step_id, assigned_to_user_id, assigned_to_role, assignment_type } = req.body;

  const tenantId = PLATFORM_ROLES.includes(req.user?.role) ? tenant_id : req.tenantId;

  if (!tenantId || !sop_step_id || !assignment_type) {
    return res.status(400).json({ error: 'Required: tenant_id, sop_step_id, assignment_type' });
  }

  if (!assigned_to_user_id && !assigned_to_role) {
    return res.status(400).json({ error: 'Must provide assigned_to_user_id or assigned_to_role' });
  }

  // Only admins can assign
  if (!PLATFORM_ROLES.includes(req.user?.role) && !['admin', 'super-admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required to assign steps' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_sop_assignments')
      .insert({
        tenant_id: tenantId,
        sop_step_id,
        assigned_to_user_id: assigned_to_user_id || null,
        assigned_to_role: assigned_to_role || null,
        assignment_type,
        assigned_by: req.user.id,
      })
      .select(`
        *,
        profiles!assigned_to_user_id(id, name, email)
      `)
      .single();

    if (error) {
      // Handle unique constraint violations for owner/reviewer
      if (error.code === '23505') {
        return res.status(409).json({
          error: `This step already has a${assignment_type === 'owner' ? 'n owner' : ' reviewer'} assigned. Remove the existing assignment first.`,
        });
      }
      throw error;
    }

    res.json({ assignment: data });
  } catch (err) {
    console.error('[sop-assignments] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

/**
 * PUT /api/sop-assignments/:id
 *
 * Update an assignment (change user/role).
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { assigned_to_user_id, assigned_to_role } = req.body;

  if (!PLATFORM_ROLES.includes(req.user?.role) && !['admin', 'super-admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_sop_assignments')
      .update({
        assigned_to_user_id: assigned_to_user_id || null,
        assigned_to_role: assigned_to_role || null,
      })
      .eq('id', id)
      .select(`*, profiles!assigned_to_user_id(id, name, email)`)
      .single();

    if (error) throw error;
    res.json({ assignment: data });
  } catch (err) {
    console.error('[sop-assignments] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

/**
 * DELETE /api/sop-assignments/:id
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!PLATFORM_ROLES.includes(req.user?.role) && !['admin', 'super-admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { error } = await req.supabase
      .from('tenant_sop_assignments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[sop-assignments] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

/**
 * GET /api/sop-assignments/coverage?tenant_id=...
 *
 * Returns coverage stats: assigned vs unassigned manual/hybrid steps.
 */
router.get('/coverage', async (req, res) => {
  const tenantId = resolveTenanId(req);
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  try {
    // Fetch all non-automated steps
    const { data: steps, error: stepsErr } = await req.supabase
      .from('tenant_sop_steps')
      .select('id, classification, department')
      .eq('tenant_id', tenantId)
      .in('classification', ['manual', 'hybrid']);

    if (stepsErr) throw stepsErr;

    // Fetch all owner assignments
    const { data: assignments, error: assignErr } = await req.supabase
      .from('tenant_sop_assignments')
      .select('sop_step_id')
      .eq('tenant_id', tenantId)
      .eq('assignment_type', 'owner');

    if (assignErr) throw assignErr;

    const assignedStepIds = new Set((assignments || []).map(a => a.sop_step_id));
    const allSteps = steps || [];

    const unassigned = allSteps.filter(s => !assignedStepIds.has(s.id));
    const byDepartment = {};
    for (const s of unassigned) {
      const dept = s.department || 'unknown';
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    }

    res.json({
      total_steps: allSteps.length,
      assigned: allSteps.length - unassigned.length,
      unassigned: unassigned.length,
      unassigned_by_department: byDepartment,
    });
  } catch (err) {
    console.error('[sop-assignments] Coverage error:', err.message);
    res.status(500).json({ error: 'Failed to compute coverage' });
  }
});

export default router;
