/**
 * Full Portal Generation Orchestrator
 *
 * Chains the three generation engines in dependency order:
 *   1. Workspaces + Agents (must run first)
 *   2. Tools + Dashboard Domains (parallel — both depend on workspaces)
 *
 * Also auto-updates the onboarding checklist with portal_generated: true.
 */

import { generateWorkspacesAndAgents } from './generatePortal.js';
import { generateTools } from './generateTools.js';
import { generateDashboardDomains } from './generateDashboards.js';

export async function generateFullPortal(supabase, tenantId) {
  // 1. Workspaces + Agents — must exist before tools/dashboards
  const { workspaces, agents } = await generateWorkspacesAndAgents(supabase, tenantId);

  // 2. Tools + Dashboard Domains — both depend on workspaces, not on each other
  const [toolsResult, domainsResult] = await Promise.all([
    generateTools(supabase, tenantId),
    generateDashboardDomains(supabase, tenantId),
  ]);

  // 3. Auto-update onboarding checklist
  const { data: current } = await supabase
    .from('tenant_company_profiles')
    .select('onboarding_checklist')
    .eq('tenant_id', tenantId)
    .single();

  const merged = { ...(current?.onboarding_checklist || {}), portal_generated: true };

  await supabase
    .from('tenant_company_profiles')
    .update({ onboarding_checklist: merged })
    .eq('tenant_id', tenantId);

  return {
    workspaces,
    agents,
    tools: toolsResult.tools,
    domains: domainsResult.domains,
  };
}
