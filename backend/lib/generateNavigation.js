/**
 * Navigation & Module Registry Generation
 *
 * Seeds tenant_nav_sections and tenant_module_registry for a tenant.
 * Called during full portal generation (generateAll.js).
 */

// ── Role hierarchy for nav filtering ─────────────────────────────────
// Higher number = more access. Used by filterNavForRole().
const ROLE_LEVEL = {
  user: 0,
  manager: 1,
  admin: 2,
  'super-admin': 3,
  super_admin: 3,
  platform_owner: 4,
};

/**
 * Filter nav sections to only include items the user's role can see.
 * Removes empty sections after filtering.
 *
 * @param {Array} sections - Nav sections with items containing min_role
 * @param {string} userRole - The user's role
 * @param {string} [userDepartmentKey] - The user's department_key (for scope filtering)
 * @returns {Array} Filtered sections
 */
export function filterNavForRole(sections, userRole, userDepartmentKey) {
  const level = ROLE_LEVEL[userRole] ?? 0;
  return sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        const minLevel = ROLE_LEVEL[item.min_role] ?? 0;
        return level >= minLevel;
      }),
    }))
    .filter(section => section.items.length > 0);
}

/**
 * Returns the default landing route for a given role.
 * user/manager → /portal/my-work, admin+ → /portal
 */
export function getDefaultRoute(userRole) {
  const level = ROLE_LEVEL[userRole] ?? 0;
  return level >= ROLE_LEVEL.admin ? '/portal' : '/portal/my-work';
}

/**
 * Seed the static nav sections for a tenant.
 * Each item has a min_role field for role-based filtering.
 * Workspaces and Tools groups remain built dynamically
 * from tenant_workspaces / tenant_tools by the frontend.
 */
export async function generateNavSections(supabase, tenantId) {
  // Delete existing
  await supabase.from('tenant_nav_sections').delete().eq('tenant_id', tenantId);

  const sections = [
    {
      tenant_id: tenantId,
      section_key: 'command-center',
      label: 'Command Center',
      sort_order: 0,
      items: [
        { key: 'my-work', label: 'My Work', path: '/portal/my-work', icon: 'ClipboardCheck', min_role: 'user' },
        { key: 'home', label: 'Command Center', path: '/portal', icon: 'LayoutDashboard', min_role: 'admin' },
      ],
    },
    {
      tenant_id: tenantId,
      section_key: 'analytics',
      label: 'Analytics',
      sort_order: 1,
      items: [
        { key: 'analytics-chat', label: 'Analytics Chat', path: '/portal/analytics', icon: 'MessageSquareText', min_role: 'user' },
        { key: 'dashboards', label: 'Dashboards', path: '/portal/dashboards', icon: 'BarChart3', min_role: 'manager', scope: 'department' },
        { key: 'action-plans', label: 'Action Plans', path: '/portal/dashboards/action-plans', icon: 'ListChecks', min_role: 'admin' },
      ],
    },
    {
      tenant_id: tenantId,
      section_key: 'automation',
      label: 'Automation',
      sort_order: 3,
      items: [
        { key: 'automation', label: 'Automation', path: '/portal/admin/automation', icon: 'Zap', min_role: 'super_admin' },
      ],
    },
    {
      tenant_id: tenantId,
      section_key: 'admin',
      label: 'Admin',
      sort_order: 4,
      items: [
        { key: 'knowledge', label: 'Agent Knowledge', path: '/portal/admin/knowledge', icon: 'BookOpen', min_role: 'admin' },
        { key: 'agents', label: 'Agent Factory', path: '/portal/admin/agents', icon: 'Bot', min_role: 'admin' },
        { key: 'users', label: 'User Management', path: '/portal/admin/users', icon: 'UserCog', min_role: 'admin' },
        { key: 'role-templates', label: 'Role Templates', path: '/portal/admin/role-templates', icon: 'ShieldCheck', min_role: 'admin' },
        { key: 'tool-builder', label: 'Tool Builder', path: '/portal/tools/custom/builder', icon: 'Wrench', min_role: 'admin' },
        { key: 'connections', label: 'Connections', path: '/portal/admin/connections', icon: 'Cable', min_role: 'super_admin' },
        { key: 'settings', label: 'Settings', path: '/portal/admin/settings', icon: 'Settings', min_role: 'super_admin' },
      ],
    },
  ];

  const { data, error } = await supabase
    .from('tenant_nav_sections')
    .insert(sections)
    .select();

  if (error) throw new Error(`Failed to create nav sections: ${error.message}`);

  console.log(`[generateNavigation] Created ${data.length} nav sections for tenant ${tenantId}`);
  return { navSections: data };
}

