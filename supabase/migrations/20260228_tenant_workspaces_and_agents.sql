-- Phase 2: Dynamic Workspaces + Agents
-- Creates tenant_workspaces and tenant_agents tables for per-tenant
-- generated portal structure driven by company profiles.

-- ═══════════════════════════════════════════════════════
-- 1. tenant_workspaces
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_workspaces (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  department_key    text NOT NULL,
  name              text NOT NULL,
  icon              text,
  description       text,
  dashboard_domains jsonb DEFAULT '[]'::jsonb,
  sort_order        integer DEFAULT 0,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT tenant_workspaces_tenant_dept_unique UNIQUE (tenant_id, department_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_workspaces_tenant_id ON tenant_workspaces(tenant_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_workspaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_workspaces_updated_at
  BEFORE UPDATE ON tenant_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_workspaces_updated_at();

-- ─── RLS ───

ALTER TABLE tenant_workspaces ENABLE ROW LEVEL SECURITY;

-- Platform owner: full access
CREATE POLICY "platform_owner_full_access"
  ON tenant_workspaces
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
CREATE POLICY "super_admin_own_workspaces"
  ON tenant_workspaces
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
CREATE POLICY "tenant_user_read_own_workspaces"
  ON tenant_workspaces
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );


-- ═══════════════════════════════════════════════════════
-- 2. tenant_agents
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_agents (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  agent_key       text NOT NULL,
  name            text NOT NULL,
  workspace_id    uuid REFERENCES tenant_workspaces(id) ON DELETE SET NULL,
  system_prompt   text,
  model           text DEFAULT 'claude-sonnet-4-20250514',
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT tenant_agents_tenant_key_unique UNIQUE (tenant_id, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_agents_tenant_id ON tenant_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_agents_workspace_id ON tenant_agents(workspace_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_agents_updated_at
  BEFORE UPDATE ON tenant_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_agents_updated_at();

-- ─── RLS ───

ALTER TABLE tenant_agents ENABLE ROW LEVEL SECURITY;

-- Platform owner: full access
CREATE POLICY "platform_owner_full_access"
  ON tenant_agents
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
CREATE POLICY "super_admin_own_agents"
  ON tenant_agents
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
CREATE POLICY "tenant_user_read_own_agents"
  ON tenant_agents
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );
