// backend/routes/financeWorkspace.js
// Finance Audit Workspace — live Snowflake queries for GL distribution,
// payroll actuals, stale budgets, and card charges.
// Super-admin only (access enforced on frontend).

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

// ─── GET /:tenantId/filter-options ──────────────────────────────────────────

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
    const managersSeen = new Set();
    const uniqueManagers = managers.filter(m => {
      const key = `${m.vp}||${m.manager}`;
      if (managersSeen.has(key)) return false;
      managersSeen.add(key);
      return true;
    });

    res.json({ vps, managers: uniqueManagers });
  } catch (err) {
    console.error('finance-workspace filter-options error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/gl-distribution ─────────────────────────────────────────

router.get('/:tenantId/gl-distribution', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        ga.GL_ACCOUNT_NUMBER           AS gl_account_number,
        ga.GL_ACCOUNT_DESCRIPTION      AS gl_description,
        COUNT(*)                       AS entry_count,
        SUM(gl.GL_ENTRY_AMOUNT)        AS total_amount
      FROM ${prefix}.FACT_GL_ENTRY gl
      JOIN ${prefix}.DIM_GL_ACCOUNT ga ON gl.GL_ACCOUNT_KEY = ga.GL_ACCOUNT_KEY
      JOIN ${prefix}.DIM_DATE d ON gl.GL_ENTRY_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON gl.JOB_KEY = j.JOB_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY ga.GL_ACCOUNT_NUMBER, ga.GL_ACCOUNT_DESCRIPTION
      ORDER BY total_amount DESC
    `;

    const rows = await connector.queryView(sql, binds);

    const grandTotal = rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

    const result = rows.map(r => {
      const amount = Number(r.total_amount) || 0;
      return {
        glAccountNumber: r.gl_account_number,
        glDescription:   r.gl_description,
        entryCount:      Number(r.entry_count) || 0,
        totalAmount:     amount,
        pctOfTotal:      grandTotal !== 0 ? Math.round((amount / grandTotal) * 1000) / 10 : 0,
      };
    });

    res.json({ rows: result, grandTotal });
  } catch (err) {
    console.error('finance-workspace gl-distribution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/account-entries ─────────────────────────────────────────

router.get('/:tenantId/account-entries', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { glAccountNumber, startDate, endDate, vp, manager, jobNumber, jobSearch } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
    ];

    if (glAccountNumber) {
      binds.push(glAccountNumber);
      conditions.push(`ga.GL_ACCOUNT_NUMBER = :${binds.length}`);
    }

    if (jobSearch) {
      binds.push(`%${jobSearch}%`);
      conditions.push(`(j.JOB_NAME ILIKE :${binds.length} OR j.JOB_NUMBER ILIKE :${binds.length})`);
    }

    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        j.JOB_NAME                     AS job_name,
        j.JOB_NUMBER                   AS job_number,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL AS vp,
        j.JOB_TIER_03_CURRENT_VALUE_LABEL AS manager,
        ga.GL_ACCOUNT_NUMBER           AS gl_account_number,
        ga.GL_ACCOUNT_DESCRIPTION      AS gl_description,
        COUNT(*)                       AS entry_count,
        SUM(gl.GL_ENTRY_AMOUNT)        AS total_amount
      FROM ${prefix}.FACT_GL_ENTRY gl
      JOIN ${prefix}.DIM_GL_ACCOUNT ga ON gl.GL_ACCOUNT_KEY = ga.GL_ACCOUNT_KEY
      JOIN ${prefix}.DIM_DATE d ON gl.GL_ENTRY_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON gl.JOB_KEY = j.JOB_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.JOB_NAME, j.JOB_NUMBER,
               j.JOB_TIER_08_CURRENT_VALUE_LABEL, j.JOB_TIER_03_CURRENT_VALUE_LABEL,
               ga.GL_ACCOUNT_NUMBER, ga.GL_ACCOUNT_DESCRIPTION
      ORDER BY total_amount DESC
    `;

    const rows = await connector.queryView(sql, binds);

    const accountTotal = rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);

    const result = rows.map(r => {
      const amount = Number(r.total_amount) || 0;
      return {
        jobName:         r.job_name,
        jobNumber:       r.job_number,
        vp:              r.vp,
        manager:         r.manager,
        glAccountNumber: r.gl_account_number,
        glDescription:   r.gl_description,
        entryCount:      Number(r.entry_count) || 0,
        totalAmount:     amount,
        pctOfAccount:    accountTotal !== 0 ? Math.round((amount / accountTotal) * 1000) / 10 : 0,
      };
    });

    res.json({ rows: result, accountTotal });
  } catch (err) {
    console.error('finance-workspace account-entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/job-entries ─────────────────────────────────────────────

router.get('/:tenantId/job-entries', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { jobNumber, glAccountNumber, startDate, endDate } = req.query;
    if (!jobNumber) return res.status(400).json({ error: 'jobNumber required' });

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter, jobNumber];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `j.JOB_NUMBER = :2`,
    ];

    if (glAccountNumber) {
      binds.push(glAccountNumber);
      conditions.push(`ga.GL_ACCOUNT_NUMBER = :${binds.length}`);
    }

    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));

    const sql = `
      SELECT
        d.CALENDAR_DATE                AS entry_date,
        ga.GL_ACCOUNT_NUMBER           AS gl_account_number,
        ga.GL_ACCOUNT_DESCRIPTION      AS gl_description,
        gl.GL_ENTRY_AMOUNT             AS amount,
        gl.GL_ENTRY_DESCRIPTION        AS description,
        gl.GL_ENTRY_SOURCE_REFERENCE   AS source_reference,
        gl.GL_ENTRY_ENTERED_BY_NAME    AS entered_by
      FROM ${prefix}.FACT_GL_ENTRY gl
      JOIN ${prefix}.DIM_GL_ACCOUNT ga ON gl.GL_ACCOUNT_KEY = ga.GL_ACCOUNT_KEY
      JOIN ${prefix}.DIM_DATE d ON gl.GL_ENTRY_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON gl.JOB_KEY = j.JOB_KEY
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.CALENDAR_DATE DESC
    `;

    const rows = await connector.queryView(sql, binds);

    const result = rows.map(r => ({
      entryDate:       r.entry_date,
      glAccountNumber: r.gl_account_number,
      glDescription:   r.gl_description,
      amount:          Number(r.amount) || 0,
      description:     r.description || '',
      sourceReference: r.source_reference || '',
      enteredBy:       r.entered_by || '',
    }));

    res.json({ rows: result });
  } catch (err) {
    console.error('finance-workspace job-entries error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/payroll-actuals ─────────────────────────────────────────

router.get('/:tenantId/payroll-actuals', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [`j.JOB_COMPANY_NAME = :1`];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        j.JOB_NAME                                                               AS job_name,
        j.JOB_NUMBER                                                             AS job_number,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL                                       AS vp,
        j.JOB_TIER_03_CURRENT_VALUE_LABEL                                       AS manager,
        SUM(t.TIMEKEEPING_TOTAL_DOLLAR_AMOUNT)                                   AS total_payroll,
        SUM(t.TIMEKEEPING_REGULAR_DOLLAR_AMOUNT)                                 AS regular_pay,
        SUM(t.TIMEKEEPING_OVERTIME_DOLLAR_AMOUNT + t.TIMEKEEPING_DOUBLETIME_DOLLAR_AMOUNT) AS ot_pay,
        SUM(t.TIMEKEEPING_TOTAL_HOURS)                                           AS total_hours,
        SUM(t.TIMEKEEPING_OVERTIME_HOURS + t.TIMEKEEPING_DOUBLETIME_HOURS)       AS ot_hours
      FROM ${prefix}.FACT_TIMEKEEPING t
      JOIN ${prefix}.DIM_DATE d ON t.WORK_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON t.JOB_KEY = j.JOB_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.JOB_NAME, j.JOB_NUMBER,
               j.JOB_TIER_08_CURRENT_VALUE_LABEL,
               j.JOB_TIER_03_CURRENT_VALUE_LABEL
      ORDER BY total_payroll DESC
    `;

    const rows = await connector.queryView(sql, binds);

    let summaryTotalPayroll = 0, summaryRegular = 0, summaryOt = 0, summaryHours = 0, summaryOtHours = 0;

    const result = rows.map(r => {
      const totalPayroll = Number(r.total_payroll) || 0;
      const regularPay   = Number(r.regular_pay)   || 0;
      const otPay        = Number(r.ot_pay)        || 0;
      const totalHours   = Number(r.total_hours)   || 0;
      const otHours      = Number(r.ot_hours)      || 0;
      const otPct        = totalHours > 0 ? Math.round((otHours / totalHours) * 1000) / 10 : 0;

      summaryTotalPayroll += totalPayroll;
      summaryRegular      += regularPay;
      summaryOt           += otPay;
      summaryHours        += totalHours;
      summaryOtHours      += otHours;

      return {
        jobName:      r.job_name,
        jobNumber:    r.job_number,
        vp:           r.vp,
        manager:      r.manager,
        totalPayroll: Math.round(totalPayroll),
        regularPay:   Math.round(regularPay),
        otPay:        Math.round(otPay),
        totalHours:   Math.round(totalHours),
        otPct,
      };
    });

    res.json({
      rows: result,
      summary: {
        totalPayroll: Math.round(summaryTotalPayroll),
        regularPay:   Math.round(summaryRegular),
        otPay:        Math.round(summaryOt),
        totalHours:   Math.round(summaryHours),
        otPct:        summaryHours > 0 ? Math.round((summaryOtHours / summaryHours) * 1000) / 10 : 0,
      },
    });
  } catch (err) {
    console.error('finance-workspace payroll-actuals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/stale-budgets ───────────────────────────────────────────

router.get('/:tenantId/stale-budgets', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { vp, manager, jobNumber } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [`j.JOB_COMPANY_NAME = :1`, `j.JOB_STATUS_LABEL = 'Active'`];
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        j.JOB_NAME                                    AS job_name,
        j.JOB_NUMBER                                  AS job_number,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL             AS vp,
        j.JOB_TIER_03_CURRENT_VALUE_LABEL             AS manager,
        MAX(d.CALENDAR_DATE)                          AS last_budget_date,
        DATEDIFF('day', MAX(d.CALENDAR_DATE), CURRENT_DATE()) AS days_stale,
        SUM(l.BUDGET_DOLLAR_AMOUNT)                   AS budget_amount,
        SUM(l.ACTUAL_DOLLAR_AMOUNT)                   AS actual_amount
      FROM ${prefix}.FACT_LABOR_BUDGET_TO_ACTUAL l
      JOIN ${prefix}.DIM_JOB j ON l.JOB_KEY = j.JOB_KEY
      JOIN ${prefix}.DIM_DATE d ON l.DATE_KEY = d.DATE_KEY
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.JOB_NAME, j.JOB_NUMBER,
               j.JOB_TIER_08_CURRENT_VALUE_LABEL,
               j.JOB_TIER_03_CURRENT_VALUE_LABEL
      HAVING DATEDIFF('day', MAX(d.CALENDAR_DATE), CURRENT_DATE()) > 365
      ORDER BY days_stale DESC
    `;

    const rows = await connector.queryView(sql, binds);

    const result = rows.map(r => ({
      jobName:        r.job_name,
      jobNumber:      r.job_number,
      vp:             r.vp,
      manager:        r.manager,
      lastBudgetDate: r.last_budget_date,
      daysStale:      Number(r.days_stale) || 0,
      budgetAmount:   Math.round(Number(r.budget_amount) || 0),
      actualAmount:   Math.round(Number(r.actual_amount) || 0),
    }));

    res.json({
      rows: result,
      summary: {
        staleJobCount: result.length,
      },
    });
  } catch (err) {
    console.error('finance-workspace stale-budgets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:tenantId/card-charges ────────────────────────────────────────────

router.get('/:tenantId/card-charges', async (req, res) => {
  try {
    const tenantId = resolveEffectiveTenantId(req, req.params.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    const { startDate, endDate, vp, manager, jobNumber } = req.query;

    const { connector, config } = await getConnector(req.supabase, tenantId);
    const prefix = fq(config);
    const binds = [config.company_filter];

    const conditions = [
      `j.JOB_COMPANY_NAME = :1`,
      `(gl.GL_ENTRY_SOURCE_REFERENCE ILIKE '%AMEX%' OR gl.GL_ENTRY_SOURCE_REFERENCE ILIKE '%CORPORATE CARD%' OR gl.GL_ENTRY_SOURCE_REFERENCE ILIKE '%CREDIT CARD%')`,
    ];
    conditions.push(...addDateFilters('d.CALENDAR_DATE', { startDate, endDate }, binds));
    conditions.push(...addJobTierFilters('j', { vp, manager, jobNumber }, binds));

    const sql = `
      SELECT
        d.CALENDAR_DATE                AS entry_date,
        j.JOB_NAME                     AS job_name,
        j.JOB_TIER_08_CURRENT_VALUE_LABEL AS vp,
        ga.GL_ACCOUNT_NUMBER           AS gl_account_number,
        ga.GL_ACCOUNT_DESCRIPTION      AS gl_description,
        gl.GL_ENTRY_AMOUNT             AS amount,
        gl.GL_ENTRY_DESCRIPTION        AS vendor,
        gl.GL_ENTRY_ENTERED_BY_NAME    AS entered_by
      FROM ${prefix}.FACT_GL_ENTRY gl
      JOIN ${prefix}.DIM_GL_ACCOUNT ga ON gl.GL_ACCOUNT_KEY = ga.GL_ACCOUNT_KEY
      JOIN ${prefix}.DIM_DATE d ON gl.GL_ENTRY_DATE_KEY = d.DATE_KEY
      JOIN ${prefix}.DIM_JOB j ON gl.JOB_KEY = j.JOB_KEY
      WHERE ${conditions.join(' AND ')}
      ORDER BY gl.GL_ENTRY_AMOUNT DESC
      LIMIT 2000
    `;

    const rows = await connector.queryView(sql, binds);

    const totalCharges = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const distinctAccounts = new Set(rows.map(r => r.gl_account_number)).size;

    const result = rows.map(r => ({
      entryDate:       r.entry_date,
      jobName:         r.job_name,
      vp:              r.vp,
      glAccountNumber: r.gl_account_number,
      glDescription:   r.gl_description,
      amount:          Number(r.amount) || 0,
      vendor:          r.vendor || '',
      enteredBy:       r.entered_by || '',
    }));

    res.json({
      rows: result,
      summary: {
        totalCharges: Math.round(totalCharges),
        distinctAccountCount: distinctAccounts,
      },
    });
  } catch (err) {
    console.error('finance-workspace card-charges error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
