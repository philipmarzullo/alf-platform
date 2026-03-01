/**
 * Dashboard Domain Generation Engine
 *
 * Generates tenant_dashboard_domains from a tenant's company profile
 * and workspace structure. Each department maps to one or more
 * dashboard domains with industry-aware KPI definitions.
 *
 * Two modes:
 *   - generateDashboardDomains() — full rebuild (idempotent)
 *   - regenerateDashboardDomainKpis() — non-destructive KPI refresh
 */

import { buildCompanyContext } from './generatePortal.js';

// ─── Department → Dashboard Domain Mapping ──────────────

const DEPT_TO_DOMAINS = {
  operations: ['operations', 'quality'],
  hr:         ['labor', 'timekeeping'],
  safety:     ['safety'],
  fleet:      ['fleet'],
  dispatch:   ['routes'],
  warehouse:  ['warehouse'],
  compliance: ['compliance'],
  // finance, sales, purchasing — no direct dashboard domains
};

// ─── Domain Metadata ────────────────────────────────────

const DOMAIN_META = {
  operations:  { name: 'Operations',  icon: 'clipboard-list', sort_order: 0 },
  labor:       { name: 'Labor',       icon: 'users',          sort_order: 1 },
  quality:     { name: 'Quality',     icon: 'search',         sort_order: 2 },
  timekeeping: { name: 'Timekeeping', icon: 'clock',          sort_order: 3 },
  safety:      { name: 'Safety',      icon: 'shield',         sort_order: 4 },
  fleet:       { name: 'Fleet',       icon: 'truck',          sort_order: 5 },
  routes:      { name: 'Routes',      icon: 'map',            sort_order: 6 },
  warehouse:   { name: 'Warehouse',   icon: 'warehouse',      sort_order: 7 },
  compliance:  { name: 'Compliance',  icon: 'file-check',     sort_order: 8 },
};

// ─── Industry-Aware KPI Definitions ─────────────────────

