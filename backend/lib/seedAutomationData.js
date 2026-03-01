/**
 * Seed Automation / Intelligence Data for Demo Tenants
 *
 * Seeds: sop_analyses, dept_automation_roadmaps, automation_actions,
 *        tenant_agent_overrides, automation_preferences
 *
 * Called by demoSeed.js after knowledge docs are seeded.
 */

/**
 * Main entry point — seeds all automation data for a tenant.
 * @param {object} supabase - Supabase admin client
 * @param {string} tenantId - Tenant UUID
 * @param {object} tenantDef - Tenant definition from demoTenants.js
 */
export async function seedAutomationInsights(supabase, tenantId, tenantDef) {
  const insights = tenantDef.automationInsights;
  if (!insights) {
    console.log(`[demo-seed] No automation insights for ${tenantDef.company_name} — skipping`);
    return;
  }

  console.log(`[demo-seed] Seeding automation data for ${tenantDef.company_name}...`);

  // 1. Delete existing automation data for this tenant
  const deleteTables = [
    'automation_preferences',
    'tenant_agent_overrides',
    'automation_actions',
    'dept_automation_roadmaps',
    'sop_analyses',
  ];
  for (const table of deleteTables) {
    const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId);
    if (error) console.warn(`[demo-seed]   Delete ${table}: ${error.message}`);
  }
  console.log(`[demo-seed]   Cleared existing automation data`);

  // 2. Seed SOP analyses
  const analysisIdMap = {}; // file_name → sop_analysis UUID
  if (insights.sopAnalyses?.length > 0) {
    await seedSopAnalyses(supabase, tenantId, insights.sopAnalyses, analysisIdMap);
  }

  // 3. Seed roadmaps
  const roadmapIdMap = {}; // department → roadmap UUID
  if (insights.roadmaps?.length > 0) {
    await seedRoadmaps(supabase, tenantId, insights.roadmaps, analysisIdMap, roadmapIdMap);
  }

  // 4. Seed automation actions (SOP-derived)
  if (insights.automationActions?.length > 0) {
    await seedAutomationActions(supabase, tenantId, insights.automationActions, roadmapIdMap);
  }

  // 5. Seed action plan items
  if (insights.actionPlanItems?.length > 0) {
    await seedActionPlanItems(supabase, tenantId, insights.actionPlanItems);
  }

  // 6. Seed automation preferences
  if (insights.automationPreferences?.length > 0) {
    await seedAutomationPreferences(supabase, tenantId, insights.automationPreferences);
  }

  console.log(`[demo-seed] Automation data complete for ${tenantDef.company_name}`);
}


// ── SOP Analyses ─────────────────────────────────────────────────────

async function seedSopAnalyses(supabase, tenantId, sopAnalyses, analysisIdMap) {
  // Look up tenant_documents to get document IDs
  const { data: docs } = await supabase
    .from('tenant_documents')
    .select('id, file_name')
    .eq('tenant_id', tenantId);

  const docIdMap = {};
  for (const d of (docs || [])) {
    docIdMap[d.file_name] = d.id;
  }

  const rows = sopAnalyses.map(sa => ({
    tenant_id: tenantId,
    document_id: docIdMap[sa.file_name] || null,
    department: sa.department,
    status: 'completed',
    analysis: sa.analysis,
    model: 'demo_seed',
    tokens_input: 0,
    tokens_output: 0,
    initiated_by_type: 'platform',
  }));

  const { data, error } = await supabase
    .from('sop_analyses')
    .insert(rows)
    .select('id, document_id');

  if (error) {
    console.error(`[demo-seed]   SOP analyses insert failed: ${error.message}`);
    return;
  }

  // Build lookup from file_name → analysis UUID
  for (const row of (data || [])) {
    // Find the file_name for this document_id
    const doc = docs?.find(d => d.id === row.document_id);
    if (doc) {
      analysisIdMap[doc.file_name] = row.id;
    }
  }

  console.log(`[demo-seed]   SOP analyses: ${data?.length || 0} inserted`);
}


// ── Roadmaps ─────────────────────────────────────────────────────────

