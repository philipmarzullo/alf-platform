import { Router } from 'express';
import { embedDocument, embedInstruction } from '../lib/embeddings.js';

const router = Router();

/** Admin guard — platform_owner, super-admin, or admin for own tenant */
function requireAdmin(req, res, next) {
  const role = req.user.role;
  const { tenantId } = req.params;
  if (role === 'platform_owner') return next();
  if (['super-admin', 'admin'].includes(role) && req.user.tenant_id === tenantId) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

/**
 * POST /api/embeddings/:tenantId/embed-document/:documentId
 * Embed a single document (chunks + vectors).
 */
router.post('/:tenantId/embed-document/:documentId', requireAdmin, async (req, res) => {
  const { tenantId, documentId } = req.params;

  try {
    const result = await embedDocument(req.supabase, tenantId, documentId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[embeddings] embed-document error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/embeddings/:tenantId/embed-instruction/:instructionId
 * Embed a single agent instruction.
 */
router.post('/:tenantId/embed-instruction/:instructionId', requireAdmin, async (req, res) => {
  const { tenantId, instructionId } = req.params;

  try {
    const result = await embedInstruction(req.supabase, tenantId, instructionId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[embeddings] embed-instruction error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/embeddings/:tenantId/embed-all
 * Backfill: embed all extracted documents + approved instructions for a tenant.
 */
router.post('/:tenantId/embed-all', requireAdmin, async (req, res) => {
  const { tenantId } = req.params;

  try {
    // Fetch all extracted documents
    const { data: docs } = await req.supabase
      .from('tenant_documents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'extracted');

    // Fetch all approved instructions for this tenant
    const { data: instructions } = await req.supabase
      .from('agent_instructions')
      .select('id')
      .eq('status', 'approved')
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);

    let embeddedDocs = 0;
    let embeddedInstructions = 0;
    let totalChunks = 0;
    let errors = 0;

    // Embed documents
    for (const doc of (docs || [])) {
      try {
        const result = await embedDocument(req.supabase, tenantId, doc.id);
        embeddedDocs++;
        totalChunks += result.chunks;
      } catch (err) {
        console.error(`[embeddings] Failed to embed document ${doc.id}:`, err.message);
        errors++;
      }
    }

    // Embed instructions
    for (const instr of (instructions || [])) {
      try {
        const result = await embedInstruction(req.supabase, tenantId, instr.id);
        embeddedInstructions++;
        totalChunks += result.chunks;
      } catch (err) {
        console.error(`[embeddings] Failed to embed instruction ${instr.id}:`, err.message);
        errors++;
      }
    }

    console.log(`[embeddings] Backfill complete for tenant ${tenantId}: ${embeddedDocs} docs, ${embeddedInstructions} instructions, ${totalChunks} chunks, ${errors} errors`);

    res.json({
      success: true,
      documents_embedded: embeddedDocs,
      instructions_embedded: embeddedInstructions,
      total_chunks: totalChunks,
      errors,
    });
  } catch (err) {
    console.error(`[embeddings] embed-all error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/embeddings/:tenantId/status
 * Return embedding coverage stats for a tenant.
 */
router.get('/:tenantId/status', requireAdmin, async (req, res) => {
  const { tenantId } = req.params;

  try {
    const [docsRes, chunksRes, embeddedDocsRes] = await Promise.all([
      // Total extracted documents
      req.supabase
        .from('tenant_documents')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'extracted'),
      // Total chunks with embeddings
      req.supabase
        .from('tenant_document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('embedding', 'is', null),
      // Distinct documents with embeddings
      req.supabase
        .from('tenant_document_chunks')
        .select('document_id')
        .eq('tenant_id', tenantId)
        .not('document_id', 'is', null)
        .not('embedding', 'is', null),
    ]);

    const totalDocuments = docsRes.count || 0;
    const totalChunks = chunksRes.count || 0;
    const embeddedDocIds = new Set((embeddedDocsRes.data || []).map(r => r.document_id));

    res.json({
      total_documents: totalDocuments,
      embedded_documents: embeddedDocIds.size,
      total_chunks: totalChunks,
      coverage_pct: totalDocuments > 0
        ? Math.round((embeddedDocIds.size / totalDocuments) * 100)
        : 0,
    });
  } catch (err) {
    console.error(`[embeddings] status error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