/**
 * Seed the module registry for a tenant. Includes platform modules
 * (dashboards, analytics, tools, etc.) and one workspace module per department.
 */
export async function generateModuleRegistry(supabase, tenantId) {
  // Delete existing
  await supabase.from('tenant_module_registry').delete().eq('tenant_id', tenantId);

  // Fetch workspaces to create workspace modules
  const { data: workspaces } = await supabase
    .from('tenant_workspaces')
    .select('department_key, name, icon')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order');

  // Platform modules
  const platformModules = [
    {
      module_key: 'dashboards',
      label: 'Dashboards',
      description: 'Operational dashboards with KPI tracking',
      icon: 'BarChart3',
      module_type: 'platform',
      min_tier: 'melmac',
      pages: [
        { key: 'operations', label: 'Operations', path: '/portal/dashboards' },
        { key: 'labor', label: 'Labor', path: '/portal/dashboards/labor' },
        { key: 'quality', label: 'Quality', path: '/portal/dashboards/quality' },
        { key: 'timekeeping', label: 'Timekeeping', path: '/portal/dashboards/timekeeping' },
        { key: 'safety', label: 'Safety', path: '/portal/dashboards/safety' },
      ],
      sort_order: 0,
    },
    {
      module_key: 'analytics',
      label: 'Analytics',
      description: 'Conversational analytics agent for operational data',
      icon: 'MessageSquareText',
      module_type: 'platform',
      min_tier: 'melmac',
      pages: [{ key: 'chat', label: 'Analytics Chat', path: '/portal/analytics' }],
      actions: [{ key: 'askAnalytics', label: 'Ask Analytics Agent' }],
      sort_order: 1,
    },
    {
      module_key: 'tools',
      label: 'Tools',
      description: 'Document generation tools',
      icon: 'Wrench',
      module_type: 'platform',
      min_tier: 'orbit',
      sort_order: 2,
    },
    {
      module_key: 'actionPlans',
      label: 'Action Plans',
      description: 'AI-generated action plans from dashboard metrics',
      icon: 'ListChecks',
      module_type: 'platform',
      min_tier: 'orbit',
      pages: [{ key: 'action-plans', label: 'Action Plans', path: '/portal/dashboards/action-plans' }],
      actions: [{ key: 'generateActionPlan', label: 'Generate Action Plan' }],
      sort_order: 3,
    },
    {
      module_key: 'knowledge',
      label: 'Agent Knowledge',
      description: 'Company SOPs, documents, and agent knowledge',
      icon: 'BookOpen',
      module_type: 'platform',
      min_tier: 'orbit',
      sort_order: 4,
    },
    {
      module_key: 'automation',
      label: 'Automation Insights',
      description: 'AI-powered SOP analysis and automation roadmaps',
      icon: 'Zap',
      module_type: 'platform',
      min_tier: 'galaxy',
      sort_order: 5,
    },
    {
      module_key: 'rfpBuilder',
      label: 'RFP Response Builder',
      description: 'AI-powered RFP response management with curated Q&A library',
      icon: 'FileSearch',
      module_type: 'platform',
      min_tier: 'galaxy',
      sort_order: 6,
    },
  ];

  // Workspace modules (one per department)
  const workspaceModules = (workspaces || []).map((ws, i) => ({
    module_key: ws.department_key,
    label: ws.name,
    icon: ws.icon || 'ClipboardList',
    module_type: 'workspace',
    min_tier: 'galaxy',
    sort_order: 100 + i,
  }));

  // Capability-level modules
  const capabilityModules = [
    {
      module_key: 'agentChat',
      label: 'Agent Chat',
      description: 'Chat with workspace agents',
      module_type: 'platform',
      min_tier: 'orbit',
      sort_order: 200,
    },
    {
      module_key: 'customToolBuilder',
      label: 'Custom Tool Builder',
      description: 'Build custom tools',
      module_type: 'platform',
      min_tier: 'orbit',
      sort_order: 201,
    },
  ];

  const allModules = [...platformModules, ...workspaceModules, ...capabilityModules].map(m => ({
    tenant_id: tenantId,
    module_key: m.module_key,
    label: m.label,
    description: m.description || null,
    icon: m.icon || null,
    module_type: m.module_type,
    min_tier: m.min_tier,
    pages: m.pages || [],
    actions: m.actions || [],
    sort_order: m.sort_order,
  }));

  const { data, error } = await supabase
    .from('tenant_module_registry')
    .insert(allModules)
    .select();

  if (error) throw new Error(`Failed to create module registry: ${error.message}`);

  console.log(`[generateNavigation] Created ${data.length} module registry entries for tenant ${tenantId}`);
  return { moduleRegistry: data };
}
