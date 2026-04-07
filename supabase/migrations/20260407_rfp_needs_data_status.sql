-- ============================================================================
-- RFP Items — add 'needs_data' status
-- ============================================================================
-- Adds a new status value for items where the agent could not produce a draft
-- because required tenant data is missing (e.g. blank fact, no Q&A match).
-- These items surface in the UI with an orange "needs data" badge and cannot
-- be approved until the underlying data gap is filled.
-- ============================================================================

ALTER TABLE tenant_rfp_items
  DROP CONSTRAINT IF EXISTS tenant_rfp_items_status_check;

ALTER TABLE tenant_rfp_items
  ADD CONSTRAINT tenant_rfp_items_status_check
  CHECK (status IN ('pending','needs_data','drafted','assigned','reviewed','approved'));
