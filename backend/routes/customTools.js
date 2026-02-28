import { Router } from 'express';
import { resolveApiKey } from '../lib/resolveApiKey.js';

const router = Router();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Verify the caller belongs to the tenant (or is a platform admin). */
function requireTenantAccess(req, tenantId) {
  const role = req.user?.role;
  if (role === 'super-admin' || role === 'platform_owner') return true;
  return req.tenantId === tenantId;
}

function requireAdmin(req) {
  const role = req.user?.role;
  return ['super-admin', 'platform_owner', 'admin'].includes(role);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ──────────────────────────────────────────────
// CRUD Routes
// ──────────────────────────────────────────────

/**
 * GET /:tenantId
 * List active custom tools for a tenant.
 */
router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_custom_tools')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[customTools] List failed:', err.message);
    res.status(500).json({ error: 'Failed to list custom tools' });
  }
});

/**
 * GET /:tenantId/all
 * List ALL custom tools for a tenant (including inactive). Platform admins + tenant admins.
 */
router.get('/:tenantId/all', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_custom_tools')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[customTools] List all failed:', err.message);
    res.status(500).json({ error: 'Failed to list custom tools' });
  }
});

/**
 * GET /:tenantId/:toolId
 * Get a single custom tool with full schema.
 */
router.get('/:tenantId/:toolId', async (req, res) => {
  const { tenantId, toolId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_custom_tools')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', toolId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Custom tool not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('[customTools] Get failed:', err.message);
    res.status(500).json({ error: 'Failed to get custom tool' });
  }
});

/**
 * POST /:tenantId
 * Create a new custom tool. Admin only.
 */
router.post('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { label, description, icon, intake_schema, purpose, output_format } = req.body;
  if (!label || !purpose) {
    return res.status(400).json({ error: 'label and purpose are required' });
  }

  const tool_key = slugify(label);
  if (!tool_key) {
    return res.status(400).json({ error: 'Invalid tool name — must contain letters or numbers' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_custom_tools')
      .insert({
        tenant_id: tenantId,
        tool_key,
        label,
        description: description || null,
        icon: icon || 'Wrench',
        intake_schema: intake_schema || [],
        purpose,
        output_format: output_format || 'text',
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A tool with this name already exists' });
      }
      throw error;
    }

    console.log(`[customTools] Created "${label}" for tenant ${tenantId}`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[customTools] Create failed:', err.message);
    res.status(500).json({ error: 'Failed to create custom tool' });
  }
});

/**
 * PUT /:tenantId/:toolId
 * Update a custom tool definition. Admin only.
 */
router.put('/:tenantId/:toolId', async (req, res) => {
  const { tenantId, toolId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { label, description, icon, intake_schema, purpose, output_format, is_active } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (label !== undefined) {
    updates.label = label;
    updates.tool_key = slugify(label);
  }
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (intake_schema !== undefined) updates.intake_schema = intake_schema;
  if (purpose !== undefined) updates.purpose = purpose;
  if (output_format !== undefined) updates.output_format = output_format;
  if (is_active !== undefined) updates.is_active = is_active;

  try {
    const { data, error } = await req.supabase
      .from('tenant_custom_tools')
      .update(updates)
      .eq('id', toolId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Custom tool not found' });

    res.json(data);
  } catch (err) {
    console.error('[customTools] Update failed:', err.message);
    res.status(500).json({ error: 'Failed to update custom tool' });
  }
});

/**
 * DELETE /:tenantId/:toolId
 * Soft-delete (set is_active = false). Admin only.
 */
router.delete('/:tenantId/:toolId', async (req, res) => {
  const { tenantId, toolId } = req.params;
  if (!requireTenantAccess(req, tenantId) || !requireAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data, error } = await req.supabase
      .from('tenant_custom_tools')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', toolId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Custom tool not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('[customTools] Delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete custom tool' });
  }
});

// ──────────────────────────────────────────────
// Generate endpoint
// ──────────────────────────────────────────────

/**
 * POST /:tenantId/:toolId/generate
 * Execute the custom tool — build prompt from purpose + form data, call Claude, return result.
 */
router.post('/:tenantId/:toolId/generate', async (req, res) => {
  const { tenantId, toolId } = req.params;
  if (!requireTenantAccess(req, tenantId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { formData } = req.body;
  if (!formData || typeof formData !== 'object') {
    return res.status(400).json({ error: 'formData is required' });
  }

  try {
    // 1. Fetch the tool definition
    const { data: tool, error: toolErr } = await req.supabase
      .from('tenant_custom_tools')
      .select('*')
      .eq('id', toolId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    if (toolErr || !tool) {
      return res.status(404).json({ error: 'Custom tool not found or inactive' });
    }

    // 2. Build prompt from purpose + form fields
    const systemPrompt = `You are a professional document generator. Your task: ${tool.purpose}. Generate a well-structured, professional document based on the inputs provided. Use clear headings, bullet points, and organized sections. Be thorough but concise.`;

    const fieldLines = (tool.intake_schema || []).map(field => {
      const val = formData[field.key];
      if (val === undefined || val === null || val === '') return null;
      const displayVal = Array.isArray(val) ? val.join(', ') : val;
      return `**${field.label}:** ${displayVal}`;
    }).filter(Boolean);

    const userMessage = fieldLines.length
      ? `Please generate the document using the following inputs:\n\n${fieldLines.join('\n')}`
      : 'Please generate the document using the tool purpose as the primary guide.';

    // 3. Resolve API key
    let apiKey, keySource, effectiveTenantId;
    try {
      ({ apiKey, keySource, effectiveTenantId } = await resolveApiKey(req, { tenantIdOverride: tenantId }));
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }

    // 4. Call Claude
    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 4096,
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error('[customTools] Anthropic error:', data.error?.message || anthropicResponse.status);
      return res.status(anthropicResponse.status).json({
        error: data.error?.message || `AI service error: ${anthropicResponse.status}`,
      });
    }

    const resultText = data.content?.[0]?.text || 'No content generated.';

    // 5. Log usage asynchronously
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    console.log(`[customTools] Generated "${tool.label}" | key: ${keySource} | tokens: ${inputTokens}+${outputTokens}`);

    req.supabase
      .from('alf_usage_logs')
      .insert({
        tenant_id: effectiveTenantId || null,
        user_id: req.user.id,
        action: 'agent_call',
        agent_key: `customTool:${tool.tool_key}`,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        model: 'claude-sonnet-4-20250514',
      })
      .then(({ error }) => {
        if (error) console.warn('[customTools] Usage log failed:', error.message);
      });

    // 6. Save to tool_submissions for history
    req.supabase
      .from('tool_submissions')
      .insert({
        tenant_id: tenantId,
        user_id: req.user.id,
        tool_key: `custom:${tool.tool_key}`,
        intake_data: formData,
        output_text: resultText,
      })
      .then(({ error }) => {
        if (error) console.warn('[customTools] Submission save failed:', error.message);
      });

    res.json({ text: resultText });
  } catch (err) {
    console.error('[customTools] Generate failed:', err.message);
    res.status(500).json({ error: 'Generation failed' });
  }
});

export default router;