async function seedRoadmaps(supabase, tenantId, roadmaps, analysisIdMap, roadmapIdMap) {
  for (const rm of roadmaps) {
    // Collect analysis IDs for SOPs referenced in this department's roadmap
    const sopAnalysisIds = [];
    for (const phase of (rm.roadmap?.phases || [])) {
      for (const item of (phase.items || [])) {
        if (item.source_sop && analysisIdMap[item.source_sop]) {
          const id = analysisIdMap[item.source_sop];
          if (!sopAnalysisIds.includes(id)) sopAnalysisIds.push(id);
        }
      }
    }

    const { data, error } = await supabase
      .from('dept_automation_roadmaps')
      .insert({
        tenant_id: tenantId,
        department: rm.department,
        status: 'completed',
        roadmap: rm.roadmap,
        sop_analysis_ids: sopAnalysisIds,
        model: 'demo_seed',
        tokens_input: 0,
        tokens_output: 0,
        initiated_by_type: 'platform',
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[demo-seed]   Roadmap insert (${rm.department}) failed: ${error.message}`);
      continue;
    }

    roadmapIdMap[rm.department] = data.id;
  }

  console.log(`[demo-seed]   Roadmaps: ${Object.keys(roadmapIdMap).length} inserted`);
}


// ── Automation Actions (SOP-derived) ─────────────────────────────────

async function seedAutomationActions(supabase, tenantId, actions, roadmapIdMap) {
  let insertedCount = 0;

  for (const action of actions) {
    const row = {
      tenant_id: tenantId,
      department: action.department,
      roadmap_id: roadmapIdMap[action.department] || null,
      phase: action.phase,
      title: action.title,
      description: action.description,
      source_sop: action.source_sop || null,
      assignee_type: action.assignee_type,
      status: action.status,
      agent_key: action.agent_key || null,
      agent_skill_prompt: action.agent_skill_prompt || null,
      agent_skill_context: action.agent_skill_context || null,
      effort: action.effort || null,
      impact: action.impact || null,
      estimated_time_saved: action.estimated_time_saved || null,
      initiated_by_type: 'platform',
    };

    const { data, error } = await supabase
      .from('automation_actions')
      .insert(row)
      .select('id, agent_key, status, title')
      .single();

    if (error) {
      console.error(`[demo-seed]   Action insert (${action.title}) failed: ${error.message}`);
      continue;
    }

    insertedCount++;

    // For active skills, create tenant_agent_overrides
    if (action.status === 'active' && action.agent_skill_prompt && action.agent_key) {
      const skillBlock = `\n\n<!-- SKILL:${data.id} -->\n### ${action.title}\n${action.agent_skill_prompt}\n<!-- /SKILL:${data.id} -->`;

      // Check if override already exists for this agent
      const { data: existing } = await supabase
        .from('tenant_agent_overrides')
        .select('id, custom_prompt_additions')
        .eq('tenant_id', tenantId)
        .eq('agent_key', action.agent_key)
        .maybeSingle();

      if (existing) {
        const currentAdditions = existing.custom_prompt_additions || '';
        await supabase
          .from('tenant_agent_overrides')
          .update({ custom_prompt_additions: currentAdditions + skillBlock })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('tenant_agent_overrides')
          .insert({
            tenant_id: tenantId,
            agent_key: action.agent_key,
            custom_prompt_additions: skillBlock,
            is_enabled: true,
          });
      }
    }
  }

  console.log(`[demo-seed]   Automation actions: ${insertedCount} inserted`);
}


// ── Action Plan Items ────────────────────────────────────────────────

async function seedActionPlanItems(supabase, tenantId, items) {
  const rows = items.map(item => {
    const phaseFromPriority = item.priority === 'critical' || item.priority === 'high'
      ? 'quick-win' : item.priority === 'medium' ? 'medium-term' : 'long-term';

    const snapshot = {
      ...(item.metric_snapshot || {}),
      suggested_owner_role: item.metric_snapshot?.suggested_owner_role || null,
    };

    return {
      tenant_id: tenantId,
      department: item.department || 'ops',
      phase: phaseFromPriority,
      title: item.title,
      description: item.description,
      source: 'dashboard_action_plan',
      status: item.status || 'open',
      priority: item.priority || 'medium',
      site_name: item.site_name || null,
      metric_snapshot: snapshot,
      assignee_type: 'human',
    };
  });

  const { data, error } = await supabase
    .from('automation_actions')
    .insert(rows)
    .select('id');

  if (error) {
    console.error(`[demo-seed]   Action plan items insert failed: ${error.message}`);
    return;
  }

  console.log(`[demo-seed]   Action plan items: ${data?.length || 0} inserted`);
}


// ── Automation Preferences ───────────────────────────────────────────

async function seedAutomationPreferences(supabase, tenantId, preferences) {
  const rows = preferences.map(pref => ({
    tenant_id: tenantId,
    agent_key: pref.agent_key,
    action_key: pref.action_key,
    integration_type: pref.integration_type,
    execution_mode: pref.execution_mode,
    risk_level: pref.risk_level || 'medium',
    alf_recommended_mode: pref.alf_recommended_mode || 'review',
    total_executions: pref.total_executions || 0,
    total_approved_without_edit: pref.total_approved_without_edit || 0,
    auto_promote_eligible: pref.auto_promote_eligible || false,
    auto_promote_threshold: pref.auto_promote_threshold || 10,
    last_executed_at: pref.last_executed_at || null,
  }));

  const { data, error } = await supabase
    .from('automation_preferences')
    .insert(rows)
    .select('id');

  if (error) {
    console.error(`[demo-seed]   Automation preferences insert failed: ${error.message}`);
    return;
  }

  console.log(`[demo-seed]   Automation preferences: ${data?.length || 0} inserted`);
}
