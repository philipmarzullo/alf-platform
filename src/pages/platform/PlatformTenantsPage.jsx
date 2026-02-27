import { useState, useEffect } from 'react';
import {
  Building2, Users, Activity, Plus, Loader2,
  ChevronDown, MapPin, Lock, ExternalLink, ArrowRight,
  Puzzle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import MetricCard from '../../components/shared/MetricCard';
import AlfIcon from '../../components/shared/AlfIcon';
import { getAllSourceAgents } from '../../agents/registry';
import { MODULE_REGISTRY } from '../../data/moduleRegistry';
import { getTierBadge, TIER_REGISTRY } from '../../data/tierRegistry';

const MODULE_OPTIONS = Object.entries(MODULE_REGISTRY).map(([key, mod]) => ({
  key,
  label: mod.label,
}));

const AGENT_MODULE_MAP = {
  hr: 'hr', finance: 'finance', purchasing: 'purchasing',
  sales: 'sales', ops: 'ops', admin: null, qbu: 'qbu', salesDeck: 'salesDeck',
};

export default function PlatformTenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const sourceAgents = getAllSourceAgents();

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    setLoading(true);

    // Fetch tenants
    const { data: tenantRows, error: tErr } = await supabase
      .from('alf_tenants')
      .select('*')
      .order('created_at', { ascending: true });

    if (tErr) {
      setError(tErr.message);
      setLoading(false);
      return;
    }

    // Fetch user counts per tenant
    const { data: profiles } = await supabase
      .from('profiles')
      .select('tenant_id');

    // Fetch site counts per tenant
    const { data: siteRows } = await supabase
      .from('tenant_sites')
      .select('tenant_id');

    // Fetch usage counts per tenant (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: usageLogs } = await supabase
      .from('alf_usage_logs')
      .select('tenant_id')
      .gte('created_at', thirtyDaysAgo);

    // Aggregate
    const userCounts = {};
    const siteCounts = {};
    const usageCounts = {};
    (profiles || []).forEach((p) => {
      if (p.tenant_id) userCounts[p.tenant_id] = (userCounts[p.tenant_id] || 0) + 1;
    });
    (siteRows || []).forEach((s) => {
      if (s.tenant_id) siteCounts[s.tenant_id] = (siteCounts[s.tenant_id] || 0) + 1;
    });
    (usageLogs || []).forEach((u) => {
      if (u.tenant_id) usageCounts[u.tenant_id] = (usageCounts[u.tenant_id] || 0) + 1;
    });

    const enriched = (tenantRows || []).map((t) => ({
      ...t,
      // Normalize: DB may use 'enabled_modules' or 'modules'
      modules: t.modules || t.enabled_modules || [],
      user_count: userCounts[t.id] || 0,
      site_count: siteCounts[t.id] || 0,
      usage_30d: usageCounts[t.id] || 0,
    }));

    setTenants(enriched);
    setLoading(false);
  }

  const totalUsers = tenants.reduce((sum, t) => sum + t.user_count, 0);
  const totalUsage = tenants.reduce((sum, t) => sum + t.usage_30d, 0);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">Tenants</h1>
          <p className="text-sm text-secondary-text mt-1">Manage organizations on the Alf platform</p>
        </div>
        <button
          onClick={() => navigate('/platform/tenants/new')}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          <Plus size={16} />
          New Tenant
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Total Tenants" value={tenants.length} icon={Building2} color="#F59E0B" />
        <MetricCard label="Total Users" value={totalUsers} icon={Users} color="#F59E0B" />
        <MetricCard label="Agent Calls (30d)" value={totalUsage.toLocaleString()} icon={Activity} color="#F59E0B" />
      </div>

      {/* Expandable Tenants Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="w-10 px-3 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Active</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const isExpanded = expandedId === tenant.id;
              return (
                <TenantRow
                  key={tenant.id}
                  tenant={tenant}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpand(tenant.id)}
                  onManage={() => navigate(`/platform/tenants/${tenant.id}`)}
                  sourceAgents={sourceAgents}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {tenants.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-secondary-text">
          No tenants yet. Create one to get started.
        </div>
      )}
    </div>
  );
}

/* ─── Tenant Row (summary + expandable detail) ─── */

function TenantRow({ tenant, isExpanded, onToggle, onManage, sourceAgents }) {
  const navigate = useNavigate();

  const tenantModules = tenant.modules || tenant.enabled_modules || [];
  const enabledModuleCount = tenantModules.length;

  // Compute active agents — agent is active if it has no module requirement OR its module is enabled
  const activeAgentCount = sourceAgents.filter((a) => {
    const requiredModule = AGENT_MODULE_MAP[a.key];
    return requiredModule === null || tenantModules.includes(requiredModule);
  }).length;

  return (
    <>
      {/* Summary row */}
      <tr
        onClick={onToggle}
        className={`border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${
          isExpanded ? 'bg-gray-50' : ''
        }`}
      >
        <td className="px-3 py-3 text-center">
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 inline-block ${
              isExpanded ? '' : '-rotate-90'
            }`}
          />
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-dark-text">{tenant.company_name}</div>
          <div className="text-xs text-secondary-text">{tenant.slug}</div>
        </td>
        <td className="px-4 py-3">
          {(() => { const b = getTierBadge(tenant.plan); return (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${b.bg} ${b.text}`}>
              {TIER_REGISTRY[tenant.plan]?.label || tenant.plan || 'Melmac'}
            </span>
          ); })()}
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
            tenant.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {tenant.status}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className={`w-2 h-2 rounded-full ${
              tenant.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
            }`} />
            {tenant.status === 'active' ? 'Yes' : 'No'}
          </span>
        </td>
      </tr>

      {/* Expanded detail panel */}
      {isExpanded && (
        <tr className="border-b border-gray-100">
          <td colSpan={5} className="bg-gray-50 px-0 py-0">
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Company Info Card */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 size={16} className="text-amber-500" />
                    <h3 className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Company Info</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-secondary-text">Company Name</span>
                      <p className="font-medium text-dark-text">{tenant.company_name}</p>
                    </div>
                    <div>
                      <span className="text-secondary-text">Slug</span>
                      <p className="font-mono text-dark-text">{tenant.slug}</p>
                    </div>
                    {tenant.domain && (
                      <div>
                        <span className="text-secondary-text">Domain</span>
                        <p className="text-dark-text">{tenant.domain}</p>
                      </div>
                    )}
                    {tenant.contact_name && (
                      <div>
                        <span className="text-secondary-text">Contact</span>
                        <p className="text-dark-text">{tenant.contact_name}</p>
                      </div>
                    )}
                    {tenant.contact_email && (
                      <div>
                        <span className="text-secondary-text">Email</span>
                        <p className="text-dark-text">{tenant.contact_email}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-secondary-text">Tier</span>
                      <p className="text-dark-text capitalize">{TIER_REGISTRY[tenant.plan]?.label || tenant.plan || 'Melmac'}</p>
                    </div>
                  </div>
                </div>

                {/* Features Card */}
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/platform/tenants/${tenant.id}?tab=features`); }}
                  className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-amber-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Puzzle size={16} className="text-amber-500" />
                      <h3 className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Features</h3>
                    </div>
                    <ArrowRight size={14} className="text-gray-300 group-hover:text-amber-400 transition-colors" />
                  </div>
                  <div className="text-lg font-semibold text-dark-text mb-2">
                    {enabledModuleCount} of {MODULE_OPTIONS.length} enabled
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {MODULE_OPTIONS.map((mod) => {
                      const isOn = tenantModules.includes(mod.key);
                      return (
                        <span
                          key={mod.key}
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            isOn
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {mod.label}
                        </span>
                      );
                    })}
                  </div>
                </button>

                {/* Agents Card */}
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/platform/tenants/${tenant.id}?tab=agents`); }}
                  className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-amber-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlfIcon size={16} />
                      <h3 className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Agents</h3>
                    </div>
                    <ArrowRight size={14} className="text-gray-300 group-hover:text-amber-400 transition-colors" />
                  </div>
                  <div className="text-lg font-semibold text-dark-text mb-2">
                    {activeAgentCount} of {sourceAgents.length} active
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceAgents.map((agent) => {
                      const requiredModule = AGENT_MODULE_MAP[agent.key];
                      const isActive = requiredModule === null || tenantModules.includes(requiredModule);
                      return (
                        <span
                          key={agent.key}
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            isActive
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {agent.name}
                        </span>
                      );
                    })}
                  </div>
                </button>

                {/* Quick Stats Card */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={16} className="text-amber-500" />
                    <h3 className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Quick Stats</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Users */}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/platform/tenants/${tenant.id}`); }}
                      className="bg-gray-50 rounded-lg p-3 text-center hover:bg-gray-100 transition-colors group relative"
                    >
                      <ExternalLink size={10} className="absolute top-2 right-2 text-gray-300 group-hover:text-amber-400 transition-colors" />
                      <Users size={18} className="text-amber-500 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-dark-text">{tenant.user_count}</div>
                      <div className="text-xs text-secondary-text">Users</div>
                    </button>
                    {/* Sites */}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/platform/tenants/${tenant.id}`); }}
                      className="bg-gray-50 rounded-lg p-3 text-center hover:bg-gray-100 transition-colors group relative"
                    >
                      <ExternalLink size={10} className="absolute top-2 right-2 text-gray-300 group-hover:text-amber-400 transition-colors" />
                      <MapPin size={18} className="text-amber-500 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-dark-text">{tenant.site_count}</div>
                      <div className="text-xs text-secondary-text">Sites</div>
                    </button>
                    {/* Usage (30d) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/platform/tenants/${tenant.id}`); }}
                      className="bg-gray-50 rounded-lg p-3 text-center hover:bg-gray-100 transition-colors group relative"
                    >
                      <ExternalLink size={10} className="absolute top-2 right-2 text-gray-300 group-hover:text-amber-400 transition-colors" />
                      <Activity size={18} className="text-amber-500 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-dark-text">{tenant.usage_30d.toLocaleString()}</div>
                      <div className="text-xs text-secondary-text">Calls (30d)</div>
                    </button>
                  </div>
                </div>

                {/* API Keys Card */}
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/platform/tenants/${tenant.id}?tab=api-keys`); }}
                  className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-amber-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Lock size={16} className="text-gray-400" />
                      <h3 className="text-xs font-semibold text-secondary-text uppercase tracking-wider">API Keys</h3>
                    </div>
                    <ArrowRight size={14} className="text-gray-300 group-hover:text-amber-400 transition-colors" />
                  </div>
                  <div className="flex items-center justify-center h-16 text-sm text-amber-600 font-medium">
                    Manage credentials
                  </div>
                </button>
              </div>

              {/* Footer with Manage button */}
              <div className="flex justify-end pt-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onManage(); }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Manage
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
