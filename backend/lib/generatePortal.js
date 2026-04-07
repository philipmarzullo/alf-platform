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

export function buildDepartmentPrompt(profile, dept, companyName) {
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

function buildRFPBuilderPrompt(profile, companyName) {
  const context = buildCompanyContext(profile, companyName);
  const shared = buildSharedRules(companyName);

  // Service catalog
  const serviceCatalog = profile.service_catalog || [];
  let serviceContext = '';
  if (serviceCatalog.length > 0) {
    const lines = serviceCatalog.map(
      (cat) => `- ${cat.category}: ${(cat.services || []).join(', ')}`
    );
    serviceContext = `\n\nCompany Service Catalog:\n${lines.join('\n')}`;
  }

  // Differentiators
  const diffs = profile.differentiators || [];
  let diffContext = '';
  if (diffs.length > 0) {
    const lines = diffs.map(
      (d) => `- ${d.label}${d.description ? ': ' + d.description : ''}`
    );
    diffContext = `\n\nKey Differentiators:\n${lines.join('\n')}`;
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

  return `You are the RFP Response Agent for ${companyName}. You draft precise, compliance-ready responses to Requests for Proposals by drawing on verified company facts, approved Q&A history, and deep cross-functional knowledge — safety, HR, operations, finance, sales, and compliance.

${context}${serviceContext}${diffContext}${techContext}

${shared}

═══════════════════════════════════════════════════════════════════
KNOWLEDGE PRIORITY ORDER (read carefully — applies to every response)
═══════════════════════════════════════════════════════════════════

When answering an RFP question, consult sources in this exact order:

1. RFP VERIFIED FACTS (injected at runtime under "=== RFP VERIFIED FACTS ===")
   - These are tenant-verified ground truth: TRIR, EMR, employee counts, references, policies, certifications.
   - Treat as authoritative. Never invent values that contradict them.
   - If a fact is missing or blank, do NOT guess. Mark the item as needs_data.

2. RFP Q&A LIBRARY (injected under "=== RFP Q&A LIBRARY ===")
   - Previously approved Q&A pairs, ranked by win count.
   - Prefer high-win-count answers when the question matches or is similar.
   - Adapt wording to fit the specific RFP context — never paste verbatim if context differs.

3. Company profile + service catalog + differentiators (above)
   - Use for general capability statements, scope-of-work descriptions, and competitive positioning.

4. Tenant Knowledge Base (uploaded SOPs, certifications, policies)
   - Use as supporting evidence; cite the source document when relevant.

═══════════════════════════════════════════════════════════════════
NEEDS_DATA PROTOCOL — when to refuse to draft
═══════════════════════════════════════════════════════════════════

You MUST mark an item as needs_data (instead of fabricating) when ANY of these are true:
- The question asks for a specific metric (TRIR, EMR, headcount, revenue, years) that is NOT in the verified facts block.
- The question asks for a reference contact (name, phone, email) that is NOT in the verified facts block.
- The question asks for a certification status (yes/no) that is NOT in the verified facts or company profile.
- The question requires a precise number, date, or quantity you cannot source from facts or the Q&A library.

When you mark needs_data, your draft response MUST:
- Start with: "[NEEDS DATA]"
- State exactly what is missing in plain language: "Missing: <fact_key or description>"
- Suggest where to add it: "Add this in the RFP Facts panel under [section]" or "Add a Q&A entry in the library covering [topic]".
- NEVER write a placeholder like "[insert TRIR here]" or "TBD" — use the [NEEDS DATA] marker instead.

═══════════════════════════════════════════════════════════════════
RESPONSE FORMATTING RULES
═══════════════════════════════════════════════════════════════════

- Mirror the RFP's structure — if numbered, use the same numbering. If section-headed, repeat the header.
- Lead with the direct answer. Follow with supporting detail (1–3 sentences).
- For yes/no questions: lead with "Yes." or "No." then justify in one sentence.
- For reference lists: use a clean table-like format (Name | Contact | Phone | Email | Scope | Years).
- For numeric questions: cite the exact number from facts, then explain the methodology in one line.
- For narrative questions: 2–4 short paragraphs, never a wall of text.
- Tone: confident, precise, compliant — match the formality of government and institutional procurement.

═══════════════════════════════════════════════════════════════════
PROHIBITED BEHAVIORS
═══════════════════════════════════════════════════════════════════

- Never invent TRIR, EMR, DART, fatality counts, or any safety metric.
- Never invent reference client names, contacts, phones, or emails.
- Never invent revenue figures, employee counts, or square-footage claims.
- Never claim a certification the company does not hold.
- Never fabricate compliance with regulations the company has not verified.
- Never paste a Q&A library answer verbatim if the question context differs — always adapt.
- Never write "TBD", "[insert X]", or placeholder text. Use [NEEDS DATA] instead.

═══════════════════════════════════════════════════════════════════
WHEN ASKED TO PARSE AN RFP DOCUMENT
═══════════════════════════════════════════════════════════════════

When asked to extract questions from an RFP document, return a clean JSON array. Each item:
{
  "item_number": <int>,
  "question_text": "<full question/requirement text>",
  "section": "<section heading or null>",
  "category": "<one of: company_overview, safety, compliance, staffing, technical, financial, references, experience, transition, sustainability, other>",
  "input_type": "<one of: yes_no, reference_list, numeric, table, narrative>"
}

═══════════════════════════════════════════════════════════════════
WHEN ASKED TO MATCH ANSWERS
═══════════════════════════════════════════════════════════════════

Return a clean JSON array. Each item:
{
  "item_number": <int>,
  "matched_answer_id": "<uuid or null>",
  "confidence": <float 0–1>,
  "suggested_response": "<your draft response, or null if no match>",
  "needs_data": <true if you cannot draft without missing facts, false otherwise>
}

If needs_data is true, set suggested_response to a "[NEEDS DATA]" message describing what is missing.`;
}

// ─── Default workspace colors by department key ─────────

const DEFAULT_DEPT_COLORS = {
  hr: '#7C3AED',
  finance: '#16A34A',
  purchasing: '#D97706',
  sales: '#2563EB',
  ops: '#009ADE',
  operations: '#009ADE',
  admin: '#4B5563',
  safety: '#DC2626',
  quality: '#7C3AED',
  training: '#0D9488',
  it: '#6366F1',
  marketing: '#EC4899',
  legal: '#78716C',
  facilities: '#0891B2',
  logistics: '#EA580C',
  engineering: '#4F46E5',
  customer_service: '#059669',
};

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

  // 3. Create workspaces from departments (with color)
  const departments = profile.departments || [];
  const workspaceRows = departments.map((dept, i) => ({
    tenant_id: tenantId,
    department_key: dept.key,
    name: dept.name,
    icon: dept.icon || null,
    description: dept.description || null,
    color: dept.color || DEFAULT_DEPT_COLORS[dept.key] || '#6B7280',
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

  // 4. Create department agents (one per workspace) with knowledge_scopes
  const agentRows = departments.map((dept) => ({
    tenant_id: tenantId,
    agent_key: dept.key,
    name: `${dept.name} Agent`,
    workspace_id: wsMap[dept.key] || null,
    system_prompt: buildDepartmentPrompt(profile, dept, companyName),
    knowledge_scopes: [dept.key],
    inject_operational_context: false,
    source: 'platform',
  }));

  // 5. Cross-functional agents (no workspace)
  agentRows.push({
    tenant_id: tenantId,
    agent_key: 'admin',
    name: 'Admin Agent',
    workspace_id: null,
    system_prompt: buildAdminPrompt(profile, companyName),
    knowledge_scopes: ['admin', 'general'],
    inject_operational_context: false,
    source: 'platform',
  });

  agentRows.push({
    tenant_id: tenantId,
    agent_key: 'analytics',
    name: 'Analytics Agent',
    workspace_id: null,
    system_prompt: buildAnalyticsPrompt(profile, companyName),
    knowledge_scopes: ['ops', 'general'],
    inject_operational_context: true,
    source: 'platform',
  });

  agentRows.push({
    tenant_id: tenantId,
    agent_key: 'rfp_builder',
    name: 'RFP Response Agent',
    workspace_id: null,
    system_prompt: buildRFPBuilderPrompt(profile, companyName),
    knowledge_scopes: [...departments.map((d) => d.key), 'general'],
    inject_operational_context: true,
    source: 'platform',
  });

  // Tool-specific agents — broad knowledge access for cross-functional tools
  agentRows.push({
    tenant_id: tenantId,
    agent_key: 'qbu',
    name: 'QBU Builder',
    workspace_id: null,
    system_prompt: '', // Frontend provides the system prompt
    knowledge_scopes: [...departments.map((d) => d.key), 'general'],
    inject_operational_context: false,
    source: 'platform',
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

  // Update each agent's system_prompt (platform agents only)
  const updates = agents.filter((a) => a.source !== 'tenant').map((agent) => {
    let newPrompt;

    if (agent.agent_key === 'admin') {
      newPrompt = buildAdminPrompt(profile, companyName);
    } else if (agent.agent_key === 'analytics') {
      newPrompt = buildAnalyticsPrompt(profile, companyName);
    } else if (agent.agent_key === 'rfp_builder') {
      newPrompt = buildRFPBuilderPrompt(profile, companyName);
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

  // Insert missing cross-functional agents (e.g. 'qbu' for existing tenants)
  const existingKeys = new Set(agents.map((a) => a.agent_key));
  const departments = profile.departments || [];
  const allDeptKeys = departments.map((d) => d.key);

  const missingCrossFunctional = [
    { agent_key: 'qbu', name: 'QBU Builder', system_prompt: '', knowledge_scopes: [...allDeptKeys, 'general'], inject_operational_context: false, source: 'platform' },
  ].filter((a) => !existingKeys.has(a.agent_key));

  if (missingCrossFunctional.length > 0) {
    const newRows = missingCrossFunctional.map((a) => ({
      tenant_id: tenantId,
      ...a,
      workspace_id: null,
    }));
    await supabase.from('tenant_agents').insert(newRows);
    console.log(`[regenerateAgentPrompts] Added missing agent(s): ${missingCrossFunctional.map((a) => a.agent_key).join(', ')}`);
  }

  // Return refreshed agents
  const { data: refreshed } = await supabase
    .from('tenant_agents')
    .select('*')
    .eq('tenant_id', tenantId);

  return { agents: refreshed || [] };
}