const INDUSTRY_LABELS = {
  'Facility Services': {
    operations: {
      description: 'Work order tracking, completion rates, and service delivery metrics',
      kpis: [
        { id: 'total_tickets', label: 'Total Work Orders', icon: 'ClipboardList', visible: true, order: 0 },
        { id: 'completed', label: 'Completed', icon: 'CheckCircle', visible: true, order: 1 },
        { id: 'completion_rate', label: 'Completion Rate', icon: 'TrendingUp', visible: true, order: 2 },
        { id: 'open_tickets', label: 'Open Work Orders', icon: 'Clock', visible: true, order: 3 },
      ],
      charts: [
        { id: 'tickets_by_site', label: 'Work Orders by Site', visible: true, order: 0 },
        { id: 'monthly_trend', label: 'Monthly Trend', visible: true, order: 1 },
        { id: 'category_breakdown', label: 'Category Breakdown', visible: true, order: 2 },
      ],
    },
    labor: {
      description: 'Workforce budget tracking, actual spend, and overtime analysis',
      kpis: [
        { id: 'budget', label: 'Budget', icon: 'DollarSign', visible: true, order: 0 },
        { id: 'actual', label: 'Actual', icon: 'DollarSign', visible: true, order: 1 },
        { id: 'variance', label: 'Variance', icon: 'AlertTriangle', visible: true, order: 2 },
        { id: 'ot_hours', label: 'OT Hours', icon: 'Clock', visible: true, order: 3 },
      ],
      charts: [
        { id: 'budget_vs_actual_by_site', label: 'Budget vs Actual by Site', visible: true, order: 0 },
        { id: 'variance_trend', label: 'Variance Trend (%)', visible: true, order: 1 },
        { id: 'ot_spend_by_site', label: 'OT Spend by Site', visible: true, order: 2 },
      ],
    },
    quality: {
      description: 'Inspection scores, corrective actions, and quality trends',
      kpis: [
        { id: 'total_audits', label: 'Total Inspections', icon: 'Search', visible: true, order: 0 },
        { id: 'corrective_actions', label: 'Corrective Actions', icon: 'AlertCircle', visible: true, order: 1 },
        { id: 'ca_to_audit_ratio', label: 'CA-to-Inspection Ratio', icon: 'BarChart3', visible: true, order: 2 },
        { id: 'qoq_change', label: 'QoQ Change', icon: 'TrendingUp', visible: true, order: 3 },
      ],
      charts: [
        { id: 'audits_by_quarter', label: 'Inspections by Quarter', visible: true, order: 0 },
        { id: 'corrective_actions_trend', label: 'Corrective Actions Trend', visible: true, order: 1 },
      ],
    },
    timekeeping: {
      description: 'Attendance tracking, schedule adherence, and call-off rates',
      kpis: [
        { id: 'total_entries', label: 'Total Entries', icon: 'Clock', visible: true, order: 0 },
        { id: 'on_time_rate', label: 'On-Time Rate', icon: 'CheckCircle', visible: true, order: 1 },
        { id: 'call_offs', label: 'Call-Offs', icon: 'PhoneOff', visible: true, order: 2 },
        { id: 'avg_hours', label: 'Avg Hours/Week', icon: 'BarChart3', visible: true, order: 3 },
      ],
      charts: [
        { id: 'attendance_by_site', label: 'Attendance by Site', visible: true, order: 0 },
        { id: 'call_off_trend', label: 'Call-Off Trend', visible: true, order: 1 },
      ],
    },
    safety: {
      description: 'Incident tracking, near misses, and safety compliance',
      kpis: [
        { id: 'total_incidents', label: 'Total Incidents', icon: 'AlertTriangle', visible: true, order: 0 },
        { id: 'near_misses', label: 'Near Misses', icon: 'Eye', visible: true, order: 1 },
        { id: 'days_without', label: 'Days Without Incident', icon: 'Shield', visible: true, order: 2 },
        { id: 'severity_rate', label: 'Severity Rate', icon: 'Activity', visible: true, order: 3 },
      ],
      charts: [
        { id: 'incidents_by_type', label: 'Incidents by Type', visible: true, order: 0 },
        { id: 'incident_trend', label: 'Incident Trend', visible: true, order: 1 },
      ],
    },
  },

  'Integrated FM': {
    // Alias — same labels as Facility Services
  },

  'Property Management': {
    operations: {
      description: 'Maintenance request tracking, resolution rates, and property operations',
      kpis: [
        { id: 'total_tickets', label: 'Maintenance Requests', icon: 'ClipboardList', visible: true, order: 0 },
        { id: 'completed', label: 'Resolved', icon: 'CheckCircle', visible: true, order: 1 },
        { id: 'completion_rate', label: 'Resolution Rate', icon: 'TrendingUp', visible: true, order: 2 },
        { id: 'open_tickets', label: 'Open Requests', icon: 'Clock', visible: true, order: 3 },
      ],
      charts: [
        { id: 'tickets_by_site', label: 'Requests by Property', visible: true, order: 0 },
        { id: 'monthly_trend', label: 'Monthly Trend', visible: true, order: 1 },
        { id: 'category_breakdown', label: 'Category Breakdown', visible: true, order: 2 },
      ],
    },
    labor: {
      description: 'Staffing budget, actual spend, and overtime by property',
      kpis: [
        { id: 'budget', label: 'Staffing Budget', icon: 'DollarSign', visible: true, order: 0 },
        { id: 'actual', label: 'Actual Spend', icon: 'DollarSign', visible: true, order: 1 },
        { id: 'variance', label: 'Variance', icon: 'AlertTriangle', visible: true, order: 2 },
        { id: 'ot_hours', label: 'Overtime Hours', icon: 'Clock', visible: true, order: 3 },
      ],
      charts: [
        { id: 'budget_vs_actual_by_site', label: 'Budget vs Actual by Property', visible: true, order: 0 },
        { id: 'variance_trend', label: 'Variance Trend (%)', visible: true, order: 1 },
        { id: 'ot_spend_by_site', label: 'OT by Property', visible: true, order: 2 },
      ],
    },
    quality: {
      description: 'Property inspections, corrective actions, and compliance scores',
      kpis: [
        { id: 'total_audits', label: 'Property Inspections', icon: 'Search', visible: true, order: 0 },
        { id: 'corrective_actions', label: 'Corrective Actions', icon: 'AlertCircle', visible: true, order: 1 },
        { id: 'ca_to_audit_ratio', label: 'CA-to-Inspection Ratio', icon: 'BarChart3', visible: true, order: 2 },
        { id: 'qoq_change', label: 'QoQ Change', icon: 'TrendingUp', visible: true, order: 3 },
      ],
      charts: [
        { id: 'audits_by_quarter', label: 'Inspections by Quarter', visible: true, order: 0 },
        { id: 'corrective_actions_trend', label: 'Corrective Actions Trend', visible: true, order: 1 },
      ],
    },
    timekeeping: {
      description: 'Attendance tracking, schedule adherence, and staffing coverage',
      kpis: [
        { id: 'total_entries', label: 'Total Entries', icon: 'Clock', visible: true, order: 0 },
        { id: 'on_time_rate', label: 'On-Time Rate', icon: 'CheckCircle', visible: true, order: 1 },
        { id: 'call_offs', label: 'Call-Offs', icon: 'PhoneOff', visible: true, order: 2 },
        { id: 'avg_hours', label: 'Avg Hours/Week', icon: 'BarChart3', visible: true, order: 3 },
      ],
      charts: [
        { id: 'attendance_by_site', label: 'Attendance by Property', visible: true, order: 0 },
        { id: 'call_off_trend', label: 'Call-Off Trend', visible: true, order: 1 },
      ],
    },
    safety: {
      description: 'Incident tracking, liability management, and safety compliance',
      kpis: [
        { id: 'total_incidents', label: 'Total Incidents', icon: 'AlertTriangle', visible: true, order: 0 },
        { id: 'near_misses', label: 'Near Misses', icon: 'Eye', visible: true, order: 1 },
        { id: 'days_without', label: 'Days Without Incident', icon: 'Shield', visible: true, order: 2 },
        { id: 'severity_rate', label: 'Severity Rate', icon: 'Activity', visible: true, order: 3 },
      ],
      charts: [
        { id: 'incidents_by_type', label: 'Incidents by Type', visible: true, order: 0 },
        { id: 'incident_trend', label: 'Incident Trend', visible: true, order: 1 },
      ],
    },
  },
};

