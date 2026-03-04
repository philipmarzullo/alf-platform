import { createClient } from '@supabase/supabase-js';
import { resolveApiKey } from './resolveApiKey.js';
import { getValidMsToken } from './msTokens.js';
import { recordActionExecution } from '../routes/automationPreferences.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Execute a complete workflow: create a run, iterate SOP steps,
 * call the Anthropic API for each step, handle email/task routing.
 *
 * @param {object} supabase - Service-role Supabase client
 * @param {object} workflowDef - workflow_definitions row
 * @param {object} trigger - workflow_triggers row
 */
export async function executeWorkflow(supabase, workflowDef, trigger) {
  const tenantId = workflowDef.tenant_id;
  const startedAt = new Date();

  // Fetch SOP steps ordered by step_number
  const { data: sopSteps, error: stepsErr } = await supabase
    .from('tenant_sop_steps')
    .select('*')
    .eq('sop_analysis_id', workflowDef.sop_analysis_id)
    .order('step_number');

  if (stepsErr || !sopSteps?.length) {
    console.warn(`[workflow] No steps found for workflow ${workflowDef.id}:`, stepsErr?.message);
    return { status: 'failed', error: 'No SOP steps found' };
  }

  // Create workflow_run
  const { data: run, error: runErr } = await supabase
    .from('workflow_runs')
    .insert({
      tenant_id: tenantId,
      workflow_definition_id: workflowDef.id,
      trigger_id: trigger.id,
      status: 'running',
      current_step_number: 0,
      total_steps: sopSteps.length,
      started_at: startedAt.toISOString(),
    })
    .select('id')
    .single();

  if (runErr) {
    console.error(`[workflow] Failed to create run:`, runErr.message);
    return { status: 'failed', error: runErr.message };
  }

  const runId = run.id;
  console.log(`[workflow] Run ${runId} started for workflow "${workflowDef.name}" (${sopSteps.length} steps)`);

  // Resolve API key for this tenant
  let apiKey;
  try {
    // Build a minimal req-like object for resolveApiKey
    const fakeReq = {
      tenantId,
      supabase,
      user: { role: 'platform_owner' },
      body: { tenant_id: tenantId },
    };
    const resolved = await resolveApiKey(fakeReq, { tenantIdOverride: tenantId });
    apiKey = resolved.apiKey;
  } catch (err) {
    console.error(`[workflow] No API key for tenant ${tenantId}:`, err.message);
    await supabase.from('workflow_runs').update({
      status: 'failed',
      error_message: `No API key: ${err.message}`,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
    }).eq('id', runId);
    return { status: 'failed', error: err.message };
  }

  // Check email connection for auto-send
  const { data: emailConn } = await supabase
    .from('tenant_connections')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('connection_type', 'email')
    .eq('status', 'connected')
    .maybeSingle();

  // Execute steps sequentially
  let previousOutput = null;
  let failedStep = null;

  for (const step of sopSteps) {
    const stepStart = Date.now();

    // Create step run
    const { data: stepRun, error: stepRunErr } = await supabase
      .from('workflow_step_runs')
      .insert({
        tenant_id: tenantId,
        workflow_run_id: runId,
        sop_step_id: step.id,
        step_number: step.step_number,
        step_classification: step.classification || 'automated',
        status: 'running',
        input_data: previousOutput ? { previous_step_output: previousOutput } : null,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (stepRunErr) {
      console.warn(`[workflow] Failed to create step run for step ${step.step_number}:`, stepRunErr.message);
      failedStep = step.step_number;
      break;
    }

    // Update current step on the run
    await supabase.from('workflow_runs').update({
      current_step_number: step.step_number,
    }).eq('id', runId);

    // Determine execution mode from automation preferences
    const agentKey = step.agent_key || workflowDef.department || 'ops';
    const actionKey = step.automation_action_id || step.id;

    const { data: pref } = await supabase
      .from('automation_preferences')
      .select('execution_mode')
      .eq('tenant_id', tenantId)
      .eq('agent_key', agentKey)
      .eq('action_key', actionKey)
      .eq('integration_type', 'agent_skill')
      .maybeSingle();

    const executionMode = pref?.execution_mode || 'review';

    // For manual steps, create a user task and skip agent call
    if (step.classification === 'manual') {
      await createUserTaskForStep(supabase, tenantId, step, stepRun.id, previousOutput);
      await supabase.from('workflow_step_runs').update({
        status: 'awaiting_human',
        agent_execution_mode: 'review',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - stepStart,
      }).eq('id', stepRun.id);
      continue;
    }

    // Build system prompt for this step
    const systemPrompt = await buildStepSystemPrompt(
      supabase, tenantId, agentKey, step, executionMode, previousOutput
    );

    // Build messages
    const userMessage = step.agent_skill_prompt
      || step.description
      || `Execute step ${step.step_number}: ${step.title}`;

    const messages = [{ role: 'user', content: userMessage }];

    try {
      const anthropicRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          system: systemPrompt,
          messages,
          max_tokens: 4096,
        }),
      });

      const data = await anthropicRes.json();

      if (!anthropicRes.ok) {
        throw new Error(data.error?.message || `Anthropic API error: ${anthropicRes.status}`);
      }

      const responseText = data.content?.[0]?.text || '';
      const tokensIn = data.usage?.input_tokens || 0;
      const tokensOut = data.usage?.output_tokens || 0;

      // Log usage
      supabase.from('alf_usage_logs').insert({
        tenant_id: tenantId,
        action: 'scheduled_workflow',
        agent_key: agentKey,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        model: 'claude-sonnet-4-5-20250929',
      }).then(({ error }) => {
        if (error) console.warn('[workflow] Usage log failed:', error.message);
      });

      // Update step run with results
      await supabase.from('workflow_step_runs').update({
        status: 'completed',
        output_data: { text: responseText },
        agent_key: agentKey,
        agent_model: 'claude-sonnet-4-5-20250929',
        agent_tokens_input: tokensIn,
        agent_tokens_output: tokensOut,
        agent_system_prompt: systemPrompt.slice(0, 5000), // truncate for storage
        agent_messages_sent: messages,
        agent_response: { text: responseText },
        agent_execution_mode: executionMode,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - stepStart,
      }).eq('id', stepRun.id);

      previousOutput = responseText;

      // Handle routing based on execution mode
      if (executionMode === 'automated' && emailConn) {
        // Try auto-send if response has Subject and To lines
        const subjectMatch = responseText.match(/^Subject:\s*(.+)$/m);
        const toMatch = responseText.match(/^To:\s*(.+)$/m);

        if (subjectMatch && toMatch) {
          try {
            const token = await getValidMsToken(tenantId);
            const emailBody = responseText
              .replace(/^Subject:\s*.+$/m, '')
              .replace(/^To:\s*.+$/m, '')
              .replace(/^\[DRAFT\]\s*/m, '')
              .replace(/^\[PENDING REVIEW\]\s*/m, '')
              .trim();
            const toAddresses = toMatch[1].split(',').map(e => e.trim()).filter(Boolean);

            const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  subject: subjectMatch[1].trim(),
                  body: {
                    contentType: 'HTML',
                    content: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;">${emailBody.replace(/\n/g, '<br>')}</div>`,
                  },
                  toRecipients: toAddresses.map(e => ({ emailAddress: { address: e } })),
                },
                saveToSentItems: true,
              }),
            });

            if (graphRes.ok) {
              console.log(`[workflow] Auto-sent email for step ${step.step_number} to ${toAddresses.join(', ')}`);
              recordActionExecution(tenantId, agentKey, actionKey, 'agent_skill', false);
            } else {
              console.warn(`[workflow] Auto-send failed: ${graphRes.status}`);
            }
          } catch (emailErr) {
            console.warn(`[workflow] Email send failed for step ${step.step_number}:`, emailErr.message);
          }
        }
      } else if (executionMode === 'draft' || executionMode === 'review' || step.classification === 'hybrid') {
        // Create user task for review
        await createUserTaskForStep(supabase, tenantId, step, stepRun.id, responseText, agentKey);
      }

      console.log(`[workflow] Step ${step.step_number} completed (${tokensIn}+${tokensOut} tokens)`);
    } catch (err) {
      console.error(`[workflow] Step ${step.step_number} failed:`, err.message);
      await supabase.from('workflow_step_runs').update({
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - stepStart,
      }).eq('id', stepRun.id);
      failedStep = step.step_number;
      break;
    }
  }

  // Finalize run
  const endTime = new Date();
  const finalStatus = failedStep ? 'failed' : 'completed';

  await supabase.from('workflow_runs').update({
    status: finalStatus,
    completed_at: endTime.toISOString(),
    duration_ms: endTime.getTime() - startedAt.getTime(),
    ...(failedStep ? { error_step_number: failedStep, error_message: `Failed at step ${failedStep}` } : {}),
  }).eq('id', runId);

  console.log(`[workflow] Run ${runId} ${finalStatus} in ${endTime.getTime() - startedAt.getTime()}ms`);

  return { status: finalStatus, runId, steps: sopSteps.length, failedStep };
}

