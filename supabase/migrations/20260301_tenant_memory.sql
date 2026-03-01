-- Tenant operational memory — distilled insights extracted from tool outputs,
-- action plans, and agent interactions.

CREATE TABLE tenant_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  memory_type text NOT NULL CHECK (memory_type IN (
    'operational_insight','client_preference','recurring_issue','performance_trend','action_outcome'
  )),
  department text NOT NULL,
  content text NOT NULL,
  source text NOT NULL CHECK (source IN (
    'qbu_submission','action_plan','agent_interaction','tool_output','manual'
  )),
  source_id uuid,
  relevance_score float DEFAULT 1.0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tenant_memory_lookup
  ON tenant_memory(tenant_id, department, relevance_score DESC);

-- Updated_at trigger (same pattern as tenant_workspaces)
CREATE OR REPLACE FUNCTION update_tenant_memory_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_memory_updated_at
  BEFORE UPDATE ON tenant_memory
  FOR EACH ROW EXECUTE FUNCTION update_tenant_memory_updated_at();

-- RLS (same pattern as tenant_workspaces)
ALTER TABLE tenant_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_full_access" ON tenant_memory FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'platform_owner'));

CREATE POLICY "super_admin_own_tenant" ON tenant_memory FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin'))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super-admin'));

CREATE POLICY "tenant_user_read_own" ON tenant_memory FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE profiles.id = auth.uid()));
