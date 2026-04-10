// backend/routes/opsWorkspace.js
// Operations Workspace — live Snowflake queries for VP/Manager summary,
// workforce, quality, and financial KPIs.

import { Router } from 'express';
import { getConnector, fq } from '../lib/snowflakeDashboards.js';

const router = Router();

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

function resolveEffectiveTenantId(req, paramTenantId) {
  if (PLATFORM_ROLES.includes(req.user?.role)) {
    return paramTenantId || req.tenantId;
  }
  return req.tenantId;
}

// ── Bind helpers ─────────────────────────────────────────────────────────────

function addDateFilters(col, { startDate, endDate }, binds) {
  const parts = [];
  if (startDate) { binds.push(startDate);            parts.push(`${col} >= :${binds.length}`); }
  if (endDate)   { binds.push(endDate + ' 23:59:59'); parts.push(`${col} <= :${binds.length}`); }
  return parts;
}

function addJobTierFilters(alias, { vp, manager }, binds) {
  const parts = [];
  if (vp && vp !== 'all')      { binds.push(vp);      parts.push(`${alias}.JOB_TIER_08_CURRENT_VALUE_LABEL = :${binds.length}`); }
  if (manager && manager !== 'all') { binds.push(manager); parts.push(`${alias}.JOB_TIER_03_CURRENT_VALUE_LABEL = :${binds.length}`); }
  return parts;
}

// ─── GET /:tenantId/filter-options ───────────────────────────────────────────

