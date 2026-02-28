import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Database, Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAllSourceAgents } from '../../agents/registry';
import { DEPT_COLORS } from '../../data/constants';

const DEPT_LABELS = {
  hr: 'HR', finance: 'Finance', purchasing: 'Purchasing',
  sales: 'Sales', ops: 'Operations', admin: 'Admin',
  platform: 'Platform', tools: 'Tools', general: 'General',
};

const AGENT_MODULE_MAP = {
  hr: 'hr', finance: 'finance', purchasing: 'purchasing',
  sales: 'sales', ops: 'ops', admin: null, qbu: 'qbu', salesDeck: 'salesDeck',
};

function getAgentStatus(agentKey, tenantModules, overrides) {
  const requiredModule = AGENT_MODULE_MAP[agentKey];
  const moduleEnabled = requiredModule === null || (tenantModules || []).includes(requiredModule);
  if (!moduleEnabled) return 'module_off';
  const override = overrides.find((o) => o.agent_key === agentKey);
  if (override && !override.is_enabled) return 'disabled';
  return 'active';
}

const AGENT_STATUS_STYLES = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700' },
  disabled: { label: 'Disabled', className: 'bg-red-50 text-red-700' },
  module_off: { label: 'Module Off', className: 'bg-gray-100 text-gray-500' },
};

