/**
 * Portal Generation Engine
 *
 * Generates tenant_workspaces and tenant_agents from a tenant's
 * company profile. Two modes:
 *   - generateWorkspacesAndAgents() — full rebuild (idempotent)
 *   - regenerateAgentPrompts() — non-destructive prompt refresh
 */

// ─── Prompt builders (internal) ─────────────────────────

export function buildCompanyContext(profile, companyName) {
  const parts = [`Company: ${companyName}`];

  if (profile.industry) parts.push(`Industry: ${profile.industry}`);
  if (profile.sub_vertical) parts.push(`Sub-vertical: ${profile.sub_vertical}`);
  if (profile.company_description) parts.push(`Description: ${profile.company_description}`);

  const diffs = profile.differentiators || [];
  if (diffs.length > 0) {
    parts.push('Key Differentiators:');
    diffs.forEach((d) => {
      parts.push(`- ${d.label}${d.description ? ': ' + d.description : ''}`);
    });
  }

  const certs = profile.certifications || [];
  if (certs.length > 0) {
    parts.push(`Certifications: ${certs.join(', ')}`);
  }

  const geo = profile.geographic_coverage || [];
  if (geo.length > 0) {
    parts.push(`Geographic Coverage: ${geo.join(', ')}`);
  }

  const leaders = profile.key_leadership || [];
  if (leaders.length > 0) {
    parts.push('Key Leadership:');
    leaders.forEach((l) => {
      parts.push(`- ${l.name}, ${l.title}`);
    });
  }

  return parts.join('\n');
}

export function buildSharedRules(companyName) {
  return `Rules that apply to ALL ${companyName} agents:
- Tone: Professional, warm, operationally specific.
- Never fabricate data, metrics, employee information, pay rates, or compliance determinations.
- If you don't have enough information to complete a task, say what's missing rather than guessing.
- Use active voice. Be concrete. Reference specific systems, programs, and tools by name.
- Do not use: "transformational", "best-in-class", "synergy", "cutting-edge", "state-of-the-art", "holistic", "paradigm".`;
}

function buildDepartmentPrompt(profile, dept, companyName) {
  const context = buildCompanyContext(profile, companyName);
  const shared = buildSharedRules(companyName);

  // Build service context if services exist for this department
  const serviceCatalog = profile.service_catalog || [];
  let serviceContext = '';
  if (serviceCatalog.length > 0) {
    const lines = serviceCatalog.map(
      (cat) => `- ${cat.category}: ${(cat.services || []).join(', ')}`
    );
    serviceContext = `\n\nCompany Service Catalog:\n${lines.join('\n')}`;
  }

  // Tech platforms
  const techPlatforms = profile.technology_platforms || [];
  let techContext = '';
  if (techPlatforms.length > 0) {
    const lines = techPlatforms.map(
      (tp) => `- ${tp.name}${tp.description ? ': ' + tp.description : ''}`
    );
    techContext = `\n\nTechnology Platforms:\n${lines.join('\n')}`;
  }

  return `You are the ${dept.name} assistant for ${companyName}. You help ${dept.name.toLowerCase()} leadership and staff with analysis, reporting, and operational questions specific to the ${dept.name.toLowerCase()} department.

${context}${serviceContext}${techContext}

${shared}

${dept.name}-Specific Rules:
- You focus on ${dept.description || dept.name.toLowerCase() + ' operations'}.
- Reference ${companyName}'s specific systems, programs, and tools when they appear in knowledge base context.
- Frame analysis around ${dept.name.toLowerCase()} excellence and operational improvement.
- Never fabricate ${dept.name.toLowerCase()} data or metrics — if data isn't available, say what's missing.`;
}

function buildAdminPrompt(profile, companyName) {
  const context = buildCompanyContext(profile, companyName);
  const shared = buildSharedRules(companyName);

  const depts = (profile.departments || []).map((d) => d.name).join(', ');

  return `You are a strategic operations advisor for ${companyName}, thinking from the perspective of the CEO. You have visibility across all departments — ${depts || 'all departments'}.

${context}

${shared}

Admin-Specific Rules:
- Think strategically — connect dots across departments.
- Focus on: revenue retention, operational efficiency, workforce stability, client satisfaction.
- Reference ${companyName}'s performance metrics and programs from knowledge base context.
- When analyzing cross-department data, surface risks and opportunities.
- Frame recommendations in terms of business impact.
- Never fabricate data — if cross-department data isn't available, say what's missing.`;
}

function buildAnalyticsPrompt(profile, companyName) {
  const context = buildCompanyContext(profile, companyName);
  const shared = buildSharedRules(companyName);

  return `You are a data analysis assistant for ${companyName}. You help leadership analyze trends, create reports, and surface insights from operational data across all departments.

${context}

${shared}

Analytics-Specific Rules:
- Focus on data-driven insights: trends, comparisons, anomalies, forecasts.
- When presented with data, organize it clearly — use tables, bullet points, and structured formats.
- Distinguish between correlation and causation in your analysis.
- Reference ${companyName}'s specific KPIs and metrics when they appear in context.
- Suggest visualization approaches when appropriate (charts, dashboards, scorecards).
- Never fabricate data or statistics — if data is insufficient for analysis, say what's missing.`;
}

