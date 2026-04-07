import { Router } from 'express';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  TextRun,
  PageBreak,
  Footer,
  Header,
  PageNumber,
} from 'docx';
import ExcelJS from 'exceljs';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function canRead(req, tenantId) {
  return req.user.role === 'platform_owner' || req.user.tenant_id === tenantId;
}

function canWrite(req, tenantId) {
  return (
    req.user.role === 'platform_owner' ||
    (['super-admin', 'admin'].includes(req.user.role) && req.user.tenant_id === tenantId)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rfp/facts/:tenantId
// Returns all RFP facts for a tenant, grouped by category.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/facts/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  if (!canRead(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_rfp_facts')
      .select('id, fact_key, fact_value, category, source, notes, updated_at')
      .eq('tenant_id', tenantId)
      .order('category')
      .order('fact_key');

    if (error) {
      console.error('[rfp/facts] GET error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    // Group by category for convenience
    const grouped = {};
    for (const row of data || []) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row);
    }

    return res.json({ facts: data || [], grouped });
  } catch (err) {
    console.error('[rfp/facts] GET exception:', err.message);
    return res.status(500).json({ error: 'Failed to fetch RFP facts' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/rfp/facts/:tenantId/:factKey
// Upsert a single fact for a tenant.
// Body: { fact_value, category, source?, notes? }
// ─────────────────────────────────────────────────────────────────────────────

router.put('/facts/:tenantId/:factKey', async (req, res) => {
  const { tenantId, factKey } = req.params;
  const { fact_value, category, source, notes } = req.body;

  if (!canWrite(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!factKey || !category) {
    return res.status(400).json({ error: 'fact_key and category are required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_rfp_facts')
      .upsert(
        {
          tenant_id: tenantId,
          fact_key: factKey,
          fact_value: fact_value ?? null,
          category,
          source: source || 'confirmed',
          notes: notes ?? null,
          updated_by: req.user.id,
        },
        { onConflict: 'tenant_id,fact_key' }
      )
      .select()
      .single();

    if (error) {
      console.error('[rfp/facts] PUT error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ fact: data });
  } catch (err) {
    console.error('[rfp/facts] PUT exception:', err.message);
    return res.status(500).json({ error: 'Failed to save RFP fact' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/rfp/facts/:tenantId  (bulk upsert)
// Body: { facts: [{ fact_key, fact_value, category, source?, notes? }, ...] }
// ─────────────────────────────────────────────────────────────────────────────

router.put('/facts/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  const { facts } = req.body;

  if (!canWrite(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!Array.isArray(facts) || facts.length === 0) {
    return res.status(400).json({ error: 'facts array is required' });
  }

  const rows = facts.map(f => ({
    tenant_id: tenantId,
    fact_key: f.fact_key,
    fact_value: f.fact_value ?? null,
    category: f.category,
    source: f.source || 'confirmed',
    notes: f.notes ?? null,
    updated_by: req.user.id,
  }));

  try {
    const { data, error } = await req.supabase
      .from('tenant_rfp_facts')
      .upsert(rows, { onConflict: 'tenant_id,fact_key' })
      .select();

    if (error) {
      console.error('[rfp/facts] BULK PUT error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ facts: data || [], count: data?.length || 0 });
  } catch (err) {
    console.error('[rfp/facts] BULK PUT exception:', err.message);
    return res.status(500).json({ error: 'Failed to save RFP facts' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/rfp/facts/:tenantId/:factKey
// ─────────────────────────────────────────────────────────────────────────────

router.delete('/facts/:tenantId/:factKey', async (req, res) => {
  const { tenantId, factKey } = req.params;

  if (!canWrite(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { error } = await req.supabase
      .from('tenant_rfp_facts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('fact_key', factKey);

    if (error) {
      console.error('[rfp/facts] DELETE error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[rfp/facts] DELETE exception:', err.message);
    return res.status(500).json({ error: 'Failed to delete RFP fact' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/rfp/:projectId/pricing
// Save the pricing_inputs JSONB for a project (auto-save on field blur).
// Body: { pricing_inputs: { "<sheet>": [{ row, role, ... }, ...] } }
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:projectId/pricing', async (req, res) => {
  const { projectId } = req.params;
  const { pricing_inputs } = req.body;

  if (!pricing_inputs || typeof pricing_inputs !== 'object') {
    return res.status(400).json({ error: 'pricing_inputs object is required' });
  }

  try {
    const { data: project, error: projectErr } = await req.supabase
      .from('tenant_rfp_projects')
      .select('tenant_id')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'RFP project not found' });
    }

    if (!canWrite(req, project.tenant_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { error: updateErr } = await req.supabase
      .from('tenant_rfp_projects')
      .update({ pricing_inputs })
      .eq('id', projectId);

    if (updateErr) {
      console.error('[rfp/pricing] update error:', updateErr.message);
      return res.status(500).json({ error: updateErr.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[rfp/pricing] exception:', err.message);
    return res.status(500).json({ error: 'Failed to save pricing inputs' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rfp/:projectId/generate-excel
// Loads the original uploaded Excel, writes approved item responses into
// their source_cell references, writes pricing_inputs into pricing-tab
// staffing rows (cols C/D/G), and returns the completed XLSX. Preserves
// all formulas — only writes plain values to non-formula cells.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:projectId/generate-excel', async (req, res) => {
  const { projectId } = req.params;

  try {
    const { data: project, error: projectErr } = await req.supabase
      .from('tenant_rfp_projects')
      .select('id, tenant_id, name, output_mode, source_excel_path, pricing_inputs')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'RFP project not found' });
    }

    if (!canRead(req, project.tenant_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!['fill_excel', 'both'].includes(project.output_mode)) {
      return res.status(400).json({
        error: 'This project is not configured for Excel output. Set output mode to fill_excel or both.',
      });
    }

    if (!project.source_excel_path) {
      return res.status(400).json({
        error: 'No source Excel file found for this project. Please re-upload the original RFP file.',
      });
    }

    // Download the original Excel from the tenant-documents bucket
    const { data: fileData, error: downloadErr } = await req.supabase.storage
      .from('tenant-documents')
      .download(project.source_excel_path);

    if (downloadErr || !fileData) {
      console.error('[rfp/generate-excel] download error:', downloadErr?.message);
      return res.status(500).json({ error: 'Failed to retrieve source Excel file' });
    }

    const sourceBuffer = Buffer.from(await fileData.arrayBuffer());

    // Fetch approved items with a source_cell + final_response
    const { data: items, error: itemsErr } = await req.supabase
      .from('tenant_rfp_items')
      .select('item_number, source_cell, final_response, draft_response, status')
      .eq('rfp_project_id', projectId)
      .eq('status', 'approved')
      .not('source_cell', 'is', null);

    if (itemsErr) {
      console.error('[rfp/generate-excel] items fetch error:', itemsErr.message);
      return res.status(500).json({ error: 'Failed to fetch approved items' });
    }

    // Load the workbook. ExcelJS preserves existing formulas on load.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(sourceBuffer);

    const warnings = [];
    let writtenCount = 0;

    // ── Questionnaire write-back ──
    for (const item of items || []) {
      const response = item.final_response && item.final_response.trim();
      if (!response) continue;

      const parsed = parseSourceCell(item.source_cell);
      if (!parsed) {
        warnings.push(`Item ${item.item_number}: invalid source_cell "${item.source_cell}"`);
        continue;
      }

      const { sheetName, cellRef } = parsed;
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) {
        warnings.push(`Item ${item.item_number}: sheet "${sheetName}" not found`);
        continue;
      }

      const cell = sheet.getCell(cellRef);

      // Safety: do not overwrite a formula cell
      if (cell.formula || (cell.value && typeof cell.value === 'object' && cell.value.formula)) {
        warnings.push(`Item ${item.item_number}: target cell ${item.source_cell} is a formula — skipped`);
        continue;
      }

      // Safety: do not overwrite a cell that already has content
      const existing = cell.value;
      const hasExisting =
        existing != null &&
        (typeof existing === 'string' ? existing.trim().length > 0 : true);
      if (hasExisting) {
        warnings.push(
          `Item ${item.item_number}: target cell ${item.source_cell} already has content — skipped`
        );
        continue;
      }

      cell.value = stripMarkdown(response);
      writtenCount += 1;
    }

    // ── Pricing write-back ──
    const pricingInputs = project.pricing_inputs || {};
    let pricingCount = 0;
    for (const [sheetName, rows] of Object.entries(pricingInputs)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) {
        warnings.push(`Pricing sheet "${sheetName}" not found`);
        continue;
      }

      for (const entry of rows) {
        if (!entry || !entry.row) continue;
        const rowNum = Number(entry.row);
        if (!Number.isFinite(rowNum) || rowNum <= 0) continue;

        // Only write to cells that are not formulas and currently empty/zero
        writePricingCell(sheet, `C${rowNum}`, entry.hours_per_day, warnings);
        writePricingCell(sheet, `D${rowNum}`, entry.days_per_week, warnings);
        writePricingCell(sheet, `G${rowNum}`, entry.wage_rate, warnings);
        pricingCount += 1;
      }
    }

    const outBuffer = await workbook.xlsx.writeBuffer();
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]+/g, '_');

    console.log(
      `[rfp/generate-excel] project=${projectId} wrote ${writtenCount} questionnaire answers, ${pricingCount} pricing rows, ${warnings.length} warnings`
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}_Response.xlsx"`
    );
    res.setHeader('X-Write-Count', String(writtenCount));
    res.setHeader('X-Pricing-Count', String(pricingCount));
    res.setHeader('X-Warning-Count', String(warnings.length));
    return res.send(Buffer.from(outBuffer));
  } catch (err) {
    console.error('[rfp/generate-excel] exception:', err);
    return res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});

// Parse 'Sheet Name!C5' → { sheetName: 'Sheet Name', cellRef: 'C5' }
function parseSourceCell(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const idx = ref.lastIndexOf('!');
  if (idx < 0) return null;
  const sheetName = ref.slice(0, idx).replace(/^'/, '').replace(/'$/, '');
  const cellRef = ref.slice(idx + 1);
  if (!sheetName || !/^[A-Z]+[0-9]+$/i.test(cellRef)) return null;
  return { sheetName, cellRef };
}

// Strip light markdown so Excel cells hold plain text.
function stripMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[\s]*[-*•]\s+/gm, '• ')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// Write a numeric value to a pricing input cell, guarding against formulas
// and missing values. Values of 0 or missing are skipped so the user can
// leave rows blank.
function writePricingCell(sheet, cellRef, value, warnings) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return;
  const cell = sheet.getCell(cellRef);
  if (cell.formula || (cell.value && typeof cell.value === 'object' && cell.value.formula)) {
    warnings.push(`Pricing cell ${sheet.name}!${cellRef} is a formula — skipped`);
    return;
  }
  cell.value = num;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rfp/:projectId/generate-doc
// Generates a DOCX response document based on the project's doc_style.
// Returns a binary DOCX file as an attachment.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:projectId/generate-doc', async (req, res) => {
  const { projectId } = req.params;

  try {
    // Fetch the project
    const { data: project, error: projectErr } = await req.supabase
      .from('tenant_rfp_projects')
      .select('id, tenant_id, name, issuing_organization, output_mode, doc_style, status')
      .eq('id', projectId)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'RFP project not found' });
    }

    if (!canRead(req, project.tenant_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch all items for this project
    const { data: items, error: itemsErr } = await req.supabase
      .from('tenant_rfp_items')
      .select('item_number, question_text, section, category, draft_response, final_response, status')
      .eq('rfp_project_id', projectId)
      .order('item_number');

    if (itemsErr) {
      console.error('[rfp/generate-doc] Items fetch error:', itemsErr.message);
      return res.status(500).json({ error: 'Failed to fetch RFP items' });
    }

    // Fetch tenant company name
    const { data: tenant } = await req.supabase
      .from('alf_tenants')
      .select('company_name')
      .eq('id', project.tenant_id)
      .single();

    const companyName = tenant?.company_name || 'Our Company';

    // Branch on doc_style
    const docStyle = project.doc_style || 'formal_questionnaire';
    let doc;
    if (docStyle === 'capabilities_brief') {
      doc = buildCapabilitiesBrief({ project, items: items || [], companyName });
    } else if (docStyle === 'full_proposal') {
      doc = buildFullProposal({ project, items: items || [], companyName });
    } else if (docStyle === 'corporate_excel_response') {
      doc = await buildCorporateExcelResponse({
        project,
        items: items || [],
        companyName,
        supabase: req.supabase,
        tenantId: project.tenant_id,
      });
    } else {
      doc = buildFormalQuestionnaire({ project, items: items || [], companyName });
    }

    const buffer = await Packer.toBuffer(doc);
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]+/g, '_');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}_response.docx"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error('[rfp/generate-doc] exception:', err);
    return res.status(500).json({ error: 'Failed to generate response document' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Document builders
// ─────────────────────────────────────────────────────────────────────────────

function makeHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function makeBody(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: text || '', ...opts })],
    spacing: { after: 120 },
  });
}

function makeFooter(companyName) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${companyName}  |  Page `, size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
          new TextRun({ text: ' of ', size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '888888' }),
        ],
      }),
    ],
  });
}

function getResponseText(item) {
  return item.final_response || item.draft_response || '[No response provided]';
}

function groupBySection(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.section || 'General';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

// ── Style 1: Formal Questionnaire ────────────────────────────────────────────
// Q-then-A pairs grouped by section. Standard government RFP format.

function buildFormalQuestionnaire({ project, items, companyName }) {
  const children = [];

  // Cover
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [
        new TextRun({ text: 'RESPONSE TO REQUEST FOR PROPOSAL', bold: true, size: 32 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: project.name, bold: true, size: 28 })],
    }),
  );

  if (project.issuing_organization) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({ text: `Issued by: ${project.issuing_organization}`, size: 22 }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 120 },
      children: [new TextRun({ text: 'Submitted by:', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: companyName, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          size: 22,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Q&A by section
  const groups = groupBySection(items);
  for (const [section, sectionItems] of groups.entries()) {
    children.push(makeHeading(section, HeadingLevel.HEADING_1));
    for (const item of sectionItems) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({ text: `${item.item_number}. `, bold: true }),
            new TextRun({ text: item.question_text, bold: true }),
          ],
        }),
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: 'Response: ', bold: true, italics: true }),
          ],
        }),
        ...formatResponseParagraphs(getResponseText(item)),
      );
    }
  }

  return new Document({
    creator: companyName,
    title: project.name,
    sections: [
      {
        properties: {},
        footers: { default: makeFooter(companyName) },
        children,
      },
    ],
  });
}

// ── Style 2: Capabilities Brief ──────────────────────────────────────────────
// Narrative capabilities deck with cover, intro, and each Q reframed as a
// capability statement. Used for sales-led RFPs.

function buildCapabilitiesBrief({ project, items, companyName }) {
  const children = [];

  // Cover
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [
        new TextRun({ text: 'CAPABILITIES BRIEF', bold: true, size: 36 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        new TextRun({ text: `Prepared for ${project.issuing_organization || project.name}`, size: 24 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 120 },
      children: [new TextRun({ text: 'Presented by', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: companyName, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
          }),
          size: 22,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Intro
  children.push(
    makeHeading('Introduction'),
    makeBody(
      `${companyName} is pleased to present this capabilities brief in response to ${project.issuing_organization || 'your organization'}'s requirements. The following pages outline how our experience, processes, and people directly address the needs you have communicated.`
    ),
  );

  // Capabilities by section — narrative form
  const groups = groupBySection(items);
  for (const [section, sectionItems] of groups.entries()) {
    children.push(makeHeading(section));
    for (const item of sectionItems) {
      // Frame as capability statement: italic question, then response as body text
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({ text: 'Requirement: ', bold: true, italics: true, color: '555555' }),
            new TextRun({ text: item.question_text, italics: true, color: '555555' }),
          ],
        }),
        ...formatResponseParagraphs(getResponseText(item)),
      );
    }
  }

  // Closing
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    makeHeading('Next Steps'),
    makeBody(
      `${companyName} welcomes the opportunity to discuss this brief in detail and answer any additional questions. We are prepared to schedule a walkthrough, provide references, and develop a customized proposal that aligns with your timeline and priorities.`
    ),
  );

  return new Document({
    creator: companyName,
    title: project.name,
    sections: [
      {
        properties: {},
        footers: { default: makeFooter(companyName) },
        children,
      },
    ],
  });
}

// ── Style 3: Full Proposal ───────────────────────────────────────────────────
// Cover + executive summary + numbered sections + Q&A appendix + closing.

function buildFullProposal({ project, items, companyName }) {
  const children = [];

  // Cover
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [
        new TextRun({ text: 'PROPOSAL', bold: true, size: 40 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: project.name, bold: true, size: 28 })],
    }),
  );

  if (project.issuing_organization) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({ text: `Prepared for ${project.issuing_organization}`, size: 24 }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1600, after: 120 },
      children: [new TextRun({ text: 'Submitted by', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: companyName, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          size: 22,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Table of contents (manual list)
  children.push(
    makeHeading('Table of Contents'),
    makeBody('1. Executive Summary'),
    makeBody('2. Company Overview'),
    makeBody('3. Detailed Responses'),
    makeBody('4. Conclusion'),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Executive Summary
  children.push(
    makeHeading('1. Executive Summary'),
    makeBody(
      `${companyName} is honored to submit this proposal in response to ${project.issuing_organization || 'your organization'}'s request. This document outlines our approach, qualifications, and detailed responses to each requirement contained in the RFP.`
    ),
    makeBody(
      'Our proposal is built on three pillars: a deep understanding of your operational needs, a track record of measurable performance with comparable clients, and a partnership model designed for long-term value rather than short-term cost cutting.'
    ),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Company Overview
  children.push(
    makeHeading('2. Company Overview'),
    makeBody(
      `${companyName} brings a structured, accountable approach to facility services. Our team is built around dedicated account management, on-site supervision, and continuous quality measurement. We choose our partnerships carefully and invest in the success of every account we take on.`
    ),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // Detailed responses
  children.push(makeHeading('3. Detailed Responses'));
  const groups = groupBySection(items);
  let subIdx = 1;
  for (const [section, sectionItems] of groups.entries()) {
    children.push(makeHeading(`3.${subIdx} ${section}`, HeadingLevel.HEADING_2));
    for (const item of sectionItems) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({ text: `${item.item_number}. `, bold: true }),
            new TextRun({ text: item.question_text, bold: true }),
          ],
        }),
        ...formatResponseParagraphs(getResponseText(item)),
      );
    }
    subIdx += 1;
  }

  // Conclusion
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    makeHeading('4. Conclusion'),
    makeBody(
      `${companyName} is committed to delivering an exceptional partnership built on transparency, performance, and accountability. We welcome the opportunity to discuss this proposal in detail and look forward to the next steps in your evaluation process.`
    ),
    new Paragraph({
      spacing: { before: 480 },
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'Respectfully submitted,', italics: true }),
      ],
    }),
    new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: companyName, bold: true })],
    }),
  );

  return new Document({
    creator: companyName,
    title: project.name,
    sections: [
      {
        properties: {},
        footers: { default: makeFooter(companyName) },
        children,
      },
    ],
  });
}

// Split a response string into paragraph blocks (preserves blank-line separation).
function formatResponseParagraphs(text) {
  if (!text) return [makeBody('')];
  const blocks = String(text).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [makeBody('')];
  return blocks.map(block =>
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: block })],
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Style 4: Corporate Excel Response
// Leave-behind proposal for corporate Excel-based RFPs (Morgan Stanley/CBRE).
// The Excel handles the formal submission; this doc wins the room.
// 9 sections, 3 of which (Exec Summary, Why Us, Tech & Innovation) are
// drafted by the rfp_builder agent at generation time.
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Fetches the rfp_builder system prompt + injects verified facts + Q&A,
// then calls Anthropic and returns the assistant text. Returns a fallback
// placeholder string on any error so the doc still generates.
async function callRfpAgent({ supabase, tenantId, sectionLabel, userPrompt }) {
  const fallback = `[Draft required: ${sectionLabel} — agent call failed. Please draft manually before submission.]`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[callRfpAgent] ANTHROPIC_API_KEY not set');
      return fallback;
    }

    // 1. Load the rfp_builder agent's base system prompt
    const { data: agent, error: agentErr } = await supabase
      .from('tenant_agents')
      .select('system_prompt')
      .eq('tenant_id', tenantId)
      .eq('agent_key', 'rfp_builder')
      .single();

    if (agentErr || !agent) {
      console.error('[callRfpAgent] rfp_builder agent not found:', agentErr?.message);
      return fallback;
    }

    let system = agent.system_prompt || '';

    // 2. Inject verified facts + Q&A library (mirrors claude.js pattern)
    const [factsRes, qaRes] = await Promise.all([
      supabase
        .from('tenant_rfp_facts')
        .select('fact_key, fact_value, category, source')
        .eq('tenant_id', tenantId),
      supabase
        .from('tenant_rfp_answers')
        .select('question, answer, category, win_count')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('win_count', { ascending: false })
        .limit(50),
    ]);

    const factEntries = (factsRes.data || []).filter(
      f => f.fact_value && String(f.fact_value).trim()
    );
    if (factEntries.length) {
      const grouped = {};
      for (const f of factEntries) {
        if (!grouped[f.category]) grouped[f.category] = [];
        grouped[f.category].push(f);
      }
      const blocks = Object.entries(grouped).map(([cat, rows]) => {
        const lines = rows.map(r => `  ${r.fact_key} = ${r.fact_value}`).join('\n');
        return `[${cat}]\n${lines}`;
      });
      system += '\n\n=== RFP VERIFIED FACTS ===\n';
      system += 'The following are tenant-verified facts. Treat them as ground truth — never invent values that contradict them.\n\n';
      system += blocks.join('\n\n');
    }

    const qaEntries = qaRes.data || [];
    if (qaEntries.length) {
      system += '\n\n=== RFP Q&A LIBRARY ===\n';
      system += 'The following are previously approved Q&A pairs. Adapt wording to fit the specific context.\n\n';
      system += qaEntries
        .map(qa => `[${qa.category}] Q: ${qa.question}\nA: ${qa.answer}`)
        .join('\n\n');
    }

    // 3. Call Anthropic
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        system,
        max_tokens: 2048,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[callRfpAgent] ${sectionLabel} HTTP ${response.status}:`, errText.slice(0, 300));
      return fallback;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    if (!text.trim()) {
      console.error(`[callRfpAgent] ${sectionLabel} empty response`);
      return fallback;
    }
    return text.trim();
  } catch (err) {
    console.error(`[callRfpAgent] ${sectionLabel} exception:`, err.message);
    return fallback;
  }
}

// Pull facts from the corporate/references categories for the References section.
async function fetchCorporateReferences(supabase, tenantId) {
  const { data } = await supabase
    .from('tenant_rfp_facts')
    .select('fact_key, fact_value, category')
    .eq('tenant_id', tenantId)
    .in('category', ['corporate', 'references'])
    .order('fact_key');
  return (data || []).filter(f => f.fact_value && String(f.fact_value).trim());
}

// Render an agent-drafted block: split by blank lines into paragraphs.
function renderAgentBlock(text) {
  const blocks = String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) {
    return [makeBody('[Draft pending]')];
  }
  return blocks.map(block =>
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: block })],
    })
  );
}

async function buildCorporateExcelResponse({ project, items, companyName, supabase, tenantId }) {
  const prospect = project.issuing_organization || 'your organization';

  // Build a compact list of approved questionnaire answers to feed into the
  // technology section prompt — the agent uses these to know which tech
  // capabilities the prospect actually asked about.
  const approvedItems = (items || []).filter(
    i => (i.final_response || i.draft_response) && (i.final_response || '').trim().length > 0
  );
  const techItems = approvedItems.filter(i => {
    const text = `${i.question_text || ''} ${i.section || ''} ${i.category || ''}`.toLowerCase();
    return /tech|software|innov|app|portal|platform|qr|sensor|ai|automation|inspect/.test(text);
  });

  // ── Sequential agent calls (rate-limit friendly) ──
  console.log('[buildCorporateExcelResponse] drafting executive summary…');
  const execSummary = await callRfpAgent({
    supabase,
    tenantId,
    sectionLabel: 'Executive Summary',
    userPrompt: `Draft a 3-paragraph Executive Summary for ${companyName}'s proposal to ${prospect}.

