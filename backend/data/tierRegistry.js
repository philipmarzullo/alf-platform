/**
 * Backend Tier Registry
 *
 * Standalone Node ESM copy of the frontend tierRegistry + moduleRegistry.
 * The frontend version imports from moduleRegistry.js which has Vite/React
 * dependencies, so this is a self-contained backend equivalent.
 *
 * Tier ladder:
 *   Melmac  = Dashboards + Analytics
 *   Orbit   = + Tools + Action Plans + Knowledge Base
 *   Galaxy  = + Workspaces + Automation (full platform)
 *
 * Keep in sync with:
 *   alf-tenant-portal/src/data/tierRegistry.js
 *   alf-tenant-portal/src/data/moduleRegistry.js
 */

// ── Module page/action maps (inline from moduleRegistry) ────────────

const MODULE_PAGES = {
  dashboards: ['operations', 'labor', 'quality', 'timekeeping', 'safety'],
  analytics: ['chat'],
  tools: ['quarterly-review', 'proposal', 'transition-plan', 'budget', 'incident-report', 'training-plan'],
  actionPlans: ['action-plans'],
  knowledge: ['library'],
  hr: ['overview', 'benefits', 'pay-rates', 'leave', 'unemployment', 'union-calendar'],
  finance: ['overview'],
  purchasing: ['overview'],
  sales: ['overview', 'contracts', 'apc', 'tbi'],
  ops: ['overview'],
  automation: ['insights'],
};

const MODULE_ACTIONS = {
  dashboards: [],
  analytics: ['askAnalytics'],
  tools: ['generateQBU', 'generateDeck', 'generateTransitionPlan', 'generateBudget', 'generateIncidentReport', 'generateTrainingPlan'],
  actionPlans: ['generateActionPlan'],
  knowledge: [],
  hr: ['draftReminder', 'generateSystemUpdate', 'checkUnionCompliance', 'notifyOperations', 'checkEligibility', 'sendReminder', 'runEnrollmentAudit', 'generateRateChangeBatch', 'askAgent'],
  finance: ['draftCollectionEmail', 'summarizeAccount'],
  purchasing: ['reorderAnalysis'],
  sales: ['renewalBrief', 'apcVarianceAnalysis', 'tbiSummary', 'pipelineSummary', 'askAgent'],
  ops: ['vpPerformanceSummary', 'inspectionAnalysis', 'askAgent'],
  automation: ['selfServicePipeline'],
};

// ── Tier definitions ────────────────────────────────────────────────

export const TIER_REGISTRY = {
  melmac: {
    key: 'melmac',
    label: 'Melmac',
    modules: ['dashboards', 'analytics'],
    maxUsers: 10,
    maxAgentCalls: 1_000,
  },
  orbit: {
    key: 'orbit',
    label: 'Orbit',
    modules: ['dashboards', 'analytics', 'tools', 'actionPlans', 'knowledge'],
    maxUsers: 25,
    maxAgentCalls: 5_000,
  },
  galaxy: {
    key: 'galaxy',
    label: 'Galaxy',
    modules: [
      'dashboards', 'analytics', 'tools', 'actionPlans', 'knowledge',
      'hr', 'finance', 'purchasing', 'sales', 'ops', 'automation',
    ],
    maxUsers: 100,
    maxAgentCalls: 25_000,
  },
};

export const TIER_ORDER = { melmac: 0, orbit: 1, galaxy: 2 };

/**
 * Build a full config object for a single module (all pages + actions enabled).
 */
function fullModuleConfig(moduleKey) {
  return {
    pages: MODULE_PAGES[moduleKey] || [],
    actions: MODULE_ACTIONS[moduleKey] || [],
  };
}

/**
 * Returns full defaults for a tier: modules list, moduleConfig, maxUsers, maxAgentCalls.
 */
export function getTierDefaults(tierKey) {
  const tier = TIER_REGISTRY[tierKey];
  if (!tier) return null;

  const moduleConfig = {};
  for (const mod of tier.modules) {
    moduleConfig[mod] = fullModuleConfig(mod);
  }

  return {
    modules: [...tier.modules],
    moduleConfig,
    maxUsers: tier.maxUsers,
    maxAgentCalls: tier.maxAgentCalls,
  };
}
