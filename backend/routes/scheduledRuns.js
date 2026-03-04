import { createClient } from '@supabase/supabase-js';
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import { executeWorkflow } from '../lib/workflowExecutor.js';

/**
 * POST /api/workflows/cron/execute
 *
 * Cron endpoint that evaluates active schedule triggers and fires matching workflows.
 * Protected by CRON_SECRET bearer token (same pattern as backup.js).
 *
 * Called by Render Cron Job on a regular interval (e.g. every 15 minutes).
 */
export async function handleScheduledWorkflows(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const now = new Date();
  const results = { triggered: 0, completed: 0, failed: 0, skipped: 0 };

  try {
    console.log('[workflow-cron] Evaluating schedule triggers...');

    // Fetch active schedule triggers with their workflow definitions
    const { data: triggers, error: trigErr } = await sb
      .from('workflow_triggers')
      .select(`
        id, tenant_id, workflow_definition_id, schedule_cron, schedule_timezone,
        last_triggered_at, next_trigger_at, is_active,
        workflow_definitions!inner(id, tenant_id, name, description, department,
          status, sop_analysis_id)
      `)
      .eq('trigger_type', 'schedule')
      .eq('is_active', true);

    if (trigErr) {
      console.error('[workflow-cron] Failed to fetch triggers:', trigErr.message);
      return res.status(500).json({ error: 'Failed to fetch triggers' });
    }

    // Filter to only active workflow definitions
    const activeTriggers = (triggers || []).filter(
      t => t.workflow_definitions?.status === 'active'
    );

    console.log(`[workflow-cron] Found ${activeTriggers.length} active schedule trigger(s)`);

    for (const trigger of activeTriggers) {
      try {
        const shouldFire = shouldTriggerNow(
          trigger.schedule_cron,
          trigger.schedule_timezone || 'America/New_York',
          trigger.last_triggered_at,
          now
        );

        if (!shouldFire) {
          results.skipped++;
          continue;
        }

        results.triggered++;
        console.log(`[workflow-cron] Firing trigger ${trigger.id} for workflow "${trigger.workflow_definitions.name}"`);

        const outcome = await executeWorkflow(sb, trigger.workflow_definitions, trigger);

        // Update trigger tracking
        const nextTriggerAt = computeNextTrigger(
          trigger.schedule_cron,
          trigger.schedule_timezone || 'America/New_York'
        );

        await sb.from('workflow_triggers').update({
          last_triggered_at: now.toISOString(),
          next_trigger_at: nextTriggerAt,
          updated_at: now.toISOString(),
        }).eq('id', trigger.id);

        if (outcome.status === 'completed') {
          results.completed++;
        } else {
          results.failed++;
        }
      } catch (err) {
        console.error(`[workflow-cron] Trigger ${trigger.id} failed:`, err.message);
        results.failed++;
      }
    }

    console.log(`[workflow-cron] Done: ${results.triggered} triggered, ${results.completed} completed, ${results.failed} failed, ${results.skipped} skipped`);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[workflow-cron] Unhandled error:', err.message);
    res.status(500).json({ error: 'Scheduled workflow execution failed', detail: err.message });
  }
}

/**
 * Check if a cron expression should have fired since the last trigger time.
 * Uses a polling window approach: if the most recent scheduled time is after
 * last_triggered_at (or within the last 15 minutes if never triggered).
 */
function shouldTriggerNow(cronExpression, timezone, lastTriggeredAt, now) {
  try {
    const options = {
      currentDate: now,
      tz: timezone,
    };

    const interval = parseExpression(cronExpression, options);
    const prevScheduled = interval.prev().toDate();

    // If never triggered, fire if the last scheduled time was within 15 minutes
    if (!lastTriggeredAt) {
      const windowMs = 15 * 60 * 1000;
      return (now.getTime() - prevScheduled.getTime()) < windowMs;
    }

    // Fire if the last scheduled time is after the last trigger time
    const lastTrigger = new Date(lastTriggeredAt);
    return prevScheduled > lastTrigger;
  } catch (err) {
    console.warn(`[workflow-cron] Invalid cron expression "${cronExpression}":`, err.message);
    return false;
  }
}

/**
 * Compute the next trigger time from a cron expression.
 */
function computeNextTrigger(cronExpression, timezone) {
  try {
    const interval = parseExpression(cronExpression, { tz: timezone });
    return interval.next().toDate().toISOString();
  } catch {
    return null;
  }
}
