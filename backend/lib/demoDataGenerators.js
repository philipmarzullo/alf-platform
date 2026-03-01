/**
 * Demo Data Generators
 *
 * Pure functions that return arrays of row objects for Supabase insert/upsert.
 * No side effects — the seed orchestrator handles DB writes.
 */

import { EMPLOYEE_NAMES } from '../data/demoTenants.js';

// ── Helpers ──────────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(options) {
  // options: [{ value, weight }]
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

/**
 * Generate a random date string (YYYY-MM-DD) between start and end.
 */
function randomDate(start, end) {
  const s = start.getTime();
  const e = end.getTime();
  const d = new Date(s + Math.random() * (e - s));
  return d.toISOString().split('T')[0];
}

/**
 * Get all weekdays between two dates.
 */
function getAllWeekdays(start, end) {
  const days = [];
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/**
 * Pick a random weekday between start and end.
 */
function randomWeekday(start, end) {
  const weekdays = getAllWeekdays(start, end);
  return pick(weekdays);
}

/**
 * Last day of a month.
 */
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).toISOString().split('T')[0];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Generators ───────────────────────────────────────────────────────

/**
 * Generate sf_dim_date rows for a year range.
 * Upserted with onConflict: 'date_key'.
 */
export function generateDateDimension(startYear, endYear) {
  const rows = [];
  for (let year = startYear; year <= endYear; year++) {
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const dateKey = d.toISOString().split('T')[0];
        const quarter = Math.floor((month - 1) / 3) + 1;
        rows.push({
          date_key: dateKey,
          year,
          quarter,
          quarter_label: `Q${quarter}`,
          month,
          month_label: MONTHS[month - 1],
          day_of_week: d.getDay(),
          is_weekend: d.getDay() === 0 || d.getDay() === 6,
        });
      }
    }
  }
  return rows;
}

/**
 * Generate sf_dim_job rows — one per site.
 */
export function generateJobs(tenantId, siteNames, companyName) {
  const tiers = ['enterprise', 'premium', 'standard'];
  return siteNames.map((site, i) => ({
    tenant_id: tenantId,
    job_name: site,
    location: site,
    supervisor: `Supervisor ${i + 1}`,
    company: companyName,
    tier: tiers[i % tiers.length],
    sq_footage: randomInt(50000, 200000),
    is_active: true,
  }));
}

/**
 * Generate sf_dim_employee rows.
 * Returns { employees, empJobMap } — empJobMap maps employee_number → job_id for timekeeping.
 */
export function generateEmployees(tenantId, jobMap, employeesPerSite) {
  const roles = ['Cleaner', 'Cleaner', 'Cleaner', 'Lead Cleaner', 'Site Supervisor', 'Area Manager'];
  const rateRanges = {
    'Cleaner': [18, 22],
    'Lead Cleaner': [22, 26],
    'Site Supervisor': [26, 30],
    'Area Manager': [28, 32],
  };

  const employees = [];
  const empJobMap = {};
  let empNum = 1000;

  for (const [jobName, jobId] of Object.entries(jobMap)) {
    for (let i = 0; i < employeesPerSite; i++) {
      const name = EMPLOYEE_NAMES[(employees.length) % EMPLOYEE_NAMES.length];
      const role = roles[i % roles.length];
      const [minRate, maxRate] = rateRanges[role];
      const empNumber = `EMP-${empNum++}`;

      employees.push({
        tenant_id: tenantId,
        employee_number: empNumber,
        first_name: name.first,
        last_name: name.last,
        role,
        hire_date: randomDate(new Date('2020-01-01'), new Date('2025-06-01')),
        job_id: jobId,
        hourly_rate: randomFloat(minRate, maxRate),
      });

      empJobMap[empNumber] = jobId;
    }
  }

  return { employees, empJobMap };
}

/**
 * Generate sf_fact_work_tickets rows.
 */
export function generateWorkTickets(tenantId, jobMap, totalTickets) {
  const categories = ['Cleaning', 'Maintenance', 'Supplies', 'Inspection', 'Safety'];
  const priorities = ['low', 'medium', 'high', 'critical'];
  const statusWeights = [
    { value: 'completed', weight: 70 },
    { value: 'in_progress', weight: 15 },
    { value: 'open', weight: 10 },
    { value: 'cancelled', weight: 5 },
  ];

  const jobEntries = Object.entries(jobMap);
  const tickets = [];

  const start = new Date('2025-04-01');
  const end = new Date('2026-02-28');

  for (let i = 0; i < totalTickets; i++) {
    const [, jobId] = pick(jobEntries);
    const status = weightedPick(statusWeights);
    const dateKey = randomWeekday(start, end);
    const completedAt = status === 'completed'
      ? new Date(new Date(dateKey).getTime() + randomInt(1, 72) * 3600000).toISOString()
      : null;

    tickets.push({
      tenant_id: tenantId,
      job_id: jobId,
      date_key: dateKey,
      category: pick(categories),
      status,
      priority: pick(priorities),
      assigned_to: `Worker ${randomInt(1, 20)}`,
      completed_at: completedAt,
    });
  }

  return tickets;
}

