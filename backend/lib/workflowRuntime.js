/**
 * Workflow Orchestration Runtime
 *
 * The engine that connects SOP steps, data, agents, and people.
 * Executes workflow runs through consolidated stages, handling
 * automated/hybrid/manual classifications with data enrichment.
 */

import { createClient } from '@supabase/supabase-js';
import { resolveApiKey } from './resolveApiKey.js';
import { getValidMsToken } from './msTokens.js';
import { enrichInputData } from './dataEnrichment.js';
import { createHash } from 'crypto';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEDUP_WINDOW_MINUTES = 5;

// ---------- Public API ----------

/**
 * Submit a new workflow run. Creates the run + stage runs, then begins execution.
 *
 * @param {object} supabase - Service-role client
 * @param {string} tenantId
 * @param {string} workflowDefinitionId
 * @param {object} inputData - Form submission data
 * @param {string|null} triggeredByUser - User ID who submitted (null for cron/event triggers)
 * @param {string|null} triggerId - workflow_trigger ID if trigger-initiated
 * @returns {{ status, runId, error? }}
 */
export async function submitWorkflow(supabase, tenantId, workflowDefinitionId, inputData = {}, triggeredByUser = null, triggerId = null) {
  // Load workflow definition
  const { data: workflowDef, error: defErr } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('id', workflowDefinitionId)
    .eq('tenant_id', tenantId)
    .single();

  if (defErr || !workflowDef) {
    return { status: 'failed', error: 'Workflow definition not found' };
  }

  if (workflowDef.status !== 'active') {
    return { status: 'failed', error: `Workflow is ${workflowDef.status}, not active` };
  }

  // Load stages
  const { data: stages, error: stagesErr } = await supabase
    .from('workflow_stages')
    .select('*')
    .eq('workflow_definition_id', workflowDefinitionId)
    .order('stage_number');

  if (stagesErr || !stages?.length) {
    return { status: 'failed', error: 'No stages configured for this workflow' };
  }

  // Dedup check
  const dedupKey = buildDedupKey(workflowDefinitionId, triggerId, inputData);
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from('workflow_runs')
    .select('id')
    .eq('dedup_key', dedupKey)
    .gte('created_at', dedupCutoff)
    .not('status', 'eq', 'cancelled')
    .maybeSingle();

  if (existing) {
    return { status: 'duplicate', runId: existing.id, error: 'Duplicate run within dedup window' };
  }

  // Create workflow_run
  const startedAt = new Date();
  const { data: run, error: runErr } = await supabase
    .from('workflow_runs')
    .insert({
      tenant_id: tenantId,
      workflow_definition_id: workflowDefinitionId,
      trigger_id: triggerId,
      triggered_by_user: triggeredByUser,
      status: 'running',
      current_step_number: 0,
      current_stage_number: 0,
      total_steps: stages.length,
      input_data: inputData,
      dedup_key: dedupKey,
      started_at: startedAt.toISOString(),
    })
    .select('id')
    .single();

  if (runErr) {
    console.error('[runtime] Failed to create run:', runErr.message);
    return { status: 'failed', error: runErr.message };
  }

  // Pre-create all stage runs
  const stageRunInserts = stages.map(s => ({
    tenant_id: tenantId,
    workflow_run_id: run.id,
    workflow_stage_id: s.id,
    stage_number: s.stage_number,
    status: 'pending',
    max_retries: 1,
  }));

  const { error: stageRunErr } = await supabase
    .from('workflow_stage_runs')
    .insert(stageRunInserts);

  if (stageRunErr) {
    console.error('[runtime] Failed to create stage runs:', stageRunErr.message);
    await supabase.from('workflow_runs').update({
      status: 'failed', error_message: stageRunErr.message,
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return { status: 'failed', error: stageRunErr.message };
  }

  console.log(`[runtime] Run ${run.id} created for "${workflowDef.name}" (${stages.length} stages)`);

  // Begin orchestration (fire-and-forget for the HTTP response)
  orchestrateRun(supabase, run.id).catch(err => {
    console.error(`[runtime] Orchestration error for run ${run.id}:`, err.message);
  });

  return { status: 'started', runId: run.id };
}

/**
 * Main orchestration loop. Finds the next pending stage and executes it.
 * For automated stages, continues to the next. For hybrid/manual, pauses.
 * Called on submit and again when a human completes their stage.
 */
export async function orchestrateRun(supabase, runId) {
  // Load the run
  const { data: run, error: runErr } = await supabase
    .from('workflow_runs')
    .select('*, workflow_definitions(*)')
    .eq('id', runId)
    .single();

  if (runErr || !run) {
    console.error('[runtime] Run not found:', runId);
    return;
  }

  if (run.status === 'cancelled' || run.status === 'completed') {
    return;
  }

  // Resolve API key once
  let apiKey;
  try {
    const fakeReq = {
      tenantId: run.tenant_id,
      supabase,
      user: { role: 'platform_owner' },
      body: { tenant_id: run.tenant_id },
    };
    const resolved = await resolveApiKey(fakeReq, { tenantIdOverride: run.tenant_id });
    apiKey = resolved.apiKey;
  } catch (err) {
    console.error(`[runtime] No API key for tenant ${run.tenant_id}:`, err.message);
    await supabase.from('workflow_runs').update({
      status: 'failed',
      error_message: `No API key: ${err.message}`,
      completed_at: new Date().toISOString(),
    }).eq('id', runId);
    return;
  }

  // Check email connection
  const { data: emailConn } = await supabase
    .from('tenant_connections')
    .select('id')
    .eq('tenant_id', run.tenant_id)
    .eq('connection_type', 'email')
    .eq('status', 'connected')
    .maybeSingle();

  // Get all stage runs ordered
  const { data: stageRuns } = await supabase
    .from('workflow_stage_runs')
    .select('*, workflow_stages(*)')
    .eq('workflow_run_id', runId)
    .order('stage_number');

  if (!stageRuns?.length) return;

  // Collect outputs from completed stages for context chaining
  const previousOutputs = [];
  for (const sr of stageRuns) {
    if (sr.status === 'completed' && sr.output_data) {
      previousOutputs.push({
        stage_number: sr.stage_number,
        name: sr.workflow_stages?.name || `Stage ${sr.stage_number}`,
        output: sr.output_data,
      });
    }
  }

  // Find next pending stage
  for (const stageRun of stageRuns) {
    if (stageRun.status !== 'pending') continue;

    const stage = stageRun.workflow_stages;
    if (!stage) continue;

    // Update run's current stage
    await supabase.from('workflow_runs').update({
      current_stage_number: stage.stage_number,
    }).eq('id', runId);

    // Execute the stage
    const result = await executeStage(supabase, run, stage, stageRun, apiKey, emailConn, previousOutputs);

    if (result.status === 'awaiting_human') {
      // Pause orchestration — will resume when human completes
      return;
    }

    if (result.status === 'failed') {
      // Stage failed after retries — create escalation task, stop advancing
      await createEscalationTask(supabase, run, stage, stageRun, result.error);
      return;
    }

    if (result.status === 'completed') {
      previousOutputs.push({
        stage_number: stage.stage_number,
        name: stage.name,
        output: result.output,
      });
      continue; // Next stage
    }
  }

  // Check if all stages are done
  const { data: remaining } = await supabase
    .from('workflow_stage_runs')
    .select('id')
    .eq('workflow_run_id', runId)
    .in('status', ['pending', 'running', 'awaiting_human']);

  if (!remaining?.length) {
    // Check for any failed stages
    const { data: failed } = await supabase
      .from('workflow_stage_runs')
      .select('id')
      .eq('workflow_run_id', runId)
      .eq('status', 'failed');

    const finalStatus = failed?.length ? 'failed' : 'completed';
    const startedAt = new Date(run.started_at).getTime();

    await supabase.from('workflow_runs').update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    }).eq('id', runId);

    console.log(`[runtime] Run ${runId} ${finalStatus}`);
  }
}

