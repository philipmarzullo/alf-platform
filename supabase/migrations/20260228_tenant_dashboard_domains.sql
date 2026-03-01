-- Phase 4: Dynamic Dashboards
-- Creates tenant_dashboard_domains table for per-tenant dashboard domain
-- definitions generated from company profiles and workspace structure.
-- Coexists alongside existing dashboard_configs and user_dashboard_configs.

-- ═══════════════════════════════════════════════════════
-- 1. tenant_dashboard_domains
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_dashboard_domains (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  domain_key           text NOT NULL,
  name                 text NOT NULL,
  description          text,
  icon                 text,
  kpi_definitions      jsonb DEFAULT '{}'::jsonb,
  source_workspace_ids jsonb DEFAULT '[]'::jsonb,
  sort_order           integer DEFAULT 0,
  is_active            boolean DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  CONSTRAINT tenant_dashboard_domains_tenant_key_unique UNIQUE (tenant_id, domain_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_dashboard_domains_tenant_id ON tenant_dashboard_domains(tenant_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_dashboard_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_dashboard_domains_updated_at
  BEFORE UPDATE ON tenant_dashboard_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_dashboard_domains_updated_at();

-- ─── RLS ───

ALTER TABLE tenant_dashboard_domains ENABLE ROW LEVEL SECURITY;

-- Platform owner: full access
CREATE POLICY "platform_owner_full_access"
  ON tenant_dashboard_domains
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'platform_owner'
    )
  );

-- Tenant super-admin: read/write own
CREATE POLICY "super_admin_own_dashboard_domains"
  ON tenant_dashboard_domains
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super-admin'
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super-admin'
    )
  );

-- Tenant user: read own
CREATE POLICY "tenant_user_read_own_dashboard_domains"
  ON tenant_dashboard_domains
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );
