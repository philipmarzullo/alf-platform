-- ============================================================================
-- RFP Excel write-back — Step 8
-- ============================================================================
-- Adds the columns needed to round-trip an Excel-based RFP:
--   tenant_rfp_items.source_cell       — cell ref in the source workbook
--                                         (e.g. 'Questionnaire!C5') so the
--                                         generate-excel route knows where
--                                         to write each approved answer.
--
--   tenant_rfp_projects.source_excel_path — storage path to the original
--                                           uploaded Excel file (in the
--                                           existing tenant-documents bucket).
--                                           Null for non-Excel projects.
--
--   tenant_rfp_projects.pricing_inputs    — JSONB keyed by pricing sheet name,
--                                           holding the manual hours/days/wage
--                                           inputs the agent cannot draft.
--                                           Structure:
--                                             {
--                                               "1585 Broadway": [
--                                                 { row, role, num_staff,
--                                                   hours_per_day,
--                                                   days_per_week,
--                                                   wage_rate }, ...
--                                               ]
--                                             }
-- ============================================================================

ALTER TABLE tenant_rfp_items
  ADD COLUMN IF NOT EXISTS source_cell text;

ALTER TABLE tenant_rfp_projects
  ADD COLUMN IF NOT EXISTS source_excel_path text;

ALTER TABLE tenant_rfp_projects
  ADD COLUMN IF NOT EXISTS pricing_inputs jsonb NOT NULL DEFAULT '{}'::jsonb;
