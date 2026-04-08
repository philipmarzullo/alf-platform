// ============================================================================
// /api/wc-claims — Workers Comp Claims for the Safety workspace
// ============================================================================
// Powers the tenant Safety workspace's Dashboard (KPIs + chart rollups) and
// Claim Tracker (full table + drawer). Tenant-scoped via the auth middleware
// (req.tenantId, req.user). Platform owners can pass ?tenant_id to override.
// ============================================================================

import { Router } from 'express';

const router = Router();

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];
const ADMIN_ROLES = ['admin', 'super-admin', 'platform_owner'];

/** Resolve effective tenant ID. Platform owners can pass ?tenant_id; everyone
 *  else is locked to their own. */
function resolveTenant(req) {
  let tenantId = req.tenantId;
  if (req.query.tenant_id && PLATFORM_ROLES.includes(req.user?.role)) {
    tenantId = req.query.tenant_id;
  }
  return tenantId;
}

// ----------------------------------------------------------------------------
// GET /api/wc-claims — list claims (with filters + pagination)
// Query params: status, vp, state, year, job_number, injury_cause, search,
//               page, limit
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

  const {
    status, vp, state, year, job_number, injury_cause, search,
    page = '1', limit = '50',
  } = req.query;

  try {
    let query = req.supabase
      .from('wc_claims')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (status) {
      const statuses = String(status).split(',').map(s => s.trim());
      // Tolerant matching: accept "open"/"Open"/"OPEN"
      query = query.in('claim_status', statuses.map(s =>
        s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
      ));
    }
    if (vp) query = query.eq('vp', vp);
    if (state) query = query.eq('accident_state', state);
    if (year) query = query.eq('loss_year', parseInt(year, 10));
    if (job_number) query = query.eq('job_number', parseInt(job_number, 10));
    if (injury_cause) query = query.ilike('injury_cause', `%${injury_cause}%`);
    if (search) {
      const s = String(search).trim();
      query = query.or(
        `employee_name.ilike.%${s}%,claim_number.ilike.%${s}%,job_name.ilike.%${s}%`
      );
    }

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const from = (pg - 1) * lim;
    query = query
      .order('date_of_loss', { ascending: false, nullsFirst: false })
      .range(from, from + lim - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      claims: data || [],
      pagination: { page: pg, limit: lim, total: count || 0 },
    });
  } catch (err) {
    console.error('[wc-claims] List error:', err.message);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/wc-claims/summary — KPI rollup for the dashboard
// Optional filters: vp, state, year, dateFrom, dateTo
// ----------------------------------------------------------------------------
router.get('/summary', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

  const { vp, state, year, dateFrom, dateTo } = req.query;

  try {
    let query = req.supabase
      .from('wc_claims')
      .select('*')
      .eq('tenant_id', tenantId);

    if (vp) query = query.eq('vp', vp);
    if (state) query = query.eq('accident_state', state);
    if (year) query = query.eq('loss_year', parseInt(year, 10));
    if (dateFrom) query = query.gte('date_of_loss', dateFrom);
    if (dateTo) query = query.lte('date_of_loss', dateTo);

    const { data: claims, error } = await query;
    if (error) throw error;

    const all = claims || [];
    const open = all.filter(c => c.claim_status === 'Open');
    const closed = all.filter(c => c.claim_status === 'Closed');
    const nr = all.filter(c => c.claim_status === 'Non-Reportable');

    const oowCount = open.filter(c =>
      (c.work_status || c.ee_status || '').toLowerCase().includes('out of work') ||
      (c.work_status || c.ee_status || '').toLowerCase() === 'oow'
    ).length;
    const lightDutyCount = open.filter(c =>
      (c.work_status || c.ee_status || '').toLowerCase().includes('light')
    ).length;
    const fullDutyCount = open.filter(c => {
      const s = (c.work_status || c.ee_status || '').toLowerCase();
      return s.includes('full duty') || s.includes('returned');
    }).length;

    const totalIncurred = all.reduce((s, c) => s + Number(c.total_incurred || 0), 0);
    const totalPaid = all.reduce((s, c) => s + Number(c.total_paid || 0), 0);
    const outstandingReserve = all.reduce((s, c) => s + Number(c.outstanding_reserve || 0), 0);

    // Group by year
    const byYearMap = {};
    for (const c of all) {
      const y = c.loss_year || 'Unknown';
      if (!byYearMap[y]) byYearMap[y] = { year: y, count: 0, incurred: 0 };
      byYearMap[y].count += 1;
      byYearMap[y].incurred += Number(c.total_incurred || 0);
    }
    const claimsByYear = Object.values(byYearMap)
      .filter(r => r.year !== 'Unknown')
      .sort((a, b) => a.year - b.year);

    // Top sites
    const bySiteMap = {};
    for (const c of all) {
      const job = c.job_name || 'Unknown';
      if (!bySiteMap[job]) bySiteMap[job] = { job_name: job, count: 0, incurred: 0 };
      bySiteMap[job].count += 1;
      bySiteMap[job].incurred += Number(c.total_incurred || 0);
    }
    const topSites = Object.values(bySiteMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top injury types
    const byInjuryMap = {};
    for (const c of all) {
      const k = c.nature_of_injury || c.injury_cause || 'Unknown';
      if (!byInjuryMap[k]) byInjuryMap[k] = { name: k, count: 0 };
      byInjuryMap[k].count += 1;
    }
    const topInjuryTypes = Object.values(byInjuryMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top cost claims
    const topCostClaims = [...all]
      .sort((a, b) => Number(b.total_incurred || 0) - Number(a.total_incurred || 0))
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        claim_number: c.claim_number,
        employee_name: c.employee_name,
        job_name: c.job_name,
        nature_of_injury: c.nature_of_injury,
        total_incurred: Number(c.total_incurred || 0),
      }));

    // Filter values for dropdowns
    const vpValues = [...new Set(all.map(c => c.vp).filter(Boolean))].sort();
    const stateValues = [...new Set(all.map(c => c.accident_state).filter(Boolean))].sort();
    const yearValues = [...new Set(all.map(c => c.loss_year).filter(Boolean))].sort((a, b) => b - a);

    res.json({
      kpis: {
        total_claims: all.length,
        open_count: open.length,
        closed_count: closed.length,
        non_reportable_count: nr.length,
        oow_count: oowCount,
        light_duty_count: lightDutyCount,
        full_duty_count: fullDutyCount,
        total_incurred: totalIncurred,
        total_paid: totalPaid,
        outstanding_reserve: outstandingReserve,
      },
      claimsByYear,
      topSites,
      topInjuryTypes,
      topCostClaims,
      filters: {
        vpValues,
        stateValues,
        yearValues,
      },
    });
  } catch (err) {
    console.error('[wc-claims] Summary error:', err.message);
    res.status(500).json({ error: 'Failed to compute summary' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/wc-claims/lifetime — historical "Since 2008" rollup
// Returns the wc_claims_lifetime_summary row for the tenant, or an empty
// shape if no row has been seeded. This is static aggregate data parsed from
// the historical dashboard report — not derived from wc_claims rows.
// ----------------------------------------------------------------------------
router.get('/lifetime', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

  try {
    const { data, error } = await req.supabase
      .from('wc_claims_lifetime_summary')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({ summary: null });
    }
    res.json({ summary: data });
  } catch (err) {
    console.error('[wc-claims] Lifetime error:', err.message);
    res.status(500).json({ error: 'Failed to fetch lifetime summary' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/wc-claims/:claimId — single claim full detail
// ----------------------------------------------------------------------------
router.get('/:claimId', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });

  try {
    const { data, error } = await req.supabase
      .from('wc_claims')
      .select('*')
      .eq('id', req.params.claimId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Claim not found' });

    res.json({ claim: data });
  } catch (err) {
    console.error('[wc-claims] Get error:', err.message);
    res.status(404).json({ error: 'Claim not found' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/wc-claims — create new claim (admin only)
// ----------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const payload = { ...req.body, tenant_id: tenantId, source: req.body.source || 'manual' };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;
    delete payload.loss_year; // generated

    const { data, error } = await req.supabase
      .from('wc_claims')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ claim: data });
  } catch (err) {
    console.error('[wc-claims] Create error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create claim' });
  }
});

// ----------------------------------------------------------------------------
// PUT /api/wc-claims/:claimId — update claim (admin only)
// ----------------------------------------------------------------------------
router.put('/:claimId', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const payload = { ...req.body };
    delete payload.id;
    delete payload.tenant_id;
    delete payload.created_at;
    delete payload.updated_at;
    delete payload.loss_year;

    const { data, error } = await req.supabase
      .from('wc_claims')
      .update(payload)
      .eq('id', req.params.claimId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Claim not found' });

    res.json({ claim: data });
  } catch (err) {
    console.error('[wc-claims] Update error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update claim' });
  }
});

// ----------------------------------------------------------------------------
// DELETE /api/wc-claims/:claimId — delete claim (admin only)
// ----------------------------------------------------------------------------
router.delete('/:claimId', async (req, res) => {
  const tenantId = resolveTenant(req);
  if (!tenantId) return res.status(400).json({ error: 'No tenant context' });
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { error } = await req.supabase
      .from('wc_claims')
      .delete()
      .eq('id', req.params.claimId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[wc-claims] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete claim' });
  }
});

export default router;
