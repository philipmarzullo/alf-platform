-- ============================================================================
-- Workers Comp Claims (wc_claims)
-- ============================================================================
-- Backs the Safety workspace claims tracker + dashboard. One row per claim.
-- Seeded from Liberty Mutual loss-run exports + the internal claim tracker
-- spreadsheet, then maintained directly in-app by safety/HR staff.
--
-- Multi-tenant. Joined to WinTeam (via Snowflake) at read-time for live
-- employee/job lookups; the snapshot fields below capture point-in-time data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wc_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES alf_tenants(id) ON DELETE CASCADE,

  -- Core claim identity
  claim_number text,
  date_of_loss date,
  loss_year integer GENERATED ALWAYS AS (EXTRACT(YEAR FROM date_of_loss)::integer) STORED,

  -- Employee (resolved from WinTeam via employee_id)
  employee_id integer,
  employee_name text,
  date_of_birth date,
  date_of_hire date,
  gender text,

  -- Job / site (from WinTeam)
  job_number integer,
  job_name text,
  vp text,
  supervisor text,
  accident_state text,

  -- Claim status
  claim_status text,         -- Open / Closed
  work_status text,          -- Out of Work / Light Duty / Full Duty / Non-Reportable
  ee_status text,            -- raw status string from tracker
  rtw_date date,
  restrictions text,
  claim_age_days integer,

  -- Injury detail
  injury_cause text,
  catalyst text,
  nature_of_injury text,
  part_of_body text,
  accident_description text,
  lost_time_days integer,
  surgery_indicator boolean,
  litigation_status text,

  -- Financials (from Liberty CSV)
  incurred_medical numeric(12,2) DEFAULT 0,
  incurred_indemnity numeric(12,2) DEFAULT 0,
  incurred_expense numeric(12,2) DEFAULT 0,
  total_incurred numeric(12,2) DEFAULT 0,
  paid_medical numeric(12,2) DEFAULT 0,
  paid_indemnity numeric(12,2) DEFAULT 0,
  paid_expense numeric(12,2) DEFAULT 0,
  total_paid numeric(12,2) DEFAULT 0,
  outstanding_reserve numeric(12,2) DEFAULT 0,

  -- Case management
  claim_stage text,
  next_action text,
  claim_concerns text,
  case_manager text,
  case_manager_email text,
  case_manager_phone text,
  carrier_report_date date,
  date_closed date,
  date_reopened date,

  -- Internal
  notes text,
  internal_notes text,
  source text DEFAULT 'manual',  -- manual / liberty_csv / liberty_api / tracker_xlsx

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- updated_at trigger (table-local function, matching the pattern of other
-- recent migrations like 20260407_tenant_rfp_facts.sql)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_wc_claims_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wc_claims_updated_at
  BEFORE UPDATE ON wc_claims
  FOR EACH ROW EXECUTE FUNCTION update_wc_claims_updated_at();

-- ----------------------------------------------------------------------------
-- RLS (3-tier — matches tenant_rfp_facts pattern)
-- ----------------------------------------------------------------------------
ALTER TABLE wc_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON wc_claims
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON wc_claims
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid() AND role IN ('super-admin','admin')
    )
  );

CREATE POLICY "Tenant users read own" ON wc_claims
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX idx_wc_claims_tenant     ON wc_claims (tenant_id);
CREATE INDEX idx_wc_claims_status     ON wc_claims (tenant_id, claim_status);
CREATE INDEX idx_wc_claims_loss_year  ON wc_claims (tenant_id, loss_year);
CREATE INDEX idx_wc_claims_job        ON wc_claims (tenant_id, job_number);
CREATE INDEX idx_wc_claims_vp         ON wc_claims (tenant_id, vp);
CREATE INDEX idx_wc_claims_state      ON wc_claims (tenant_id, accident_state);

-- Unique constraint on (tenant_id, claim_number) so the seed script (and any
-- future re-import) can upsert. NULL claim_numbers are allowed (postgres
-- treats each NULL as distinct), but normal seed flow always supplies one.
CREATE UNIQUE INDEX idx_wc_claims_tenant_claim_num
  ON wc_claims (tenant_id, claim_number);

-- ----------------------------------------------------------------------------
-- Register the Safety workspace for the A&A tenant (idempotent — only inserts
-- if a Safety workspace row does not already exist).
-- A&A tenant_id: 6acb59e5-05c9-4653-98ec-710906771dbb
-- ----------------------------------------------------------------------------
INSERT INTO tenant_workspaces (tenant_id, department_key, name, icon, description, color, sort_order, is_active)
SELECT
  '6acb59e5-05c9-4653-98ec-710906771dbb'::uuid,
  'safety',
  'Safety',
  'ShieldAlert',
  'Workers comp claims, incident tracking, and OSHA reporting',
  '#DC2626',
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tenant_workspaces WHERE tenant_id = '6acb59e5-05c9-4653-98ec-710906771dbb'::uuid),
  true
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_workspaces
  WHERE tenant_id = '6acb59e5-05c9-4653-98ec-710906771dbb'::uuid AND department_key = 'safety'
);