Paragraph 1: Open with a confident statement of why ${companyName} is the right partner for ${prospect}'s facility services. Reference the prospect by name.
Paragraph 2: Highlight 2–3 specific, verifiable capabilities or differentiators from the verified facts that map directly to a corporate facility client like ${prospect} (e.g. multi-site coordination, safety record, technology platform, account management discipline).
Paragraph 3: Close with the partnership commitment and a clear next step.

Tone: confident, precise, executive-level. No fluff. No bullet points. No headings — return only the body text. ~250 words total.`,
  });

  console.log('[buildCorporateExcelResponse] drafting why-us section…');
  const whyUs = await callRfpAgent({
    supabase,
    tenantId,
    sectionLabel: 'Why ' + companyName + ' for This Account',
    userPrompt: `Draft the "Why ${companyName} for This Account" section of a proposal to ${prospect}.

Structure: 4–6 short paragraphs, each opening with a single bolded lead-in phrase followed by 2–3 sentences of supporting detail. Each paragraph should make ONE specific, evidence-backed argument for why ${companyName} is uniquely qualified to win and retain this account.

Draw from the verified facts and Q&A library. Topics to consider (use what is supported by facts, skip the rest):
- Comparable corporate accounts already served
- Safety record (TRIR/EMR if available)
- Account management model and supervisor coverage
- Quality assurance discipline and reporting cadence
- Workforce stability / retention numbers
- Technology platform and transparency