// Default KPI definitions for domains not covered by industry-specific labels
const DEFAULT_DOMAIN_KPIS = {
  operations: {
    description: 'Ticket tracking, completion rates, and operational metrics',
    kpis: [
      { id: 'total_tickets', label: 'Total Tickets', icon: 'ClipboardList', visible: true, order: 0 },
      { id: 'completed', label: 'Completed', icon: 'CheckCircle', visible: true, order: 1 },
      { id: 'completion_rate', label: 'Completion Rate', icon: 'TrendingUp', visible: true, order: 2 },
      { id: 'open_tickets', label: 'Open Tickets', icon: 'Clock', visible: true, order: 3 },
    ],
    charts: [
      { id: 'tickets_by_site', label: 'Tickets by Site', visible: true, order: 0 },
      { id: 'monthly_trend', label: 'Monthly Trend', visible: true, order: 1 },
      { id: 'category_breakdown', label: 'Category Breakdown', visible: true, order: 2 },
    ],
  },
  labor: {
    description: 'Budget tracking, actual spend, and overtime analysis',
    kpis: [
      { id: 'budget', label: 'Budget', icon: 'DollarSign', visible: true, order: 0 },
      { id: 'actual', label: 'Actual', icon: 'DollarSign', visible: true, order: 1 },
      { id: 'variance', label: 'Variance', icon: 'AlertTriangle', visible: true, order: 2 },
      { id: 'ot_hours', label: 'OT Hours', icon: 'Clock', visible: true, order: 3 },
    ],
    charts: [
      { id: 'budget_vs_actual_by_site', label: 'Budget vs Actual by Site', visible: true, order: 0 },
      { id: 'variance_trend', label: 'Variance Trend (%)', visible: true, order: 1 },
      { id: 'ot_spend_by_site', label: 'OT Spend by Site', visible: true, order: 2 },
    ],
  },
  quality: {
    description: 'Audit scores, corrective actions, and quality trends',
    kpis: [
      { id: 'total_audits', label: 'Total Audits', icon: 'Search', visible: true, order: 0 },
      { id: 'corrective_actions', label: 'Corrective Actions', icon: 'AlertCircle', visible: true, order: 1 },
      { id: 'ca_to_audit_ratio', label: 'CA-to-Audit Ratio', icon: 'BarChart3', visible: true, order: 2 },
      { id: 'qoq_change', label: 'QoQ Change', icon: 'TrendingUp', visible: true, order: 3 },
    ],
    charts: [
      { id: 'audits_by_quarter', label: 'Audits by Quarter', visible: true, order: 0 },
      { id: 'corrective_actions_trend', label: 'Corrective Actions Trend', visible: true, order: 1 },
    ],
  },
  timekeeping: {
    description: 'Attendance tracking, schedule adherence, and call-off rates',
    kpis: [
      { id: 'total_entries', label: 'Total Entries', icon: 'Clock', visible: true, order: 0 },
      { id: 'on_time_rate', label: 'On-Time Rate', icon: 'CheckCircle', visible: true, order: 1 },
      { id: 'call_offs', label: 'Call-Offs', icon: 'PhoneOff', visible: true, order: 2 },
      { id: 'avg_hours', label: 'Avg Hours/Week', icon: 'BarChart3', visible: true, order: 3 },
    ],
    charts: [
      { id: 'attendance_by_site', label: 'Attendance by Site', visible: true, order: 0 },
      { id: 'call_off_trend', label: 'Call-Off Trend', visible: true, order: 1 },
    ],
  },
  safety: {
    description: 'Incident tracking, near misses, and safety compliance',
    kpis: [
      { id: 'total_incidents', label: 'Total Incidents', icon: 'AlertTriangle', visible: true, order: 0 },
      { id: 'near_misses', label: 'Near Misses', icon: 'Eye', visible: true, order: 1 },
      { id: 'days_without', label: 'Days Without Incident', icon: 'Shield', visible: true, order: 2 },
      { id: 'severity_rate', label: 'Severity Rate', icon: 'Activity', visible: true, order: 3 },
    ],
    charts: [
      { id: 'incidents_by_type', label: 'Incidents by Type', visible: true, order: 0 },
      { id: 'incident_trend', label: 'Incident Trend', visible: true, order: 1 },
    ],
  },
  fleet: {
    description: 'Vehicle utilization, maintenance schedules, and fleet costs',
    kpis: [
      { id: 'total_vehicles', label: 'Total Vehicles', icon: 'Truck', visible: true, order: 0 },
      { id: 'active_vehicles', label: 'Active', icon: 'CheckCircle', visible: true, order: 1 },
      { id: 'maintenance_due', label: 'Maintenance Due', icon: 'Wrench', visible: true, order: 2 },
      { id: 'utilization_rate', label: 'Utilization Rate', icon: 'TrendingUp', visible: true, order: 3 },
    ],
    charts: [
      { id: 'fleet_by_status', label: 'Fleet by Status', visible: true, order: 0 },
      { id: 'maintenance_trend', label: 'Maintenance Trend', visible: true, order: 1 },
    ],
  },
  routes: {
    description: 'Route efficiency, on-time delivery, and dispatch metrics',
    kpis: [
      { id: 'total_routes', label: 'Total Routes', icon: 'Map', visible: true, order: 0 },
      { id: 'on_time_delivery', label: 'On-Time Delivery', icon: 'CheckCircle', visible: true, order: 1 },
      { id: 'avg_stops', label: 'Avg Stops/Route', icon: 'MapPin', visible: true, order: 2 },
      { id: 'route_efficiency', label: 'Route Efficiency', icon: 'TrendingUp', visible: true, order: 3 },
    ],
    charts: [
      { id: 'routes_by_region', label: 'Routes by Region', visible: true, order: 0 },
      { id: 'delivery_trend', label: 'Delivery Trend', visible: true, order: 1 },
    ],
  },
  warehouse: {
    description: 'Inventory levels, order fulfillment, and warehouse operations',
    kpis: [
      { id: 'total_skus', label: 'Total SKUs', icon: 'Package', visible: true, order: 0 },
      { id: 'fill_rate', label: 'Fill Rate', icon: 'CheckCircle', visible: true, order: 1 },
      { id: 'orders_pending', label: 'Orders Pending', icon: 'Clock', visible: true, order: 2 },
      { id: 'inventory_turns', label: 'Inventory Turns', icon: 'RefreshCw', visible: true, order: 3 },
    ],
    charts: [
      { id: 'inventory_by_category', label: 'Inventory by Category', visible: true, order: 0 },
      { id: 'fulfillment_trend', label: 'Fulfillment Trend', visible: true, order: 1 },
    ],
  },
  compliance: {
    description: 'Regulatory compliance, certifications, and audit readiness',
    kpis: [
      { id: 'total_requirements', label: 'Total Requirements', icon: 'FileCheck', visible: true, order: 0 },
      { id: 'compliant', label: 'Compliant', icon: 'CheckCircle', visible: true, order: 1 },
      { id: 'expiring_soon', label: 'Expiring Soon', icon: 'AlertTriangle', visible: true, order: 2 },
      { id: 'compliance_rate', label: 'Compliance Rate', icon: 'TrendingUp', visible: true, order: 3 },
    ],
    charts: [
      { id: 'compliance_by_category', label: 'Compliance by Category', visible: true, order: 0 },
      { id: 'compliance_trend', label: 'Compliance Trend', visible: true, order: 1 },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────

/**
 * Get industry-specific KPI definitions for a domain.
 * Falls back to default labels if industry isn't mapped.
 */
function getKpiDefinitions(industry, domainKey) {
  // Check for industry-specific labels
  let industryMap = INDUSTRY_LABELS[industry];

  // Integrated FM uses Facility Services labels
  if (!industryMap && industry === 'Integrated FM') {
    industryMap = INDUSTRY_LABELS['Facility Services'];
  }

  const domainDef = industryMap?.[domainKey] || DEFAULT_DOMAIN_KPIS[domainKey];

  if (!domainDef) {
    return { kpis: [], charts: [] };
  }

  return {
    kpis: domainDef.kpis || [],
    charts: domainDef.charts || [],
  };
}

/**
 * Get domain description — industry-specific if available, else default.
 */
function getDomainDescription(industry, domainKey) {
  let industryMap = INDUSTRY_LABELS[industry];
  if (!industryMap && industry === 'Integrated FM') {
    industryMap = INDUSTRY_LABELS['Facility Services'];
  }
  return industryMap?.[domainKey]?.description
    || DEFAULT_DOMAIN_KPIS[domainKey]?.description
    || '';
}

// ─── Exported Functions ─────────────────────────────────

/**
 * Full rebuild — deletes existing dashboard domains and regenerates
 * from profile + workspaces. Also populates the dashboard_domains
 * column on each tenant_workspace.
 * Returns { domains }.
 */
export async function generateDashboardDomains(supabase, tenantId) {
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
      .select('id, department_key, name')
      .eq('tenant_id', tenantId),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);
  if (tenantRes.error) throw new Error(`Tenant not found: ${tenantRes.error.message}`);

  const profile = profileRes.data;
  const industry = profile.industry || '';
  const workspaces = wsRes.data || [];

  if (workspaces.length === 0) {
    throw new Error('No workspaces found — generate workspaces first');
  }

  // 2. Delete existing dashboard domains (idempotent rebuild)
  await supabase.from('tenant_dashboard_domains').delete().eq('tenant_id', tenantId);

  // 3. Walk workspaces and map department_key → domain(s)
  //    Track which workspace IDs feed each domain
  const domainSources = {}; // domainKey → Set of workspace ids
  const wsDomainsMap = {};  // workspaceId → array of domain keys

  for (const ws of workspaces) {
    const domains = DEPT_TO_DOMAINS[ws.department_key] || [];
    wsDomainsMap[ws.id] = domains;

    for (const dk of domains) {
      if (!domainSources[dk]) domainSources[dk] = new Set();
      domainSources[dk].add(ws.id);
    }
  }

  // 4. Build domain rows
  const domainRows = Object.entries(domainSources).map(([domainKey, wsIdSet]) => {
    const meta = DOMAIN_META[domainKey] || { name: domainKey, icon: 'layout-dashboard', sort_order: 99 };
    const kpiDefs = getKpiDefinitions(industry, domainKey);
    const description = getDomainDescription(industry, domainKey);

    return {
      tenant_id: tenantId,
      domain_key: domainKey,
      name: meta.name,
      description,
      icon: meta.icon,
      kpi_definitions: kpiDefs,
      source_workspace_ids: [...wsIdSet],
      sort_order: meta.sort_order,
    };
  });

  // Sort by sort_order before insert
  domainRows.sort((a, b) => a.sort_order - b.sort_order);

  // 5. Insert domain rows
  const { data: domains, error } = await supabase
    .from('tenant_dashboard_domains')
    .insert(domainRows)
    .select();

  if (error) throw new Error(`Failed to create dashboard domains: ${error.message}`);

  // 6. Update workspace dashboard_domains columns
  const wsUpdates = workspaces.map((ws) => {
    const wsDomains = wsDomainsMap[ws.id] || [];
    return supabase
      .from('tenant_workspaces')
      .update({ dashboard_domains: wsDomains })
      .eq('id', ws.id);
  });

  await Promise.all(wsUpdates);

  return { domains: domains || [] };
}

/**
 * Non-destructive — only updates kpi_definitions, description,
 * and source_workspace_ids on existing domains. Preserves
 * is_active toggles, name edits, and sort_order changes.
 * Returns { domains }.
 */
export async function regenerateDashboardDomainKpis(supabase, tenantId) {
  // Fetch profile + tenant + existing domains + workspaces
  const [profileRes, tenantRes, domainsRes, wsRes] = await Promise.all([
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
      .from('tenant_dashboard_domains')
      .select('*')
      .eq('tenant_id', tenantId),
    supabase
      .from('tenant_workspaces')
      .select('id, department_key')
      .eq('tenant_id', tenantId),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);
  if (tenantRes.error) throw new Error(`Tenant not found: ${tenantRes.error.message}`);

  const profile = profileRes.data;
  const industry = profile.industry || '';
  const existingDomains = domainsRes.data || [];
  const workspaces = wsRes.data || [];

  // Rebuild source workspace mapping
  const domainSources = {};
  for (const ws of workspaces) {
    const domains = DEPT_TO_DOMAINS[ws.department_key] || [];
    for (const dk of domains) {
      if (!domainSources[dk]) domainSources[dk] = new Set();
      domainSources[dk].add(ws.id);
    }
  }

  // Update each existing domain's KPI definitions and description
  const updates = existingDomains.map((domain) => {
    const kpiDefs = getKpiDefinitions(industry, domain.domain_key);
    const description = getDomainDescription(industry, domain.domain_key);
    const sourceIds = domainSources[domain.domain_key]
      ? [...domainSources[domain.domain_key]]
      : domain.source_workspace_ids;

    return supabase
      .from('tenant_dashboard_domains')
      .update({
        kpi_definitions: kpiDefs,
        description,
        source_workspace_ids: sourceIds,
      })
      .eq('id', domain.id);
  });

  await Promise.all(updates);

  // Return refreshed domains
  const { data: refreshed } = await supabase
    .from('tenant_dashboard_domains')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');

  return { domains: refreshed || [] };
}
