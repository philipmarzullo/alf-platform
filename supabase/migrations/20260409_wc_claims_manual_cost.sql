-- ============================================================================
-- wc_claims.manual_cost
-- ============================================================================
-- Adds a manually-entered cost field for incidents Liberty doesn't track —
-- urgent care visits, first-aid treatment, OTC supplies, etc. Liberty's
-- loss-run only carries claims that became formal WC submissions, so for
-- non-reportable incidents the safety team needs a place to capture
-- out-of-pocket cost themselves.
--
-- Surfaced in the Claim Tracker as an inline-editable column on
-- non-reportable rows, and in the dashboard's Total Cost KPI when the
-- Recordable/Non-Recordable toggle is set to Non-Recordable.
-- ============================================================================

ALTER TABLE wc_claims
  ADD COLUMN IF NOT EXISTS manual_cost numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN wc_claims.manual_cost IS
  'Manually-entered cost (urgent care, first aid, supplies) for incidents Liberty does not track. Used primarily for non-reportable claims.';
