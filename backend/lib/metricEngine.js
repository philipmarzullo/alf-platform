/**
 * Dynamic Metric Engine
 *
 * Executes tenant-defined metrics against their data tables and evaluates
 * threshold-based attention items. Used by dashboard endpoints when a tenant
 * has rows in tenant_metrics (dynamic path); tenants without rows fall back
 * to the legacy hardcoded queries.
 */

// ─── Supabase pagination helper (same pattern as dashboards.js) ──────────────

async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Filter condition helpers ────────────────────────────────────────────────

function applyFilterConditions(rows, conditions) {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return rows;

  return rows.filter(row => {
    return conditions.every(cond => {
      const val = row[cond.column];
      switch (cond.op) {
        case 'eq':  return val === cond.value;
        case 'neq': return val !== cond.value;
        case 'gt':  return Number(val) > Number(cond.value);
        case 'gte': return Number(val) >= Number(cond.value);
        case 'lt':  return Number(val) < Number(cond.value);
        case 'lte': return Number(val) <= Number(cond.value);
        case 'in':  return Array.isArray(cond.value) && cond.value.includes(val);
        case 'not_null': return val != null;
        case 'is_null':  return val == null;
        default: return true;
      }
    });
  });
}

// ─── Aggregation primitives ─────────────────────────────────────────────────

function aggregate(rows, aggType, column) {
  switch (aggType) {
    case 'count':
      return rows.length;

    case 'count_distinct': {
      const vals = new Set(rows.map(r => r[column]).filter(v => v != null));
      return vals.size;
    }

    case 'sum': {
      let total = 0;
      for (const r of rows) total += Number(r[column]) || 0;
      return total;
    }

    case 'avg': {
      const nums = rows.map(r => Number(r[column])).filter(n => !isNaN(n));
      if (nums.length === 0) return null;
      return nums.reduce((s, v) => s + v, 0) / nums.length;
    }

    case 'min': {
      const nums = rows.map(r => Number(r[column])).filter(n => !isNaN(n));
      return nums.length ? Math.min(...nums) : null;
    }

    case 'max': {
      const nums = rows.map(r => Number(r[column])).filter(n => !isNaN(n));
      return nums.length ? Math.max(...nums) : null;
    }

    // count_where and sum_where are handled by the caller applying filters first
    case 'count_where':
      return rows.length;

    case 'sum_where': {
      let total = 0;
      for (const r of rows) total += Number(r[column]) || 0;
      return total;
    }

    default:
      return rows.length;
  }
}

// ─── Fetch rows for a metric from Supabase ──────────────────────────────────

async function fetchMetricRows(supabase, tenantId, table, dateColumn, siteColumn, filters) {
  return fetchAllRows(() => {
    let q = supabase.from(table).select('*').eq('tenant_id', tenantId);
    if (filters.dateFrom && dateColumn) q = q.gte(dateColumn, filters.dateFrom);
    if (filters.dateTo && dateColumn)   q = q.lte(dateColumn, filters.dateTo);
    if (filters.jobIds?.length && siteColumn) q = q.in(siteColumn, filters.jobIds);
    return q;
  });
}

// ─── Compute a single metric value ──────────────────────────────────────────

