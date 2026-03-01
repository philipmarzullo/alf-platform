import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getPlatformApiKey } from './platformCredentials.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const EXTRACTION_MODEL = 'claude-sonnet-4-20250514';

// Service-level Supabase client for fire-and-forget extraction
const serviceSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function requireTenantAccess(req, tenantId) {
  const role = req.user?.role;
  if (role === 'super-admin' || role === 'platform_owner') return true;
  return req.tenantId === tenantId;
}

function requireAdmin(req) {
  const role = req.user?.role;
  return role === 'super-admin' || role === 'platform_owner';
}

const EXTRACTION_PROMPT = `You are an operational memory extractor. Analyze the following content and extract key operational insights that would be valuable for future AI agent interactions with this tenant.

Extract 0-5 memories. Each memory should be a concise, actionable insight. Return a JSON array of objects with:
- "memory_type": one of "operational_insight", "client_preference", "recurring_issue", "performance_trend", "action_outcome"
- "content": the insight (1-2 sentences, specific and actionable)
- "relevance_score": 0.1 to 1.0 (how broadly useful this insight is)

If the content doesn't contain extractable operational insights, return an empty array.

Return ONLY valid JSON — no markdown, no explanation.`;

// ──────────────────────────────────────────────
// Shared extraction function (fire-and-forget)
// ──────────────────────────────────────────────

/**
 * Extract memories from content using Claude and store them.
 * Uses service-level Supabase client — safe to call without req context.
 * Never throws — logs errors internally.
 */
export async function extractMemories(tenantId, content, source, sourceId, department) {
  try {
    // Resolve API key: platform DB first, then env fallback
    let apiKey;
    try {
      apiKey = await getPlatformApiKey(serviceSupabase, 'anthropic');
    } catch (err) {
      console.error('[memory] Platform key lookup failed:', err.message);
    }
    if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error('[memory] No API key for extraction');
      return;
    }

    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: content.slice(0, 4000) }],
        max_tokens: 1024,
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error('[memory] Anthropic error:', data.error?.message || anthropicResponse.status);
      return;
    }

    const text = data.content?.[0]?.text || '[]';
    let memories;
    try {
      memories = JSON.parse(text);
    } catch {
      console.warn('[memory] Failed to parse extraction result:', text.slice(0, 200));
      return;
    }

    if (!Array.isArray(memories) || memories.length === 0) {
      console.log(`[memory] No memories extracted for tenant ${tenantId}`);
      return;
    }

    const rows = memories.map(m => ({
      tenant_id: tenantId,
      memory_type: m.memory_type,
      department,
      content: m.content,
      source,
      source_id: sourceId || null,
      relevance_score: Math.min(1, Math.max(0.1, m.relevance_score || 0.5)),
    }));

    const { error } = await serviceSupabase
      .from('tenant_memory')
      .insert(rows);

    if (error) {
      console.error('[memory] Insert failed:', error.message);
    } else {
      console.log(`[memory] Extracted ${rows.length} memories for tenant ${tenantId} (source: ${source})`);
    }
  } catch (err) {
    console.error('[memory] Extraction error:', err.message);
  }
}

// ──────────────────────────────────────────────
// CRUD Routes
// ──────────────────────────────────────────────

/**
 * GET /:tenantId
 * List memories for a tenant. Excludes expired, ordered by relevance.
 * Optional query params: ?department=hr&memory_type=recurring_issue
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    let query = req.supabase
      .from('tenant_memory')
      .select('*')
      .eq('tenant_id', tenantId)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('relevance_score', { ascending: false });

    if (req.query.department) {
      query = query.eq('department', req.query.department);
    }
    if (req.query.memory_type) {
      query = query.eq('memory_type', req.query.memory_type);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[memory] List failed:', err.message);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

/**
 * PUT /:tenantId/:id
 * Update a memory. Super-admin / platform_owner only.
 */
router.put('/:tenantId/:id', async (req, res) => {
  const { tenantId, id } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { content, relevance_score } = req.body;
  const updates = {};
  if (content !== undefined) updates.content = content;
  if (relevance_score !== undefined) updates.relevance_score = relevance_score;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_memory')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Memory not found' });

    res.json(data);
  } catch (err) {
    console.error('[memory] Update failed:', err.message);
    res.status(500).json({ error: 'Failed to update memory' });
  }
});

/**
 * DELETE /:tenantId/:id
 * Delete a memory. Super-admin / platform_owner only.
 */
router.delete('/:tenantId/:id', async (req, res) => {
  const { tenantId, id } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_memory')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Memory not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('[memory] Delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

/**
 * POST /:tenantId/extract
 * Extract memories from provided content via Claude.
 */
router.post('/:tenantId/extract', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { content, source, source_id, department } = req.body;
  if (!content || !source || !department) {
    return res.status(400).json({ error: 'content, source, and department are required' });
  }

  try {
    await extractMemories(tenantId, content, source, source_id || null, department);

    // Return the newly created memories
    const { data } = await req.supabase
      .from('tenant_memory')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({ success: true, memories: data || [] });
  } catch (err) {
    console.error('[memory] Extract endpoint failed:', err.message);
    res.status(500).json({ error: 'Memory extraction failed' });
  }
});

export default router;
