/**
 * Tool Generation Engine
 *
 * Generates tenant_tools from a tenant's company profile.
 * Each tool gets a company-specific system prompt and a
 * structured intake schema for dynamic form rendering.
 *
 * Two modes:
 *   - generateTools() — full rebuild (idempotent)
 *   - regenerateToolPrompts() — non-destructive prompt refresh
 */

import { buildCompanyContext, buildSharedRules } from './generatePortal.js';

// ─── Tool Definitions ───────────────────────────────────

const TOOL_DEFS = [
  {
    tool_key: 'qbu',
    name: 'Quarterly Review Builder',
    description: 'Generate comprehensive quarterly business updates with safety, financial, and operational sections.',
    icon: 'bar-chart',
    dept_key: 'operations',
    agent_key: 'operations',
    output_format: 'slides',
    max_tokens: 16384,
    sort_order: 0,
  },
  {
    tool_key: 'proposal',
    name: 'Proposal Builder',
    description: 'Create tailored sales proposals with company-specific differentiators and service positioning.',
    icon: 'file-text',
    dept_key: 'sales',
    agent_key: 'sales',
    output_format: 'slides',
    max_tokens: 8192,
    sort_order: 1,
  },
  {
    tool_key: 'budget',
    name: 'Budget Builder',
    description: 'Build detailed operational budgets with labor, supply, and equipment breakdowns.',
    icon: 'dollar-sign',
    dept_key: 'finance',
    agent_key: 'finance',
    output_format: 'document',
    max_tokens: 4096,
    sort_order: 2,
  },
  {
    tool_key: 'transition-plan',
    name: 'Transition Plan Builder',
    description: 'Generate structured transition plans for new account onboarding with timelines and milestones.',
    icon: 'clipboard-list',
    dept_key: 'operations',
    agent_key: 'operations',
    output_format: 'document',
    max_tokens: 4096,
    sort_order: 3,
  },
  {
    tool_key: 'incident-report',
    name: 'Incident Report',
    description: 'Create detailed incident reports with root cause analysis and corrective actions.',
    icon: 'shield',
    dept_key: 'safety',
    fallback_dept_key: 'operations',
    agent_key: 'safety',
    output_format: 'report',
    max_tokens: 4096,
    sort_order: 4,
  },
  {
    tool_key: 'training-plan',
    name: 'Training Plan',
    description: 'Develop structured training programs with schedules, materials, and assessment criteria.',
    icon: 'users',
    dept_key: 'hr',
    agent_key: 'hr',
    output_format: 'document',
    max_tokens: 4096,
    sort_order: 5,
  },
];

// ─── Intake Schema Templates ────────────────────────────

const INTAKE_SCHEMAS = {
  qbu: [
    { key: 'clientName', label: 'Client Name', type: 'text', required: true, section: 'Cover' },
    { key: 'quarter', label: 'Quarter', type: 'text', required: true, section: 'Cover' },
    { key: 'date', label: 'Date', type: 'text', section: 'Cover' },
    { key: 'jobName', label: 'Job / Site Name', type: 'text', section: 'Cover' },
    { key: 'jobNumber', label: 'Job Number', type: 'text', section: 'Cover' },
    { key: 'regionVP', label: 'Region VP', type: 'text', section: 'Cover' },
    { key: 'safetyTheme', label: 'Safety Theme', type: 'text', section: 'Safety' },
    { key: 'safetyTips', label: 'Key Safety Tips', type: 'textarea', section: 'Safety' },
    { key: 'incidents', label: 'Incidents Summary', type: 'textarea', section: 'Safety' },
    { key: 'goodSaves', label: 'Good Saves / Near Misses', type: 'textarea', section: 'Safety' },
    { key: 'achievements', label: 'Key Achievements', type: 'textarea', required: true, section: 'Executive' },
    { key: 'challenges', label: 'Challenges & Issues', type: 'textarea', section: 'Executive' },
    { key: 'innovations', label: 'Innovations & Improvements', type: 'textarea', section: 'Executive' },
    { key: 'totalOutstanding', label: 'Total Outstanding ($)', type: 'text', section: 'Financial' },
    { key: 'asOfDate', label: 'As of Date', type: 'text', section: 'Financial' },
    { key: 'strategyNotes', label: 'Collection Strategy Notes', type: 'textarea', section: 'Financial' },
    { key: 'roadmapHighlights', label: 'Roadmap Highlights', type: 'textarea', section: 'Roadmap' },
    { key: 'goalStatement', label: 'Goal Statement', type: 'textarea', section: 'Roadmap' },
  ],

  proposal: [
    { key: 'prospect', label: 'Prospect Company', type: 'text', required: true },
    { key: 'site', label: 'Site / Location', type: 'text', required: true },
    { key: 'facilityType', label: 'Facility Type', type: 'text' },
    { key: 'approxSqft', label: 'Approx. Square Footage', type: 'text' },
    { key: 'presentingTo', label: 'Presenting To', type: 'text' },
    { key: 'servicesRequested', label: 'Services Requested', type: 'textarea', required: true },
    { key: 'currentProvider', label: 'Current Provider', type: 'text' },
    { key: 'reasonForChange', label: 'Reason for Change', type: 'textarea' },
    { key: 'concerns', label: 'Key Challenges / Pain Points', type: 'textarea' },
    { key: 'specialRequirements', label: 'Special Requirements', type: 'textarea' },
    { key: 'emphasisAreas', label: 'Differentiators to Emphasize', type: 'textarea' },
  ],

  budget: [
    { key: 'siteName', label: 'Site / Account Name', type: 'text', required: true },
    { key: 'budgetPeriod', label: 'Budget Period', type: 'text', required: true },
    { key: 'siteType', label: 'Facility Type', type: 'text' },
    { key: 'squareFootage', label: 'Square Footage', type: 'text' },
    { key: 'serviceScope', label: 'Service Scope', type: 'textarea', required: true },
    { key: 'headcount', label: 'Estimated Headcount', type: 'text' },
    { key: 'laborRates', label: 'Labor Rate Notes', type: 'textarea' },
    { key: 'supplyBudget', label: 'Supply Budget Notes', type: 'textarea' },
    { key: 'equipmentNeeds', label: 'Equipment Needs', type: 'textarea' },
    { key: 'specialConsiderations', label: 'Special Considerations', type: 'textarea' },
  ],

  'transition-plan': [
    { key: 'accountName', label: 'Account Name', type: 'text', required: true },
    { key: 'siteName', label: 'Site Name', type: 'text', required: true },
    { key: 'startDate', label: 'Transition Start Date', type: 'text', required: true },
    { key: 'goLiveDate', label: 'Go-Live Date', type: 'text' },
    { key: 'serviceScope', label: 'Service Scope', type: 'textarea', required: true },
    { key: 'incumbentProvider', label: 'Incumbent Provider', type: 'text' },
    { key: 'keyContacts', label: 'Key Client Contacts', type: 'textarea' },
    { key: 'knownChallenges', label: 'Known Challenges', type: 'textarea' },
    { key: 'specialRequirements', label: 'Special Requirements', type: 'textarea' },
    { key: 'staffingPlan', label: 'Staffing Plan Notes', type: 'textarea' },
  ],

  'incident-report': [
    { key: 'incidentDate', label: 'Incident Date', type: 'text', required: true },
    { key: 'incidentTime', label: 'Incident Time', type: 'text' },
    { key: 'location', label: 'Location', type: 'text', required: true },
    { key: 'reportedBy', label: 'Reported By', type: 'text', required: true },
    { key: 'incidentType', label: 'Incident Type', type: 'text', required: true },
    { key: 'description', label: 'Incident Description', type: 'textarea', required: true },
    { key: 'injuriesOrDamage', label: 'Injuries / Damage', type: 'textarea' },
    { key: 'witnessInfo', label: 'Witness Information', type: 'textarea' },
    { key: 'immediateActions', label: 'Immediate Actions Taken', type: 'textarea' },
    { key: 'rootCause', label: 'Root Cause (if known)', type: 'textarea' },
    { key: 'correctiveActions', label: 'Corrective Actions', type: 'textarea' },
  ],

  'training-plan': [
    { key: 'programName', label: 'Program Name', type: 'text', required: true },
    { key: 'targetAudience', label: 'Target Audience', type: 'text', required: true },
    { key: 'duration', label: 'Program Duration', type: 'text' },
    { key: 'objectives', label: 'Learning Objectives', type: 'textarea', required: true },
    { key: 'topics', label: 'Key Topics', type: 'textarea' },
    { key: 'deliveryMethod', label: 'Delivery Method', type: 'text' },
    { key: 'prerequisites', label: 'Prerequisites', type: 'textarea' },
    { key: 'assessmentMethod', label: 'Assessment Method', type: 'textarea' },
    { key: 'materials', label: 'Required Materials', type: 'textarea' },
    { key: 'specialNotes', label: 'Special Notes', type: 'textarea' },
  ],
};

// ─── Prompt Builders ────────────────────────────────────

function buildServiceContext(profile) {
  const serviceCatalog = profile.service_catalog || [];
  if (serviceCatalog.length === 0) return '';
  const lines = serviceCatalog.map(
    (cat) => `- ${cat.category}: ${(cat.services || []).join(', ')}`
  );
  return `\nCompany Service Catalog:\n${lines.join('\n')}`;
}

function buildDifferentiatorContext(profile) {
  const diffs = profile.differentiators || [];
  if (diffs.length === 0) return '';
  const lines = diffs.map(
    (d) => `- ${d.label}${d.description ? ': ' + d.description : ''}`
  );
  return `\nKey Differentiators:\n${lines.join('\n')}`;
}

function buildToolPrompt(toolKey, profile, companyName) {
  const context = buildCompanyContext(profile, companyName);
  const shared = buildSharedRules(companyName);
  const serviceCtx = buildServiceContext(profile);
  const diffCtx = buildDifferentiatorContext(profile);

  const prompts = {
    qbu: () => `You are a quarterly business update (QBU) generator for ${companyName}. You produce comprehensive, polished quarterly review presentations that showcase operational excellence, safety performance, and business results.

${context}${serviceCtx}

${shared}

QBU-Specific Rules:
- Generate a complete quarterly business update following a structured slide format.
- Sections include: Cover, Safety, Executive Summary, Work Tickets & Events, Audits & Inspections, Special Projects, Challenges & Follow-ups, Financial Summary, and Roadmap.
- Use specific data provided in the intake form — never fabricate metrics, incident counts, or financial figures.
- Frame challenges constructively with action plans and timelines.
- Safety section should lead with the safety theme and reinforce ${companyName}'s commitment to zero incidents.
- Financial section should present AR aging clearly with collection strategies.
- Roadmap should be forward-looking with concrete milestones.${diffCtx}

Output Format: Generate structured content for each slide section using HTML comment markers (<!-- NARRATIVE:SECTION:TYPE -->...<!-- /NARRATIVE -->) for downstream parsing.`,

    proposal: () => `You are a sales proposal generator for ${companyName}. You create compelling, customized proposals that position ${companyName}'s services against prospect needs while highlighting competitive differentiators.

${context}${serviceCtx}${diffCtx}

${shared}

Proposal-Specific Rules:
- Create a structured sales presentation tailored to the prospect's facility and needs.
- Sections include: Cover, About ${companyName}, Understanding Their Needs, Proposed Solution, Service Approach, Safety & Compliance, Technology & Innovation, Team & Leadership, Investment Overview, and Next Steps.
- Weave ${companyName}'s differentiators naturally into the narrative — don't just list them.
- Address the prospect's stated pain points and challenges directly.
- If a current provider is mentioned, subtly position ${companyName}'s advantages without disparaging competitors.
- Reference specific services from ${companyName}'s service catalog that match the requested scope.
- Tone should be confident and consultative, not aggressive or salesy.

Output Format: Generate structured content for each slide section using HTML comment markers (<!-- NARRATIVE:SECTION:TYPE -->...<!-- /NARRATIVE -->) for downstream parsing.`,

    budget: () => `You are an operational budget builder for ${companyName}. You create detailed, realistic budgets that cover labor, supplies, equipment, and overhead for facility service operations.

${context}${serviceCtx}

${shared}

Budget-Specific Rules:
- Build a comprehensive operational budget broken into clear categories: labor, supplies, equipment, overhead, and margin.
- Use industry-standard cost structures for facility services.
- Labor estimates should account for shift coverage, supervision, and seasonal variations.
- Supply budgets should be based on square footage and service scope.
- Include notes and assumptions for each line item.
- Flag any areas where additional information is needed for accurate budgeting.
- Present totals with clear formatting — use tables where appropriate.`,

    'transition-plan': () => `You are a transition plan builder for ${companyName}. You create structured, detailed plans for onboarding new accounts — covering pre-transition preparation, go-live execution, and post-transition stabilization.

${context}${serviceCtx}

${shared}

Transition Plan-Specific Rules:
- Organize the plan into phases: Pre-Transition (30-60 days before), Go-Live Week, and Post-Transition Stabilization (30-90 days after).
- Each phase should have specific milestones, responsible parties, and deliverables.
- Include staffing plan with hiring timeline and training requirements.
- Address equipment procurement and supply chain setup.
- Include client communication plan with key touchpoints.
- If an incumbent provider is mentioned, plan for knowledge transfer.
- Include risk mitigation strategies for common transition challenges.
- Reference ${companyName}'s specific onboarding standards and programs.`,

    'incident-report': () => `You are an incident report writer for ${companyName}. You produce thorough, professional incident reports that document facts, analyze root causes, and define corrective actions in compliance with safety standards.

${context}

${shared}

Incident Report-Specific Rules:
- Follow a structured format: Incident Summary, Description of Events, Contributing Factors, Root Cause Analysis, Corrective Actions, and Follow-Up Plan.
- Document facts objectively — avoid speculation or blame language.
- Root cause analysis should use the "5 Whys" or similar systematic approach.
- Corrective actions should be specific, measurable, and assigned to responsible parties with deadlines.
- Include any regulatory reporting requirements based on incident type.
- Reference ${companyName}'s safety protocols and reporting standards.
- Tone should be professional and factual, not defensive.`,

    'training-plan': () => `You are a training plan developer for ${companyName}. You create structured training programs with clear objectives, schedules, materials, and assessment criteria aligned with ${companyName}'s operational standards.

${context}${serviceCtx}

${shared}

Training Plan-Specific Rules:
- Structure the plan with: Program Overview, Learning Objectives, Schedule & Timeline, Content Modules, Delivery Methods, Assessment & Certification, and Resources Required.
- Learning objectives should be specific and measurable (Bloom's taxonomy).
- Include both classroom/theoretical and hands-on/practical components.
- Assessment methods should verify competency, not just attendance.
- Reference ${companyName}'s specific equipment, systems, and operational procedures.
- Include onboarding context for new hires and ongoing development for existing staff.
- Note any compliance or certification requirements.`,
  };

  const builder = prompts[toolKey];
  return builder ? builder() : '';
}

