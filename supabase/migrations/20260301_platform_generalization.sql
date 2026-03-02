-- ============================================================================
-- Platform Generalization Migration
-- 4 ALTER TABLEs + 3 new tables + RLS + triggers + indexes + A&A data backfill
-- ============================================================================

-- ──────────────────────────────────────────────
-- 1. ALTER TABLES
-- ──────────────────────────────────────────────

-- 1a. Workspace colors (replaces DEPT_COLORS constant)
ALTER TABLE tenant_workspaces
  ADD COLUMN IF NOT EXISTS color TEXT;

-- 1b. Agent knowledge scoping (replaces AGENT_DEPT_MAP constant)
ALTER TABLE tenant_agents
  ADD COLUMN IF NOT EXISTS knowledge_scopes JSONB DEFAULT '[]'::jsonb;

-- 1c. Agent operational context flag (replaces hardcoded analytics agent check)
ALTER TABLE tenant_agents
  ADD COLUMN IF NOT EXISTS inject_operational_context BOOLEAN DEFAULT false;

-- 1d. Remove CHECK constraints on memory (allow dynamic types/sources)
ALTER TABLE tenant_memory
  DROP CONSTRAINT IF EXISTS tenant_memory_memory_type_check;
ALTER TABLE tenant_memory
  DROP CONSTRAINT IF EXISTS tenant_memory_source_check;

-- ──────────────────────────────────────────────
-- 2. NEW TABLE: tenant_nav_sections
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_nav_sections (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, section_key)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tenant_nav_sections_tenant
  ON tenant_nav_sections(tenant_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_nav_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_nav_sections_updated_at ON tenant_nav_sections;
CREATE TRIGGER trg_tenant_nav_sections_updated_at
  BEFORE UPDATE ON tenant_nav_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_nav_sections_updated_at();

-- RLS
ALTER TABLE tenant_nav_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_nav_sections"
  ON tenant_nav_sections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'role' = 'platform_owner'
    )
  );

CREATE POLICY "super_admin_own_tenant_nav_sections"
  ON tenant_nav_sections
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (
      SELECT (raw_user_meta_data->>'tenant_id')::uuid
      FROM auth.users WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'role' = 'super-admin'
    )
  );

CREATE POLICY "tenant_user_read_nav_sections"
  ON tenant_nav_sections
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT (raw_user_meta_data->>'tenant_id')::uuid
      FROM auth.users WHERE id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- 3. NEW TABLE: tenant_module_registry
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_module_registry (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  module_type TEXT NOT NULL DEFAULT 'workspace'
              CHECK (module_type IN ('platform', 'workspace')),
  min_tier    TEXT DEFAULT 'galaxy'
              CHECK (min_tier IN ('melmac', 'orbit', 'galaxy')),
  pages       JSONB DEFAULT '[]'::jsonb,
  actions     JSONB DEFAULT '[]'::jsonb,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tenant_module_registry_tenant
  ON tenant_module_registry(tenant_id);

-- RLS
ALTER TABLE tenant_module_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_module_registry"
  ON tenant_module_registry
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'role' = 'platform_owner'
    )
  );

CREATE POLICY "super_admin_own_tenant_module_registry"
  ON tenant_module_registry
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (
      SELECT (raw_user_meta_data->>'tenant_id')::uuid
      FROM auth.users WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'role' = 'super-admin'
    )
  );

CREATE POLICY "tenant_user_read_module_registry"
  ON tenant_module_registry
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT (raw_user_meta_data->>'tenant_id')::uuid
      FROM auth.users WHERE id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- 4. NEW TABLE: tenant_operational_context_queries
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_operational_context_queries (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  query_key         TEXT NOT NULL,
  label             TEXT NOT NULL,
  source_table      TEXT NOT NULL,
  select_columns    TEXT[] NOT NULL,
  filter_conditions JSONB,
  order_by          TEXT,
  row_limit         INTEGER DEFAULT 500,
  summary_type      TEXT NOT NULL DEFAULT 'raw_table'
                    CHECK (summary_type IN ('template', 'raw_table', 'aggregate')),
  summary_template  TEXT,
  sort_order        INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, query_key)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tenant_op_context_queries_tenant
  ON tenant_operational_context_queries(tenant_id);

-- RLS
ALTER TABLE tenant_operational_context_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_op_context"
  ON tenant_operational_context_queries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'role' = 'platform_owner'
    )
  );

CREATE POLICY "super_admin_own_tenant_op_context"
  ON tenant_operational_context_queries
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (
      SELECT (raw_user_meta_data->>'tenant_id')::uuid
      FROM auth.users WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'role' = 'super-admin'
    )
  );

CREATE POLICY "tenant_user_read_op_context"
  ON tenant_operational_context_queries
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT (raw_user_meta_data->>'tenant_id')::uuid
      FROM auth.users WHERE id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- 5. A&A DATA BACKFILL
-- ──────────────────────────────────────────────

-- Backfill knowledge_scopes on existing agents
UPDATE tenant_agents SET knowledge_scopes = '["hr"]' WHERE agent_key = 'hr';
UPDATE tenant_agents SET knowledge_scopes = '["finance"]' WHERE agent_key = 'finance';
UPDATE tenant_agents SET knowledge_scopes = '["purchasing"]' WHERE agent_key = 'purchasing';
UPDATE tenant_agents SET knowledge_scopes = '["sales"]' WHERE agent_key = 'sales';
UPDATE tenant_agents SET knowledge_scopes = '["ops"]' WHERE agent_key = 'ops';
UPDATE tenant_agents SET knowledge_scopes = '["admin","general"]' WHERE agent_key = 'admin';
UPDATE tenant_agents SET knowledge_scopes = '["general"]' WHERE agent_key IN ('qbu','salesDeck');
UPDATE tenant_agents SET knowledge_scopes = '["ops","general"]' WHERE agent_key IN ('actionPlan','analytics');

-- Flag analytics agent for operational context injection
UPDATE tenant_agents SET inject_operational_context = true WHERE agent_key = 'analytics';

-- Backfill workspace colors from current DEPT_COLORS
UPDATE tenant_workspaces SET color = '#7C3AED' WHERE department_key = 'hr';
UPDATE tenant_workspaces SET color = '#16A34A' WHERE department_key = 'finance';
UPDATE tenant_workspaces SET color = '#D97706' WHERE department_key = 'purchasing';
UPDATE tenant_workspaces SET color = '#2563EB' WHERE department_key = 'sales';
UPDATE tenant_workspaces SET color = '#009ADE' WHERE department_key IN ('ops','operations');
UPDATE tenant_workspaces SET color = '#4B5563' WHERE department_key = 'admin';
