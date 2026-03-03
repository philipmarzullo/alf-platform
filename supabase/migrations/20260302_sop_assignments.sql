-- ============================================================================
-- SOP Step Decomposition & User Assignment System
-- ============================================================================
-- Extends the SOP pipeline with:
--   1. tenant_sop_steps — discrete steps extracted from SOP analyses
--   2. tenant_sop_assignments — user/role assignments per step
--   3. tenant_user_tasks — runtime task queue for agent outputs & manual work
-- ============================================================================

-- ─── 1. SOP Steps ──────────────────────────────────────────────────────────

CREATE TABLE tenant_sop_steps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  sop_analysis_id      uuid NOT NULL REFERENCES sop_analyses(id) ON DELETE CASCADE,
  document_id          uuid NOT NULL REFERENCES tenant_documents(id) ON DELETE CASCADE,
  workspace_id         uuid REFERENCES tenant_workspaces(id) ON DELETE SET NULL,
  department           text,
  step_number          integer NOT NULL,
  step_description     text NOT NULL,
  classification       text NOT NULL CHECK (classification IN ('automated','hybrid','manual')),
  automation_action_id uuid REFERENCES automation_actions(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now(),

  UNIQUE (sop_analysis_id, step_number)
);

CREATE INDEX idx_sop_steps_tenant    ON tenant_sop_steps (tenant_id);
CREATE INDEX idx_sop_steps_document  ON tenant_sop_steps (document_id);
CREATE INDEX idx_sop_steps_workspace ON tenant_sop_steps (workspace_id);
CREATE INDEX idx_sop_steps_class     ON tenant_sop_steps (tenant_id, classification);

-- RLS
ALTER TABLE tenant_sop_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_sop_steps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_sop_steps
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Tenant users read own" ON tenant_sop_steps
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 2. SOP Assignments ───────────────────────────────────────────────────

CREATE TABLE tenant_sop_assignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  sop_step_id         uuid NOT NULL REFERENCES tenant_sop_steps(id) ON DELETE CASCADE,
  assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to_role    text,
  assignment_type     text NOT NULL CHECK (assignment_type IN ('owner','reviewer','notified')),
  assigned_by         uuid NOT NULL REFERENCES profiles(id),
  assigned_at         timestamptz DEFAULT now(),

  CONSTRAINT chk_assignment_target CHECK (
    assigned_to_user_id IS NOT NULL OR assigned_to_role IS NOT NULL
  )
);

-- One owner and one reviewer per step; notified can be many
CREATE UNIQUE INDEX uq_sop_assignment_owner
  ON tenant_sop_assignments (sop_step_id)
  WHERE assignment_type = 'owner';

CREATE UNIQUE INDEX uq_sop_assignment_reviewer
  ON tenant_sop_assignments (sop_step_id)
  WHERE assignment_type = 'reviewer';

CREATE INDEX idx_sop_assignments_user ON tenant_sop_assignments (assigned_to_user_id);
CREATE INDEX idx_sop_assignments_role ON tenant_sop_assignments (tenant_id, assigned_to_role);
CREATE INDEX idx_sop_assignments_step ON tenant_sop_assignments (sop_step_id);

-- RLS
ALTER TABLE tenant_sop_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_sop_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_sop_assignments
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Tenant users read own" ON tenant_sop_assignments
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 3. User Tasks ────────────────────────────────────────────────────────

CREATE TABLE tenant_user_tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sop_step_id           uuid REFERENCES tenant_sop_steps(id) ON DELETE SET NULL,
  sop_assignment_id     uuid REFERENCES tenant_sop_assignments(id) ON DELETE SET NULL,
  source_type           text NOT NULL CHECK (source_type IN ('agent_output','manual_trigger','scheduled')),
  source_reference_id   uuid,
  title                 text NOT NULL,
  description           text,
  agent_output          jsonb,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','in_progress','completed','dismissed')),
  due_date              timestamptz,
  created_at            timestamptz DEFAULT now(),
  completed_at          timestamptz,
  completed_by          uuid REFERENCES profiles(id),
  outcome_notes         text,
  edits_applied         boolean DEFAULT false,
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_user_tasks_queue  ON tenant_user_tasks (user_id, status, created_at DESC);
CREATE INDEX idx_user_tasks_tenant ON tenant_user_tasks (tenant_id, status);
CREATE INDEX idx_user_tasks_step   ON tenant_user_tasks (sop_step_id);
CREATE INDEX idx_user_tasks_source ON tenant_user_tasks (source_type, source_reference_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_user_tasks_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_user_tasks_updated_at
  BEFORE UPDATE ON tenant_user_tasks
  FOR EACH ROW EXECUTE FUNCTION update_tenant_user_tasks_updated_at();

-- RLS
ALTER TABLE tenant_user_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_user_tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_user_tasks
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Users see own tasks" ON tenant_user_tasks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users update own tasks" ON tenant_user_tasks
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