router.get('/:tenantId/filter-options', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const sql = `
      SELECT DISTINCT
        j.JOB_TIER_08_CURRENT_VALUE_LABEL AS vp,
        j.JOB_TIER_03_CURRENT_VALUE_LABEL AS manager,
        j.JOB_TIER_01_CURRENT_VALUE_LABEL AS region
      FROM ${prefix}.DIM_JOB j
      WHERE j.JOB_COMPANY_NAME = :1
        AND j.JOB_TIER_08_CURRENT_VALUE_LABEL IS NOT NULL
        AND j.JOB_TIER_08_CURRENT_VALUE_LABEL != ''
      ORDER BY vp, manager
    `;

    const rows = await connector.queryView(sql, binds);

    const vps = [...new Set(rows.map(r => r.vp).filter(Boolean))].sort();
    const managers = rows
      .filter(r => r.manager)
      .map(r => ({ manager: r.manager, vp: r.vp, region: r.region }));
    const regions = [...new Set(rows.map(r => r.region).filter(Boolean))].sort();

    res.json({ vps, managers, regions });
  } catch (err) {
    console.error('ops-workspace filter-options error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/vp-summary ───────────────────────────────────────────────

router.get('/:tenantId/vp-summary', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, threshold = 50 } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
      `j.JOB_TIER_08_CURRENT_VALUE_LABEL IS NOT NULL`,
      `c.CHECKPOINT_TEMPLATE_TYPE_LABEL = 'Inspection'`,
      `c.CHECKPOINT_TEMPLATE_DESCRIPTION NOT IN (
        'DO NOT USE - INACTIVE',
        'Property Received',
        'Medical Inspection',
        'Tesla Daily/Nightly Report',
        'LIU Daily/Nightly Report',
        'Byte Dance Daily/Nightly Report',
        'Honda Employee Use Only',
        'CIMS Self-Audit'
      )`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager }, binds));

    const sql = `
      SELECT
        j.JOB_TIER_08_CURRENT_VALUE_LABEL                        AS vp,
        COUNT(DISTINCT c.JOB_KEY)                                AS job_count,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS safety_insp_count,
        ROUND(AVG(CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_SCORE_PERCENT END), 1)            AS safety_pct,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS commercial_insp_count,
        ROUND(AVG(CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_SCORE_PERCENT END), 1)            AS commercial_pct,

        SUM(c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY)                AS total_deficiencies,
        SUM(c.CHECKPOINT_DEFICIENT_ITEM_OPEN_QUANTITY)           AS open_deficiencies,
        SUM(c.CHECKPOINT_DEFICIENT_ITEM_CLOSED_QUANTITY)         AS closed_deficiencies,

        COUNT(DISTINCT CASE WHEN c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 1
              THEN c.JOB_KEY END)                                 AS sites_below_objective,

        ROUND(
          NULLIF(SUM(c.CHECKPOINT_DEFICIENT_ITEM_CLOSED_QUANTITY), 0) /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY > 0
            THEN c.CHECKPOINT_ID END), 0)
        , 1)                                                      AS avg_close_days

      FROM ${prefix}.FACT_CHECKPOINT c
      JOIN ${prefix}.DIM_JOB j ON c.JOB_KEY = j.JOB_KEY
      JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = c.CHECKPOINT_PERFORMED_DATE_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.JOB_TIER_08_CURRENT_VALUE_LABEL
      ORDER BY vp
    `;

    const rows = await connector.queryView(sql, binds);

    const result = rows.map(r => ({
      vp:                  r.vp,
      jobCount:            Number(r.job_count) || 0,
      safetyInspCount:     Number(r.safety_insp_count) || 0,
      safetyPct:           r.safety_pct != null ? Number(r.safety_pct) : null,
      commercialInspCount: Number(r.commercial_insp_count) || 0,
      commercialPct:       r.commercial_pct != null ? Number(r.commercial_pct) : null,
      totalDeficiencies:   Number(r.total_deficiencies) || 0,
      openDeficiencies:    Number(r.open_deficiencies) || 0,
      closedDeficiencies:  Number(r.closed_deficiencies) || 0,
      sitesBelowObjective: Number(r.sites_below_objective) || 0,
      avgCloseDays:        r.avg_close_days != null ? Number(r.avg_close_days) : null,
      // Pending data share expansion
      incidents:   null,
      goodSaves:   null,
      compliments: null,
    }));

    res.json({ rows: result, threshold: Number(threshold) });
  } catch (err) {
    console.error('ops-workspace vp-summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/manager-summary ──────────────────────────────────────────

router.get('/:tenantId/manager-summary', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, threshold = 50 } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
      `j.JOB_TIER_03_CURRENT_VALUE_LABEL IS NOT NULL`,
      `c.CHECKPOINT_TEMPLATE_TYPE_LABEL = 'Inspection'`,
      `c.CHECKPOINT_TEMPLATE_DESCRIPTION NOT IN (
        'DO NOT USE - INACTIVE',
        'Property Received',
        'Medical Inspection',
        'Tesla Daily/Nightly Report',
        'LIU Daily/Nightly Report',
        'Byte Dance Daily/Nightly Report',
        'Honda Employee Use Only',
        'CIMS Self-Audit'
      )`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager }, binds));

    const sql = `
      SELECT
        j.JOB_TIER_03_CURRENT_VALUE_LABEL                        AS manager,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL                        AS vp,
        j.JOB_TIER_01_CURRENT_VALUE_LABEL                        AS region,
        COUNT(DISTINCT c.JOB_KEY)                                AS job_count,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS safety_insp_count,
        ROUND(AVG(CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_SCORE_PERCENT END), 1)            AS safety_pct,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS commercial_insp_count,
        ROUND(AVG(CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_SCORE_PERCENT END), 1)            AS commercial_pct,

        SUM(c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY)                AS total_deficiencies,
        SUM(c.CHECKPOINT_DEFICIENT_ITEM_OPEN_QUANTITY)           AS open_deficiencies,
        COUNT(DISTINCT CASE WHEN c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 1
              THEN c.JOB_KEY END)                                 AS sites_below_objective,
        ROUND(
          NULLIF(SUM(c.CHECKPOINT_DEFICIENT_ITEM_CLOSED_QUANTITY), 0) /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY > 0
            THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS avg_close_days

      FROM ${prefix}.FACT_CHECKPOINT c
      JOIN ${prefix}.DIM_JOB j ON c.JOB_KEY = j.JOB_KEY
      JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = c.CHECKPOINT_PERFORMED_DATE_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.JOB_TIER_03_CURRENT_VALUE_LABEL, j.JOB_TIER_08_CURRENT_VALUE_LABEL, j.JOB_TIER_01_CURRENT_VALUE_LABEL
      ORDER BY manager
    `;

    const rows = await connector.queryView(sql, binds);

    const result = rows.map(r => ({
      manager:             r.manager,
      vp:                  r.vp,
      region:              r.region,
      jobCount:            Number(r.job_count) || 0,
      safetyInspCount:     Number(r.safety_insp_count) || 0,
      safetyPct:           r.safety_pct != null ? Number(r.safety_pct) : null,
      commercialInspCount: Number(r.commercial_insp_count) || 0,
      commercialPct:       r.commercial_pct != null ? Number(r.commercial_pct) : null,
      totalDeficiencies:   Number(r.total_deficiencies) || 0,
      openDeficiencies:    Number(r.open_deficiencies) || 0,
      sitesBelowObjective: Number(r.sites_below_objective) || 0,
      avgCloseDays:        r.avg_close_days != null ? Number(r.avg_close_days) : null,
      incidents:   null,
      goodSaves:   null,
      compliments: null,
    }));

    res.json({ rows: result, threshold: Number(threshold) });
  } catch (err) {
    console.error('ops-workspace manager-summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/workforce-kpis ───────────────────────────────────────────

router.get('/:tenantId/workforce-kpis', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);

    // ── Active headcount (FACT_EMPLOYEE_WORKFORCE_DAILY) ──
    // Matches turnover query pattern in snowflakeDashboards.js:
    //   DATE_KEY → DIM_DATE join, PRIMARY_JOB_KEY, IS_ACTIVE_FLAG
    const hcBinds = [config.company_filter];
    const hcCond = [
      `w.PRIMARY_JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
      `w.IS_ACTIVE_FLAG = 1`,
    ];
    hcCond.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, hcBinds));
    // VP/Manager filtering via subquery on DIM_JOB
    const hcTierParts = [];
    if (vp && vp !== 'all')      { hcBinds.push(vp);      hcTierParts.push(`j2.JOB_TIER_08_CURRENT_VALUE_LABEL = :${hcBinds.length}`); }
    if (manager && manager !== 'all') { hcBinds.push(manager); hcTierParts.push(`j2.JOB_TIER_03_CURRENT_VALUE_LABEL = :${hcBinds.length}`); }
    const hcTierJoin = hcTierParts.length
      ? `JOIN ${prefix}.DIM_JOB j2 ON j2.JOB_KEY = w.PRIMARY_JOB_KEY AND ${hcTierParts.join(' AND ')}`
      : '';

    const headcountSql = `
      SELECT COUNT(DISTINCT w.EMPLOYEE_KEY) AS active_headcount
      FROM ${prefix}.FACT_EMPLOYEE_WORKFORCE_DAILY w
      JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = w.DATE_KEY
      ${hcTierJoin}
      WHERE ${hcCond.join(' AND ')}
    `;

    // ── Turnover (FACT_EMPLOYEE_STATUS_HISTORY + DIM_EMPLOYEE_STATUS) ──
    const toBinds = [config.company_filter, config.company_filter];
    const toCond = [
      `h.TENANT_ID = :1`,
      `j.TENANT_ID = :2`,
    ];
    if (startDate) { toBinds.push(startDate); toCond.push(`h.EMPLOYEE_EVENT_EFFECTIVE_FROM_TIMESTAMP >= :${toBinds.length}`); }
    if (endDate)   { toBinds.push(endDate);   toCond.push(`h.EMPLOYEE_EVENT_EFFECTIVE_FROM_TIMESTAMP <= :${toBinds.length}`); }
    toCond.push(...addJobTierFilters('j', { vp, manager }, toBinds));

    const turnoverSql = `
      SELECT
        COUNT(DISTINCT CASE
          WHEN es.EMPLOYEE_STATUS_LABEL ILIKE '%terminat%'
            OR es.EMPLOYEE_STATUS_LABEL ILIKE '%inactive%'
          THEN h.EMPLOYEE_KEY END)     AS terminations,
        COUNT(DISTINCT h.EMPLOYEE_KEY) AS total_employees
      FROM ${prefix}.FACT_EMPLOYEE_STATUS_HISTORY h
      JOIN ${prefix}.DIM_EMPLOYEE_STATUS es ON h.EMPLOYEE_STATUS_KEY = es.EMPLOYEE_STATUS_KEY
      JOIN ${prefix}.DIM_JOB j ON h.PRIMARY_JOB_KEY = j.JOB_KEY
      WHERE ${toCond.join(' AND ')}
    `;

    // ── Overtime % (FACT_TIMEKEEPING — dedicated OT/DT columns) ──
    const otBinds = [config.company_filter, config.company_filter];
    const otCond = [`t.TENANT_ID = :1`, `j.TENANT_ID = :2`];
    otCond.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, otBinds));
    otCond.push(...addJobTierFilters('j', { vp, manager }, otBinds));

    const otSql = `
      SELECT
        SUM(t.TIMEKEEPING_OVERTIME_HOURS + t.TIMEKEEPING_DOUBLETIME_HOURS) AS ot_hours,
        SUM(t.TIMEKEEPING_TOTAL_HOURS)                                      AS total_hours,
        SUM(t.TIMEKEEPING_OVERTIME_DOLLAR_AMOUNT
          + t.TIMEKEEPING_DOUBLETIME_DOLLAR_AMOUNT)                         AS ot_dollars,
        SUM(t.TIMEKEEPING_TOTAL_DOLLAR_AMOUNT)                              AS total_dollars
      FROM ${prefix}.FACT_TIMEKEEPING t
      JOIN ${prefix}.DIM_DATE d ON t.WORK_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON t.JOB_KEY = j.JOB_KEY
      WHERE ${otCond.join(' AND ')}
    `;

    // ── Absenteeism (FACT_EMPLOYEE_ABSENCE — direct ABSENCE_DATE) ──
    const absBinds = [config.company_filter, config.company_filter];
    const absCond = [`a.TENANT_ID = :1`, `j.TENANT_ID = :2`];
    if (startDate) { absBinds.push(startDate); absCond.push(`a.ABSENCE_DATE >= :${absBinds.length}`); }
    if (endDate)   { absBinds.push(endDate);   absCond.push(`a.ABSENCE_DATE <= :${absBinds.length}`); }
    absCond.push(...addJobTierFilters('j', { vp, manager }, absBinds));

    const absenceSql = `
      SELECT
        COUNT(DISTINCT CASE WHEN a.IS_ABSENT_UNEXCUSED_FLAG = 1
              THEN a.EMPLOYEE_KEY END)          AS unexcused_absences,
        COUNT(DISTINCT a.EMPLOYEE_KEY)          AS employees_with_absences,
        SUM(a.ABSENCE_TOTAL_HOURS)              AS total_absence_hours
      FROM ${prefix}.FACT_EMPLOYEE_ABSENCE a
      JOIN ${prefix}.DIM_JOB j ON a.JOB_KEY = j.JOB_KEY
      WHERE ${absCond.join(' AND ')}
    `;

    const [hcRows, toRows, otRows, absRows] = await Promise.all([
      connector.queryView(headcountSql, hcBinds),
      connector.queryView(turnoverSql, toBinds),
      connector.queryView(otSql, otBinds),
      connector.queryView(absenceSql, absBinds),
    ]);

    const hc   = hcRows[0]  || {};
    const to   = toRows[0]  || {};
    const ot   = otRows[0]  || {};
    const abs  = absRows[0] || {};

    const totalEmployees = Number(to.total_employees) || 0;
    const terminations   = Number(to.terminations)    || 0;
    const otHours        = Number(ot.ot_hours)        || 0;
    const totalHours     = Number(ot.total_hours)     || 0;

    const hasTurnoverData = totalEmployees > 0;
    const hasOvertimeData = totalHours > 0;
    const hasAbsenceData  = (Number(abs.employees_with_absences) || 0) > 0;

    res.json({
      activeHeadcount:    Number(hc.active_headcount) || 0,
      turnoverRate:       totalEmployees ? Math.round((terminations / totalEmployees) * 100 * 10) / 10 : 0,
      overtimePct:        totalHours     ? Math.round((otHours / totalHours) * 100 * 10) / 10         : 0,
      unexcusedAbsences:  Number(abs.unexcused_absences) || 0,
      totalAbsenceHours:  Math.round(Number(abs.total_absence_hours) || 0),
      terminations,
      totalHours:         Math.round(totalHours),
      hasTurnoverData,
      hasOvertimeData,
      hasAbsenceData,
      dataNote: (!hasTurnoverData && !hasOvertimeData && !hasAbsenceData)
        ? 'No activity in selected period' : null,
    });
  } catch (err) {
    console.error('ops-workspace workforce-kpis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/quality-kpis ─────────────────────────────────────────────

router.get('/:tenantId/quality-kpis', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager }, binds));

    const sql = `
      SELECT
        ROUND(AVG(c.CHECKPOINT_SCORE_PERCENT), 1)              AS avg_score,
        COUNT(DISTINCT c.CHECKPOINT_ID)                        AS total_inspections,
        SUM(c.CHECKPOINT_DEFICIENT_ITEM_OPEN_QUANTITY)         AS open_deficiencies,
        SUM(c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY)              AS total_deficiencies,
        COUNT(DISTINCT CASE WHEN c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 1
              THEN c.JOB_KEY END)                              AS sites_below_objective,
        COUNT(DISTINCT c.JOB_KEY)                              AS total_sites_inspected,
        ROUND(AVG(c.CHECKPOINT_SCORE_OBJECTIVE_VARIANCE_PERCENT), 1) AS avg_variance_from_objective
      FROM ${prefix}.FACT_CHECKPOINT c
      JOIN ${prefix}.DIM_JOB j ON c.JOB_KEY = j.JOB_KEY
      JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = c.CHECKPOINT_PERFORMED_DATE_KEY
      WHERE ${conditions.join(' AND ')}
    `;

    const rows = await connector.queryView(sql, binds);
    const r = rows[0] || {};

    res.json({
      avgScore:                Number(r.avg_score)                  || 0,
      totalInspections:        Number(r.total_inspections)          || 0,
      openDeficiencies:        Number(r.open_deficiencies)          || 0,
      totalDeficiencies:       Number(r.total_deficiencies)         || 0,
      sitesBelowObjective:    Number(r.sites_below_objective)      || 0,
      totalSitesInspected:    Number(r.total_sites_inspected)      || 0,
      avgVarianceFromObjective: Number(r.avg_variance_from_objective) || 0,
    });
  } catch (err) {
    console.error('ops-workspace quality-kpis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/financial-kpis ───────────────────────────────────────────

router.get('/:tenantId/financial-kpis', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    function buildFinancialSql(applyDates) {
      const b = [config.company_filter];
      const c = [`l.TENANT_ID = :1`, `j.TENANT_ID = :1`];
      if (applyDates) {
        const dateParts = [];
        if (startDate) { b.push(startDate); dateParts.push(`CALENDAR_DATE >= :${b.length}`); }
        if (endDate)   { b.push(endDate);   dateParts.push(`CALENDAR_DATE <= :${b.length}`); }
        if (dateParts.length) {
          c.push(`l.DATE_KEY IN (SELECT DATE_KEY FROM ${prefix}.DIM_DATE WHERE ${dateParts.join(' AND ')})`);
        }
      }
      c.push(...addJobTierFilters('j', { vp, manager }, b));
      const s = `
        SELECT
          SUM(l.ACTUAL_DOLLAR_AMOUNT)  AS actual_labor,
          SUM(l.BUDGET_DOLLAR_AMOUNT)  AS budget_labor,
          SUM(l.ACTUAL_HOURS)          AS actual_hours,
          SUM(l.BUDGET_HOURS)          AS budget_hours
        FROM ${prefix}.FACT_LABOR_BUDGET_TO_ACTUAL l
        JOIN ${prefix}.DIM_JOB j ON l.JOB_KEY = j.JOB_KEY
        WHERE ${c.join(' AND ')}
      `;
      return { sql: s, binds: b };
    }

    // Try with date filter first
    const dated = buildFinancialSql(true);
    let rows = await connector.queryView(dated.sql, dated.binds);
    let r = rows[0] || {};
    let dateFiltered = true;

    let actual = Number(r.actual_labor) || 0;
    let budget = Number(r.budget_labor) || 0;

    // Fallback: if no data in selected period, re-run all-time
    if (actual === 0 && budget === 0) {
      const allTime = buildFinancialSql(false);
      rows = await connector.queryView(allTime.sql, allTime.binds);
      r = rows[0] || {};
      actual = Number(r.actual_labor) || 0;
      budget = Number(r.budget_labor) || 0;
      dateFiltered = false;
    }

    const variance = budget ? Math.round(((actual - budget) / budget) * 100 * 10) / 10 : 0;

    res.json({
      actualLaborDollars: actual,
      budgetLaborDollars: budget,
      laborVariancePct:   variance,
      actualHours:        Math.round(Number(r.actual_hours) || 0),
      budgetHours:        Math.round(Number(r.budget_hours) || 0),
      hasData:            actual > 0 || budget > 0,
      dateFiltered,
      note:               dateFiltered ? null : 'Showing all available data — no records found in selected period',
    });
  } catch (err) {
    console.error('ops-workspace financial-kpis error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