async function computeMetric(supabase, tenantId, metric, filters, rowCache) {
  const cacheKey = `${metric.source_table}:${metric.date_column}:${metric.site_column}`;

  // Reuse fetched rows for the same table+date+site combo
  if (!rowCache[cacheKey]) {
    rowCache[cacheKey] = await fetchMetricRows(
      supabase, tenantId, metric.source_table,
      metric.date_column, metric.site_column, filters
    );
  }
  let rows = rowCache[cacheKey];

  const agg = metric.aggregation;

  // Simple aggregations
  if (['count', 'count_distinct', 'sum', 'avg', 'min', 'max'].includes(agg)) {
    return aggregate(rows, agg, metric.source_column);
  }

  // Filtered aggregations
  if (agg === 'count_where' || agg === 'sum_where') {
    const filtered = applyFilterConditions(rows, metric.filter_conditions);
    return aggregate(filtered, agg, metric.source_column);
  }

  // Compound: ratio
  if (agg === 'ratio') {
    const numeratorRows = applyFilterConditions(rows, metric.filter_conditions);
    const numAgg = metric.source_column ? 'sum' : 'count';
    const numerator = aggregate(numeratorRows, numAgg, metric.source_column);

    // Denominator — may be same or different table
    const secTable = metric.secondary_table || metric.source_table;
    let denomRows;
    if (secTable === metric.source_table) {
      denomRows = rows;
    } else {
      const secKey = `${secTable}:${metric.date_column}:${metric.site_column}`;
      if (!rowCache[secKey]) {
        rowCache[secKey] = await fetchMetricRows(
          supabase, tenantId, secTable, metric.date_column, metric.site_column, filters
        );
      }
      denomRows = rowCache[secKey];
    }
    if (metric.secondary_filter) {
      denomRows = applyFilterConditions(denomRows, metric.secondary_filter);
    }
    const denAgg = metric.secondary_agg || (metric.secondary_column ? 'sum' : 'count');
    const denominator = aggregate(denomRows, denAgg, metric.secondary_column);

    if (!denominator) return 0;
    const multiply = Number(metric.compound_multiply) || 1;
    return +((numerator / denominator) * multiply).toFixed(1);
  }

  // Compound: variance = (primary - secondary) / secondary * multiply
  if (agg === 'variance') {
    const primary = aggregate(rows, 'sum', metric.source_column);
    const secondary = aggregate(rows, 'sum', metric.secondary_column);
    if (!secondary) return 0;
    const multiply = Number(metric.compound_multiply) || 1;
    return +(((primary - secondary) / secondary) * multiply).toFixed(1);
  }

  // Fallback
  return aggregate(rows, 'count', null);
}

// ─── Compute a metric grouped by a column (for charts or per-site thresholds) ─