export default function PlatformAgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [expandedTenant, setExpandedTenant] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const sourceAgents = getAllSourceAgents();

      const [dbRes, tenantsRes, overridesRes] = await Promise.all([
        supabase.from('alf_agent_definitions').select('*').order('agent_key'),
        supabase.from('alf_tenants').select('*').order('company_name'),
        supabase.from('tenant_agent_overrides').select('tenant_id, agent_key, is_enabled, custom_prompt_additions'),
      ]);

      if (dbRes.error) throw dbRes.error;
      if (tenantsRes.error) throw tenantsRes.error;

      const dbAgents = dbRes.data || [];
      const dbMap = new Map(dbAgents.map((a) => [a.agent_key, a]));

      // Merge: DB preferred, source-code fallback
      const merged = sourceAgents.map((src) => {
        const db = dbMap.get(src.key);
        return {
          key: src.key,
          name: db?.name || src.name || src.key,
          department: db?.department || src.department || 'general',
          model: db?.model || src.model || null,
          status: db?.status || 'active',
          systemPrompt: db?.system_prompt || src.systemPrompt || '',
          actions: db?.actions || (src.actions ? Object.keys(src.actions) : []),
          inDb: !!db,
          sourceKey: src.key,
        };
      });

      // Add any DB-only agents not in source
      for (const db of dbAgents) {
        if (!sourceAgents.find((s) => s.key === db.agent_key)) {
          merged.push({
            key: db.agent_key,
            name: db.name || db.agent_key,
            department: db.department || 'general',
            model: db.model || null,
            status: db.status || 'active',
            systemPrompt: db.system_prompt || '',
            actions: db.actions || [],
            inDb: true,
            sourceKey: null,
          });
        }
      }

      setAgents(merged);
      setTenants(tenantsRes.data || []);
      setOverrides(overridesRes.data || []);

      // Auto-expand if only one tenant
      const tenantList = tenantsRes.data || [];
      if (tenantList.length === 1) {
        setExpandedTenant(tenantList[0].id);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    setSeedResult(null);

    try {
      const sourceAgents = getAllSourceAgents();
      const rows = sourceAgents.map((agent) => ({
        agent_key: agent.key,
        name: agent.name || agent.key,
        department: agent.department || 'general',
        model: agent.model || 'claude-sonnet-4-5-20250929',
        system_prompt: agent.systemPrompt || '',
        status: 'active',
        actions: agent.actions
          ? Object.entries(agent.actions).map(([k, v]) => ({
              key: k,
              label: v.label || k,
              description: v.description || '',
            }))
          : [],
      }));

      const { data, error: upsertErr } = await supabase
        .from('alf_agent_definitions')
        .upsert(rows, { onConflict: 'agent_key' })
        .select();

      if (upsertErr) throw upsertErr;

      setSeedResult(`Seeded ${data.length} agent(s) to database.`);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    setSeeding(false);
  }

  const tenantAgents = agents.filter((a) => a.department !== 'platform');
  const platformAgents = agents.filter((a) => a.department === 'platform');

  function getTenantAgentSummary(tenant) {
    const tenantOverrides = overrides.filter((o) => o.tenant_id === tenant.id);
    let activeCount = 0;
    for (const agent of tenantAgents) {
      if (getAgentStatus(agent.key, tenant.enabled_modules, tenantOverrides) === 'active') {
        activeCount++;
      }
    }
    return { activeCount, total: tenantAgents.length };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">Agents</h1>
          <p className="text-sm text-secondary-text mt-1">
            Manage agent definitions and tenant assignments
          </p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding || loading}
          className="flex items-center gap-2 px-4 py-2 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
        >
          {seeding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          {seeding ? 'Seeding...' : 'Seed All to Database'}
        </button>
      </div>

      {/* Alerts */}
      {seedResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          {seedResult}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-alf-orange animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Bot size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-secondary-text">No agents found. Click "Seed All to Database" to populate from source.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Tenant accordion sections */}
          {tenants.map((tenant) => {
            const isExpanded = expandedTenant === tenant.id;
            const { activeCount, total } = getTenantAgentSummary(tenant);
            const tenantOverrides = overrides.filter((o) => o.tenant_id === tenant.id);
            const tenantActive = tenant.is_active !== false;

            return (
              <div key={tenant.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Tenant header row */}
                <button
                  onClick={() => setExpandedTenant(isExpanded ? null : tenant.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown size={16} className="text-gray-400 shrink-0" />
                    : <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  }
                  <span className="text-sm font-semibold text-dark-text truncate">
                    {tenant.company_name}
                  </span>
                  <span className="text-xs text-secondary-text whitespace-nowrap">
                    {activeCount} of {total} active
                  </span>
                  <span className={`ml-auto px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap shrink-0 ${
                    tenantActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tenantActive ? 'Active' : 'Inactive'}
                  </span>
                </button>

                {/* Expanded agent table */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-secondary-text">
                          <th className="text-left font-medium px-4 py-2">Agent</th>
                          <th className="text-left font-medium px-4 py-2">Department</th>
                          <th className="text-left font-medium px-4 py-2">Status</th>
                          <th className="text-right font-medium px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tenantAgents.map((agent) => {
                          const deptColor = DEPT_COLORS[agent.department] || '#6B7280';
                          const status = getAgentStatus(agent.key, tenant.enabled_modules, tenantOverrides);
                          const statusStyle = AGENT_STATUS_STYLES[status];

                          return (
                            <tr key={agent.key} className="border-t border-gray-50 hover:bg-gray-50/50">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-1 h-5 rounded-full shrink-0"
                                    style={{ backgroundColor: deptColor }}
                                  />
                                  <span className="text-sm font-medium text-dark-text">
                                    {agent.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                                  style={{ backgroundColor: deptColor + '18', color: deptColor }}
                                >
                                  {DEPT_LABELS[agent.department] || agent.department}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${statusStyle.className}`}>
                                  {statusStyle.label}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => navigate(`/platform/agents/${agent.key}`)}
                                  className="text-xs text-alf-orange hover:text-alf-orange font-medium"
                                >
                                  Edit Agent →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Platform section */}
          {platformAgents.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium text-secondary-text uppercase tracking-wider">Platform</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {platformAgents.map((agent) => {
                      const deptColor = DEPT_COLORS[agent.department] || '#6B7280';
                      const isActive = agent.status === 'active';

                      return (
                        <tr key={agent.key} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-1 h-5 rounded-full shrink-0"
                                style={{ backgroundColor: deptColor }}
                              />
                              <span className="text-sm font-medium text-dark-text">
                                {agent.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                              style={{ backgroundColor: deptColor + '18', color: deptColor }}
                            >
                              {DEPT_LABELS[agent.department] || agent.department}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                              isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => navigate(`/platform/agents/${agent.key}`)}
                              className="text-xs text-alf-orange hover:text-alf-orange font-medium"
                            >
                              Edit Agent →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Seed help text */}
      <p className="text-xs text-secondary-text text-center">
        "Seed All to Database" resets all agents in the database to their source-code defaults.
      </p>
    </div>
  );
}
