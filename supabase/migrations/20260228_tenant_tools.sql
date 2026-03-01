-- Phase 3: Dynamic Tools
-- Creates tenant_tools table for per-tenant tool definitions
-- generated from company profiles. Coexists alongside hardcoded
-- tool agents and tenant_custom_tools.

-- ═══════════════════════════════════════════════════════
-- 1. tenant_tools
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_tools (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  tool_key        text NOT NULL,
  name            text NOT NULL,
  description     text,
  icon            text,
  workspace_id    uuid REFERENCES tenant_workspaces(id) ON DELETE SET NULL,
  agent_key       text,
  intake_schema   jsonb DEFAULT '[]'::jsonb,
  system_prompt   text,
  output_format   text DEFAULT 'document',
  max_tokens      integer DEFAULT 4096,
  sort_order      integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT tenant_tools_tenant_key_unique UNIQUE (tenant_id, tool_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_tools_tenant_id ON tenant_tools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_tools_workspace_id ON tenant_tools(workspace_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_tools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_tools_updated_at
  BEFORE UPDATE ON tenant_tools
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_tools_updated_at();

-- ─── RLS ───

ALTER TABLE tenant_tools ENABLE ROW LEVEL SECURITY;

-- Platform owner: full access
CREATE POLICY "platform_owner_full_access"
  ON tenant_tools
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
CREATE POLICY "super_admin_own_tools"
  ON tenant_tools
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
CREATE POLICY "tenant_user_read_own_tools"
  ON tenant_tools
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
  );
