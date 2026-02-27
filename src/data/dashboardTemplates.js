/**
 * Dashboard Configuration Templates
 *
 * Applied during tenant onboarding or from the Alf tenant detail page.
 * Each template provides configs for all 6 dashboards (home + 5 domains).
 * Domain dashboards use the same schema: { version, kpis, charts }.
 * Home uses: { version, heroMetrics, workspaceCards, sections }.
 *
 * Missing dashboard keys = tenant portal falls back to registry defaults.
 */

export const DASHBOARD_TEMPLATES = {
  'facility-services': {
    label: 'Facility Services',
    description: 'Janitorial, grounds, MEP — uses APC, TBI, VP terminology',
    configs: {
      home: {
        version: 1,
        heroMetrics: [
          { id: 'total_apc', label: 'Total Annual APC', icon: 'DollarSign', module: 'sales', format: 'currency', visible: true, order: 0 },
          { id: 'total_jobs', label: 'Total Job Count', icon: 'HardHat', module: 'ops', format: 'number', visible: true, order: 1 },
          { id: 'outstanding_ar', label: 'Outstanding AR', icon: 'Clock', module: 'finance', format: 'currency', visible: true, order: 2 },
          { id: 'contracts_expiring', label: 'Contracts Expiring (90d)', icon: 'FileText', module: 'sales', format: 'number', visible: true, order: 3 },
        ],
        workspaceCards: [
          { module: 'hr', visible: true, order: 0 },
          { module: 'finance', visible: true, order: 1 },
          { module: 'purchasing', visible: true, order: 2 },
          { module: 'sales', visible: true, order: 3 },
          { module: 'ops', visible: true, order: 4 },
        ],
        sections: {
          needsAttention: { visible: true, maxItems: 12 },
          agentActivity: { visible: true },
        },
      },
      operations: {
        version: 1,
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
        version: 1,
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
        version: 1,
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
      // timekeeping and safety use registry defaults (no overrides needed)
    },
  },

  'property-management': {
    label: 'Property Management',
    description: 'Commercial/residential property — Contract Value, Pending Invoices, Lease terms',
    configs: {
      home: {
        version: 1,
        heroMetrics: [
          { id: 'total_apc', label: 'Total Contract Value', icon: 'DollarSign', module: 'sales', format: 'currency', visible: true, order: 0 },
          { id: 'total_jobs', label: 'Properties Managed', icon: 'HardHat', module: 'ops', format: 'number', visible: true, order: 1 },
          { id: 'outstanding_ar', label: 'Pending Invoices', icon: 'Clock', module: 'finance', format: 'currency', visible: true, order: 2 },
          { id: 'contracts_expiring', label: 'Leases Expiring (90d)', icon: 'FileText', module: 'sales', format: 'number', visible: true, order: 3 },
        ],
        workspaceCards: [
          { module: 'hr', visible: true, order: 0 },
          { module: 'finance', visible: true, order: 1 },
          { module: 'ops', visible: true, order: 2 },
          { module: 'sales', visible: true, order: 3 },
          { module: 'purchasing', visible: true, order: 4 },
        ],
        sections: {
          needsAttention: { visible: true, maxItems: 10 },
          agentActivity: { visible: true },
        },
      },
      operations: {
        version: 1,
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
        version: 1,
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
    },
  },

  'default': {
    label: 'Default',
    description: 'Generic labels — Tickets, Budget, Audits. Good starting point for any industry.',
    configs: {
      // Empty configs = tenant portal uses registry defaults for everything
    },
  },
};

export const TEMPLATE_KEYS = Object.keys(DASHBOARD_TEMPLATES);

/**
 * Get the config payloads for a template.
 * Returns an object: { home: {...}, operations: {...}, ... }
 * Missing keys mean "use registry defaults" (no row written).
 */
export function getTemplateConfigs(templateKey) {
  const template = DASHBOARD_TEMPLATES[templateKey];
  if (!template) return {};
  return template.configs || {};
}
