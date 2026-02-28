/**
 * Module Capability Registry
 *
 * Canonical list of every module, its pages, and its agent actions.
 * Identical copy lives in alf-platform — keep them in sync.
 *
 * Pages map 1:1 to routes/components in the tenant portal.
 * Actions map 1:1 to agent action keys in agents/configs/*.js.
 */

export const MODULE_REGISTRY = {
  // ── Dashboards & Analytics ──────────────────────────────
  dashboards: {
    label: 'Dashboards',
    description: 'Operational dashboards with KPI tracking',
    icon: 'BarChart3',
    pages: [
      { key: 'operations', label: 'Operations', path: '/dashboards', default: true },
      { key: 'labor', label: 'Labor', path: '/dashboards/labor' },
      { key: 'quality', label: 'Quality', path: '/dashboards/quality' },
      { key: 'timekeeping', label: 'Timekeeping', path: '/dashboards/timekeeping' },
      { key: 'safety', label: 'Safety', path: '/dashboards/safety' },
    ],
    actions: [],
  },
  analytics: {
    label: 'Analytics',
    description: 'Conversational analytics agent for operational data',
    icon: 'MessageSquareText',
    pages: [
      { key: 'chat', label: 'Analytics Chat', path: '/analytics', default: true },
    ],
    actions: [
      { key: 'askAnalytics', label: 'Ask Analytics Agent' },
    ],
  },

  // ── Tools ───────────────────────────────────────────────
  tools: {
    label: 'Tools',
    description: 'Document generation tools — reviews, proposals, plans, reports',
    icon: 'Wrench',
    pages: [
      { key: 'quarterly-review', label: 'Quarterly Review Builder', path: '/tools/qbu' },
      { key: 'proposal', label: 'Proposal Builder', path: '/tools/sales-deck' },
      { key: 'transition-plan', label: 'Transition Plan Builder', path: '/tools/transition-plan' },
      { key: 'budget', label: 'Budget Builder', path: '/tools/budget' },
      { key: 'incident-report', label: 'Incident Report', path: '/tools/incident-report' },
      { key: 'training-plan', label: 'Training Plan', path: '/tools/training-plan' },
    ],
    actions: [
      { key: 'generateQBU', label: 'Generate Quarterly Review' },
      { key: 'generateDeck', label: 'Generate Proposal' },
      { key: 'generateTransitionPlan', label: 'Generate Transition Plan' },
      { key: 'generateBudget', label: 'Generate Budget' },
      { key: 'generateIncidentReport', label: 'Generate Incident Report' },
      { key: 'generateTrainingPlan', label: 'Generate Training Plan' },
    ],
  },
  actionPlans: {
    label: 'Action Plans',
    description: 'AI-generated action plans from dashboard metrics',
    icon: 'ListChecks',
    pages: [
      { key: 'action-plans', label: 'Action Plans', path: '/dashboards/action-plans', default: true },
    ],
    actions: [
      { key: 'generateActionPlan', label: 'Generate Action Plan' },
    ],
  },
  knowledge: {
    label: 'Knowledge Base',
    description: 'Company SOPs, documents, and agent knowledge',
    icon: 'BookOpen',
    pages: [
      { key: 'library', label: 'Knowledge Base', path: '/admin/knowledge', default: true },
    ],
    actions: [],
  },

  // ── Workspaces ──────────────────────────────────────────
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
      { key: 'generateSystemUpdate', label: 'Generate System Update' },
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

  // ── Admin / Platform ────────────────────────────────────
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

  // Legacy module keys — kept for backward compatibility with existing DB records.
  // The "tools" umbrella module now gates all tool pages. These entries exist only
  // so that old module_config JSONB that references "qbu" or "salesDeck" doesn't
  // break. New tenants should use the "tools" module instead.
  qbu: {
    label: 'Quarterly Review Builder',
    description: 'Quarterly business review decks (legacy key — use "tools" module)',
    icon: 'FileBarChart',
    pages: [
      { key: 'builder', label: 'Quarterly Review Builder', path: '/tools/qbu', default: true },
    ],
    actions: [
      { key: 'generateQBU', label: 'Generate Quarterly Review' },
    ],
  },
  salesDeck: {
    label: 'Proposal Builder',
    description: 'Prospect proposal decks (legacy key — use "tools" module)',
    icon: 'Presentation',
    pages: [
      { key: 'builder', label: 'Proposal Builder', path: '/tools/sales-deck', default: true },
    ],
    actions: [
      { key: 'generateDeck', label: 'Generate Proposal' },
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
