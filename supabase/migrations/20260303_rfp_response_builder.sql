-- ============================================================================
-- RFP Response Builder — Schema
-- ============================================================================
-- Galaxy-tier tool: parse RFP documents, match against curated Q&A library,
-- draft responses, and manage review workflow. Won/lost outcomes feed the
-- intelligence loop.
--
-- New tables:
--   1. tenant_rfp_answers   — curated Q&A library
--   2. tenant_rfp_projects  — RFP project tracking
--   3. tenant_rfp_items     — individual questions/requirements per project
--
-- Modified tables:
--   4. tenant_documents     — add document_scope column
--   5. tenant_memory        — extend CHECK constraints for RFP values
-- ============================================================================

-- ─── 1. Curated Q&A Library ─────────────────────────────────────────────────

CREATE TABLE tenant_rfp_answers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  question            text NOT NULL,
  answer              text NOT NULL,
  category            text NOT NULL,
  source_document_id  uuid REFERENCES tenant_documents(id) ON DELETE SET NULL,
  tags                text[] DEFAULT '{}',
  last_used_at        timestamptz,
  use_count           integer DEFAULT 0,
  win_count           integer DEFAULT 0,
  loss_count          integer DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_rfp_answers_tenant   ON tenant_rfp_answers (tenant_id, category);
CREATE INDEX idx_rfp_answers_active   ON tenant_rfp_answers (tenant_id, is_active)
  WHERE is_active = true;
CREATE INDEX idx_rfp_answers_win_rate ON tenant_rfp_answers (tenant_id, win_count DESC, loss_count);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_rfp_answers_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rfp_answers_updated_at
  BEFORE UPDATE ON tenant_rfp_answers
  FOR EACH ROW EXECUTE FUNCTION update_rfp_answers_updated_at();

-- RLS
ALTER TABLE tenant_rfp_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_rfp_answers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_rfp_answers
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Tenant users read own" ON tenant_rfp_answers
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 2. RFP Project Tracking ───────────────────────────────────────────────

CREATE TABLE tenant_rfp_projects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  source_document_id    uuid REFERENCES tenant_documents(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','review','submitted','won','lost')),
  due_date              timestamptz,
  issuing_organization  text,
  item_count            integer DEFAULT 0,
  approved_count        integer DEFAULT 0,
  created_by            uuid NOT NULL REFERENCES profiles(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_rfp_projects_tenant  ON tenant_rfp_projects (tenant_id, status);
CREATE INDEX idx_rfp_projects_created ON tenant_rfp_projects (tenant_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_rfp_projects_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rfp_projects_updated_at
  BEFORE UPDATE ON tenant_rfp_projects
  FOR EACH ROW EXECUTE FUNCTION update_rfp_projects_updated_at();

-- RLS
ALTER TABLE tenant_rfp_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_rfp_projects
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_rfp_projects
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Tenant users read own" ON tenant_rfp_projects
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 3. RFP Items (Questions/Requirements) ─────────────────────────────────

CREATE TABLE tenant_rfp_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  rfp_project_id    uuid NOT NULL REFERENCES tenant_rfp_projects(id) ON DELETE CASCADE,
  item_number       integer NOT NULL,
  question_text     text NOT NULL,
  section           text,
  category          text,
  matched_answer_id uuid REFERENCES tenant_rfp_answers(id) ON DELETE SET NULL,
  match_confidence  float,
  draft_response    text,
  final_response    text,
  assigned_to       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','drafted','assigned','reviewed','approved')),
  reviewed_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  UNIQUE (rfp_project_id, item_number)
);

CREATE INDEX idx_rfp_items_project  ON tenant_rfp_items (rfp_project_id, item_number);
CREATE INDEX idx_rfp_items_assigned ON tenant_rfp_items (assigned_to, status)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_rfp_items_status   ON tenant_rfp_items (rfp_project_id, status);
CREATE INDEX idx_rfp_items_matched  ON tenant_rfp_items (matched_answer_id)
  WHERE matched_answer_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_rfp_items_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rfp_items_updated_at
  BEFORE UPDATE ON tenant_rfp_items
  FOR EACH ROW EXECUTE FUNCTION update_rfp_items_updated_at();

-- RLS
ALTER TABLE tenant_rfp_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_rfp_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_rfp_items
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Tenant users read own" ON tenant_rfp_items
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- Users can update items assigned to them (SME review workflow)
CREATE POLICY "Assigned user update items" ON tenant_rfp_items
  FOR UPDATE USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- ─── 4. tenant_documents — add document_scope ──────────────────────────────

ALTER TABLE tenant_documents
  ADD COLUMN IF NOT EXISTS document_scope text DEFAULT 'general'
    CHECK (document_scope IN ('general', 'rfp_library', 'rfp_source'));

CREATE INDEX IF NOT EXISTS idx_tenant_docs_scope
  ON tenant_documents (tenant_id, document_scope)
  WHERE deleted_at IS NULL;

-- ─── 5. tenant_memory — extend CHECK constraints ───────────────────────────

ALTER TABLE tenant_memory
  DROP CONSTRAINT IF EXISTS tenant_memory_memory_type_check;
ALTER TABLE tenant_memory
  ADD CONSTRAINT tenant_memory_memory_type_check
  CHECK (memory_type IN (
    'operational_insight','client_preference','recurring_issue',
    'performance_trend','action_outcome',
    'rfp_pattern','win_loss_insight'
  ));

ALTER TABLE tenant_memory
  DROP CONSTRAINT IF EXISTS tenant_memory_source_check;
ALTER TABLE tenant_memory
  ADD CONSTRAINT tenant_memory_source_check
  CHECK (source IN (
    'qbu_submission','action_plan','agent_interaction',
    'tool_output','manual',
    'rfp_response'
  ));