/**
 * Generate sf_fact_labor_budget_actual rows — 12 monthly periods per site.
 */
export function generateLaborBudget(tenantId, jobMap) {
  const rows = [];
  const months = [
    // Apr 2025 – Feb 2026 (11 months of data)
    [2025, 4], [2025, 5], [2025, 6], [2025, 7], [2025, 8], [2025, 9],
    [2025, 10], [2025, 11], [2025, 12], [2026, 1], [2026, 2],
  ];

  for (const [, jobId] of Object.entries(jobMap)) {
    for (const [year, month] of months) {
      const budgetHours = randomInt(400, 900);
      const budgetDollars = budgetHours * randomFloat(20, 28);
      // Variance 85–115% for interesting stories
      const variancePct = randomFloat(0.85, 1.15);
      const actualHours = Math.round(budgetHours * variancePct);
      const actualDollars = parseFloat((budgetDollars * variancePct).toFixed(2));
      // OT correlated with overruns
      const otHours = variancePct > 1.0 ? randomInt(10, Math.round((variancePct - 1) * budgetHours * 2)) : randomInt(0, 8);
      const otDollars = parseFloat((otHours * randomFloat(30, 42)).toFixed(2));

      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const periodEnd = lastDayOfMonth(year, month);

      rows.push({
        tenant_id: tenantId,
        job_id: jobId,
        period_start: periodStart,
        period_end: periodEnd,
        budget_hours: budgetHours,
        actual_hours: actualHours,
        budget_dollars: parseFloat(budgetDollars.toFixed(2)),
        actual_dollars: actualDollars,
        ot_hours: otHours,
        ot_dollars: otDollars,
      });
    }
  }

  return rows;
}

/**
 * Generate sf_fact_timekeeping rows.
 */
export function generateTimekeeping(tenantId, empJobMap, totalEntries) {
  const punchStatusWeights = [
    { value: 'accepted', weight: 92 },
    { value: 'incomplete', weight: 4 },
    { value: 'manual_edit', weight: 2.5 },
    { value: 'exception', weight: 1.5 },
  ];

  const empEntries = Object.entries(empJobMap);
  const rows = [];

  const start = new Date('2025-04-01');
  const end = new Date('2026-02-28');

  for (let i = 0; i < totalEntries; i++) {
    const [employeeId, jobId] = pick(empEntries);
    const dateKey = randomWeekday(start, end);
    const punchStatus = weightedPick(punchStatusWeights);

    // Generate reasonable clock times (time-only, not timestamp)
    const shiftStart = randomInt(17, 20); // 5pm-8pm start
    const shiftHours = randomFloat(6, 9, 1);
    const clockIn = `${String(shiftStart).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}:00`;
    const clockOutHour = shiftStart + Math.floor(shiftHours);
    const clockOut = punchStatus === 'incomplete'
      ? null
      : `${String(clockOutHour % 24).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}:00`;

    const regularHours = Math.min(parseFloat(shiftHours), 8);
    const otHours = parseFloat(shiftHours) > 8 ? parseFloat((shiftHours - 8).toFixed(1)) : 0;

    rows.push({
      tenant_id: tenantId,
      employee_id: employeeId,
      job_id: jobId,
      date_key: dateKey,
      clock_in: clockIn,
      clock_out: clockOut,
      regular_hours: regularHours,
      ot_hours: otHours,
      dt_hours: 0,
      punch_status: punchStatus,
    });
  }

  return rows;
}

/**
 * Generate sf_fact_job_daily rows — one per site per weekday.
 */
export function generateJobDaily(tenantId, jobMap) {
  const start = new Date('2025-04-01');
  const end = new Date('2026-02-28');
  const weekdays = getAllWeekdays(start, end);
  const rows = [];

  for (const [, jobId] of Object.entries(jobMap)) {
    for (const dateKey of weekdays) {
      const headcount = randomInt(4, 15);
      rows.push({
        tenant_id: tenantId,
        job_id: jobId,
        date_key: dateKey,
        audits: Math.random() < 0.30 ? randomInt(1, 3) : 0,
        corrective_actions: Math.random() < 0.15 ? randomInt(1, 2) : 0,
        recordable_incidents: Math.random() < 0.01 ? 1 : 0,
        good_saves: Math.random() < 0.10 ? randomInt(1, 2) : 0,
        near_misses: Math.random() < 0.05 ? 1 : 0,
        trir: randomFloat(0, 4, 2),
        headcount,
      });
    }
  }

  return rows;
}
