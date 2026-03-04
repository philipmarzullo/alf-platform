import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Utilities (exported for use by oauth.js, integrations.js) ───────────────

export async function upsertConnection({ tenantId, connectionType, provider, status, capabilities, metadata, credentialId }) {
  const { error } = await supabase
    .from('tenant_connections')
    .upsert({
      tenant_id: tenantId,
      connection_type: connectionType,
      provider,
      status: status || 'connected',
      capabilities: capabilities || [],
      metadata: metadata || {},
      credential_id: credentialId || null,
      connected_at: status === 'connected' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,connection_type,provider' });

  if (error) {
    console.error('[connections] Upsert failed:', error.message);
    throw error;
  }
}

export async function removeConnection(tenantId, connectionType, provider) {
  const { error } = await supabase
    .from('tenant_connections')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('connection_type', connectionType)
    .eq('provider', provider);

  if (error) {
    console.error('[connections] Remove failed:', error.message);
    throw error;
  }
}

// ─── GET /:tenantId — list all connections for a tenant ──────────────────────

router.get('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  if (req.user.role === 'super-admin' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  try {
    const { data, error } = await supabase
      .from('tenant_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at');

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[connections] List error:', err.message);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

// ─── POST /:tenantId — upsert a connection ──────────────────────────────────

router.post('/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  if (req.user.role !== 'platform_owner' && req.user.role !== 'super-admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (req.user.role === 'super-admin' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  const { connectionType, provider, status, capabilities, metadata, credentialId } = req.body;
  if (!connectionType || !provider) {
    return res.status(400).json({ error: 'connectionType and provider are required' });
  }

  try {
    await upsertConnection({ tenantId, connectionType, provider, status, capabilities, metadata, credentialId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upsert connection' });
  }
});

// ─── DELETE /:tenantId/:connectionId — remove a connection ───────────────────

router.delete('/:tenantId/:connectionId', async (req, res) => {
  const { tenantId, connectionId } = req.params;

  if (req.user.role !== 'platform_owner' && req.user.role !== 'super-admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (req.user.role === 'super-admin' && req.user.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Access denied — wrong tenant' });
  }

  try {
    const { error } = await supabase
      .from('tenant_connections')
      .delete()
      .eq('id', connectionId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[connections] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

export default router;
