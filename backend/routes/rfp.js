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

export default router;
