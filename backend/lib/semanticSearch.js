/**
 * Semantic Search
 *
 * Vector similarity search over tenant document chunks.
 * Used by getKnowledgeContext() in claude.js as a replacement
 * for keyword-based document retrieval.
 */

import { generateEmbedding } from './embeddings.js';

/**
 * Search tenant documents by semantic similarity to a query string.
 *
 * @param {object} supabase - Supabase client (service role)
 * @param {string} tenantId - Tenant UUID
 * @param {string} query - User's search query / message
 * @param {object} [options]
 * @param {number} [options.matchCount=10] - Max chunks to return
 * @param {number} [options.matchThreshold=0.3] - Minimum cosine similarity
 * @returns {string|null} - Formatted context block or null
 */
export async function semanticSearch(supabase, tenantId, query, options = {}) {
  const { matchCount = 10, matchThreshold = 0.3 } = options;

  // Embed the query
  const queryEmbedding = await generateEmbedding(query);

  // Call the match_document_chunks RPC
  const { data: matches, error } = await supabase.rpc('match_document_chunks', {
    p_tenant_id: tenantId,
    p_embedding: JSON.stringify(queryEmbedding),
    p_match_count: matchCount,
    p_match_threshold: matchThreshold,
  });

  if (error) {
    console.error('[semanticSearch] RPC error:', error.message);
    return null;
  }

  if (!matches?.length) return null;

  // De-duplicate by document_id — merge adjacent chunks from same document
  const byDocument = {};
  const instructionChunks = [];

  for (const match of matches) {
    if (match.document_id) {
      if (!byDocument[match.document_id]) {
        byDocument[match.document_id] = {
          documentId: match.document_id,
          metadata: match.metadata || {},
          chunks: [],
          topSimilarity: match.similarity,
        };
      }
      byDocument[match.document_id].chunks.push(match);
    } else if (match.instruction_id) {
      instructionChunks.push(match);
    }
  }

  // Build context blocks
  const blocks = [];

  // Document blocks
  for (const doc of Object.values(byDocument)) {
    // Sort chunks by chunk_index for reading order
    doc.chunks.sort((a, b) => {
      const aIdx = a.metadata?.chunk_index ?? 0;
      const bIdx = b.metadata?.chunk_index ?? 0;
      return aIdx - bIdx;
    });

    const fileName = doc.metadata.file_name || 'Unknown';
    const docType = (doc.metadata.doc_type || 'document').toUpperCase();
    const dept = doc.metadata.department || '';
    const text = doc.chunks.map(c => c.chunk_text).join('\n\n');

    blocks.push(`--- ${docType}: ${fileName}${dept ? ` (${dept})` : ''} ---\n${text}`);
  }

  // Instruction blocks
  if (instructionChunks.length > 0) {
    const instrText = instructionChunks.map(c => c.chunk_text).join('\n\n');
    blocks.push(`--- AGENT INSTRUCTIONS ---\n${instrText}`);
  }

  if (blocks.length === 0) return null;

  return `\n\n=== TENANT KNOWLEDGE BASE ===\nThe following relevant passages have been retrieved from tenant documents. Use them as reference when answering questions. Follow SOPs exactly as documented.\n\n${blocks.join('\n\n')}`;
}

/**
 * Check if a tenant has any embeddings stored.
 * Used to decide between semantic search vs. keyword fallback.
 */
export async function hasEmbeddings(supabase, tenantId) {
  const { count, error } = await supabase
    .from('tenant_document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('embedding', 'is', null);

  if (error) return false;
  return (count || 0) > 0;
}