/**
 * Execute a single stage. Handles automated, hybrid, and manual classifications.
 *
 * @returns {{ status: 'completed'|'awaiting_human'|'failed', output?, error? }}
 */
async function executeStage(supabase, run, stage, stageRun, apiKey, emailConn, previousOutputs) {
  const tenantId = run.tenant_id;
  const stageStart = Date.now();

  // Mark stage as running
  await supabase.from('workflow_stage_runs').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', stageRun.id);

  // Enrich input data from synced tables
  const stageInput = {
    ...(run.input_data || {}),
    ...(previousOutputs.length ? { previous_stages: previousOutputs } : {}),
  };
  const { enriched, context: enrichmentContext } = await enrichInputData(supabase, tenantId, stageInput);

  // Resolve assignee for this stage
  const assignee = await resolveStageAssignee(supabase, tenantId, stage, enriched);

  if (stage.classification === 'manual') {
    // No agent call — create task immediately
    const task = await createStageTask(supabase, tenantId, run, stage, stageRun, assignee, null);

    await supabase.from('workflow_stage_runs').update({
      status: 'awaiting_human',
      assigned_to: assignee?.id || null,
      task_id: task?.id || null,
      input_data: stageInput,
    }).eq('id', stageRun.id);

    return { status: 'awaiting_human' };
  }

  // Automated or hybrid — invoke agent
  const agentKey = stage.agent_key || run.workflow_definitions?.department || 'ops';

  // Build stage-specific prompt
  const systemPrompt = await buildStagePrompt(
    supabase, tenantId, agentKey, stage, run, enrichmentContext, previousOutputs
  );

  const userMessage = buildStageUserMessage(stage, stageInput, enriched);
  const messages = [{ role: 'user', content: userMessage }];

  // Attempt with retry
  let lastError = null;
  const maxAttempts = (stageRun.max_retries || 1) + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

      // Log usage (fire-and-forget)
      supabase.from('alf_usage_logs').insert({
        tenant_id: tenantId,
        action: 'workflow_stage',
        agent_key: agentKey,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        model: 'claude-sonnet-4-5-20250929',
      }).then(({ error }) => {
        if (error) console.warn('[runtime] Usage log failed:', error.message);
      });

      const outputData = { text: responseText };

      if (stage.classification === 'hybrid') {
        // Agent ran — now create task for human review
        const task = await createStageTask(supabase, tenantId, run, stage, stageRun, assignee, responseText);

        await supabase.from('workflow_stage_runs').update({
          status: 'awaiting_human',
          input_data: stageInput,
          output_data: outputData,
          assigned_to: assignee?.id || null,
          task_id: task?.id || null,
          agent_key: agentKey,
          agent_model: 'claude-sonnet-4-5-20250929',
          agent_tokens_input: tokensIn,
          agent_tokens_output: tokensOut,
          agent_system_prompt: systemPrompt.slice(0, 5000),
          agent_messages_sent: messages,
          agent_response: { text: responseText },
          retry_count: attempt - 1,
        }).eq('id', stageRun.id);

        return { status: 'awaiting_human' };
      }

      // Fully automated — mark completed
      await supabase.from('workflow_stage_runs').update({
        status: 'completed',
        input_data: stageInput,
        output_data: outputData,
        agent_key: agentKey,
        agent_model: 'claude-sonnet-4-5-20250929',
        agent_tokens_input: tokensIn,
        agent_tokens_output: tokensOut,
        agent_system_prompt: systemPrompt.slice(0, 5000),
        agent_messages_sent: messages,
        agent_response: { text: responseText },
        retry_count: attempt - 1,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - stageStart,
      }).eq('id', stageRun.id);

      // Auto-send email if applicable
      if (emailConn) {
        await tryAutoSendEmail(supabase, tenantId, responseText, agentKey, stage);
      }

      console.log(`[runtime] Stage ${stage.stage_number} "${stage.name}" completed (${tokensIn}+${tokensOut} tokens)`);

      return { status: 'completed', output: outputData };

    } catch (err) {
      lastError = err.message;
      console.warn(`[runtime] Stage ${stage.stage_number} attempt ${attempt}/${maxAttempts} failed:`, err.message);

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000)); // Brief pause before retry
      }
    }
  }

  // All attempts failed — park the stage
  await supabase.from('workflow_stage_runs').update({
    status: 'failed',
    error_message: lastError,
    retry_count: maxAttempts - 1,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - stageStart,
  }).eq('id', stageRun.id);

  return { status: 'failed', error: lastError };
}

