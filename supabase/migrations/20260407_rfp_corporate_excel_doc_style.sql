-- ============================================================================
-- RFP doc_style — add 'corporate_excel_response' option
-- ============================================================================
-- Adds a 4th doc style used as the leave-behind proposal document for
-- corporate Excel-based RFPs (e.g. Morgan Stanley / CBRE format).
--
-- This style is auto-selected when output_mode = 'both' AND the source
-- was an Excel RFP. The Excel handles the formal submission; this doc
-- wins the room.
-- ============================================================================

ALTER TABLE tenant_rfp_projects
  DROP CONSTRAINT IF EXISTS tenant_rfp_projects_doc_style_check;

ALTER TABLE tenant_rfp_projects
  ADD CONSTRAINT tenant_rfp_projects_doc_style_check
  CHECK (doc_style IN (
    'formal_questionnaire',
    'capabilities_brief',
    'full_proposal',
    'corporate_excel_response'
  ));
