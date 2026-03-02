import { Router } from 'express';

const router = Router();

const PLATFORM_ROLES = ['super-admin', 'platform_owner'];

function resolveEffectiveTenantId(req, paramTenantId) {
  if (PLATFORM_ROLES.includes(req.user?.role)) {
    return paramTenantId || req.tenantId;
  }
  return req.tenantId;
}

function requireAdmin(req, res, next) {
  const adminRoles = ['platform_owner', 'super-admin', 'admin'];
  if (!adminRoles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ─── Metrics CRUD ───────────────────────────────────────────────────────────

/**
 * GET /api/metrics/:tenantId
 * List all metrics for a tenant, optionally filtered by domain_id.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    let query = req.supabase
      .from('tenant_metrics')
      .select('*, tenant_dashboard_domains!inner(domain_key, name)')
      .eq('tenant_id', effectiveTenantId)
      .eq('is_active', true)
      .order('sort_order');

    if (req.query.domain_id) {
      query = query.eq('domain_id', req.query.domain_id);
    }

    if (req.query.is_hero === 'true') {
      query = query.eq('is_hero', true).order('hero_order');
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ metrics: data || [] });
  } catch (err) {
    console.error('[metrics] List error:', err.message);
    res.status(500).json({ error: 'Failed to list metrics' });
  }
});

/**
 * GET /api/metrics/:tenantId/:metricId
 * Get a single metric by ID.
 */
router.get('/:tenantId/:metricId', async (req, res) => {
  const { tenantId, metricId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_metrics')
      .select('*, tenant_dashboard_domains!inner(domain_key, name)')
      .eq('id', metricId)
      .eq('tenant_id', effectiveTenantId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Metric not found' });

    res.json({ metric: data });
  } catch (err) {
    console.error('[metrics] Get error:', err.message);
    res.status(500).json({ error: 'Failed to get metric' });
  }
});

/**
 * POST /api/metrics/:tenantId
 * Create a new metric.
 */
router.post('/:tenantId', requireAdmin, async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const {
    domain_id, metric_key, label, description,
    source_table, source_column, date_column, site_column,
    aggregation, filter_conditions,
    secondary_table, secondary_column, secondary_agg, secondary_filter, compound_multiply,
    display_as, format, unit, icon, color,
    group_by, group_truncate, group_label_table, group_label_column, group_label_key,
    is_hero, hero_order, sensitivity, sort_order,
  } = req.body;

  if (!domain_id || !metric_key || !label || !source_table) {
    return res.status(400).json({ error: 'domain_id, metric_key, label, and source_table are required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_metrics')
      .insert({
        tenant_id: effectiveTenantId,
        domain_id, metric_key, label, description,
        source_table, source_column, date_column, site_column,
        aggregation, filter_conditions,
        secondary_table, secondary_column, secondary_agg, secondary_filter, compound_multiply,
        display_as, format, unit, icon, color,
        group_by, group_truncate, group_label_table, group_label_column, group_label_key,
        is_hero, hero_order, sensitivity, sort_order,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ metric: data });
  } catch (err) {
    console.error('[metrics] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create metric' });
  }
});

/**
 * PUT /api/metrics/:tenantId/:metricId
 * Update a metric.
 */
router.put('/:tenantId/:metricId', requireAdmin, async (req, res) => {
  const { tenantId, metricId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Only allow specific fields to be updated
  const allowedFields = [
    'domain_id', 'metric_key', 'label', 'description',
    'source_table', 'source_column', 'date_column', 'site_column',
    'aggregation', 'filter_conditions',
    'secondary_table', 'secondary_column', 'secondary_agg', 'secondary_filter', 'compound_multiply',
    'display_as', 'format', 'unit', 'icon', 'color',
    'group_by', 'group_truncate', 'group_label_table', 'group_label_column', 'group_label_key',
    'is_hero', 'hero_order', 'sensitivity', 'sort_order', 'is_active',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_metrics')
      .update(updates)
      .eq('id', metricId)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Metric not found' });

    res.json({ metric: data });
  } catch (err) {
    console.error('[metrics] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update metric' });
  }
});

/**
 * DELETE /api/metrics/:tenantId/:metricId
 * Soft-delete a metric (set is_active=false).
 */
router.delete('/:tenantId/:metricId', requireAdmin, async (req, res) => {
  const { tenantId, metricId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_metrics')
      .update({ is_active: false })
      .eq('id', metricId)
      .eq('tenant_id', effectiveTenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Metric not found' });

    res.json({ deleted: true });
  } catch (err) {
    console.error('[metrics] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete metric' });
  }
});

// ─── Thresholds CRUD ────────────────────────────────────────────────────────

/**
 * GET /api/metrics/:tenantId/:metricId/threshold
 * Get threshold for a metric.
 */
router.get('/:tenantId/:metricId/threshold', async (req, res) => {
  const { tenantId, metricId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_metric_thresholds')
      .select('*')
      .eq('metric_id', metricId)
      .eq('tenant_id', effectiveTenantId)
      .maybeSingle();

    if (error) throw error;

    res.json({ threshold: data || null });
  } catch (err) {
    console.error('[metrics] Get threshold error:', err.message);
    res.status(500).json({ error: 'Failed to get threshold' });
  }
});

/**
 * POST /api/metrics/:tenantId/:metricId/threshold
 * Create or replace threshold for a metric.
 */
router.post('/:tenantId/:metricId/threshold', requireAdmin, async (req, res) => {
  const { tenantId, metricId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const {
    operator, threshold_value, scope, priority,
    description_template, action_label, dept_label,
    escalation_operator, escalation_value, escalation_priority,
  } = req.body;

  if (!operator || threshold_value == null) {
    return res.status(400).json({ error: 'operator and threshold_value are required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_metric_thresholds')
      .upsert({
        tenant_id: effectiveTenantId,
        metric_id: metricId,
        operator, threshold_value, scope, priority,
        description_template, action_label, dept_label,
        escalation_operator, escalation_value, escalation_priority,
      }, { onConflict: 'metric_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ threshold: data });
  } catch (err) {
    console.error('[metrics] Create threshold error:', err.message);
    res.status(500).json({ error: 'Failed to create threshold' });
  }
});

/**
 * DELETE /api/metrics/:tenantId/:metricId/threshold
 * Delete threshold for a metric.
 */
router.delete('/:tenantId/:metricId/threshold', requireAdmin, async (req, res) => {
  const { tenantId, metricId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { error } = await req.supabase
      .from('tenant_metric_thresholds')
      .delete()
      .eq('metric_id', metricId)
      .eq('tenant_id', effectiveTenantId);

    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    console.error('[metrics] Delete threshold error:', err.message);
    res.status(500).json({ error: 'Failed to delete threshold' });
  }
});

// ─── Data Sources ───────────────────────────────────────────────────────────

/**
 * GET /api/metrics/:tenantId/data-sources
 * List discovered data sources for a tenant.
 */
router.get('/:tenantId/data-sources', async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_data_sources')
      .select('*')
      .eq('tenant_id', effectiveTenantId)
      .order('table_name')
      .order('column_name');

    if (error) throw error;
    res.json({ dataSources: data || [] });
  } catch (err) {
    console.error('[metrics] Data sources list error:', err.message);
    res.status(500).json({ error: 'Failed to list data sources' });
  }
});

/**
 * POST /api/metrics/:tenantId/data-sources/discover
 * Introspect tenant's data tables and populate tenant_data_sources.
 * Only tables with a tenant_id column are eligible.
 */
router.post('/:tenantId/data-sources/discover', requireAdmin, async (req, res) => {
  const { tenantId } = req.params;
  const effectiveTenantId = resolveEffectiveTenantId(req, tenantId);

  if (!PLATFORM_ROLES.includes(req.user?.role) && effectiveTenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // System tables that should never be exposed
  const BLOCKED_TABLES = new Set([
    'profiles', 'alf_tenants', 'alf_platform_config', 'alf_agent_definitions',
    'alf_usage_logs', 'tenant_api_credentials', 'tenant_metrics',
    'tenant_metric_thresholds', 'tenant_data_sources',
  ]);

  try {
    // Query information_schema for tables that have a tenant_id column
    const { data: tenantTables, error: schemaErr } = await req.supabase.rpc(
      'discover_tenant_tables', {}
    ).catch(() => ({ data: null, error: { message: 'RPC not available' } }));

    // Fallback: discover from known sf_* tables
    const SF_TABLES = [
      'sf_dim_job', 'sf_dim_employee',
      'sf_fact_work_tickets', 'sf_fact_labor_budget_actual',
      'sf_fact_job_daily', 'sf_fact_timekeeping',
    ];

    const discovered = [];

    for (const tableName of SF_TABLES) {
      if (BLOCKED_TABLES.has(tableName)) continue;

      try {
        // Get columns by selecting a single row
        const { data: sample, error: sampleErr } = await req.supabase
          .from(tableName)
          .select('*')
          .eq('tenant_id', effectiveTenantId)
          .limit(1);

        if (sampleErr || !sample?.length) continue;

        // Get row count
        const { count } = await req.supabase
          .from(tableName)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', effectiveTenantId);

        const row = sample[0];
        for (const [colName, colValue] of Object.entries(row)) {
          if (colName === 'tenant_id') continue; // Skip tenant_id itself

          let dataType = 'text';
          if (colValue === null) dataType = 'text';
          else if (typeof colValue === 'number') dataType = Number.isInteger(colValue) ? 'integer' : 'numeric';
          else if (typeof colValue === 'boolean') dataType = 'boolean';
          else if (typeof colValue === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(colValue)) dataType = 'date';
            else if (/^\d{4}-\d{2}-\d{2}T/.test(colValue)) dataType = 'timestamptz';
            else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(colValue)) dataType = 'uuid';
          }

          discovered.push({
            tenant_id: effectiveTenantId,
            table_name: tableName,
            column_name: colName,
            data_type: dataType,
            is_nullable: true,
            row_count: count || 0,
          });
        }
      } catch (tableErr) {
        console.warn(`[metrics] Discovery skipped ${tableName}:`, tableErr.message);
      }
    }

    if (discovered.length > 0) {
      const { error: upsertErr } = await req.supabase
        .from('tenant_data_sources')
        .upsert(discovered, { onConflict: 'tenant_id,table_name,column_name' });

      if (upsertErr) throw upsertErr;
    }

    res.json({ discovered: discovered.length, tables: [...new Set(discovered.map(d => d.table_name))] });
  } catch (err) {
    console.error('[metrics] Discovery error:', err.message);
    res.status(500).json({ error: 'Schema discovery failed' });
  }
});

export default router;