// ─── Exported Functions ─────────────────────────────────

/**
 * Full rebuild — deletes existing tools and regenerates from profile.
 * Returns { tools }.
 */
export async function generateTools(supabase, tenantId) {
  // 1. Fetch profile + tenant + existing workspaces
  const [profileRes, tenantRes, wsRes] = await Promise.all([
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
      .from('tenant_workspaces')
      .select('id, department_key')
      .eq('tenant_id', tenantId),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);
  if (tenantRes.error) throw new Error(`Tenant not found: ${tenantRes.error.message}`);

  const profile = profileRes.data;
  const companyName = tenantRes.data.company_name;
  const workspaces = wsRes.data || [];

  // Build workspace lookup by department_key
  const wsMap = {};
  workspaces.forEach((ws) => { wsMap[ws.department_key] = ws.id; });

  // 2. Delete existing tools (idempotent rebuild)
  await supabase.from('tenant_tools').delete().eq('tenant_id', tenantId);

  // 3. Create tool rows
  const toolRows = TOOL_DEFS.map((def) => {
    const workspaceId = wsMap[def.dept_key] || wsMap[def.fallback_dept_key] || null;

    return {
      tenant_id: tenantId,
      tool_key: def.tool_key,
      name: def.name,
      description: def.description,
      icon: def.icon,
      workspace_id: workspaceId,
      agent_key: def.agent_key,
      intake_schema: INTAKE_SCHEMAS[def.tool_key] || [],
      system_prompt: buildToolPrompt(def.tool_key, profile, companyName),
      output_format: def.output_format,
      max_tokens: def.max_tokens,
      sort_order: def.sort_order,
    };
  });

  const { data: tools, error } = await supabase
    .from('tenant_tools')
    .insert(toolRows)
    .select();

  if (error) throw new Error(`Failed to create tools: ${error.message}`);

  return { tools: tools || [] };
}

/**
 * Non-destructive — only updates system_prompt on existing tools
 * from the latest profile data. Preserves is_active toggles,
 * name edits, intake_schema changes, etc.
 */
export async function regenerateToolPrompts(supabase, tenantId) {
  // Fetch profile + tenant + existing tools
  const [profileRes, tenantRes, toolsRes] = await Promise.all([
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
      .from('tenant_tools')
      .select('*')
      .eq('tenant_id', tenantId),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);
  if (tenantRes.error) throw new Error(`Tenant not found: ${tenantRes.error.message}`);

  const profile = profileRes.data;
  const companyName = tenantRes.data.company_name;
  const tools = toolsRes.data || [];

  // Update each tool's system_prompt
  const updates = tools.map((tool) => {
    const newPrompt = buildToolPrompt(tool.tool_key, profile, companyName);
    if (!newPrompt) return null; // Unknown tool_key — skip

    return supabase
      .from('tenant_tools')
      .update({ system_prompt: newPrompt })
      .eq('id', tool.id);
  });

  await Promise.all(updates.filter(Boolean));

  // Return refreshed tools
  const { data: refreshed } = await supabase
    .from('tenant_tools')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');

  return { tools: refreshed || [] };
}
