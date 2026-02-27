/**
 * Module Capability Registry
 *
 * Canonical list of every module, its pages, and its agent actions.
 * Identical copy lives in aa-portal — keep them in sync.
 *
 * Pages map 1:1 to routes/components in the tenant portal.
 * Actions map 1:1 to agent action keys in agents/configs/*.js.
 */

export const MODULE_REGISTRY = {
  hr: {
    label: 'HR',
    description: 'Benefits, payroll, leave management, union calendars',
    icon: 'Users',
    pages: [
      { key: 'overview', label: 'Overview', path: '/hr', default: true },
      { key: 'benefits', label: 'Benefits', path: '/hr/benefits' },
      { key: 'pay-rates', label: 'Pay Rate Changes', path: '/hr/pay-rates' },
      { key: 'leave', label: 'Leave Management', path: '/hr/leave' },
      { key: 'unemployment', label: 'Unemployment', path: '/hr/unemployment' },
      { key: 'union-calendar', label: 'Union Calendar', path: '/hr/union-calendar' },
    ],
    actions: [
      { key: 'draftReminder', label: 'Draft Reminder Email' },
      { key: 'generateWinTeamUpdate', label: 'Generate WinTeam Update' },
      { key: 'checkUnionCompliance', label: 'Check Union Compliance' },
      { key: 'notifyOperations', label: 'Notify Operations' },
      { key: 'checkEligibility', label: 'Check Eligibility' },
      { key: 'sendReminder', label: 'Send Reminder' },
      { key: 'runEnrollmentAudit', label: 'Run Enrollment Audit' },
      { key: 'generateRateChangeBatch', label: 'Generate Rate Change Batch' },
      { key: 'askAgent', label: 'Ask HR Agent' },
    ],
  },
  finance: {
    label: 'Finance',
    description: 'AR, collections, budget tracking',
    icon: 'DollarSign',
    pages: [
      { key: 'overview', label: 'Overview', path: '/finance', default: true },
    ],
    actions: [
      { key: 'draftCollectionEmail', label: 'Draft Collection Email' },
      { key: 'summarizeAccount', label: 'Summarize Account' },
    ],
  },
  purchasing: {
    label: 'Purchasing',
    description: 'Reorders, vendor management',
    icon: 'ShoppingCart',
    pages: [
      { key: 'overview', label: 'Overview', path: '/purchasing', default: true },
    ],
    actions: [
      { key: 'reorderAnalysis', label: 'Reorder Analysis' },
    ],
  },
  sales: {
    label: 'Sales',
    description: 'Contracts, renewals, pipeline management',
    icon: 'Briefcase',
    pages: [
      { key: 'overview', label: 'Overview', path: '/sales', default: true },
      { key: 'contracts', label: 'Contracts', path: '/sales/contracts' },
      { key: 'apc', label: 'APC Tracker', path: '/sales/apc' },
      { key: 'tbi', label: 'TBI Tracker', path: '/sales/tbi' },
    ],
    actions: [
      { key: 'renewalBrief', label: 'Generate Renewal Brief' },
      { key: 'apcVarianceAnalysis', label: 'APC Variance Analysis' },
      { key: 'tbiSummary', label: 'TBI Summary Report' },
      { key: 'pipelineSummary', label: 'Pipeline Summary' },
      { key: 'askAgent', label: 'Ask Sales Agent' },
    ],
  },
  ops: {
    label: 'Operations',
    description: 'Inspections, KPIs, incidents',
    icon: 'ClipboardCheck',
    pages: [
      { key: 'overview', label: 'Overview', path: '/ops', default: true },
    ],
    actions: [
      { key: 'vpPerformanceSummary', label: 'VP Performance Summary' },
      { key: 'inspectionAnalysis', label: 'Inspection Analysis' },
      { key: 'askAgent', label: 'Ask Operations Agent' },
    ],
  },
  qbu: {
    label: 'QBU Builder',
    description: 'Quarterly business update decks',
    icon: 'FileBarChart',
    pages: [
      { key: 'builder', label: 'QBU Builder', path: '/tools/qbu', default: true },
    ],
    actions: [
      { key: 'generateQBU', label: 'Generate QBU' },
    ],
  },
  salesDeck: {
    label: 'Sales Deck',
    description: 'Sales presentation builder',
    icon: 'Presentation',
    pages: [
      { key: 'builder', label: 'Sales Deck Builder', path: '/tools/sales-deck', default: true },
    ],
    actions: [
      { key: 'generateDeck', label: 'Generate Sales Deck' },
    ],
  },
  automation: {
    label: 'Automation Insights',
    description: 'AI-powered SOP analysis and automation roadmaps',
    icon: 'Zap',
    pages: [
      { key: 'insights', label: 'Automation Insights', path: '/admin/automation', default: true },
    ],
    actions: [
      { key: 'selfServicePipeline', label: 'Self-Service Analysis Pipeline' },
    ],
  },
  dashboards: {
    label: 'Dashboards',
    description: 'Operational dashboards with KPI tracking and action plans',
    icon: 'BarChart3',
    pages: [
      { key: 'operations', label: 'Operations', path: '/dashboards', default: true },
      { key: 'labor', label: 'Labor', path: '/dashboards/labor' },
      { key: 'quality', label: 'Quality', path: '/dashboards/quality' },
      { key: 'timekeeping', label: 'Timekeeping', path: '/dashboards/timekeeping' },
      { key: 'safety', label: 'Safety', path: '/dashboards/safety' },
      { key: 'action-plans', label: 'Action Plans', path: '/dashboards/action-plans' },
    ],
    actions: [
      { key: 'generateActionPlan', label: 'Generate Action Plan' },
    ],
  },
};

/**
 * Returns a full config object for a single module (all pages + actions enabled).
 * Used when toggling a module ON — gives everything by default.
 */
export function fullModuleConfig(moduleKey) {
  const mod = MODULE_REGISTRY[moduleKey];
  if (!mod) return null;
  return {
    pages: mod.pages.map((p) => p.key),
    actions: mod.actions.map((a) => a.key),
  };
}

/**
 * Returns a full platform config with all modules and all capabilities enabled.
 * Used for seeding or "give everything" scenarios.
 */
export function fullPlatformConfig() {
  const config = {};
  for (const key of Object.keys(MODULE_REGISTRY)) {
    config[key] = fullModuleConfig(key);
  }
  return config;
}
