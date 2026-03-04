/**
 * One-time backfill script: Embed all existing tenant documents.
 *
 * Run after deploying the pgvector migration:
 *   node backend/scripts/backfill-embeddings.mjs
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { embedDocument, embedInstruction } from '../lib/embeddings.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('=== Backfill Embeddings ===\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set. Aborting.');
    process.exit(1);
  }

  // Fetch all active tenants
  const { data: tenants, error: tenantErr } = await supabase
    .from('alf_tenants')
    .select('id, company_name')
    .eq('is_active', true);

  if (tenantErr) {
    console.error('Failed to fetch tenants:', tenantErr.message);
    process.exit(1);
  }

  console.log(`Found ${tenants.length} active tenant(s)\n`);

  let totalDocs = 0;
  let totalInstructions = 0;
  let totalChunks = 0;
  let totalErrors = 0;

  for (const tenant of tenants) {
    console.log(`\n--- ${tenant.company_name} (${tenant.id}) ---`);

    // Fetch extracted documents
    const { data: docs } = await supabase
      .from('tenant_documents')
      .select('id, file_name')
      .eq('tenant_id', tenant.id)
      .eq('status', 'extracted')
      .is('deleted_at', null);

    // Fetch approved instructions
    const { data: instructions } = await supabase
      .from('agent_instructions')
      .select('id, agent_key')
      .eq('status', 'approved')
      .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);

    const docCount = docs?.length || 0;
    const instrCount = instructions?.length || 0;
    console.log(`  ${docCount} document(s), ${instrCount} instruction(s)`);

    // Embed documents
    for (const doc of (docs || [])) {
      try {
        const result = await embedDocument(supabase, tenant.id, doc.id);
        totalDocs++;
        totalChunks += result.chunks;
        if (result.chunks > 0) {
          console.log(`  ✓ ${doc.file_name}: ${result.chunks} chunks`);
        }
      } catch (err) {
        console.error(`  ✗ ${doc.file_name}: ${err.message}`);
        totalErrors++;
      }

      // Rate limit: pause between documents to avoid OpenAI rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    // Embed instructions
    for (const instr of (instructions || [])) {
      try {
        const result = await embedInstruction(supabase, tenant.id, instr.id);
        totalInstructions++;
        totalChunks += result.chunks;
        if (result.chunks > 0) {
          console.log(`  ✓ instruction ${instr.agent_key}: ${result.chunks} chunks`);
        }
      } catch (err) {
        console.error(`  ✗ instruction ${instr.id}: ${err.message}`);
        totalErrors++;
      }

      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Documents embedded: ${totalDocs}`);
  console.log(`  Instructions embedded: ${totalInstructions}`);
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