/**
 * Build enriched system prompt for a workflow step.
 */
async function buildStepSystemPrompt(supabase, tenantId, agentKey, step, executionMode, previousOutput) {
  const parts = [];

  // Base agent prompt from DB
  const { data: agentRow } = await supabase
    .from('tenant_agents')
    .select('system_prompt, knowledge_scopes')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .maybeSingle();

  if (agentRow?.system_prompt) {
    parts.push(agentRow.system_prompt);
  }

  // Fallback to platform agent definition
  if (!agentRow?.system_prompt) {
    const { data: platformAgent } = await supabase
      .from('alf_agent_definitions')
      .select('system_prompt')
      .eq('agent_key', agentKey)
      .maybeSingle();

    if (platformAgent?.system_prompt) {
      parts.push(platformAgent.system_prompt);
    }
  }

  // Knowledge context (tenant documents)
  const departments = agentRow?.knowledge_scopes || [];
  if (departments.length) {
    const { data: docs } = await supabase
      .from('tenant_documents')
      .select('file_name, doc_type, department, extracted_text')
      .eq('tenant_id', tenantId)
      .eq('status', 'extracted')
      .in('department', departments)
      .order('doc_type')
      .limit(20);

    if (docs?.length) {
      const blocks = docs.map(d =>
        `--- ${d.doc_type.toUpperCase()}: ${d.file_name} (${d.department}) ---\n${d.extracted_text}`
      );
      parts.push(`\n\n=== TENANT KNOWLEDGE BASE ===\n${blocks.join('\n\n')}`);
    }
  }

  // Agent instructions
  const { data: instructions } = await supabase
    .from('agent_instructions')
    .select('instruction_text, extracted_text, tenant_id')
    .eq('agent_key', agentKey)
    .eq('status', 'approved')
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order('created_at');

  if (instructions?.length) {
    const blocks = instructions.map(i => {
      const scope = i.tenant_id ? '[TENANT]' : '[GLOBAL]';
      let text = `${scope} ${i.instruction_text}`;
      if (i.extracted_text) text += `\n[ATTACHED DOCUMENT]\n${i.extracted_text}`;
      return text;
    });
    parts.push(`\n\n=== AGENT INSTRUCTIONS ===\n${blocks.join('\n\n')}`);
  }

  // Connected integrations context
  const { data: conns } = await supabase
    .from('tenant_connections')
    .select('connection_type, capabilities')
    .eq('tenant_id', tenantId)
    .eq('status', 'connected');

  if (conns?.length) {
    const caps = conns.flatMap(c => c.capabilities || []);
    if (caps.includes('can_send_email')) {
      parts.push('\n\n=== CONNECTED INTEGRATIONS ===\nThis tenant has email connected. Format email drafts with clear Subject: and To: lines.');
    }
  }

  // Execution mode instruction
  if (executionMode === 'draft') {
    parts.push('\n[EXECUTION MODE: DRAFT] — Generate your output as a draft. Label it "[DRAFT]" at the top.');
  } else if (executionMode === 'review') {
    parts.push('\n[EXECUTION MODE: REVIEW] — Generate your output and mark it "[PENDING REVIEW]" at the top.');
  }

  // Workflow context
  parts.push(`\n\n=== WORKFLOW CONTEXT ===`);
  parts.push(`This is an automated workflow execution, step ${step.step_number}: "${step.title}".`);
  if (step.description) parts.push(`Step description: ${step.description}`);
  if (previousOutput) {
    parts.push(`\nPrevious step output:\n${previousOutput.slice(0, 2000)}`);
  }

  return parts.join('\n');
}

/**
 * Create a tenant_user_tasks entry for a workflow step that needs human review.
 */
async function createUserTaskForStep(supabase, tenantId, step, stepRunId, outputText, agentKey) {
  // Find assigned user(s) for this step
  const { data: assignments } = await supabase
    .from('tenant_sop_assignments')
    .select('assigned_to_user_id, assigned_to_role, assignment_type')
    .eq('sop_step_id', step.id);

  const target = assignments?.find(a => a.assignment_type === 'reviewer')
    || assignments?.find(a => a.assignment_type === 'owner');

  if (!target) return;

  let userIds = [];
  if (target.assigned_to_user_id) {
    userIds = [target.assigned_to_user_id];
  } else if (target.assigned_to_role) {
    const { data: roleUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', target.assigned_to_role);
    userIds = (roleUsers || []).map(u => u.id);
  }

  for (const uid of userIds) {
    await supabase.from('tenant_user_tasks').insert({
      tenant_id: tenantId,
      user_id: uid,
      sop_step_id: step.id,
      source_type: 'scheduled',
      title: `Review: ${step.title}`,
      description: `Scheduled workflow produced output for "${step.title}". Please review and take action.`,
      agent_output: outputText ? { text: outputText, agent_key: agentKey } : null,
    });
  }
}
