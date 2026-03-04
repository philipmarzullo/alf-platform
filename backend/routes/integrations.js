import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getValidMsToken } from '../lib/msTokens.js';
import { recordActionExecution } from './automationPreferences.js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── POST /email/send — send email via Microsoft Graph API ───────────────────

router.post('/email/send', async (req, res) => {
  const { tenantId, to, subject, body, cc, bcc, taskId, agentKey, actionKey, wasEdited } = req.body;

  if (!tenantId || !to || !subject || !body) {
    return res.status(400).json({ error: 'tenantId, to, subject, and body are required' });
  }

  // Tenant access check
  if (req.user.role !== 'platform_owner') {
    if (req.user.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Access denied — wrong tenant' });
    }
  }

  let token;
  try {
    token = await getValidMsToken(tenantId);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  // Build Graph API message
  const toRecipients = (Array.isArray(to) ? to : [to]).map(email => ({
    emailAddress: { address: email },
  }));
  const ccRecipients = cc
    ? (Array.isArray(cc) ? cc : [cc]).map(email => ({ emailAddress: { address: email } }))
    : undefined;
  const bccRecipients = bcc
    ? (Array.isArray(bcc) ? bcc : [bcc]).map(email => ({ emailAddress: { address: email } }))
    : undefined;

  const graphPayload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients,
      ...(ccRecipients && { ccRecipients }),
      ...(bccRecipients && { bccRecipients }),
    },
    saveToSentItems: true,
  };

  try {
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphPayload),
    });

    if (!graphRes.ok) {
      const errBody = await graphRes.json().catch(() => ({}));
      const errCode = errBody?.error?.code;

      // Detect scope/permission issues — prompt re-auth
      if (graphRes.status === 403 || errCode === 'ErrorAccessDenied') {
        return res.status(403).json({
          error: 'Insufficient permissions — Mail.Send scope required',
          code: 'SCOPE_REQUIRED',
        });
      }

      console.error('[integrations] Graph sendMail failed:', graphRes.status, errBody);
      return res.status(graphRes.status).json({
        error: errBody?.error?.message || 'Failed to send email',
      });
    }

    // Audit log
    supabase
      .from('credential_audit_logs')
      .insert({
        tenant_id: tenantId,
        credential_id: token.credential_id,
        service_type: 'microsoft',
        action: 'email_sent',
        detail: {
          to: Array.isArray(to) ? to : [to],
          subject,
          sent_by: req.user.id,
          agent_key: agentKey || null,
        },
        user_id: req.user.id,
        user_name: req.user.name || null,
      })
      .then(({ error }) => {
        if (error) console.warn('[integrations] Audit log failed:', error.message);
      });

    // Track execution for auto-promotion
    if (agentKey && actionKey) {
      recordActionExecution(tenantId, agentKey, actionKey, 'agent_skill', wasEdited ?? false)
        .catch(err => console.warn('[integrations] Execution tracking failed:', err.message));
    }

    // Mark task as completed if taskId provided
    if (taskId) {
      supabase
        .from('tenant_user_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: req.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .then(({ error }) => {
          if (error) console.warn('[integrations] Task completion failed:', error.message);
        });
    }

    console.log(`[integrations] Email sent for tenant ${tenantId} to ${Array.isArray(to) ? to.join(', ') : to}`);
    res.json({ success: true, sent_from: token.user_email });
  } catch (err) {
    console.error('[integrations] Email send error:', err.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router;
