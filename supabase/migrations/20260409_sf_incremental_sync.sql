-- Migration: Add source_uq columns + watermark support for incremental sync
--
-- Every Wavelytics WinTeam fact view has a *_UQ column (e.g. TIMEKEEPING_UQ)
-- that uniquely identifies each row. Adding source_uq to our sf_fact_* mirror
-- tables lets us upsert (onConflict: tenant_id, source_uq) instead of the
-- delete-and-insert path, which is required for incremental nightly syncs.
--
-- Also adds sync_watermarks JSONB to sync_configs so the runner can track
-- per-table high-watermarks for SOURCE_RECORD_UPDATED_TIMESTAMP filtering.

-- ── 1. Add source_uq to all fact tables ──────────────────────────────────

ALTER TABLE sf_fact_labor_budget_actual
  ADD COLUMN IF NOT EXISTS source_uq VARCHAR;

ALTER TABLE sf_fact_job_daily
  ADD COLUMN IF NOT EXISTS source_uq VARCHAR;

ALTER TABLE sf_fact_work_tickets
  ADD COLUMN IF NOT EXISTS source_uq VARCHAR;

ALTER TABLE sf_fact_timekeeping
  ADD COLUMN IF NOT EXISTS source_uq VARCHAR;

-- ── 2. Create unique indexes on (tenant_id, source_uq) ──────────────────
-- These enable ON CONFLICT for upsert. Non-partial because PostgREST
-- requires a regular unique index/constraint for conflict resolution.
-- NULLs are always unique in PostgreSQL so legacy rows (source_uq IS NULL)
-- don't collide.

CREATE UNIQUE INDEX IF NOT EXISTS idx_sf_fact_labor_budget_actual_uq
  ON sf_fact_labor_budget_actual (tenant_id, source_uq);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sf_fact_job_daily_uq
  ON sf_fact_job_daily (tenant_id, source_uq);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sf_fact_work_tickets_uq
  ON sf_fact_work_tickets (tenant_id, source_uq);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sf_fact_timekeeping_uq
  ON sf_fact_timekeeping (tenant_id, source_uq);

-- Drop the check constraint on tier — WinTeam sends actual business tier
-- labels (JOB_TIER_01_CURRENT_VALUE_LABEL), not our internal enum.
ALTER TABLE sf_dim_job DROP CONSTRAINT IF EXISTS sf_dim_job_tier_check;

-- ── 3. Add sync_watermarks to sync_configs ───────────────────────────────
-- Tracks per-table high-watermarks: { "sf_fact_timekeeping": "2026-04-09T..." }

ALTER TABLE sync_configs
  ADD COLUMN IF NOT EXISTS sync_watermarks JSONB DEFAULT '{}';

-- ── 4. Add source_updated_at to track per-row modification timestamps ────
-- Used by the runner to compute the next watermark after each batch.

ALTER TABLE sf_fact_labor_budget_actual
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

ALTER TABLE sf_fact_job_daily
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

ALTER TABLE sf_fact_work_tickets
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

ALTER TABLE sf_fact_timekeeping
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

-- ── 5. Drop legacy unique constraints that conflict with source_uq approach ─
-- These old constraints assumed one row per (tenant, job, date) but the actual
-- WinTeam data has multiple rows per combination (different UQ keys).

DROP INDEX IF EXISTS uq_sf_fact_labor_budget_tenant_job_period;
DROP INDEX IF EXISTS uq_sf_fact_job_daily_tenant_job_date;

-- ── 6. Relax punch_status on sf_fact_timekeeping ────────────────────────────
-- WinTeam doesn't expose clock-in/clock-out times (surrogate TIME_KEY with no
-- DIM_TIME view), so punch_status is always NULL from Snowflake.

ALTER TABLE sf_fact_timekeeping DROP CONSTRAINT IF EXISTS sf_fact_timekeeping_punch_status_check;
ALTER TABLE sf_fact_timekeeping ALTER COLUMN punch_status DROP NOT NULL;
ALTER TABLE sf_fact_timekeeping ALTER COLUMN punch_status DROP DEFAULT;
