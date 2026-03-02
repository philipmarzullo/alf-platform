-- Dynamic Dashboard Metrics
-- Creates tenant_metrics, tenant_metric_thresholds, and tenant_data_sources tables
-- for per-tenant metric definitions, threshold-based alerts, and schema discovery.
-- Tenants with no rows in these tables fall back to hardcoded dashboard behavior.

-- ═══════════════════════════════════════════════════════
-- 1. tenant_metrics
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_metrics (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  domain_id         uuid NOT NULL REFERENCES tenant_dashboard_domains(id) ON DELETE CASCADE,

  -- Identity
  metric_key        text NOT NULL,
  label             text NOT NULL,
  description       text,

  -- Data source
  source_table      text NOT NULL,
  source_column     text,
  date_column       text DEFAULT 'date_key',
  site_column       text DEFAULT 'job_id',

  -- How to compute
  aggregation       text NOT NULL DEFAULT 'count',
  filter_conditions jsonb,

  -- For compound aggregations (ratio, variance)
  secondary_table   text,
  secondary_column  text,
  secondary_agg     text,
  secondary_filter  jsonb,
  compound_multiply numeric DEFAULT 1,

  -- Display
  display_as        text NOT NULL DEFAULT 'kpi'
                    CHECK (display_as IN ('kpi', 'bar', 'line', 'pie', 'table')),
  format            text DEFAULT 'number'
                    CHECK (format IN ('number', 'currency', 'percent', 'integer')),
  unit              text,
  icon              text,
  color             text,

  -- For charts: grouping
  group_by            text,
  group_truncate      text,
  group_label_table   text,
  group_label_column  text,
  group_label_key     text,

  -- Command Center
  is_hero           boolean DEFAULT false,
  hero_order        integer,

  -- Visibility
  sensitivity       text DEFAULT 'operational'
                    CHECK (sensitivity IN ('operational', 'managerial', 'financial')),
  sort_order        integer DEFAULT 0,
  is_active         boolean DEFAULT true,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  CONSTRAINT tenant_metrics_tenant_key_unique UNIQUE (tenant_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_metrics_tenant ON tenant_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_metrics_domain ON tenant_metrics(domain_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_metrics_updated_at
  BEFORE UPDATE ON tenant_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_metrics_updated_at();

-- ═══════════════════════════════════════════════════════
-- 2. tenant_metric_thresholds
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_metric_thresholds (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  metric_id             uuid NOT NULL REFERENCES tenant_metrics(id) ON DELETE CASCADE,

  -- Trigger condition
  operator              text NOT NULL CHECK (operator IN ('gt', 'lt', 'gte', 'lte')),
  threshold_value       numeric NOT NULL,
  scope                 text NOT NULL DEFAULT 'per_site'
                        CHECK (scope IN ('per_site', 'aggregate')),

  -- Alert output
  priority              text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  description_template  text,
  action_label          text DEFAULT 'Review',
  dept_label            text,

  -- Optional escalation tier
  escalation_operator   text CHECK (escalation_operator IN ('gt', 'lt', 'gte', 'lte')),
  escalation_value      numeric,
  escalation_priority   text CHECK (escalation_priority IN ('critical', 'high', 'medium', 'low')),

  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),

  CONSTRAINT tenant_metric_thresholds_metric_unique UNIQUE (metric_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_metric_thresholds_tenant ON tenant_metric_thresholds(tenant_id);

-- ═══════════════════════════════════════════════════════
-- 3. tenant_data_sources
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_data_sources (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,

  table_name      text NOT NULL,
  column_name     text NOT NULL,
  data_type       text NOT NULL,
  is_nullable     boolean DEFAULT true,
  sample_values   jsonb,
  row_count       integer,
  min_value       text,
  max_value       text,

  discovered_at   timestamptz DEFAULT now(),

  CONSTRAINT tenant_data_sources_unique UNIQUE (tenant_id, table_name, column_name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_data_sources_tenant ON tenant_data_sources(tenant_id);

-- ═══════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════

-- tenant_metrics
ALTER TABLE tenant_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_access"
  ON tenant_metrics FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner')
  );

CREATE POLICY "super_admin_own_tenant_metrics"
  ON tenant_metrics FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin')
  );

CREATE POLICY "tenant_user_read_own_metrics"
  ON tenant_metrics FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );

-- tenant_metric_thresholds
ALTER TABLE tenant_metric_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_access"
  ON tenant_metric_thresholds FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner')
  );

CREATE POLICY "super_admin_own_tenant_thresholds"
  ON tenant_metric_thresholds FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin')
  );

CREATE POLICY "tenant_user_read_own_thresholds"
  ON tenant_metric_thresholds FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );

-- tenant_data_sources
ALTER TABLE tenant_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_access"
  ON tenant_data_sources FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner')
  );

CREATE POLICY "super_admin_own_tenant_data_sources"
  ON tenant_data_sources FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin')
  );

CREATE POLICY "tenant_user_read_own_data_sources"
  ON tenant_data_sources FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );
