/**
 * Tenant Tier Registry
 *
 * Defines Melmac / Orbit / Galaxy tier metadata, default modules, and limits.
 * Identical copy lives in aa-portal — keep them in sync.
 */

import { fullModuleConfig } from './moduleRegistry';

export const TIER_REGISTRY = {
  melmac: {
    key: 'melmac',
    label: 'Melmac',
    description: 'Core modules for small operations',
    modules: ['hr', 'finance', 'ops'],
    maxUsers: 10,
    maxAgentCalls: 1_000,
    badge: { bg: 'bg-gray-100', text: 'text-gray-700' },
  },
  orbit: {
    key: 'orbit',
    label: 'Orbit',
    description: 'Extended modules for growing teams',
    modules: ['hr', 'finance', 'purchasing', 'sales', 'ops', 'qbu'],
    maxUsers: 25,
    maxAgentCalls: 5_000,
    badge: { bg: 'bg-blue-50', text: 'text-blue-700' },
  },
  galaxy: {
    key: 'galaxy',
    label: 'Galaxy',
    description: 'Full platform with automation and self-service pipeline',
    modules: ['hr', 'finance', 'purchasing', 'sales', 'ops', 'qbu', 'salesDeck', 'automation'],
    maxUsers: 100,
    maxAgentCalls: 25_000,
    badge: { bg: 'bg-purple-50', text: 'text-purple-700' },
  },
};

/** Ordered tier keys for dropdowns and iteration */
export const TIER_KEYS = ['melmac', 'orbit', 'galaxy'];

/**
 * Returns full defaults for a tier: modules list, moduleConfig object, maxUsers, maxAgentCalls.
 * moduleConfig is built by enabling all pages + actions for each included module.
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

/**
 * Returns badge classes for a tier key. Falls back to melmac styling.
 */
export function getTierBadge(tierKey) {
  const tier = TIER_REGISTRY[tierKey] || TIER_REGISTRY.melmac;
  return tier.badge;
}
