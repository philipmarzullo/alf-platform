-- ============================================================================
-- Tenant RFP Facts — structured knowledge base for the RFP Response Builder
-- ============================================================================
-- A flat key-value store of vetted facts about the tenant company that the RFP
-- agent injects into every response generation. Examples:
--   safety.trir = "0.42"
--   safety.emr = "0.81"
--   refs.client_1.name = "Hartford Public Schools"
--   policy.has_drug_policy = "true"
--
-- Categories: safety_metrics, policy_flags, references, company_counts,
--             certifications, other
--
-- Source values: confirmed (verified by user), agent_proposed, imported, default
-- ============================================================================

CREATE TABLE tenant_rfp_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,
  fact_key    text NOT NULL,
  fact_value  text,
  category    text NOT NULL DEFAULT 'other'
    CHECK (category IN (
      'safety_metrics','policy_flags','references','company_counts',
      'certifications','other'
    )),
  source      text NOT NULL DEFAULT 'confirmed'
    CHECK (source IN ('confirmed','agent_proposed','imported','default')),
  notes       text,
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  UNIQUE (tenant_id, fact_key)
);

CREATE INDEX idx_rfp_facts_tenant   ON tenant_rfp_facts (tenant_id, category);
CREATE INDEX idx_rfp_facts_key      ON tenant_rfp_facts (tenant_id, fact_key);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_rfp_facts_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rfp_facts_updated_at
  BEFORE UPDATE ON tenant_rfp_facts
  FOR EACH ROW EXECUTE FUNCTION update_rfp_facts_updated_at();

-- RLS
ALTER TABLE tenant_rfp_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON tenant_rfp_facts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON tenant_rfp_facts
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('super-admin','admin'))
  );

CREATE POLICY "Tenant users read own" ON tenant_rfp_facts
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
