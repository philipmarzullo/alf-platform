// backend/routes/opsWorkspace.js
// Operations Workspace — live Snowflake queries for VP/Manager summary,
// workforce, quality, and financial KPIs.

import { Router } from 'express';
import { getConnector, fq } from '../lib/snowflakeDashboards.js';

const router = Router();

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

const INSPECTION_EXCLUSIONS = `(
  'DO NOT USE - INACTIVE','Property Received','Medical Inspection',
  'Tesla Daily/Nightly Report','LIU Daily/Nightly Report',
  'Byte Dance Daily/Nightly Report','Honda Employee Use Only','CIMS Self-Audit'
)`;

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

function addJobTierFilters(alias, { vp, manager, jobNumber }, binds) {
  const parts = [];
  if (vp && vp !== 'all')           { binds.push(vp);        parts.push(`${alias}.JOB_TIER_08_CURRENT_VALUE_LABEL = :${binds.length}`); }
  if (manager && manager !== 'all') { binds.push(manager);   parts.push(`${alias}.JOB_TIER_03_CURRENT_VALUE_LABEL = :${binds.length}`); }
  if (jobNumber && jobNumber !== 'all') { binds.push(jobNumber); parts.push(`${alias}.JOB_NUMBER = :${binds.length}`); }
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
        j.JOB_NUMBER                      AS job_number,
        j.JOB_NAME                        AS job_name
      FROM ${prefix}.DIM_JOB j
      WHERE j.JOB_COMPANY_NAME = :1
        AND j.JOB_TIER_08_CURRENT_VALUE_LABEL IS NOT NULL
        AND j.JOB_TIER_08_CURRENT_VALUE_LABEL != ''
      ORDER BY vp, manager, job_name
    `;

    const rows = await connector.queryView(sql, binds);

    const vps = [...new Set(rows.map(r => r.vp).filter(Boolean))].sort();
    const managers = rows
      .filter(r => r.manager)
      .map(r => ({ manager: r.manager, vp: r.vp }));
    // Deduplicate managers
    const managersSeen = new Set();
    const uniqueManagers = managers.filter(m => {
      const key = `${m.vp}||${m.manager}`;
      if (managersSeen.has(key)) return false;
      managersSeen.add(key);
      return true;
    });
    const jobs = rows
      .filter(r => r.job_number && r.job_name)
      .map(r => ({ jobNumber: r.job_number, jobName: r.job_name, vp: r.vp, manager: r.manager }));
    // Deduplicate jobs
    const jobsSeen = new Set();
    const uniqueJobs = jobs.filter(j => {
      if (jobsSeen.has(j.jobNumber)) return false;
      jobsSeen.add(j.jobNumber);
      return true;
    });

    res.json({ vps, managers: uniqueManagers, jobs: uniqueJobs });
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
    const { startDate, endDate, vp, manager, jobNumber, threshold = 50 } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
      `j.JOB_TIER_08_CURRENT_VALUE_LABEL IS NOT NULL`,
      `c.CHECKPOINT_TEMPLATE_TYPE_LABEL = 'Inspection'`,
      `c.CHECKPOINT_TEMPLATE_DESCRIPTION NOT IN ${INSPECTION_EXCLUSIONS}`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        j.JOB_TIER_08_CURRENT_VALUE_LABEL                        AS vp,
        COUNT(DISTINCT c.JOB_KEY)                                AS job_count,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS safety_insp_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                IN ('Safety Inspection', 'Safety Inspection old')
                AND c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
                THEN c.CHECKPOINT_KEY END) * 100.0 /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                IN ('Safety Inspection', 'Safety Inspection old')
                THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS safety_pass_rate,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS commercial_insp_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                NOT IN ('Safety Inspection', 'Safety Inspection old')
                AND c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
                THEN c.CHECKPOINT_KEY END) * 100.0 /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                NOT IN ('Safety Inspection', 'Safety Inspection old')
                THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS inspection_pass_rate,

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
      safetyPassRate:      r.safety_pass_rate != null ? Number(r.safety_pass_rate) : null,
      commercialInspCount: Number(r.commercial_insp_count) || 0,
      inspectionPassRate:  r.inspection_pass_rate != null ? Number(r.inspection_pass_rate) : null,
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
    const { startDate, endDate, vp, manager, jobNumber, threshold = 50 } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
      `j.JOB_TIER_03_CURRENT_VALUE_LABEL IS NOT NULL`,
      `c.CHECKPOINT_TEMPLATE_TYPE_LABEL = 'Inspection'`,
      `c.CHECKPOINT_TEMPLATE_DESCRIPTION NOT IN ${INSPECTION_EXCLUSIONS}`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        j.JOB_TIER_03_CURRENT_VALUE_LABEL                        AS manager,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL                        AS vp,
        j.JOB_TIER_01_CURRENT_VALUE_LABEL                        AS region,
        COUNT(DISTINCT c.JOB_KEY)                                AS job_count,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS safety_insp_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                IN ('Safety Inspection', 'Safety Inspection old')
                AND c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
                THEN c.CHECKPOINT_KEY END) * 100.0 /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                IN ('Safety Inspection', 'Safety Inspection old')
                THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS safety_pass_rate,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS commercial_insp_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                NOT IN ('Safety Inspection', 'Safety Inspection old')
                AND c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
                THEN c.CHECKPOINT_KEY END) * 100.0 /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                NOT IN ('Safety Inspection', 'Safety Inspection old')
                THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS inspection_pass_rate,

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
      safetyPassRate:      r.safety_pass_rate != null ? Number(r.safety_pass_rate) : null,
      commercialInspCount: Number(r.commercial_insp_count) || 0,
      inspectionPassRate:  r.inspection_pass_rate != null ? Number(r.inspection_pass_rate) : null,
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
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

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
    // VP/Manager/Job filtering via subquery on DIM_JOB
    const hcTierParts = [];
    if (vp && vp !== 'all')           { hcBinds.push(vp);        hcTierParts.push(`j2.JOB_TIER_08_CURRENT_VALUE_LABEL = :${hcBinds.length}`); }
    if (manager && manager !== 'all') { hcBinds.push(manager);   hcTierParts.push(`j2.JOB_TIER_03_CURRENT_VALUE_LABEL = :${hcBinds.length}`); }
    if (jobNumber && jobNumber !== 'all') { hcBinds.push(jobNumber); hcTierParts.push(`j2.JOB_NUMBER = :${hcBinds.length}`); }
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
    const toBinds = [config.company_filter];
    const toCond = [
      `j.JOB_COMPANY_NAME = :1`,
    ];
    if (startDate) { toBinds.push(startDate); toCond.push(`h.EMPLOYEE_EVENT_EFFECTIVE_FROM_TIMESTAMP >= :${toBinds.length}`); }
    if (endDate)   { toBinds.push(endDate);   toCond.push(`h.EMPLOYEE_EVENT_EFFECTIVE_FROM_TIMESTAMP <= :${toBinds.length}`); }
    toCond.push(...addJobTierFilters('j', { vp, manager, jobNumber }, toBinds));

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
    const otBinds = [config.company_filter];
    const otCond = [`j.JOB_COMPANY_NAME = :1`];
    otCond.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, otBinds));
    otCond.push(...addJobTierFilters('j', { vp, manager, jobNumber }, otBinds));

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
    const absBinds = [config.company_filter];
    const absCond = [`j.JOB_COMPANY_NAME = :1`];
    if (startDate) { absBinds.push(startDate); absCond.push(`a.ABSENCE_DATE >= :${absBinds.length}`); }
    if (endDate)   { absBinds.push(endDate);   absCond.push(`a.ABSENCE_DATE <= :${absBinds.length}`); }
    absCond.push(...addJobTierFilters('j', { vp, manager, jobNumber }, absBinds));

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
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        ROUND(AVG(c.CHECKPOINT_SCORE_PERCENT), 1)              AS avg_score,
        COUNT(DISTINCT c.CHECKPOINT_ID)                        AS total_inspections,
        COUNT(DISTINCT CASE WHEN c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
              THEN c.CHECKPOINT_ID END)                        AS passed_inspections,
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

    const totalInsp  = Number(r.total_inspections) || 0;
    const passedInsp = Number(r.passed_inspections) || 0;

    res.json({
      avgScore:                Number(r.avg_score)                  || 0,
      totalInspections:        totalInsp,
      passedInspections:       passedInsp,
      passRate:                totalInsp > 0 ? Math.round((passedInsp / totalInsp) * 1000) / 10 : 0,
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

// ─── GET /:tenantId/financial-kpis (Payroll Actuals via FACT_TIMEKEEPING) ────

router.get('/:tenantId/financial-kpis', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);

    // ── Payroll actuals (FACT_TIMEKEEPING) ──
    const payBinds = [config.company_filter];
    const payCond = [`j.JOB_COMPANY_NAME = :1`];
    payCond.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, payBinds));
    payCond.push(...addJobTierFilters('j', { vp, manager, jobNumber }, payBinds));

    const payrollSql = `
      SELECT
        SUM(t.TIMEKEEPING_TOTAL_DOLLAR_AMOUNT)                                   AS total_dollars,
        SUM(t.TIMEKEEPING_REGULAR_DOLLAR_AMOUNT)                                 AS regular_dollars,
        SUM(t.TIMEKEEPING_OVERTIME_DOLLAR_AMOUNT + t.TIMEKEEPING_DOUBLETIME_DOLLAR_AMOUNT) AS ot_dollars,
        SUM(t.TIMEKEEPING_TOTAL_HOURS)                                           AS total_hours,
        SUM(t.TIMEKEEPING_REGULAR_HOURS)                                         AS regular_hours,
        SUM(t.TIMEKEEPING_OVERTIME_HOURS + t.TIMEKEEPING_DOUBLETIME_HOURS)       AS ot_hours
      FROM ${prefix}.FACT_TIMEKEEPING t
      JOIN ${prefix}.DIM_DATE d ON t.WORK_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON t.JOB_KEY = j.JOB_KEY
      WHERE ${payCond.join(' AND ')}
    `;

    // ── Budget (FACT_LABOR_BUDGET_TO_ACTUAL) ──
    // Uses DATE_KEY IN (subquery) approach — confirmed working pattern
    const budBinds = [config.company_filter];
    const budCond = [`j.JOB_COMPANY_NAME = :1`];
    if (startDate) { budBinds.push(startDate); budCond.push(`l.DATE_KEY IN (SELECT DATE_KEY FROM ${prefix}.DIM_DATE WHERE CALENDAR_DATE >= :${budBinds.length})`); }
    if (endDate)   { budBinds.push(endDate);   budCond.push(`l.DATE_KEY IN (SELECT DATE_KEY FROM ${prefix}.DIM_DATE WHERE CALENDAR_DATE <= :${budBinds.length})`); }
    budCond.push(...addJobTierFilters('j', { vp, manager, jobNumber }, budBinds));

    const budgetSql = `
      SELECT
        SUM(l.BUDGET_DOLLAR_AMOUNT) AS budget_dollars,
        SUM(l.BUDGET_HOURS)         AS budget_hours
      FROM ${prefix}.FACT_LABOR_BUDGET_TO_ACTUAL l
      JOIN ${prefix}.DIM_JOB j ON l.JOB_KEY = j.JOB_KEY
      WHERE ${budCond.join(' AND ')}
    `;

    const [payRows, budRows] = await Promise.all([
      connector.queryView(payrollSql, payBinds),
      connector.queryView(budgetSql, budBinds),
    ]);

    const p = payRows[0] || {};
    const b = budRows[0] || {};

    const totalPayroll   = Math.round(Number(p.total_dollars) || 0);
    const regularPay     = Math.round(Number(p.regular_dollars) || 0);
    const otPay          = Math.round(Number(p.ot_dollars) || 0);
    const totalHours     = Math.round(Number(p.total_hours) || 0);
    const regularHours   = Math.round(Number(p.regular_hours) || 0);
    const otHours        = Math.round(Number(p.ot_hours) || 0);
    const otPct          = totalHours > 0 ? Math.round((otHours / totalHours) * 1000) / 10 : 0;

    const budgetDollars  = Math.round(Number(b.budget_dollars) || 0);
    const budgetHours    = Math.round(Number(b.budget_hours) || 0);
    const hasBudgetData  = budgetDollars > 0 || budgetHours > 0;
    const laborVariancePct = budgetDollars > 0
      ? Math.round(((totalPayroll - budgetDollars) / budgetDollars) * 1000) / 10
      : 0;

    res.json({
      totalPayroll,
      regularPay,
      otPay,
      totalHours,
      regularHours,
      otHours,
      otPct,
      budgetLaborDollars: budgetDollars,
      budgetHours,
      laborVariancePct,
      hasBudgetData,
      hasPayrollData: totalPayroll > 0 || totalHours > 0,
    });
  } catch (err) {
    console.error('ops-workspace financial-kpis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/manager-sites ───────────────────────────────────────────

router.get('/:tenantId/manager-sites', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { manager: managerName, startDate, endDate } = req.query;
    if (!managerName) return res.status(400).json({ error: 'manager param required' });

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter, managerName];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `c.IS_CHECKPOINT_COMPLETED_FLAG = 1`,
      `c.CHECKPOINT_TEMPLATE_TYPE_LABEL = 'Inspection'`,
      `c.CHECKPOINT_TEMPLATE_DESCRIPTION NOT IN ${INSPECTION_EXCLUSIONS}`,
      `j.JOB_TIER_03_CURRENT_VALUE_LABEL = :2`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));

    const sql = `
      SELECT
        j.JOB_NAME                                                AS job_name,
        j.JOB_NUMBER                                              AS job_number,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL                        AS vp,
        j.JOB_TIER_03_CURRENT_VALUE_LABEL                        AS manager,
        COUNT(DISTINCT c.CHECKPOINT_KEY)                          AS total_inspections,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS safety_insp_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                IN ('Safety Inspection', 'Safety Inspection old')
                AND c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
                THEN c.CHECKPOINT_KEY END) * 100.0 /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                IN ('Safety Inspection', 'Safety Inspection old')
                THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS safety_pass_rate,

        COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
              NOT IN ('Safety Inspection', 'Safety Inspection old')
              THEN c.CHECKPOINT_KEY END)                          AS commercial_insp_count,
        ROUND(
          COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                NOT IN ('Safety Inspection', 'Safety Inspection old')
                AND c.IS_CHECKPOINT_SCORE_BELOW_OBJECTIVE_FLAG = 0
                THEN c.CHECKPOINT_KEY END) * 100.0 /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_TEMPLATE_DESCRIPTION
                NOT IN ('Safety Inspection', 'Safety Inspection old')
                THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS inspection_pass_rate,

        SUM(c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY)                AS total_deficiencies,
        SUM(c.CHECKPOINT_DEFICIENT_ITEM_OPEN_QUANTITY)           AS open_deficiencies,

        ROUND(
          NULLIF(SUM(c.CHECKPOINT_DEFICIENT_ITEM_CLOSED_QUANTITY), 0) /
          NULLIF(COUNT(DISTINCT CASE WHEN c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY > 0
            THEN c.CHECKPOINT_KEY END), 0)
        , 1)                                                      AS avg_close_days

      FROM ${prefix}.FACT_CHECKPOINT c
      JOIN ${prefix}.DIM_JOB j ON c.JOB_KEY = j.JOB_KEY
      JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = c.CHECKPOINT_PERFORMED_DATE_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.JOB_NAME, j.JOB_NUMBER, j.JOB_TIER_08_CURRENT_VALUE_LABEL, j.JOB_TIER_03_CURRENT_VALUE_LABEL
      ORDER BY open_deficiencies DESC
    `;

    const rows = await connector.queryView(sql, binds);

    res.json({
      rows: rows.map(r => ({
        jobName:            r.job_name,
        jobNumber:          r.job_number,
        vp:                 r.vp,
        manager:            r.manager,
        totalInspections:   Number(r.total_inspections) || 0,
        safetyInspCount:    Number(r.safety_insp_count) || 0,
        safetyPassRate:     r.safety_pass_rate != null ? Number(r.safety_pass_rate) : null,
        commercialInspCount: Number(r.commercial_insp_count) || 0,
        inspectionPassRate: r.inspection_pass_rate != null ? Number(r.inspection_pass_rate) : null,
        totalDeficiencies:  Number(r.total_deficiencies) || 0,
        openDeficiencies:   Number(r.open_deficiencies) || 0,
        avgCloseDays:       r.avg_close_days != null ? Number(r.avg_close_days) : null,
      })),
    });
  } catch (err) {
    console.error('ops-workspace manager-sites error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/site-deficiencies ───────────────────────────────────────

router.get('/:tenantId/site-deficiencies', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { jobNumber } = req.query;
    if (!jobNumber) return res.status(400).json({ error: 'jobNumber param required' });

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter, jobNumber];

    // No date filter — always show all deficiencies for the site
    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `li.IS_CHECKPOINT_ITEM_DEFICIENT_FLAG = 1`,
      `j.JOB_NUMBER = :2`,
    ];

    const sql = `
      SELECT
        li.CHECKPOINT_ITEM_TYPE_LABEL                             AS area_type,
        li.CHECKPOINT_AREA_LABEL                                  AS area,
        li.CHECKPOINT_ITEM_LABEL                                  AS item,
        li.CHECKPOINT_ITEM_DEFICIENCY_DETAIL_TEXT                 AS detail,
        li.IS_CHECKPOINT_ITEM_DEFICIENCY_OPEN_FLAG                AS is_open,
        li.IS_CHECKPOINT_ITEM_DEFICIENCY_CLOSED_FLAG              AS is_closed,
        li.CHECKPOINT_DEFICIENT_ITEM_CLOSED_TIMESTAMP             AS closed_at,
        li.CHECKPOINT_DEFICIENT_ITEM_CLOSED_BY_NAME               AS closed_by,
        li.CHECKPOINT_ITEM_NOTES                                  AS notes,
        d.CALENDAR_DATE                                           AS inspection_date,
        c.CHECKPOINT_TEMPLATE_DESCRIPTION                         AS inspection_type
      FROM ${prefix}.FACT_CHECKPOINT_LINEITEM li
      JOIN ${prefix}.FACT_CHECKPOINT c ON c.CHECKPOINT_ID = li.CHECKPOINT_ID
      JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = li.CHECKPOINT_PERFORMED_DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON j.JOB_KEY = li.JOB_KEY
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.CALENDAR_DATE DESC
      LIMIT 2000
    `;

    const rows = await connector.queryView(sql, binds);

    // Compute repeat items (item label appearing >1 time at this site)
    const itemCounts = {};
    for (const r of rows) {
      const key = (r.item || '').toLowerCase();
      itemCounts[key] = (itemCounts[key] || 0) + 1;
    }

    const items = rows.map(r => ({
      areaType:       r.area_type || '',
      area:           r.area || '',
      item:           r.item || '',
      detail:         r.detail || '',
      isOpen:         r.is_open === 1,
      isClosed:       r.is_closed === 1,
      closedAt:       r.closed_at || null,
      closedBy:       r.closed_by || null,
      notes:          r.notes || '',
      inspectionDate: r.inspection_date || null,
      inspectionType: r.inspection_type || '',
      isRepeat:       itemCounts[(r.item || '').toLowerCase()] > 1,
    }));

    const openItems = items.filter(i => i.isOpen);
    const areas = new Set(openItems.map(i => i.area).filter(Boolean));

    res.json({
      items,
      summary: {
        totalCount: items.length,
        openCount:  openItems.length,
        areaCount:  areas.size,
      },
    });
  } catch (err) {
    console.error('ops-workspace site-deficiencies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/safety-kpis ─────────────────────────────────────────────
// Reads from Supabase wc_claims (same source as Safety Workspace).
// Filters by VP / manager (supervisor) / job_number / date range.

router.get('/:tenantId/safety-kpis', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

    const { data: claims, error } = await req.supabase
      .from('wc_claims')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) throw error;

    // Apply filters in JS (table is small — a few hundred rows max)
    const filtered = (claims || []).filter(c => {
      if (vp && vp !== 'all' && c.vp !== vp) return false;
      if (manager && manager !== 'all' && c.supervisor !== manager) return false;
      if (jobNumber && jobNumber !== 'all' && String(c.job_number) !== String(jobNumber)) return false;
      if (startDate && (!c.date_of_loss || c.date_of_loss < startDate)) return false;
      if (endDate && (!c.date_of_loss || c.date_of_loss > endDate)) return false;
      return true;
    });

    const open = filtered.filter(c => c.claim_status === 'Open');

    const oowCount = open.filter(c => {
      const s = (c.work_status || c.ee_status || '').toLowerCase();
      return s.includes('out of work') || s === 'oow';
    }).length;

    const totalIncurred = filtered.reduce((s, c) => s + Number(c.total_incurred || 0), 0);

    // Recordable = Liberty-tracked (Open + Closed), excludes Non-Reportable
    const recordable = filtered.filter(c => c.claim_status !== 'Non-Reportable');
    const recordableCount = recordable.length;

    // Lost time = claims with lost_time_days > 0
    const lostTimeCount = filtered.filter(c => Number(c.lost_time_days || 0) > 0).length;

    // Top sites by claim count
    const bySite = {};
    for (const c of filtered) {
      const name = c.job_name || 'Unknown';
      if (!bySite[name]) bySite[name] = 0;
      bySite[name]++;
    }
    const highRiskSites = Object.entries(bySite)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    res.json({
      openClaims: open.length,
      outOfWork: oowCount,
      totalIncurred: Math.round(totalIncurred),
      recordableIncidents: recordableCount,
      lostTimeIncidents: lostTimeCount,
      highRiskSites,
      totalClaims: filtered.length,
      hasData: filtered.length > 0,
    });
  } catch (err) {
    console.error('ops-workspace safety-kpis error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