async function computeMetricGrouped(supabase, tenantId, metric, filters, groupByCol, rowCache) {
  const cacheKey = `${metric.source_table}:${metric.date_column}:${metric.site_column}`;

  if (!rowCache[cacheKey]) {
    rowCache[cacheKey] = await fetchMetricRows(
      supabase, tenantId, metric.source_table,
      metric.date_column, metric.site_column, filters
    );
  }
  const rows = rowCache[cacheKey];

  // Group rows
  const groups = {};
  for (const row of rows) {
    const key = row[groupByCol] ?? '__null__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const agg = metric.aggregation;
  const results = {};

  for (const [key, groupRows] of Object.entries(groups)) {
    if (agg === 'ratio') {
      const numeratorRows = applyFilterConditions(groupRows, metric.filter_conditions);
      const numAgg = metric.source_column ? 'sum' : 'count';
      const numerator = aggregate(numeratorRows, numAgg, metric.source_column);

      let denomRows = groupRows;
      if (metric.secondary_filter) {
        denomRows = applyFilterConditions(groupRows, metric.secondary_filter);
      }
      const denAgg = metric.secondary_agg || (metric.secondary_column ? 'sum' : 'count');
      const denominator = aggregate(denomRows, denAgg, metric.secondary_column);

      const multiply = Number(metric.compound_multiply) || 1;
      results[key] = denominator ? +((numerator / denominator) * multiply).toFixed(1) : 0;
    } else if (agg === 'variance') {
      const primary = aggregate(groupRows, 'sum', metric.source_column);
      const secondary = aggregate(groupRows, 'sum', metric.secondary_column);
      const multiply = Number(metric.compound_multiply) || 1;
      results[key] = secondary ? +(((primary - secondary) / secondary) * multiply).toFixed(1) : 0;
    } else if (agg === 'count_where' || agg === 'sum_where') {
      const filtered = applyFilterConditions(groupRows, metric.filter_conditions);
      results[key] = aggregate(filtered, agg, metric.source_column);
    } else {
      results[key] = aggregate(groupRows, agg, metric.source_column);
    }
  }

  return results;
}

// ─── Public API: executeMetrics ─────────────────────────────────────────────

/**
 * Execute an array of metric definitions and return computed values.
 *
 * @param {object} supabase - Supabase client
 * @param {string} tenantId - Tenant UUID
 * @param {object[]} metrics - Array of tenant_metrics rows
 * @param {object} filters - { dateFrom, dateTo, jobIds }
 * @param {Set<string>} allowedTables - Set of table names from tenant_data_sources
 * @returns {{ [metricKey]: value | [{group, label, value}] }}
 */
export async function executeMetrics(supabase, tenantId, metrics, filters, allowedTables) {
  const rowCache = {};
  const results = {};

  for (const metric of metrics) {
    // Security: validate source_table is in the allowlist
    if (allowedTables && !allowedTables.has(metric.source_table)) {
      console.warn(`[metricEngine] Rejected metric ${metric.metric_key}: table ${metric.source_table} not in allowlist`);
      results[metric.metric_key] = null;
      continue;
    }
    if (metric.secondary_table && allowedTables && !allowedTables.has(metric.secondary_table)) {
      console.warn(`[metricEngine] Rejected metric ${metric.metric_key}: secondary table ${metric.secondary_table} not in allowlist`);
      results[metric.metric_key] = null;
      continue;
    }

    try {
      // Chart metrics with group_by return an array
      if (metric.group_by && metric.display_as !== 'kpi') {
        const grouped = await computeMetricGrouped(
          supabase, tenantId, metric, filters, metric.group_by, rowCache
        );

        // Resolve group labels if configured
        let labelMap = null;
        if (metric.group_label_table && metric.group_label_column && metric.group_label_key) {
          const { data: labels } = await supabase
            .from(metric.group_label_table)
            .select(`${metric.group_label_key}, ${metric.group_label_column}`)
            .eq('tenant_id', tenantId);

          if (labels) {
            labelMap = {};
            for (const row of labels) {
              labelMap[row[metric.group_label_key]] = row[metric.group_label_column];
            }
          }
        }

        // Apply group_truncate for date grouping
        let groupedData = grouped;
        if (metric.group_truncate && metric.group_by) {
          groupedData = truncateDateGroups(grouped, metric.group_truncate);
        }

        results[metric.metric_key] = Object.entries(groupedData).map(([key, value]) => ({
          group: key,
          label: labelMap?.[key] || key,
          value,
        }));
      } else {
        // Scalar KPI
        results[metric.metric_key] = await computeMetric(supabase, tenantId, metric, filters, rowCache);
      }
    } catch (err) {
      console.error(`[metricEngine] Error computing ${metric.metric_key}:`, err.message);
      results[metric.metric_key] = null;
    }
  }

  return results;
}

// ─── Date truncation for chart grouping ─────────────────────────────────────

function truncateDateGroups(grouped, truncate) {
  const buckets = {};
  for (const [key, value] of Object.entries(grouped)) {
    let bucket;
    try {
      const d = new Date(key);
      if (isNaN(d.getTime())) { bucket = key; }
      else {
        switch (truncate) {
          case 'day':     bucket = key.slice(0, 10); break;
          case 'week': {
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            bucket = monday.toISOString().slice(0, 10);
            break;
          }
          case 'month':   bucket = key.slice(0, 7); break;
          case 'quarter': {
            const q = Math.ceil((d.getMonth() + 1) / 3);
            bucket = `${d.getFullYear()}-Q${q}`;
            break;
          }
          default: bucket = key;
        }
      }
    } catch { bucket = key; }

    buckets[bucket] = (buckets[bucket] || 0) + value;
  }
  return buckets;
}

// ─── Public API: evaluateThresholds ─────────────────────────────────────────

/**
 * Evaluate threshold rules against metric values and generate attention items.
 *
 * @param {object} supabase - Supabase client
 * @param {string} tenantId - Tenant UUID
 * @param {object[]} thresholds - Array of tenant_metric_thresholds rows (with joined metric)
 * @param {object[]} metrics - Full metric definitions (to look up by id)
 * @param {object} filters - { dateFrom, dateTo, jobIds }
 * @param {object} jobMap - { jobId: jobName } lookup
 * @param {Set<string>} allowedTables - Allowed table names
 * @returns {object[]} - Attention items sorted by priority
 */
export async function evaluateThresholds(supabase, tenantId, thresholds, metrics, filters, jobMap, allowedTables) {
  const rowCache = {};
  const attentionItems = [];
  let taskId = 0;

  const metricById = {};
  for (const m of metrics) metricById[m.id] = m;

  for (const threshold of thresholds) {
    if (!threshold.is_active) continue;

    const metric = metricById[threshold.metric_id];
    if (!metric) continue;

    // Security check
    if (allowedTables && !allowedTables.has(metric.source_table)) continue;

    try {
      if (threshold.scope === 'per_site') {
        // Compute metric per site
        const siteCol = metric.site_column || 'job_id';
        const grouped = await computeMetricGrouped(
          supabase, tenantId, metric, filters, siteCol, rowCache
        );

        for (const [siteId, value] of Object.entries(grouped)) {
          if (breaches(value, threshold.operator, threshold.threshold_value)) {
            let priority = threshold.priority;

            // Check escalation
            if (threshold.escalation_operator && threshold.escalation_value != null) {
              if (breaches(value, threshold.escalation_operator, threshold.escalation_value)) {
                priority = threshold.escalation_priority || 'high';
              }
            }

            const siteName = jobMap[siteId] || siteId;
            const description = renderTemplate(threshold.description_template, {
              value: formatValue(value, metric.format),
              site_name: siteName,
              metric_label: metric.label,
              threshold: threshold.threshold_value,
            });

            attentionItems.push({
              id: ++taskId,
              priority,
              dept: threshold.dept_label || metric.domain_key || 'operations',
              description,
              detail: `${metric.label}: ${formatValue(value, metric.format)}`,
              actionLabel: threshold.action_label || 'Review',
            });
          }
        }
      } else {
        // Aggregate scope — compute across all sites
        const value = await computeMetric(supabase, tenantId, metric, filters, rowCache);

        if (breaches(value, threshold.operator, threshold.threshold_value)) {
          let priority = threshold.priority;
          if (threshold.escalation_operator && threshold.escalation_value != null) {
            if (breaches(value, threshold.escalation_operator, threshold.escalation_value)) {
              priority = threshold.escalation_priority || 'high';
            }
          }

          const description = renderTemplate(threshold.description_template, {
            value: formatValue(value, metric.format),
            site_name: 'All Sites',
            metric_label: metric.label,
            threshold: threshold.threshold_value,
          });

          attentionItems.push({
            id: ++taskId,
            priority,
            dept: threshold.dept_label || metric.domain_key || 'operations',
            description,
            detail: `${metric.label}: ${formatValue(value, metric.format)}`,
            actionLabel: threshold.action_label || 'Review',
          });
        }
      }
    } catch (err) {
      console.error(`[metricEngine] Threshold evaluation error for metric ${metric?.metric_key}:`, err.message);
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  attentionItems.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

  return attentionItems;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function breaches(value, operator, threshold) {
  if (value == null) return false;
  const v = Number(value);
  const t = Number(threshold);
  switch (operator) {
    case 'gt':  return v > t;
    case 'lt':  return v < t;
    case 'gte': return v >= t;
    case 'lte': return v <= t;
    default:    return false;
  }
}

function renderTemplate(template, vars) {
  if (!template) return `${vars.metric_label}: ${vars.value} — ${vars.site_name}`;
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function formatValue(value, format) {
  if (value == null) return '--';
  switch (format) {
    case 'percent': return `${value}%`;
    case 'currency': return `$${Number(value).toLocaleString()}`;
    case 'integer': return Math.round(value).toLocaleString();
    default: return String(value);
  }
}

// ─── Public API: getAllowedTables ────────────────────────────────────────────

/**
 * Fetch the set of allowed table names for a tenant from tenant_data_sources.
 * Also includes the default sf_* tables that any tenant with synced data can use.
 */
export async function getAllowedTables(supabase, tenantId) {
  const { data } = await supabase
    .from('tenant_data_sources')
    .select('table_name')
    .eq('tenant_id', tenantId);

  const tables = new Set(
    (data || []).map(r => r.table_name)
  );

  // Always allow the standard sf_* tables for any tenant — these are created
  // by the sync system and always have tenant_id scoping
  const DEFAULT_TABLES = [
    'sf_dim_job', 'sf_dim_employee', 'sf_dim_date',
    'sf_fact_work_tickets', 'sf_fact_labor_budget_actual',
    'sf_fact_job_daily', 'sf_fact_timekeeping',
  ];
  for (const t of DEFAULT_TABLES) tables.add(t);

  return tables;
}
