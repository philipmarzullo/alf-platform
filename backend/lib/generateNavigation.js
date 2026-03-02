/**
 * Navigation & Module Registry Generation
 *
 * Seeds tenant_nav_sections and tenant_module_registry for a tenant.
 * Called during full portal generation (generateAll.js).
 */

/**
 * Seed the three static nav sections (command-center, analytics, admin)
 * for a tenant. Workspaces and Tools groups remain built dynamically
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
        { key: 'home', label: 'Command Center', path: '/portal', icon: 'LayoutDashboard' },
      ],
    },
    {
      tenant_id: tenantId,
      section_key: 'analytics',
      label: 'Analytics',
      sort_order: 1,
      items: [
        { key: 'dashboards', label: 'Dashboards', path: '/portal/dashboards', icon: 'BarChart3', module_key: 'dashboards' },
        { key: 'action-plans', label: 'Action Plans', path: '/portal/dashboards/action-plans', icon: 'ListChecks', module_key: 'actionPlans' },
        { key: 'analytics-chat', label: 'Analytics Chat', path: '/portal/analytics', icon: 'MessageSquareText', module_key: 'analytics' },
      ],
    },
    {
      tenant_id: tenantId,
      section_key: 'automation',
      label: 'Automation',
      sort_order: 3,
      items: [
        { key: 'automation', label: 'Automation Insights', path: '/portal/admin/automation', icon: 'Zap', module_key: 'automation' },
        { key: 'sop-builder', label: 'SOP Builder', path: '/portal/tools/sop-builder', icon: 'FileText', module_key: 'automation' },
        { key: 'automation-preferences', label: 'Automation Preferences', path: '/portal/admin/automation-preferences', icon: 'SlidersHorizontal', module_key: 'automation', super_admin_only: true },
      ],
    },
    {
      tenant_id: tenantId,
      section_key: 'admin',
      label: 'Admin',
      sort_order: 4,
      items: [
        { key: 'users', label: 'User Management', path: '/portal/admin/users', icon: 'UserCog', module_key: 'admin', admin_only: true },
        { key: 'knowledge', label: 'Knowledge Base', path: '/portal/admin/knowledge', icon: 'BookOpen', module_key: 'knowledge' },
        { key: 'role-templates', label: 'Role Templates', path: '/portal/admin/role-templates', icon: 'ShieldCheck', module_key: 'admin', admin_only: true },
        { key: 'tool-builder', label: 'Tool Builder', path: '/portal/tools/custom/builder', icon: 'Wrench', module_key: 'admin', admin_only: true },
        { key: 'connections', label: 'Connections', path: '/portal/admin/connections', icon: 'Cable', super_admin_only: true },
        { key: 'settings', label: 'Settings', path: '/portal/admin/settings', icon: 'Settings', super_admin_only: true },
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
      label: 'Knowledge Base',
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
