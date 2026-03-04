import { createClient } from '@supabase/supabase-js';
import { evaluateThresholds, getAllowedTables } from '../lib/metricEngine.js';
import { executeWorkflow } from '../lib/workflowExecutor.js';

/**
 * POST /api/workflows/cron/metric-triggers
 *
 * Cron endpoint that evaluates metric-threshold-based workflow triggers.
 * When a tenant metric breaches its threshold, the linked workflow fires.
 * Protected by CRON_SECRET bearer token (same pattern as scheduledRuns.js).
 */
export async function handleMetricTriggers(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const now = new Date();
  const results = { evaluated: 0, triggered: 0, skipped: 0, completed: 0, failed: 0 };

  try {
    console.log('[metric-triggers] Evaluating metric-based workflow triggers...');

    // Fetch active event triggers for metric_threshold with their workflow definitions
    const { data: triggers, error: trigErr } = await sb
      .from('workflow_triggers')
      .select(`
        id, tenant_id, workflow_definition_id, event_source, event_config,
        last_triggered_at, is_active,
        workflow_definitions!inner(id, tenant_id, name, description, department,
          status, sop_analysis_id)
      `)
      .eq('trigger_type', 'event')
      .eq('event_source', 'metric_threshold')
      .eq('is_active', true);

    if (trigErr) {
      console.error('[metric-triggers] Failed to fetch triggers:', trigErr.message);
      return res.status(500).json({ error: 'Failed to fetch triggers' });
    }

    // Filter to only active workflow definitions
    const activeTriggers = (triggers || []).filter(
      t => t.workflow_definitions?.status === 'active'
    );

    console.log(`[metric-triggers] Found ${activeTriggers.length} active metric trigger(s)`);

    // Group triggers by tenant for efficient evaluation
    const byTenant = {};
    for (const t of activeTriggers) {
      if (!byTenant[t.tenant_id]) byTenant[t.tenant_id] = [];
      byTenant[t.tenant_id].push(t);
    }

    for (const [tenantId, tenantTriggers] of Object.entries(byTenant)) {
      try {
        // Fetch all metrics and thresholds for this tenant
        const [metricsRes, thresholdsRes] = await Promise.all([
          sb.from('tenant_metrics').select('*').eq('tenant_id', tenantId).eq('is_active', true),
          sb.from('tenant_metric_thresholds').select('*').eq('tenant_id', tenantId).eq('is_active', true),
        ]);

        const metrics = metricsRes.data || [];
        const thresholds = thresholdsRes.data || [];

        if (!metrics.length || !thresholds.length) {
          results.skipped += tenantTriggers.length;
          continue;
        }

        const allowedTables = await getAllowedTables(sb, tenantId);

        // Default filters — evaluate over all time / all sites
        const filters = {};

        // Build job map for site name resolution (empty is fine — descriptions still work)
        const jobMap = {};

        // Evaluate all thresholds for this tenant
        const attentionItems = await evaluateThresholds(
          sb, tenantId, thresholds, metrics, filters, jobMap, allowedTables
        );

        // Build a set of breached threshold IDs for matching
        // attentionItems don't directly carry threshold_id, so we re-check per trigger
        // by matching metric_id from event_config against breached thresholds
        const breachedMetricIds = new Set();
        const breachedThresholdIds = new Set();

        // Re-scan thresholds to determine which ones breached (attentionItems exist)
        // Since evaluateThresholds returns items when breached, we track which thresholds
        // produced items by checking if any attention items exist for a metric
        for (const threshold of thresholds) {
          if (!threshold.is_active) continue;
          const metric = metrics.find(m => m.id === threshold.metric_id);
          if (!metric) continue;

          // A threshold is "breached" if evaluateThresholds produced any attention items
          // We can determine this by checking if the metric_id+threshold combo appears
          // in the attention items (via detail field containing the metric label)
          const hasBreachedItem = attentionItems.some(
            item => item.detail?.includes(metric.label)
          );

          if (hasBreachedItem) {
            breachedMetricIds.add(threshold.metric_id);
            breachedThresholdIds.add(threshold.id);
          }
        }

        // Now check each trigger against breached thresholds
        for (const trigger of tenantTriggers) {
          results.evaluated++;
          const config = trigger.event_config || {};
          const metricId = config.metric_id;
          const thresholdId = config.threshold_id;

          // Check if the trigger's metric/threshold breached
          const breached = thresholdId
            ? breachedThresholdIds.has(thresholdId)
            : breachedMetricIds.has(metricId);

          if (!breached) {
            results.skipped++;
            continue;
          }

          // Check cooldown — don't fire if triggered too recently
          const cooldownMinutes = config.cooldown_minutes || 60;
          if (trigger.last_triggered_at) {
            const lastFired = new Date(trigger.last_triggered_at);
            const cooldownMs = cooldownMinutes * 60 * 1000;
            if (now.getTime() - lastFired.getTime() < cooldownMs) {
              results.skipped++;
              console.log(`[metric-triggers] Trigger ${trigger.id} in cooldown (${cooldownMinutes}min), skipping`);
              continue;
            }
          }

          // Fire the workflow
          results.triggered++;
          console.log(`[metric-triggers] Firing trigger ${trigger.id} for workflow "${trigger.workflow_definitions.name}"`);

          try {
            const outcome = await executeWorkflow(sb, trigger.workflow_definitions, trigger);

            // Update last_triggered_at
            await sb.from('workflow_triggers').update({
              last_triggered_at: now.toISOString(),
              updated_at: now.toISOString(),
            }).eq('id', trigger.id);

            if (outcome.status === 'completed') {
              results.completed++;
            } else {
              results.failed++;
            }
          } catch (execErr) {
            console.error(`[metric-triggers] Workflow execution failed for trigger ${trigger.id}:`, execErr.message);
            results.failed++;
          }
        }
      } catch (tenantErr) {
        console.error(`[metric-triggers] Tenant ${tenantId} evaluation failed:`, tenantErr.message);
        results.skipped += tenantTriggers.length;
      }
    }

    console.log(`[metric-triggers] Done: evaluated=${results.evaluated} triggered=${results.triggered} completed=${results.completed} failed=${results.failed} skipped=${results.skipped}`);
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('[metric-triggers] Unhandled error:', err.message);
    res.status(500).json({ error: 'Metric trigger evaluation failed', detail: err.message });
  }
}