// ─── Exported functions ─────────────────────────────────

/**
 * Full rebuild — deletes existing workspaces/agents and regenerates from profile.
 * Returns { workspaces, agents }.
 */
export async function generateWorkspacesAndAgents(supabase, tenantId) {
  // 1. Fetch profile + tenant record
  const [profileRes, tenantRes] = await Promise.all([
    supabase
      .from('tenant_company_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('alf_tenants')
      .select('company_name')
      .eq('id', tenantId)
      .single(),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);
  if (tenantRes.error) throw new Error(`Tenant not found: ${tenantRes.error.message}`);

  const profile = profileRes.data;
  const companyName = tenantRes.data.company_name;

  // 2. Delete existing (agents first due to FK)
  await supabase.from('tenant_agents').delete().eq('tenant_id', tenantId);
  await supabase.from('tenant_workspaces').delete().eq('tenant_id', tenantId);

  // 3. Create workspaces from departments
  const departments = profile.departments || [];
  const workspaceRows = departments.map((dept, i) => ({
    tenant_id: tenantId,
    department_key: dept.key,
    name: dept.name,
    icon: dept.icon || null,
    description: dept.description || null,
    sort_order: i,
  }));

  let workspaces = [];
  if (workspaceRows.length > 0) {
    const { data, error } = await supabase
      .from('tenant_workspaces')
      .insert(workspaceRows)
      .select();
    if (error) throw new Error(`Failed to create workspaces: ${error.message}`);
    workspaces = data;
  }

  // Build workspace lookup by department_key
  const wsMap = {};
  workspaces.forEach((ws) => { wsMap[ws.department_key] = ws.id; });

  // 4. Create department agents (one per workspace)
  const agentRows = departments.map((dept) => ({
    tenant_id: tenantId,
    agent_key: dept.key,
    name: `${dept.name} Agent`,
    workspace_id: wsMap[dept.key] || null,
    system_prompt: buildDepartmentPrompt(profile, dept, companyName),
  }));

  // 5. Cross-functional agents (no workspace)
  agentRows.push({
    tenant_id: tenantId,
    agent_key: 'admin',
    name: 'Admin Agent',
    workspace_id: null,
    system_prompt: buildAdminPrompt(profile, companyName),
  });

  agentRows.push({
    tenant_id: tenantId,
    agent_key: 'analytics',
    name: 'Analytics Agent',
    workspace_id: null,
    system_prompt: buildAnalyticsPrompt(profile, companyName),
  });

  let agents = [];
  if (agentRows.length > 0) {
    const { data, error } = await supabase
      .from('tenant_agents')
      .insert(agentRows)
      .select();
    if (error) throw new Error(`Failed to create agents: ${error.message}`);
    agents = data;
  }

  return { workspaces, agents };
}

/**
 * Non-destructive — only updates system_prompt on existing agents
 * from the latest profile data. Preserves workspace structure,
 * active/inactive toggles, and name edits.
 */
export async function regenerateAgentPrompts(supabase, tenantId) {
  // Fetch profile + tenant + existing agents
  const [profileRes, tenantRes, agentsRes] = await Promise.all([
    supabase
      .from('tenant_company_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('alf_tenants')
      .select('company_name')
      .eq('id', tenantId)
      .single(),
    supabase
      .from('tenant_agents')
      .select('*')
      .eq('tenant_id', tenantId),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);
  if (tenantRes.error) throw new Error(`Tenant not found: ${tenantRes.error.message}`);

  const profile = profileRes.data;
  const companyName = tenantRes.data.company_name;
  const agents = agentsRes.data || [];

  // Build department lookup
  const deptMap = {};
  (profile.departments || []).forEach((d) => { deptMap[d.key] = d; });

  // Update each agent's system_prompt
  const updates = agents.map((agent) => {
    let newPrompt;

    if (agent.agent_key === 'admin') {
      newPrompt = buildAdminPrompt(profile, companyName);
    } else if (agent.agent_key === 'analytics') {
      newPrompt = buildAnalyticsPrompt(profile, companyName);
    } else if (deptMap[agent.agent_key]) {
      newPrompt = buildDepartmentPrompt(profile, deptMap[agent.agent_key], companyName);
    } else {
      // Unknown agent key — skip
      return null;
    }

    return supabase
      .from('tenant_agents')
      .update({ system_prompt: newPrompt })
      .eq('id', agent.id);
  });

  await Promise.all(updates.filter(Boolean));

  // Return refreshed agents
  const { data: refreshed } = await supabase
    .from('tenant_agents')
    .select('*')
    .eq('tenant_id', tenantId);

  return { agents: refreshed || [] };
}
