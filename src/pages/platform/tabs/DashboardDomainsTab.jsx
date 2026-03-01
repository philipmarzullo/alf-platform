import { useState, useEffect } from 'react';
import {
  Loader2, RefreshCw, Zap, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, AlertTriangle,
  ClipboardList, Users, Clock, Shield, Search, Truck, Map,
  Warehouse, FileCheck, LayoutDashboard, BarChart3,
} from 'lucide-react';
import { getFreshToken } from '../../../lib/supabase';
import { supabase } from '../../../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Map icon strings from domain definitions to Lucide components */
const ICON_MAP = {
  'clipboard-list': ClipboardList,
  'users': Users,
  'search': Search,
  'clock': Clock,
  'shield': Shield,
  'truck': Truck,
  'map': Map,
  'warehouse': Warehouse,
  'file-check': FileCheck,
  'layout-dashboard': LayoutDashboard,
};

function getIcon(iconStr) {
  return ICON_MAP[iconStr] || BarChart3;
}

export default function DashboardDomainsTab({ tenantId, profileStatus, hasWorkspaces }) {
  const [domains, setDomains] = useState([]);
  const [workspaceNames, setWorkspaceNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  useEffect(() => {
    loadData();
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const [domainsRes, wsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/tenant-dashboard-domains/${tenantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        supabase
          .from('tenant_workspaces')
          .select('id, name')
          .eq('tenant_id', tenantId),
      ]);

      const domainsJson = await domainsRes.json();
      if (!domainsRes.ok) throw new Error(domainsJson.error || 'Failed to load dashboard domains');
      setDomains(domainsJson.domains || []);

      // Build workspace name lookup
      const wsMap = {};
      (wsRes.data || []).forEach((ws) => { wsMap[ws.id] = ws.name; });
      setWorkspaceNames(wsMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (domains.length > 0 && !confirmGenerate) {
      setConfirmGenerate(true);
      return;
    }
    setConfirmGenerate(false);
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-dashboard-domains/${tenantId}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      setDomains(json.domains || []);
      setSuccess(`Generated ${json.domains?.length || 0} dashboard domains`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerateKpis() {
    setRegenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-dashboard-domains/${tenantId}/regenerate-kpis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'KPI regeneration failed');
      setDomains(json.domains || []);
      setSuccess('KPI definitions regenerated from latest profile');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleDomain(domainId) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-dashboard-domains/${tenantId}/${domainId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Toggle failed');
      setDomains((prev) => prev.map((d) => d.id === domainId ? json.domain : d));
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleCard(id) {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const hasDomains = domains.length > 0;
  const profileReady = profileStatus && profileStatus !== 'draft';
  const canGenerate = profileReady && hasWorkspaces;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-dark-text">Dynamic Dashboards</h2>
          {hasDomains && (
            <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
              {domains.length} domains
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDomains && (
            <button
              onClick={handleRegenerateKpis}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary-text bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {regenerating ? 'Regenerating...' : 'Regenerate KPIs'}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || !canGenerate}
            title={
              !profileReady
                ? 'Company profile must be confirmed or enriched before generating'
                : !hasWorkspaces
                  ? 'Generate workspaces first before generating dashboard domains'
                  : ''
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-alf-orange rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {generating ? 'Generating...' : 'Generate from Profile'}
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmGenerate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                This will replace all existing dashboard domains for this tenant.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Active/inactive toggles, name edits, and sort order changes will be lost. This cannot be undone.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleGenerate}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Yes, regenerate all
                </button>
                <button
                  onClick={() => setConfirmGenerate(false)}
                  className="px-3 py-1.5 text-sm font-medium text-amber-800 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No profile or workspaces warning */}
      {!canGenerate && !hasDomains && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <BarChart3 size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-secondary-text">
            {!profileReady
              ? 'Confirm the Company Profile first, then generate workspaces, then generate dashboard domains.'
              : 'Generate workspaces first, then generate dynamic dashboard domains.'}
          </p>
        </div>
      )}

      {/* Empty state with profile + workspaces ready */}
      {canGenerate && !hasDomains && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Zap size={32} className="text-alf-orange/40 mx-auto mb-3" />
          <p className="text-sm text-secondary-text">
            No dashboard domains generated yet. Click "Generate from Profile" to create industry-specific dashboard domains with KPI definitions.
          </p>
        </div>
      )}

      {/* Domain cards */}
      {domains.map((domain) => {
        const Icon = getIcon(domain.icon);
        const expanded = expandedCards[domain.id];
        const kpiDefs = domain.kpi_definitions || {};
        const kpis = kpiDefs.kpis || [];
        const charts = kpiDefs.charts || [];
        const sourceIds = domain.source_workspace_ids || [];

        return (
          <div
            key={domain.id}
            className={`bg-white rounded-lg border transition-colors ${
              domain.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
            }`}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => toggleCard(domain.id)}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <Icon size={18} className="text-alf-orange shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-dark-text">{domain.name}</span>
                    <span className="text-xs text-secondary-text font-mono">{domain.domain_key}</span>
                  </div>
                  {domain.description && (
                    <p className="text-xs text-secondary-text mt-0.5 truncate">{domain.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto mr-3 shrink-0">
                  <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
                    {kpis.length} KPIs
                  </span>
                  <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
                    {charts.length} charts
                  </span>
                </div>
                {expanded ? (
                  <ChevronUp size={16} className="text-secondary-text shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-secondary-text shrink-0" />
                )}
              </button>
              <button
                onClick={() => handleToggleDomain(domain.id)}
                className="ml-2 shrink-0"
                title={domain.is_active ? 'Deactivate domain' : 'Activate domain'}
              >
                {domain.is_active ? (
                  <ToggleRight size={22} className="text-green-500" />
                ) : (
                  <ToggleLeft size={22} className="text-gray-300" />
                )}
              </button>
            </div>

            {/* Expanded: KPIs, charts, source workspaces */}
            {expanded && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
                {/* KPI Definitions */}
                {kpis.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 size={14} className="text-secondary-text" />
                      <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                        KPI Definitions
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {kpis.map((kpi) => (
                          <div key={kpi.id} className="flex items-center gap-1.5 text-xs">
                            <span className="text-dark-text">{kpi.label}</span>
                            <span className="text-secondary-text/60 font-mono text-[10px]">
                              {kpi.id}
                            </span>
                            {kpi.icon && (
                              <span className="text-secondary-text/40 text-[10px]">
                                ({kpi.icon})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Chart Definitions */}
                {charts.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 size={14} className="text-secondary-text" />
                      <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                        Chart Definitions
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {charts.map((chart) => (
                          <div key={chart.id} className="flex items-center gap-1.5 text-xs">
                            <span className="text-dark-text">{chart.label}</span>
                            <span className="text-secondary-text/60 font-mono text-[10px]">
                              {chart.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Source Workspaces */}
                {sourceIds.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList size={14} className="text-secondary-text" />
                      <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                        Source Workspaces
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sourceIds.map((wsId) => (
                        <span
                          key={wsId}
                          className="text-xs bg-gray-100 text-secondary-text px-2 py-1 rounded"
                        >
                          {workspaceNames[wsId] || wsId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
