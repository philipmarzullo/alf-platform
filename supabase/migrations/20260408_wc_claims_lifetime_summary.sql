-- ============================================================================
-- Workers Comp Claims — Lifetime Summary (wc_claims_lifetime_summary)
-- ============================================================================
-- Stores pre-aggregated lifetime claim metrics for the Safety dashboard's
-- "Since 2008" panel. We don't have row-per-claim history going back that far
-- — Liberty's loss-run only carries the recent open/closed window — so this
-- table holds the rolled-up totals from the historical dashboard report:
--
--   - 4 headline metrics (total claims, total cost, average, highest)
--   - Claims by year + cost by year time series
--   - Top sites + top injury types frequency lists
--   - Top cost claims (15 high-severity records, with claim_number)
--
-- Source: AA_Claims Dashboard Report with Charts Since 2008.xlsx
--
-- One row per tenant. Idempotent upsert keyed on tenant_id. The wc_claims
-- row-level table remains the source of truth for individual claim records;
-- this table is purely for the executive lifetime panel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wc_claims_lifetime_summary (
  tenant_id uuid PRIMARY KEY REFERENCES alf_tenants(id) ON DELETE CASCADE,

  -- Period covered by this snapshot
  as_of_date date,
  period_start_year integer,
  period_end_year integer,

  -- Headline metrics
  total_claims integer,
  total_incurred numeric(14,2),
  average_claim_cost numeric(12,2),
  highest_claim_cost numeric(12,2),

  -- Time series — [{ year, count, incurred }, ...]
  claims_by_year jsonb DEFAULT '[]'::jsonb,

  -- Frequency lists
  top_sites jsonb DEFAULT '[]'::jsonb,           -- [{ job_name, count }]
  top_injury_types jsonb DEFAULT '[]'::jsonb,    -- [{ name, count }]

  -- Top severity records — [{ claim_number, claimant, job_name, injury, total_incurred }]
  top_cost_claims jsonb DEFAULT '[]'::jsonb,

  -- Provenance
  source_file text,
  source text DEFAULT 'historical_dashboard',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- updated_at trigger (table-local, matching the wc_claims pattern)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_wc_claims_lifetime_summary_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wc_claims_lifetime_summary_updated_at
  BEFORE UPDATE ON wc_claims_lifetime_summary
  FOR EACH ROW EXECUTE FUNCTION update_wc_claims_lifetime_summary_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — same 3-tier model as wc_claims
-- ----------------------------------------------------------------------------
ALTER TABLE wc_claims_lifetime_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner full access" ON wc_claims_lifetime_summary
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'platform_owner')
  );

CREATE POLICY "Tenant admins manage own" ON wc_claims_lifetime_summary
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid() AND role IN ('super-admin','admin')
    )
  );

CREATE POLICY "Tenant users read own" ON wc_claims_lifetime_summary
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
