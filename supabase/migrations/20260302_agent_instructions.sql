-- Agent Instructions — tenant feedback + platform teaching instructions for agents.
-- Tenants submit (pending approval); platform admin pushes (auto-approved).
-- tenant_id NULL = global instruction (applies to all tenants).

CREATE TABLE agent_instructions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       uuid REFERENCES alf_tenants(id) ON DELETE CASCADE,
  agent_key       text NOT NULL,
  instruction_text text NOT NULL,
  -- Optional file attachment
  file_name       text,
  file_type       text,
  file_size       integer,
  storage_path    text,
  extracted_text  text,
  -- Source + approval
  source          text NOT NULL CHECK (source IN ('tenant', 'platform')),
  created_by      uuid NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agent_instructions_agent_status
  ON agent_instructions(agent_key, status);

CREATE INDEX idx_agent_instructions_tenant_agent
  ON agent_instructions(tenant_id, agent_key);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_agent_instructions_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_instructions_updated_at
  BEFORE UPDATE ON agent_instructions
  FOR EACH ROW EXECUTE FUNCTION update_agent_instructions_updated_at();

-- RLS
ALTER TABLE agent_instructions ENABLE ROW LEVEL SECURITY;

-- Platform owner: full access
CREATE POLICY "platform_owner_full_access" ON agent_instructions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner'));

-- Super-admin: full access on own tenant rows
CREATE POLICY "super_admin_own_tenant" ON agent_instructions FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin'))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin'));

-- Tenant users: INSERT own tenant + SELECT own tenant + global approved
CREATE POLICY "tenant_user_insert_own" ON agent_instructions FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND source = 'tenant'
  );

CREATE POLICY "tenant_user_select" ON agent_instructions FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    OR (tenant_id IS NULL AND status = 'approved')
  );

-- Nav update: add Agent Instructions to admin section for all tenants
UPDATE tenant_nav_sections
SET items = items || '[{"label": "Agent Instructions", "path": "/portal/admin/agent-instructions", "icon": "MessageSquareText", "admin_only": true}]'::jsonb
WHERE section_key = 'admin';
