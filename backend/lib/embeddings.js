/**
 * Embedding Service
 *
 * Chunks text, generates embeddings via OpenAI text-embedding-3-small,
 * and stores them in tenant_document_chunks for semantic search.
 */

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

/**
 * Generate an embedding vector for a text string.
 * Uses OpenAI text-embedding-3-small (1536 dims, $0.02/1M tokens).
 */
export async function generateEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text.slice(0, 8000), // Safety: truncate excessively long inputs
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI embedding failed: ${response.status} ${err.error?.message || ''}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * More efficient than calling generateEmbedding individually.
 */
export async function generateEmbeddings(texts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: texts.map(t => t.slice(0, 8000)),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI embedding batch failed: ${response.status} ${err.error?.message || ''}`);
  }

  const data = await response.json();
  return data.data.map(d => d.embedding);
}

/**
 * Split text into chunks of approximately maxTokens with overlap.
 * Respects paragraph boundaries where possible.
 *
 * @param {string} text - The source text to chunk
 * @param {number} maxTokens - Approximate max tokens per chunk (rough: 1 token ≈ 4 chars)
 * @param {number} overlapTokens - Token overlap between chunks
 * @returns {Array<{text: string, index: number}>}
 */
export function chunkText(text, maxTokens = 500, overlapTokens = 50) {
  if (!text || !text.trim()) return [];

  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  // Split into paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();

    // If a single paragraph exceeds maxChars, split it by sentences
    if (trimmedPara.length > maxChars) {
      // Flush current chunk first
      if (currentChunk.trim()) {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
        // Keep overlap from end of current chunk
        const overlapText = currentChunk.trim().slice(-overlapChars);
        currentChunk = overlapText ? overlapText + '\n\n' : '';
      }

      // Split long paragraph by sentences
      const sentences = trimmedPara.match(/[^.!?]+[.!?]+\s*/g) || [trimmedPara];
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxChars && currentChunk.trim()) {
          chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
          const overlapText = currentChunk.trim().slice(-overlapChars);
          currentChunk = overlapText ? overlapText + ' ' : '';
        }
        currentChunk += sentence;
      }
      continue;
    }

    // Would adding this paragraph exceed the limit?
    if (currentChunk.length + trimmedPara.length + 2 > maxChars && currentChunk.trim()) {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
      // Keep overlap from end of current chunk
      const overlapText = currentChunk.trim().slice(-overlapChars);
      currentChunk = overlapText ? overlapText + '\n\n' : '';
    }

    currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
  }

  // Flush remaining
  if (currentChunk.trim()) {
    chunks.push({ text: currentChunk.trim(), index: chunkIndex });
  }

  return chunks;
}

/**
 * Estimate token count for a text string.
 * Rough approximation: 1 token ≈ 4 chars for English text.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Embed all chunks for a single tenant document.
 * Deletes existing chunks for the document first (idempotent).
 */
export async function embedDocument(supabase, tenantId, documentId) {
  // Fetch the document
  const { data: doc, error: docErr } = await supabase
    .from('tenant_documents')
    .select('extracted_text, file_name, department, doc_type')
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .single();

  if (docErr || !doc?.extracted_text) {
    console.log(`[embeddings] Skipping document ${documentId}: no extracted text`);
    return { chunks: 0 };
  }

  // Chunk the text
  const chunks = chunkText(doc.extracted_text);
  if (chunks.length === 0) return { chunks: 0 };

  // Generate embeddings in batch
  const embeddings = await generateEmbeddings(chunks.map(c => c.text));

  // Delete existing chunks for this document
  await supabase
    .from('tenant_document_chunks')
    .delete()
    .eq('document_id', documentId);

  // Insert new chunks
  const rows = chunks.map((chunk, i) => ({
    tenant_id: tenantId,
    document_id: documentId,
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    embedding: JSON.stringify(embeddings[i]),
    token_count: estimateTokens(chunk.text),
    metadata: {
      file_name: doc.file_name,
      department: doc.department,
      doc_type: doc.doc_type,
    },
  }));

  const { error: insertErr } = await supabase
    .from('tenant_document_chunks')
    .insert(rows);

  if (insertErr) {
    throw new Error(`Failed to insert chunks for document ${documentId}: ${insertErr.message}`);
  }

  console.log(`[embeddings] Embedded document ${doc.file_name}: ${chunks.length} chunks`);
  return { chunks: chunks.length };
}

/**
 * Embed all chunks for a single agent instruction.
 */
export async function embedInstruction(supabase, tenantId, instructionId) {
  const { data: instr, error: instrErr } = await supabase
    .from('agent_instructions')
    .select('instruction_text, extracted_text, agent_key')
    .eq('id', instructionId)
    .single();

  if (instrErr || (!instr?.instruction_text && !instr?.extracted_text)) {
    console.log(`[embeddings] Skipping instruction ${instructionId}: no text`);
    return { chunks: 0 };
  }

  const fullText = [instr.instruction_text, instr.extracted_text].filter(Boolean).join('\n\n');
  const chunks = chunkText(fullText);
  if (chunks.length === 0) return { chunks: 0 };

  const embeddings = await generateEmbeddings(chunks.map(c => c.text));

  // Delete existing chunks for this instruction
  await supabase
    .from('tenant_document_chunks')
    .delete()
    .eq('instruction_id', instructionId);

  const rows = chunks.map((chunk, i) => ({
    tenant_id: tenantId,
    instruction_id: instructionId,
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    embedding: JSON.stringify(embeddings[i]),
    token_count: estimateTokens(chunk.text),
    metadata: {
      agent_key: instr.agent_key,
      source: 'agent_instruction',
    },
  }));

  const { error: insertErr } = await supabase
    .from('tenant_document_chunks')
    .insert(rows);

  if (insertErr) {
    throw new Error(`Failed to insert chunks for instruction ${instructionId}: ${insertErr.message}`);
  }

  console.log(`[embeddings] Embedded instruction ${instructionId}: ${chunks.length} chunks`);
  return { chunks: chunks.length };
}
