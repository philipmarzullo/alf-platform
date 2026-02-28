import { hrAgent } from './configs/hr';
import { financeAgent } from './configs/finance';
import { purchasingAgent } from './configs/purchasing';
import { qbuAgent } from './configs/qbu';
import { salesDeckAgent } from './configs/salesDeck';
import { salesAgent } from './configs/sales';
import { opsAgent } from './configs/ops';
import { adminAgent } from './configs/admin';
import { actionPlanAgent } from './configs/actionPlan';
import { transitionPlanAgent } from './configs/transitionPlan';
import { budgetAgent } from './configs/budget';
import { incidentReportAgent } from './configs/incidentReport';
import { trainingPlanAgent } from './configs/trainingPlan';
import { analyticsAgent } from './configs/analytics';
import { alfPlatformAgent } from './configs/alfPlatform';
import { mergeOverride } from './overrides';

const agents = {
  hr: hrAgent,
  finance: financeAgent,
  purchasing: purchasingAgent,
  sales: salesAgent,
  ops: opsAgent,
  admin: adminAgent,
  qbu: qbuAgent,
  salesDeck: salesDeckAgent,
  actionPlan: actionPlanAgent,
  transitionPlan: transitionPlanAgent,
  budget: budgetAgent,
  incidentReport: incidentReportAgent,
  trainingPlan: trainingPlanAgent,
  analytics: analyticsAgent,
  alfPlatform: alfPlatformAgent,
};

/** Returns the agent config with any localStorage overrides merged in.
 *  If tenantContext is provided, prepends company name to system prompt. */
export function getAgent(agentKey, tenantContext) {
  const source = agents[agentKey];
  if (!source) return null;
  const merged = mergeOverride(source, agentKey);
  if (tenantContext?.companyName) {
    merged.systemPrompt = `You are working for ${tenantContext.companyName}. ` + merged.systemPrompt;
  }
  return merged;
}

/** Returns the original source-code config, ignoring overrides. */
export function getSourceAgentConfig(agentKey) {
  return agents[agentKey] || null;
}

export function getAgentAction(agentKey, actionKey, tenantContext) {
  const agent = getAgent(agentKey, tenantContext);
  if (!agent) return null;
  return agent.actions[actionKey] || null;
}

export function getAllAgents() {
  return Object.entries(agents).map(([key, config]) => ({
    key,
    ...mergeOverride(config, key),
  }));
}

/** Returns all agents with source-code defaults (no overrides). */
export function getAllSourceAgents() {
  return Object.entries(agents).map(([key, config]) => ({
    key,
    ...config,
  }));
}

export default agents;
