import { hrAgent } from './configs/hr';
import { financeAgent } from './configs/finance';
import { purchasingAgent } from './configs/purchasing';
import { qbuAgent } from './configs/qbu';
import { salesDeckAgent } from './configs/salesDeck';
import { salesAgent } from './configs/sales';
import { opsAgent } from './configs/ops';
import { adminAgent } from './configs/admin';
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
  alfPlatform: alfPlatformAgent,
};

/** Returns the agent config with any localStorage overrides merged in. */
export function getAgent(agentKey) {
  const source = agents[agentKey];
  if (!source) return null;
  return mergeOverride(source, agentKey);
}

/** Returns the original source-code config, ignoring overrides. */
export function getSourceAgentConfig(agentKey) {
  return agents[agentKey] || null;
}

export function getAgentAction(agentKey, actionKey) {
  const agent = getAgent(agentKey);
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
