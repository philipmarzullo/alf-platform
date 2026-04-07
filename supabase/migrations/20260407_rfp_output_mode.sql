-- ============================================================================
-- RFP Projects — output mode and document style
-- ============================================================================
-- Adds three columns:
--   output_mode    — what the user wants the agent to produce
--   detected_type  — what the parser determined the source files to be
--   doc_style      — which response document template to use when generating
--
-- Output modes:
--   response_document — produce a written response document (PDF/DOCX)
--   fill_excel        — populate the source Excel workbook in place
--   both              — produce both
--
-- Doc styles:
--   formal_questionnaire — Q-then-A pairs, government RFP format
--   capabilities_brief   — narrative capabilities deck for sales-led RFPs
--   full_proposal        — full multi-section proposal with cover, exec summary, sections
-- ============================================================================

ALTER TABLE tenant_rfp_projects
  ADD COLUMN IF NOT EXISTS output_mode text DEFAULT 'response_document'
    CHECK (output_mode IN ('response_document','fill_excel','both')),
  ADD COLUMN IF NOT EXISTS detected_type text
    CHECK (detected_type IN ('pdf_questionnaire','docx_questionnaire','excel_questionnaire','excel_pricing','mixed','unknown')),
  ADD COLUMN IF NOT EXISTS doc_style text DEFAULT 'formal_questionnaire'
    CHECK (doc_style IN ('formal_questionnaire','capabilities_brief','full_proposal'));