/**
 * Advance a run after a human completes a stage.
 * Called from the task completion handler or the stage complete API.
 *
 * @param {object} supabase
 * @param {string} runId
 * @param {string} stageRunId - The stage run being completed
 * @param {object|null} humanOutput - Edits or notes from the human
 * @param {string|null} completedBy - User ID
 */
export async function advanceRun(supabase, runId, stageRunId, humanOutput = null, completedBy = null) {
  // Mark the stage as completed
  const updates = {
    status: 'completed',
    completed_at: new Date().toISOString(),
  };

  if (humanOutput) {
    updates.human_edited_output = humanOutput;
    updates.edited_by = completedBy;
    updates.edited_at = new Date().toISOString();
  }

  // Calculate duration
  const { data: stageRun } = await supabase
    .from('workflow_stage_runs')
    .select('started_at')
    .eq('id', stageRunId)
    .single();

  if (stageRun?.started_at) {
    updates.duration_ms = Date.now() - new Date(stageRun.started_at).getTime();
  }

  await supabase.from('workflow_stage_runs')
    .update(updates)
    .eq('id', stageRunId);

  // Continue orchestration
  await orchestrateRun(supabase, runId);
}

/**
 * Cancel a workflow run. Marks pending/awaiting stages as skipped.
 */
export async function cancelRun(supabase, runId) {
  // Mark run as cancelled
  await supabase.from('workflow_runs').update({
    status: 'cancelled',
    completed_at: new Date().toISOString(),
  }).eq('id', runId);

  // Skip pending and awaiting_human stages
  await supabase.from('workflow_stage_runs')
    .update({ status: 'skipped' })
    .eq('workflow_run_id', runId)
    .in('status', ['pending', 'awaiting_human']);

  console.log(`[runtime] Run ${runId} cancelled`);
}