Tone: confident, specific, no generic claims. Use numbers where the facts provide them. If a topic lacks supporting facts, do not invent — leave it out. Return only the body text (with **bold** lead-ins). No section heading — that is added separately.`,
  });

  // Build a tech-question summary for the agent
  let techQContext = '';
  if (techItems.length) {
    techQContext = '\n\nThe Excel questionnaire includes these technology-related items the prospect asked about:\n';
    techQContext += techItems
      .slice(0, 15)
      .map(i => `- ${i.item_number}: ${i.question_text}`)
      .join('\n');
  }

  console.log('[buildCorporateExcelResponse] drafting technology section…');
  const techSection = await callRfpAgent({
    supabase,
    tenantId,
    sectionLabel: 'Technology & Innovation',
    userPrompt: `Draft the "Technology & Innovation" section of a corporate proposal to ${prospect}.

Goal: position ${companyName}'s technology platform as a competitive advantage. The reader is a corporate procurement / facilities executive who has seen many janitorial proposals and is looking for differentiation.

Structure: 3 short subsections, each with a bolded subheading and 2–3 sentences of plain-language detail. Suggested subsections (use what is supported by the verified facts and tech platform list — skip any not supported):
1. **Real-time visibility** — how the platform gives the client live access to inspections, work orders, attendance.
2. **Quality measurement** — automated audits, scoring, trend reporting, accountability.
3. **Operational AI** — what the platform automates today and what is on the roadmap for ${prospect}.

