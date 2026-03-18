/**
 * Snowflake-direct dashboard queries for QBU domains.
 *
 * These run live against Wavelytics views (not synced sf_* tables).
 * Each function connects via SnowflakeConnector.queryView() and returns
 * formatted data matching what the frontend dashboard components expect.
 *
 * NOTE: All *_DATE_KEY columns are surrogate MD5 hashes, NOT date strings.
 * We join DIM_DATE to resolve actual CALENDAR_DATE values for filtering/display.
 */

import SnowflakeConnector from '../sync/connectors/SnowflakeConnector.js';
import { getPlatformApiKey } from '../routes/platformCredentials.js';

// ── Lazy singleton connector per tenant ──
const connectors = new Map();

async function getConnector(supabase, tenantId) {
  if (connectors.has(tenantId)) return connectors.get(tenantId);

  const { data: sc } = await supabase
    .from('sync_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('connector_type', 'snowflake')
    .single();

  if (!sc?.config) throw new Error('Snowflake not configured for this tenant');

  // Decrypt platform Snowflake credentials (same path as sync runner)
  const credJson = await getPlatformApiKey(supabase, 'snowflake');
  if (!credJson) throw new Error('Snowflake platform credentials missing');
  const credentials = typeof credJson === 'string' ? JSON.parse(credJson) : credJson;

  const connector = new SnowflakeConnector(tenantId, sc.config, credentials);
  await connector.connect();
  connectors.set(tenantId, { connector, config: sc.config });
  return { connector, config: sc.config };
}

function fq(config) {
  return `${config.tenant_database}.${config.schema || 'PUBLIC'}`;
}

// Filter on a resolved CALENDAR_DATE column (from a DIM_DATE join alias)
function dateFilter(calendarDateCol, filters, binds) {
  const parts = [];
  if (filters.dateFrom) {
    binds.push(filters.dateFrom);
    parts.push(`${calendarDateCol} >= :${binds.length}`);
  }
  if (filters.dateTo) {
    binds.push(filters.dateTo);
    parts.push(`${calendarDateCol} <= :${binds.length}`);
  }
  return parts;
}

function jobFilter(col, filters, binds) {
  if (!filters.jobIds?.length) return [];
  const placeholders = filters.jobIds.map(id => {
    binds.push(id);
    return `:${binds.length}`;
  });
  return [`${col} IN (${placeholders.join(', ')})`];
}

// ── DOMAIN: action-items ──

async function queryActionItems(supabase, tenantId, filters) {
  const { connector, config } = await getConnector(supabase, tenantId);
  const prefix = fq(config);
  const binds = [config.company_filter];

  const conditions = [
    `li.JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
    `li.IS_CHECKPOINT_ITEM_DEFICIENT_FLAG = 1`,
  ];

  conditions.push(...dateFilter('d.CALENDAR_DATE', filters, binds));
  conditions.push(...jobFilter('li.JOB_KEY', filters, binds));
  if (filters.itemType) {
    binds.push(filters.itemType);
    conditions.push(`li.CHECKPOINT_ITEM_TYPE_LABEL = :${binds.length}`);
  }

  const sql = `
    SELECT
      li.CHECKPOINT_ID,
      li.CHECKPOINT_ITEM_LABEL,
      d.CALENDAR_DATE AS PERFORMED_DATE,
      li.IS_CHECKPOINT_ITEM_DEFICIENCY_OPEN_FLAG,
      li.IS_CHECKPOINT_ITEM_DEFICIENCY_CLOSED_FLAG,
      li.CHECKPOINT_ITEM_DEFICIENCY_DETAIL_TEXT,
      li.CHECKPOINT_ITEM_TYPE_LABEL,
      li.CHECKPOINT_SECTION_LABEL,
      j.JOB_NUMBER,
      j.JOB_NAME
    FROM ${prefix}.FACT_CHECKPOINT_LINEITEM li
    JOIN ${prefix}.DIM_JOB j ON j.JOB_KEY = li.JOB_KEY
    JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = li.CHECKPOINT_PERFORMED_DATE_KEY
    WHERE ${conditions.join(' AND ')}
    ORDER BY d.CALENDAR_DATE DESC
    LIMIT 2000
  `;

  const rows = await connector.queryView(sql, binds);

  // Build jobs list for filter dropdown
  const jobsSet = new Map();
  for (const r of rows) {
    if (r.job_number && !jobsSet.has(r.job_number)) {
      jobsSet.set(r.job_number, { id: r.job_number, job_name: r.job_name });
    }
  }

  // Build item types for filter
  const itemTypes = [...new Set(rows.map(r => r.checkpoint_item_type_label).filter(Boolean))].sort();

  return {
    items: rows.map(r => ({
      action_item_id: r.checkpoint_id,
      description: r.checkpoint_item_label,
      comment_date: r.performed_date,
      status: r.is_checkpoint_item_deficiency_open_flag === 1 ? 'Open' : 'Closed',
      comment: r.checkpoint_item_deficiency_detail_text,
      item_type: r.checkpoint_item_type_label,
      section: r.checkpoint_section_label,
      job_number: r.job_number,
      job_name: r.job_name,
    })),
    jobs: Array.from(jobsSet.values()),
    itemTypes,
  };
}

// ── DOMAIN: inspections ──

async function queryInspections(supabase, tenantId, filters) {
  const { connector, config } = await getConnector(supabase, tenantId);
  const prefix = fq(config);
  const binds = [config.company_filter];

  const headerConditions = [
    `c.JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
  ];
  headerConditions.push(...dateFilter('d.CALENDAR_DATE', filters, binds));
  headerConditions.push(...jobFilter('c.JOB_KEY', filters, binds));
  if (filters.inspectionType) {
    binds.push(filters.inspectionType);
    headerConditions.push(`c.CHECKPOINT_TEMPLATE_TYPE_LABEL = :${binds.length}`);
  }

  // Query 1: Inspection headers — join DIM_DATE for performed date
  const headerSql = `
    SELECT
      c.CHECKPOINT_ID,
      c.CHECKPOINT_KEY,
      d.CALENDAR_DATE AS PERFORMED_DATE,
      c.CHECKPOINT_SCORE_PERCENT,
      c.CHECKPOINT_EVALUATED_ITEM_QUANTITY,
      c.CHECKPOINT_DEFICIENT_ITEM_QUANTITY,
      c.CHECKPOINT_TEMPLATE_TYPE_LABEL,
      c.CHECKPOINT_ADDED_TIMESTAMP,
      j.JOB_NUMBER,
      j.JOB_NAME
    FROM ${prefix}.FACT_CHECKPOINT c
    JOIN ${prefix}.DIM_JOB j ON j.JOB_KEY = c.JOB_KEY
    JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = c.CHECKPOINT_PERFORMED_DATE_KEY
    WHERE ${headerConditions.join(' AND ')}
    ORDER BY d.CALENDAR_DATE DESC
    LIMIT 2000
  `;

  // Query 2: Deficiency line items — join DIM_DATE for performed date
  const binds2 = [config.company_filter];
  const lineConditions = [
    `li.JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
    `li.IS_CHECKPOINT_ITEM_DEFICIENT_FLAG = 1`,
  ];
  lineConditions.push(...dateFilter('d2.CALENDAR_DATE', filters, binds2));
  lineConditions.push(...jobFilter('li.JOB_KEY', filters, binds2));

  const lineSql = `
    SELECT
      li.CHECKPOINT_ID,
      d2.CALENDAR_DATE AS PERFORMED_DATE,
      li.CHECKPOINT_DEFICIENT_ITEM_CLOSED_TIMESTAMP,
      li.CHECKPOINT_ITEM_LABEL,
      li.CHECKPOINT_ITEM_DEFICIENCY_DETAIL_TEXT,
      li.CHECKPOINT_DEFICIENT_ITEM_NOTES_TEXT
    FROM ${prefix}.FACT_CHECKPOINT_LINEITEM li
    JOIN ${prefix}.DIM_DATE d2 ON d2.DATE_KEY = li.CHECKPOINT_PERFORMED_DATE_KEY
    WHERE ${lineConditions.join(' AND ')}
    ORDER BY d2.CALENDAR_DATE DESC
    LIMIT 2000
  `;

  const [headers, lineItems] = await Promise.all([
    connector.queryView(headerSql, binds),
    connector.queryView(lineSql, binds2),
  ]);

  // KPI calculations
  const inspectionCount = headers.length;
  const touchpointCount = headers.reduce((sum, r) => sum + (Number(r.checkpoint_evaluated_item_quantity) || 0), 0);
  const deficiencyCount = headers.reduce((sum, r) => sum + (Number(r.checkpoint_deficient_item_quantity) || 0), 0);
  const deficiencyPct = touchpointCount > 0 ? ((deficiencyCount / touchpointCount) * 100).toFixed(1) : '0.0';

  // Jobs for filter
  const jobsSet = new Map();
  for (const r of headers) {
    if (r.job_number && !jobsSet.has(r.job_number)) {
      jobsSet.set(r.job_number, { id: r.job_number, job_name: r.job_name });
    }
  }

  // Inspection types for filter
  const inspectionTypes = [...new Set(headers.map(r => r.checkpoint_template_type_label).filter(Boolean))].sort();

  return {
    kpis: {
      inspection_count: inspectionCount,
      touchpoint_count: touchpointCount,
      deficiency_count: deficiencyCount,
      deficiency_pct: parseFloat(deficiencyPct),
    },
    inspections: headers.map(r => ({
      id: r.checkpoint_id,
      checkpoint_key: r.checkpoint_key,
      job_number: r.job_number,
      job_name: r.job_name,
      date: r.performed_date,
      score_pct: r.checkpoint_score_percent != null ? Number(r.checkpoint_score_percent) : null,
      type: r.checkpoint_template_type_label,
    })),
    deficiencies: lineItems.map(r => ({
      checkpoint_id: r.checkpoint_id,
      added_date: r.performed_date,
      closed_date: r.checkpoint_deficient_item_closed_timestamp,
      item_description: r.checkpoint_item_label,
      deficiency_notes: r.checkpoint_item_deficiency_detail_text,
      closed_notes: r.checkpoint_deficient_item_notes_text,
    })),
    jobs: Array.from(jobsSet.values()),
    inspectionTypes,
  };
}

// ── DOMAIN: turnover ──

async function queryTurnover(supabase, tenantId, filters) {
  const { connector, config } = await getConnector(supabase, tenantId);
  const prefix = fq(config);
  const binds = [config.company_filter];

  const conditions = [
    `w.PRIMARY_JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
  ];
  conditions.push(...dateFilter('d.CALENDAR_DATE', filters, binds));
  conditions.push(...jobFilter('w.PRIMARY_JOB_KEY', filters, binds));

  // Monthly aggregation via DIM_DATE.CALENDAR_DATE for real date grouping
  const sql = `
    SELECT
      TO_CHAR(d.CALENDAR_DATE, 'YYYY-MM') AS month,
      COUNT(DISTINCT CASE WHEN w.IS_TERMINATION_INCLUDED_IN_TURNOVER_FLAG = 1 THEN w.EMPLOYEE_KEY END) AS termed,
      COUNT(DISTINCT CASE WHEN w.IS_ACTIVE_FLAG = 1 THEN w.EMPLOYEE_KEY END) AS active_employees
    FROM ${prefix}.FACT_EMPLOYEE_WORKFORCE_DAILY w
    JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = w.DATE_KEY
    WHERE ${conditions.join(' AND ')}
    GROUP BY TO_CHAR(d.CALENDAR_DATE, 'YYYY-MM')
    ORDER BY month
  `;

  const monthly = await connector.queryView(sql, binds);

  // Calculate turnover % per month
  let totalTermed = 0;
  let totalActive = 0;
  const monthlyData = monthly.map(r => {
    const termed = Number(r.termed) || 0;
    const active = Number(r.active_employees) || 0;
    const pct = active > 0 ? ((termed / active) * 100) : 0;
    totalTermed += termed;
    totalActive = Math.max(totalActive, active); // Use peak headcount for overall
    return {
      month: r.month,
      turnover_pct: parseFloat(pct.toFixed(1)),
      termed,
      active_employees: active,
    };
  });

  const overallPct = totalActive > 0 ? ((totalTermed / totalActive) * 100) : 0;

  // Jobs for filter
  const binds2 = [config.company_filter];
  const jobConditions = [
    `w.PRIMARY_JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
  ];
  jobConditions.push(...dateFilter('d.CALENDAR_DATE', filters, binds2));

  const jobSql = `
    SELECT DISTINCT j.JOB_NUMBER, j.JOB_NAME
    FROM ${prefix}.FACT_EMPLOYEE_WORKFORCE_DAILY w
    JOIN ${prefix}.DIM_JOB j ON j.JOB_KEY = w.PRIMARY_JOB_KEY
    JOIN ${prefix}.DIM_DATE d ON d.DATE_KEY = w.DATE_KEY
    WHERE ${jobConditions.join(' AND ')}
    ORDER BY j.JOB_NAME
    LIMIT 500
  `;
  const jobRows = await connector.queryView(jobSql, binds2);

  return {
    kpis: {
      monthly_turnover_pct: parseFloat(overallPct.toFixed(1)),
      termed_employees: totalTermed,
    },
    monthly: monthlyData,
    jobs: jobRows.map(r => ({ id: r.job_number, job_name: r.job_name })),
  };
}

// ── DOMAIN: work-tickets-qbu ──

async function queryWorkTicketsQBU(supabase, tenantId, filters) {
  const { connector, config } = await getConnector(supabase, tenantId);
  const prefix = fq(config);
  const binds = [config.company_filter];

  const conditions = [
    `t.JOB_KEY IN (SELECT JOB_KEY FROM ${prefix}.DIM_JOB WHERE JOB_COMPANY_NAME = :1)`,
  ];
  conditions.push(...dateFilter('ds.CALENDAR_DATE', filters, binds));
  conditions.push(...jobFilter('t.JOB_KEY', filters, binds));
  if (filters.ticketType) {
    binds.push(filters.ticketType);
    conditions.push(`t.WORK_SCHEDULE_TYPE_LABEL = :${binds.length}`);
  }

  // Two DIM_DATE joins: ds for scheduled date, dc for completed date
  const sql = `
    SELECT
      t.WORK_TICKET_NUMBER,
      ds.CALENDAR_DATE AS SCHEDULE_DATE,
      dc.CALENDAR_DATE AS COMPLETION_DATE,
      t.WORK_SCHEDULE_TYPE_LABEL,
      t.WORK_TICKET_COMPLETION_NOTES,
      t.IS_WORK_TICKET_COMPLETED_FLAG,
      j.JOB_NUMBER,
      j.JOB_NAME,
      j.JOB_ADDRESS_LINE_1,
      j.JOB_CITY,
      j.JOB_STATE_CODE,
      tk.WORK_SCHEDULE_TASK_NAME
    FROM ${prefix}.FACT_WORK_SCHEDULE_TICKET t
    JOIN ${prefix}.DIM_JOB j ON j.JOB_KEY = t.JOB_KEY
    JOIN ${prefix}.DIM_DATE ds ON ds.DATE_KEY = t.WORK_TICKET_SCHEDULED_DATE_KEY
    LEFT JOIN ${prefix}.DIM_DATE dc ON dc.DATE_KEY = t.WORK_TICKET_COMPLETED_DATE_KEY
    LEFT JOIN ${prefix}.DIM_WORK_SCHEDULE_TASK tk ON tk.WORK_SCHEDULE_TASK_KEY = t.WORK_SCHEDULE_TASK_KEY
    WHERE ${conditions.join(' AND ')}
    ORDER BY ds.CALENDAR_DATE DESC
    LIMIT 2000
  `;

  const rows = await connector.queryView(sql, binds);

  const completed = [];
  const upcoming = [];

  for (const r of rows) {
    const ticket = {
      ticket_number: r.work_ticket_number,
      schedule_date: r.schedule_date,
      address: r.job_address_line_1,
      city: r.job_city,
      state: r.job_state_code,
      type: r.work_schedule_type_label,
      work_description: r.work_ticket_completion_notes || r.work_schedule_task_name || '',
      job_number: r.job_number,
      job_name: r.job_name,
    };

    if (r.is_work_ticket_completed_flag === 1) {
      ticket.completion_date = r.completion_date;
      completed.push(ticket);
    } else {
      upcoming.push(ticket);
    }
  }

  // Jobs for filter
  const jobsSet = new Map();
  for (const r of rows) {
    if (r.job_number && !jobsSet.has(r.job_number)) {
      jobsSet.set(r.job_number, { id: r.job_number, job_name: r.job_name });
    }
  }

  // Types for filter
  const ticketTypes = [...new Set(rows.map(r => r.work_schedule_type_label).filter(Boolean))].sort();

  return {
    completed,
    upcoming,
    jobs: Array.from(jobsSet.values()),
    ticketTypes,
  };
}

// ── Domain Dispatcher ──

const SNOWFLAKE_DOMAINS = new Set(['action-items', 'inspections', 'turnover', 'work-tickets-qbu']);

async function getSnowflakeDomainData(supabase, tenantId, domain, filters) {
  switch (domain) {
    case 'action-items':
      return queryActionItems(supabase, tenantId, filters);
    case 'inspections':
      return queryInspections(supabase, tenantId, filters);
    case 'turnover':
      return queryTurnover(supabase, tenantId, filters);
    case 'work-tickets-qbu':
      return queryWorkTicketsQBU(supabase, tenantId, filters);
    default:
      throw new Error(`Unknown Snowflake domain: ${domain}`);
  }
}

export { SNOWFLAKE_DOMAINS, getSnowflakeDomainData };