/**
 * Reassign a stage to a different user.
 */
export async function reassignStage(supabase, stageRunId, newUserId) {
  // Update the stage run
  await supabase.from('workflow_stage_runs')
    .update({ assigned_to: newUserId })
    .eq('id', stageRunId);

  // Update the linked task if one exists
  const { data: stageRun } = await supabase
    .from('workflow_stage_runs')
    .select('task_id')
    .eq('id', stageRunId)
    .single();

  if (stageRun?.task_id) {
    await supabase.from('tenant_user_tasks')
      .update({ user_id: newUserId })
      .eq('id', stageRun.task_id);
  }
}

// ---------- Prompt Construction ----------

async function buildStagePrompt(supabase, tenantId, agentKey, stage, run, enrichmentContext, previousOutputs) {
  const parts = [];

  // Base agent prompt
  const { data: agentRow } = await supabase
    .from('tenant_agents')
    .select('system_prompt, knowledge_scopes')
    .eq('tenant_id', tenantId)
    .eq('agent_key', agentKey)
    .maybeSingle();

  if (agentRow?.system_prompt) {
    parts.push(agentRow.system_prompt);
  } else {
    const { data: platformAgent } = await supabase
      .from('alf_agent_definitions')
      .select('system_prompt')
      .eq('agent_key', agentKey)
      .maybeSingle();
    if (platformAgent?.system_prompt) parts.push(platformAgent.system_prompt);
  }

  // Knowledge context
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

  // Connected integrations
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

  // Data enrichment context
  if (enrichmentContext) {
    parts.push(enrichmentContext);
  }

  // Workflow + stage context
  const workflowDef = run.workflow_definitions;
  parts.push(`\n\n=== WORKFLOW CONTEXT ===`);
  parts.push(`Workflow: "${workflowDef?.name || 'Unknown'}" — ${workflowDef?.description || ''}`);
  parts.push(`This is stage ${stage.stage_number} of ${run.total_steps}: "${stage.name}"`);
  if (stage.description) parts.push(`Stage instruction: ${stage.description}`);

  // Classification instruction
  if (stage.classification === 'automated') {
    parts.push(`Classification: AUTOMATED — Produce final output. Your response will be recorded and used by subsequent stages.`);
  } else if (stage.classification === 'hybrid') {
    parts.push(`Classification: HYBRID — Produce a draft for human review. A reviewer will be able to edit your output before it advances.`);
  }

  // Output format instruction
  parts.push(`\nProduce your output as structured content. Use clear sections. When possible, include a JSON block with keys: summary, decision, next_action, notifications.`);

  // Previous stage outputs
  if (previousOutputs.length) {
    parts.push(`\n\n=== PREVIOUS STAGE OUTPUTS ===`);
    for (const prev of previousOutputs) {
      const text = prev.output?.text || JSON.stringify(prev.output);
      parts.push(`\n--- Stage ${prev.stage_number}: ${prev.name} ---\n${text.slice(0, 2000)}`);
    }
  }

  return parts.join('\n');
}

function buildStageUserMessage(stage, inputData, enriched) {
  const parts = [];

  parts.push(`Execute stage: "${stage.name}"`);

  if (stage.description) {
    parts.push(`\nInstruction: ${stage.description}`);
  }

  // Include relevant input data (excluding large previous_stages)
  const cleanInput = { ...inputData };
  delete cleanInput.previous_stages;

  if (Object.keys(cleanInput).length) {
    parts.push(`\nInput data:\n${JSON.stringify(cleanInput, null, 2)}`);
  }

  return parts.join('\n');
}

// ---------- Assignment & Routing ----------