Close with one short paragraph stating that the platform is included at no additional cost and is deployed in week 1 of the transition.${techQContext}

Tone: technical-credible, not marketing-fluffy. Avoid buzzwords like "synergy" or "leverage". Return only the body text with **bold** subheadings. No top-level section heading — that is added separately.`,
  });

  // ── References (from facts) ──
  const references = await fetchCorporateReferences(supabase, tenantId);

  // ── Build the document ──
  const children = [];

  // ── Section 1: Cover ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: 'PROPOSAL', bold: true, size: 44 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'Janitorial & Facility Services', size: 24, color: '555555' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 240 },
      children: [new TextRun({ text: `Prepared for ${prospect}`, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: project.name, size: 22, color: '555555' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 120 },
      children: [new TextRun({ text: 'Submitted by', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: companyName, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          size: 22,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 2: Executive Summary (agent) ──
  children.push(
    makeHeading('Executive Summary'),
    ...renderAgentBlock(execSummary),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 3: Company Overview (static Tier 1) ──
  children.push(
    makeHeading('Company Overview'),
    makeBody(
      `${companyName} delivers janitorial and facility services to corporate, institutional, and government clients. We are built around a simple principle: the client should never have to chase us. Every account is structured for accountability, with dedicated supervision, transparent reporting, and a single point of contact who answers when you call.`
    ),
    makeBody(
      'Our business model is intentionally selective. We grow only as fast as we can hire, train, and supervise. This is why our retention numbers — both client and employee — outperform the industry. When we take on an account, it stays.'
    ),
    makeBody(
      'We operate with a flat decision structure. The supervisor on your account has the authority to solve problems on the spot. Escalations reach the executive team within hours, not days. This is the difference between a vendor and a partner — and it is the difference our clients consistently cite when asked why they renew.'
    ),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 4: Why Us (agent) ──
  children.push(
    makeHeading(`Why ${companyName} for This Account`),
    ...renderAgentBlock(whyUs),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 5: Technology & Innovation (agent) ──
  children.push(
    makeHeading('Technology & Innovation'),
    ...renderAgentBlock(techSection),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 6: Quality Assurance & Reporting (static + dynamic) ──
  children.push(
    makeHeading('Quality Assurance & Reporting'),
    makeBody(
      `${companyName}'s quality program is built on three layers: the on-site supervisor, the account manager, and the quality assurance director. Each layer performs structured inspections on a defined cadence, and every inspection feeds into a single reporting system the client can access in real time.`
    ),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: 'Inspection Cadence', bold: true })],
    }),
    makeBody('• Supervisor walk-throughs: daily, every shift, every assigned area.'),
    makeBody('• Account manager inspections: weekly, scored against the contract scope.'),
    makeBody('• QA director audits: monthly, unannounced, with corrective-action tracking.'),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: 'Reporting to the Client', bold: true })],
    }),
    makeBody(
      'Inspection results are visible to the client through our reporting platform within minutes of completion. Monthly QBRs (Quarterly Business Reviews held monthly during the first year) summarize trends, corrective actions, training updates, and forward planning. Nothing is hidden — clients see the same data we see.'
    ),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 7: Transition Overview (static Tier 1) ──
  children.push(
    makeHeading('Transition Overview'),
    makeBody(
      `${companyName} executes transitions as a structured program with a named transition lead, a defined timeline, and daily checkpoints in weeks 1 and 2. Our standard transition window for an account of this size is 30 days, with the first 14 days running parallel to the incumbent where possible.`
    ),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: 'Phase 1 — Mobilization (Days 1–7)', bold: true })],
    }),
    makeBody(
      'Site walks with client leadership; final scope confirmation; staff offers extended to retained incumbent employees; supervisor placement; uniform and equipment staging; technology platform stand-up.'
    ),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: 'Phase 2 — Stabilization (Days 8–21)', bold: true })],
    }),
    makeBody(
      'Daily on-site presence by the transition lead; punch-list resolution; first inspection cycle; client feedback sessions every 48 hours; staffing adjustments based on observed workload.'
    ),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: 'Phase 3 — Steady State (Days 22–30)', bold: true })],
    }),
    makeBody(
      'Hand-off from the transition lead to the permanent account manager; first formal QBR scheduled; reporting cadence established; lessons-learned document delivered to the client.'
    ),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── Section 8: References (from facts) ──
  children.push(makeHeading('References'));
  if (references.length === 0) {
    children.push(
      makeBody(
        '[Draft required: References — no corporate references found in the verified facts. Add reference entries in the RFP Facts panel under category "corporate" or "references" before submission.]'
      )
    );
  } else {
    children.push(
      makeBody(
        'The following clients have authorized us to share their contact information. Additional references are available on request.'
      )
    );
    for (const ref of references) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({ text: `${ref.fact_key}: `, bold: true }),
            new TextRun({ text: String(ref.fact_value) }),
          ],
        })
      );
    }
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Section 9: Contact / Next Steps (static) ──
  children.push(
    makeHeading('Contact & Next Steps'),
    makeBody(
      `${companyName} is ready to discuss this proposal in detail at ${prospect}'s convenience. We welcome a site walk, additional reference calls, and the opportunity to meet the supervisor and account manager who would be assigned to this account.`
    ),
    makeBody('Recommended next steps:'),
    makeBody('1. Review of the formal Excel response submitted alongside this proposal.'),
    makeBody('2. Site walk and scope confirmation with the proposed account manager.'),
    makeBody('3. Reference calls with the contacts listed in this document.'),
    makeBody('4. Contract finalization and 30-day transition kickoff.'),
    new Paragraph({
      spacing: { before: 480 },
      children: [new TextRun({ text: 'Respectfully submitted,', italics: true })],
    }),
    new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: companyName, bold: true })],
    }),
  );

  return new Document({
    creator: companyName,
    title: project.name,
    sections: [
      {
        properties: {},
        footers: { default: makeFooter(companyName) },
        children,
      },
    ],
  });
}

export default router;
