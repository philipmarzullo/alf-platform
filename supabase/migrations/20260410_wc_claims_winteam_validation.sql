-- ============================================================================
-- wc_claims.wt_* — WinTeam timekeeping validation columns
-- ============================================================================
-- Liberty's loss-run is the source of truth for work_status, but the value
-- gets stale fast — an employee can return to work weeks before Liberty
-- updates the claim. WinTeam timekeeping (FACT_TIMEKEEPING) has actual
-- clock-in data, so we can confirm or contradict Liberty's status.
--
-- These columns are populated by `backend/scripts/validate-wc-claims-work-status.mjs`,
-- runnable on demand via POST /api/wc-claims/validate-work-status or on a
-- nightly cron. The manual `work_status` field remains untouched — Jackie
-- still drives that. The wt_* columns power a colored validation dot in the
-- tracker, drawer, and dashboard table.
-- ============================================================================

ALTER TABLE wc_claims
  ADD COLUMN IF NOT EXISTS wt_validation_state    text,
  ADD COLUMN IF NOT EXISTS wt_last_clocked_day    date,
  ADD COLUMN IF NOT EXISTS wt_hours_last_14d      numeric(8,2),
  ADD COLUMN IF NOT EXISTS wt_days_worked_last_14d int,
  ADD COLUMN IF NOT EXISTS wt_jobs_worked_last_14d text,
  ADD COLUMN IF NOT EXISTS wt_validation_checked_at timestamptz;

ALTER TABLE wc_claims
  DROP CONSTRAINT IF EXISTS wc_claims_wt_validation_state_check;

ALTER TABLE wc_claims
  ADD CONSTRAINT wc_claims_wt_validation_state_check
  CHECK (wt_validation_state IS NULL OR wt_validation_state IN ('confirmed', 'mismatch', 'no_data'));

COMMENT ON COLUMN wc_claims.wt_validation_state IS
  'WinTeam validation outcome: confirmed = timekeeping matches Liberty work_status; mismatch = clocked-in activity contradicts Liberty (likely stale); no_data = employee not found in WinTeam timekeeping. NULL = never checked.';
COMMENT ON COLUMN wc_claims.wt_last_clocked_day IS
  'Most recent date the employee clocked any hours in WinTeam (last 14 days window).';
COMMENT ON COLUMN wc_claims.wt_hours_last_14d IS
  'Sum of regular + overtime + doubletime hours clocked in WinTeam over the last 14 days.';
COMMENT ON COLUMN wc_claims.wt_days_worked_last_14d IS
  'Distinct days worked in WinTeam over the last 14 days.';
COMMENT ON COLUMN wc_claims.wt_jobs_worked_last_14d IS
  'Comma-separated list of distinct job_names the employee clocked at over the last 14 days. Used to spot modified-duty placements at sites other than the claim site.';
COMMENT ON COLUMN wc_claims.wt_validation_checked_at IS
  'Timestamp when the WinTeam validation script last ran for this row.';