async function resolveStageAssignee(supabase, tenantId, stage, enrichedData) {
  const routingRule = stage.routing_rule || {};

  // 1. Check explicit routing rules
  if (routingRule.assign_to_user) {
    const { data: user } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', routingRule.assign_to_user)
      .maybeSingle();
    if (user) return user;
  }

  if (routingRule.assign_to_role) {
    const { data: users } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('tenant_id', tenantId)
      .eq('role', routingRule.assign_to_role)
      .limit(1);
    if (users?.length) return users[0];
  }

  // 2. Dynamic routing: resolve from data
  if (routingRule.resolve_from === 'job_supervisor' && enrichedData?.supervisor) {
    return enrichedData.supervisor;
  }

  if (routingRule.resolve_from === 'employee_manager' && enrichedData?.employee?.job_id) {
    // Look up job → supervisor → profile
    const { data: job } = await supabase
      .from('sf_dim_job')
      .select('supervisor')
      .eq('id', enrichedData.employee.job_id)
      .maybeSingle();

    if (job?.supervisor) {
      const { data: sup } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${job.supervisor}%`)
        .maybeSingle();
      if (sup) return sup;
    }
  }

  // 3. Fallback: look up SOP step assignments for this stage
  const { data: stageSteps } = await supabase
    .from('workflow_stage_steps')
    .select('sop_step_id')
    .eq('workflow_stage_id', stage.id);

  if (stageSteps?.length) {
    const sopStepIds = stageSteps.map(s => s.sop_step_id);
    const { data: assignments } = await supabase
      .from('tenant_sop_assignments')
      .select('assigned_to_user_id, assigned_to_role, assignment_type')
      .in('sop_step_id', sopStepIds);

    const target = assignments?.find(a => a.assignment_type === 'reviewer')
      || assignments?.find(a => a.assignment_type === 'owner');

    if (target?.assigned_to_user_id) {
      const { data: user } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', target.assigned_to_user_id)
        .maybeSingle();
      if (user) return user;
    }

    if (target?.assigned_to_role) {
      const { data: users } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('tenant_id', tenantId)
        .eq('role', target.assigned_to_role)
        .limit(1);
      if (users?.length) return users[0];
    }
  }

  // 4. Last resort: department admin
  const { data: admin } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'super-admin'])
    .limit(1);

  return admin?.[0] || null;
}

// ---------- Task Creation ----------

async function createStageTask(supabase, tenantId, run, stage, stageRun, assignee, agentOutput) {
  if (!assignee) return null;

  const workflowDef = run.workflow_definitions;
  const isHybrid = stage.classification === 'hybrid';

  const title = isHybrid
    ? `Review: ${stage.name}`
    : `Action Required: ${stage.name}`;

  const description = isHybrid
    ? `Workflow "${workflowDef?.name}" — stage ${stage.stage_number} produced a draft. Please review, edit if needed, and approve to advance the workflow.`
    : `Workflow "${workflowDef?.name}" — stage ${stage.stage_number} requires your action. ${stage.description || ''}`;

  const { data: task, error } = await supabase
    .from('tenant_user_tasks')
    .insert({
      tenant_id: tenantId,
      user_id: assignee.id,
      source_type: 'workflow',
      title,
      description,
      agent_output: agentOutput ? { text: agentOutput, agent_key: stage.agent_key } : null,
      workflow_run_id: run.id,
      workflow_step_run_id: stageRun.id,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[runtime] Failed to create task:', error.message);
    return null;
  }

  return task;
}

async function createEscalationTask(supabase, run, stage, stageRun, errorMessage) {
  // Find a workflow admin
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('tenant_id', run.tenant_id)
    .in('role', ['admin', 'super-admin'])
    .limit(1);

  if (!admin?.length) return;

  await supabase.from('tenant_user_tasks').insert({
    tenant_id: run.tenant_id,
    user_id: admin[0].id,
    source_type: 'workflow',
    title: `Escalation: Stage "${stage.name}" failed`,
    description: `Workflow "${run.workflow_definitions?.name}" — stage ${stage.stage_number} failed after retries.\n\nError: ${errorMessage}\n\nPlease investigate and retry or skip this stage.`,
    workflow_run_id: run.id,
    workflow_step_run_id: stageRun.id,
  });
}

// ---------- Email ----------

async function tryAutoSendEmail(supabase, tenantId, responseText, agentKey, stage) {
  const subjectMatch = responseText.match(/^Subject:\s*(.+)$/m);
  const toMatch = responseText.match(/^To:\s*(.+)$/m);

  if (!subjectMatch || !toMatch) return;

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
      console.log(`[runtime] Auto-sent email at stage ${stage.stage_number} to ${toAddresses.join(', ')}`);
    } else {
      console.warn(`[runtime] Email send failed: ${graphRes.status}`);
    }
  } catch (err) {
    console.warn(`[runtime] Email error at stage ${stage.stage_number}:`, err.message);
  }
}

// ---------- Helpers ----------

function buildDedupKey(workflowDefinitionId, triggerId, inputData) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const payload = `${workflowDefinitionId}:${triggerId || 'manual'}:${JSON.stringify(inputData || {})}:${dateStr}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
