import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Users, MapPin, Activity,
  Puzzle, Bot, Lock, ToggleLeft, ToggleRight,
  FileText, BookOpen, Upload, ChevronUp, ChevronDown,
  Key, Trash2, CheckCircle, XCircle, Eye, EyeOff, FlaskConical, Zap,
  Plus, Mail, Palette, RefreshCw, ChevronRight, BarChart3,
  GripVertical, Download, HardDrive, AlertTriangle, Wrench, Settings2, Star, X,
} from 'lucide-react';
import { supabase, getFreshToken } from '../../lib/supabase';
import DataTable from '../../components/shared/DataTable';
import TenantOverviewTab from './tabs/TenantOverviewTab';
import { getAllSourceAgents } from '../../agents/registry';
import { DEPT_COLORS } from '../../data/constants';
import { MODULE_REGISTRY, fullModuleConfig } from '../../data/moduleRegistry';
import { TIER_KEYS, TIER_REGISTRY } from '../../data/tierRegistry';
import { buildDocumentPath, formatFileSize } from '../../utils/storagePaths';
import { DASHBOARD_TEMPLATES, TEMPLATE_KEYS, getTemplateConfigs } from '../../data/dashboardTemplates';

const MODULE_OPTIONS = Object.entries(MODULE_REGISTRY).map(([key, mod]) => ({
  key,
  label: mod.label,
  description: mod.description,
}));

const AGENT_MODULE_MAP = {
  hr: 'hr', finance: 'finance', purchasing: 'purchasing',
  sales: 'sales', ops: 'ops', admin: null, qbu: 'qbu', salesDeck: 'salesDeck',
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'features', label: 'Features', icon: Puzzle },
  { key: 'agents', label: 'Agents', icon: Bot },
  { key: 'api-keys', label: 'API Keys', icon: Lock },
  { key: 'brand', label: 'Brand', icon: Palette },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { key: 'automation', label: 'Automation', icon: FlaskConical },
  { key: 'dashboards', label: 'Dashboards', icon: BarChart3 },
  { key: 'backup', label: 'Backup', icon: HardDrive },
  { key: 'custom-tools', label: 'Custom Tools', icon: Wrench },
];

// Which agents each module unlocks
function getAgentsForModule(moduleKey, sourceAgents) {
  return sourceAgents.filter((a) => AGENT_MODULE_MAP[a.key] === moduleKey);
}

export default function PlatformTenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [usage, setUsage] = useState([]);
  const [agentOverrides, setAgentOverrides] = useState([]);
  const [dbAgents, setDbAgents] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({ total: 0, open: 0, lastGenerated: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [savingOverride, setSavingOverride] = useState(null);
  const [error, setError] = useState(null);

  const sourceAgents = getAllSourceAgents();

  // Editable fields
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editStatus, setEditStatus] = useState('');

  // Brand tab state
  const [editBrand, setEditBrand] = useState({
    brand_display_name: '',
    brand_logo_url: '',
    brand_primary_color: '#009ADE',
    brand_sidebar_bg: '#1B2133',
  });
  const [savingBrand, setSavingBrand] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);

    const [tenantRes, usersRes, sitesRes, usageRes, overridesRes, dbAgentsRes, dashActionsRes] = await Promise.all([
      supabase.from('alf_tenants').select('*').eq('id', id).single(),
      supabase.from('profiles').select('id, name, email, role, active, dashboard_template_id').eq('tenant_id', id).order('name'),
      supabase.from('tenant_sites').select('*').eq('tenant_id', id).order('name'),
      supabase.from('alf_usage_logs').select('id, agent_key, tokens_input, tokens_output, created_at').eq('tenant_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('tenant_agent_overrides').select('*').eq('tenant_id', id),
      supabase.from('alf_agent_definitions').select('*').order('agent_key'),
      supabase.from('automation_actions').select('id, status, created_at').eq('tenant_id', id).eq('source', 'dashboard_action_plan').order('created_at', { ascending: false }),
    ]);

    if (tenantRes.error) {
      setError(tenantRes.error.message);
      setLoading(false);
      return;
    }

    // Normalize column names — DB may use 'enabled_modules' or 'modules'
    const t = { ...tenantRes.data };
    if (t.enabled_modules && !t.modules) t.modules = t.enabled_modules;

    setTenant(t);
    setEditName(t.company_name);
    setEditPlan(t.plan || 'melmac');
    setEditStatus(t.status || 'active');
    setEditBrand({
      brand_display_name: t.brand_display_name || '',
      brand_logo_url: t.brand_logo_url || '',
      brand_primary_color: t.brand_primary_color || '#009ADE',
      brand_sidebar_bg: t.brand_sidebar_bg || '#1B2133',
    });
    setUsers(usersRes.data || []);
    setSites(sitesRes.data || []);
    setUsage(usageRes.data || []);
    setAgentOverrides(overridesRes.data || []);
    setDbAgents(dbAgentsRes.data || []);

    // Dashboard action plan stats
    const dashActions = dashActionsRes.data || [];
    setDashboardStats({
      total: dashActions.length,
      open: dashActions.filter((a) => a.status === 'open' || a.status === 'in_progress').length,
      lastGenerated: dashActions[0]?.created_at || null,
    });

    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: updateErr } = await supabase
      .from('alf_tenants')
      .update({ company_name: editName, plan: editPlan, status: editStatus })
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setTenant((prev) => ({ ...prev, company_name: editName, plan: editPlan, status: editStatus }));
    }
    setSaving(false);
  }

  async function handleToggleModule(moduleKey) {
    setSavingModules(true);
    setError(null);

    const currentConfig = tenant.module_config || {};
    let newConfig;

    if (moduleKey in currentConfig) {
      // Remove the module
      const { [moduleKey]: _, ...rest } = currentConfig;
      newConfig = rest;
    } else {
      // Add the module with all capabilities enabled
      newConfig = { ...currentConfig, [moduleKey]: fullModuleConfig(moduleKey) };
    }

    const enabledModules = Object.keys(newConfig);

    const { error: updateErr } = await supabase
      .from('alf_tenants')
      .update({
        module_config: newConfig,
        enabled_modules: enabledModules,
      })
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setTenant((prev) => ({
        ...prev,
        modules: enabledModules,
        enabled_modules: enabledModules,
        module_config: newConfig,
      }));
    }
    setSavingModules(false);
  }

  async function handleSaveModuleConfig(newConfig) {
    setSavingModules(true);
    setError(null);

    const enabledModules = Object.keys(newConfig);

    const { error: updateErr } = await supabase
      .from('alf_tenants')
      .update({
        module_config: newConfig,
        enabled_modules: enabledModules,
      })
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setTenant((prev) => ({
        ...prev,
        modules: enabledModules,
        enabled_modules: enabledModules,
        module_config: newConfig,
      }));
    }
    setSavingModules(false);
  }

  async function handleToggleAgent(agentKey, existingOverride) {
    setSavingOverride(agentKey);
    setError(null);

    const newEnabled = existingOverride ? !existingOverride.is_enabled : false;

    if (existingOverride) {
      const { error: updateErr } = await supabase
        .from('tenant_agent_overrides')
        .update({ is_enabled: newEnabled })
        .eq('id', existingOverride.id);

      if (updateErr) {
        setError(updateErr.message);
      } else {
        setAgentOverrides((prev) =>
          prev.map((o) => o.id === existingOverride.id ? { ...o, is_enabled: newEnabled } : o)
        );
      }
    } else {
      // Insert new override (disabled)
      const { data: newRow, error: insertErr } = await supabase
        .from('tenant_agent_overrides')
        .insert({ tenant_id: id, agent_key: agentKey, is_enabled: false })
        .select()
        .single();

      if (insertErr) {
        setError(insertErr.message);
      } else {
        setAgentOverrides((prev) => [...prev, newRow]);
      }
    }
    setSavingOverride(null);
  }

  async function handleSaveBrand() {
    setSavingBrand(true);
    setError(null);
    setSaved(false);

    const { error: updateErr } = await supabase
      .from('alf_tenants')
      .update(editBrand)
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setTenant((prev) => ({ ...prev, ...editBrand }));
    }
    setSavingBrand(false);
  }

  function setTab(tabKey) {
    setError(null);
    setSaved(false);
    setSearchParams({ tab: tabKey }, { replace: true });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-24">
        <p className="text-secondary-text">Tenant not found.</p>
        <button onClick={() => navigate('/platform/tenants')} className="text-sm text-amber-600 hover:underline mt-2">
          Back to Tenants
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/platform/tenants')}
        className="flex items-center gap-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Tenants
      </button>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-secondary-text hover:text-dark-text hover:border-gray-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          Tenant updated successfully.
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <TenantOverviewTab
          tenant={tenant}
          users={users}
          sites={sites}
          usage={usage}
          editName={editName}
          editPlan={editPlan}
          editStatus={editStatus}
          setEditName={setEditName}
          setEditPlan={setEditPlan}
          setEditStatus={setEditStatus}
          saving={saving}
          onSave={handleSave}
          error={error}
          setError={setError}
          saved={saved}
          setSaved={setSaved}
        />
      )}

      {/* Features Tab */}
      {activeTab === 'features' && (
        <FeaturesTab
          tenant={tenant}
          sourceAgents={sourceAgents}
          savingModules={savingModules}
          onToggleModule={handleToggleModule}
          onSaveModuleConfig={handleSaveModuleConfig}
        />
      )}

      {/* Agents Tab */}
      {activeTab === 'agents' && (
        <AgentsTab
          tenant={tenant}
          sourceAgents={sourceAgents}
          dbAgents={dbAgents}
          agentOverrides={agentOverrides}
          savingOverride={savingOverride}
          onToggleAgent={handleToggleAgent}
        />
      )}

      {/* API Keys Tab */}
      {activeTab === 'api-keys' && (
        <ApiKeysTab tenantId={id} />
      )}

      {/* Brand Tab */}
      {activeTab === 'brand' && (
        <BrandTab
          editBrand={editBrand}
          setEditBrand={setEditBrand}
          saving={savingBrand}
          onSave={handleSaveBrand}
          tenantId={id}
        />
      )}

      {/* Knowledge Tab */}
      {activeTab === 'knowledge' && (
        <KnowledgeTab tenantId={id} />
      )}

      {/* Automation Tab */}
      {activeTab === 'automation' && (
        <AutomationTab tenantId={id} />
      )}

      {/* Dashboards Tab */}
      {activeTab === 'dashboards' && (
        <DashboardsTab tenantId={id} />
      )}

      {activeTab === 'backup' && (
        <BackupTab tenantId={id} tenantSlug={tenant?.slug || tenant?.name} />
      )}

      {activeTab === 'custom-tools' && (
        <CustomToolsTab tenantId={id} />
      )}
    </div>
  );
}

/* ─── Features Tab ─── */

function FeaturesTab({ tenant, sourceAgents, savingModules, onToggleModule, onSaveModuleConfig }) {
  const moduleConfig = tenant.module_config || {};
  const [expanded, setExpanded] = useState(null);

  function toggleCapability(moduleKey, type, capKey) {
    const current = moduleConfig[moduleKey] || { pages: [], actions: [] };
    const list = current[type] || [];
    const updated = list.includes(capKey)
      ? list.filter((k) => k !== capKey)
      : [...list, capKey];
    const newModConfig = {
      ...moduleConfig,
      [moduleKey]: { ...current, [type]: updated },
    };
    onSaveModuleConfig(newModConfig);
  }

  function selectAll(moduleKey, type) {
    const registry = MODULE_REGISTRY[moduleKey];
    if (!registry) return;
    const allKeys = type === 'pages'
      ? registry.pages.map((p) => p.key)
      : registry.actions.map((a) => a.key);
    const newModConfig = {
      ...moduleConfig,
      [moduleKey]: { ...(moduleConfig[moduleKey] || {}), [type]: allKeys },
    };
    onSaveModuleConfig(newModConfig);
  }

  function deselectAll(moduleKey, type) {
    const newModConfig = {
      ...moduleConfig,
      [moduleKey]: { ...(moduleConfig[moduleKey] || {}), [type]: [] },
    };
    onSaveModuleConfig(newModConfig);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-dark-text">Feature Modules</h2>
        <p className="text-sm text-secondary-text mt-1">
          Enable or disable modules, then expand to configure individual pages and agent actions.
        </p>
      </div>

      <div className="space-y-3">
        {MODULE_OPTIONS.map((mod) => {
          const isEnabled = mod.key in moduleConfig;
          const isExpanded = expanded === mod.key;
          const registry = MODULE_REGISTRY[mod.key];
          const config = moduleConfig[mod.key] || { pages: [], actions: [] };
          const relatedAgents = getAgentsForModule(mod.key, sourceAgents);
          const enabledPages = config.pages || [];
          const enabledActions = config.actions || [];

          return (
            <div
              key={mod.key}
              className={`bg-white rounded-lg border transition-colors ${
                isEnabled ? 'border-amber-200' : 'border-gray-200'
              }`}
            >
              {/* Module header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Puzzle size={16} className={isEnabled ? 'text-amber-500' : 'text-gray-400'} />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-dark-text">{mod.label}</h3>
                    <p className="text-xs text-secondary-text">{mod.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isEnabled && registry && (registry.pages.length > 1 || registry.actions.length > 1) && (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : mod.key)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      title={isExpanded ? 'Collapse' : 'Configure capabilities'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                  <button
                    onClick={() => onToggleModule(mod.key)}
                    disabled={savingModules}
                    className="text-gray-500 hover:text-amber-600 transition-colors disabled:opacity-50"
                  >
                    {isEnabled
                      ? <ToggleRight size={24} className="text-amber-600" />
                      : <ToggleLeft size={24} className="text-gray-400" />
                    }
                  </button>
                </div>
              </div>

              {/* Summary badges when collapsed but enabled */}
              {isEnabled && !isExpanded && (
                <div className="px-4 pb-3 flex flex-wrap gap-2 text-xs text-secondary-text">
                  <span>{enabledPages.length}/{registry.pages.length} pages</span>
                  <span className="text-gray-300">|</span>
                  <span>{enabledActions.length}/{registry.actions.length} actions</span>
                  {relatedAgents.length > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      {relatedAgents.map((a) => (
                        <span key={a.key} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {a.name}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Expanded capability checkboxes */}
              {isEnabled && isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-4">
                  {/* Pages */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-dark-text uppercase tracking-wide">Pages</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => selectAll(mod.key, 'pages')}
                          disabled={savingModules}
                          className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50"
                        >
                          All
                        </button>
                        <button
                          onClick={() => deselectAll(mod.key, 'pages')}
                          disabled={savingModules}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {registry.pages.map((page) => {
                        const checked = enabledPages.includes(page.key);
                        return (
                          <label
                            key={page.key}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                              checked ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCapability(mod.key, 'pages', page.key)}
                              disabled={savingModules}
                              className="accent-amber-600"
                            />
                            {page.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-dark-text uppercase tracking-wide">Agent Actions</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => selectAll(mod.key, 'actions')}
                          disabled={savingModules}
                          className="text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50"
                        >
                          All
                        </button>
                        <button
                          onClick={() => deselectAll(mod.key, 'actions')}
                          disabled={savingModules}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {registry.actions.map((action) => {
                        const checked = enabledActions.includes(action.key);
                        return (
                          <label
                            key={action.key}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                              checked ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCapability(mod.key, 'actions', action.key)}
                              disabled={savingModules}
                              className="accent-amber-600"
                            />
                            {action.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Agents Tab ─── */

function AgentsTab({ tenant, sourceAgents, dbAgents, agentOverrides, savingOverride, onToggleAgent }) {
  const navigate = useNavigate();
  const tenantModules = tenant.modules || [];
  const [expandedPrompt, setExpandedPrompt] = useState(null);
  const [customPrompts, setCustomPrompts] = useState({});
  const [savingPrompt, setSavingPrompt] = useState(null);

  // Initialize custom prompts from overrides
  useEffect(() => {
    const prompts = {};
    agentOverrides.forEach((o) => {
      if (o.custom_prompt_additions) {
        prompts[o.agent_key] = o.custom_prompt_additions;
      }
    });
    setCustomPrompts(prompts);
  }, [agentOverrides]);

  async function handleSaveCustomPrompt(agentKey) {
    setSavingPrompt(agentKey);
    const override = agentOverrides.find((o) => o.agent_key === agentKey);
    const promptText = customPrompts[agentKey] || '';

    const { error } = await supabase
      .from('tenant_agent_overrides')
      .upsert({
        tenant_id: tenant.id,
        agent_key: agentKey,
        is_enabled: override ? override.is_enabled : true,
        custom_prompt_additions: promptText || null,
      }, { onConflict: 'tenant_id,agent_key' });

    if (error) {
      console.error('Failed to save custom prompt:', error.message);
    }
    setSavingPrompt(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-dark-text">Agent Assignments</h2>
        <p className="text-sm text-secondary-text mt-1">
          Toggle agents on/off for this tenant. Edit agent definitions on the <button onClick={() => navigate('/platform/agents')} className="text-amber-600 hover:underline">Agents page</button>.
        </p>
      </div>

      <div className="space-y-2">
        {sourceAgents.map((agent) => {
          const requiredModule = AGENT_MODULE_MAP[agent.key];
          const moduleEnabled = requiredModule === null || tenantModules.includes(requiredModule);
          const override = agentOverrides.find((o) => o.agent_key === agent.key);
          const hasCustomPrompt = expandedPrompt === agent.key;

          let statusLabel, statusColor;
          if (!moduleEnabled) {
            statusLabel = 'Module Off';
            statusColor = 'bg-gray-100 text-gray-500';
          } else if (override && !override.is_enabled) {
            statusLabel = 'Disabled';
            statusColor = 'bg-red-50 text-red-600';
          } else {
            statusLabel = 'Active';
            statusColor = 'bg-green-50 text-green-700';
          }

          const deptColor = DEPT_COLORS[agent.department] || '#6B7280';

          return (
            <div
              key={agent.key}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              style={{ borderLeftColor: deptColor, borderLeftWidth: '3px' }}
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-dark-text">{agent.name}</span>
                      <span className="text-xs text-secondary-text capitalize">{agent.department}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>
                    {statusLabel}
                  </span>

                  {/* Custom prompt toggle */}
                  <button
                    onClick={() => setExpandedPrompt(hasCustomPrompt ? null : agent.key)}
                    className="text-xs text-secondary-text hover:text-amber-600 transition-colors"
                    title="Custom prompt additions"
                  >
                    <FileText size={14} className={override?.custom_prompt_additions ? 'text-amber-500' : ''} />
                  </button>

                  {/* Edit Agent link */}
                  <button
                    onClick={() => navigate(`/platform/agents/${agent.key}`)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
                  >
                    Edit Agent
                  </button>

                  {/* Toggle */}
                  {moduleEnabled && (
                    <button
                      onClick={() => onToggleAgent(agent.key, override)}
                      disabled={savingOverride === agent.key}
                      className="text-gray-500 hover:text-amber-600 transition-colors disabled:opacity-50"
                    >
                      {savingOverride === agent.key ? (
                        <Loader2 size={20} className="animate-spin text-amber-500" />
                      ) : (override && !override.is_enabled) ? (
                        <ToggleLeft size={24} className="text-gray-400" />
                      ) : (
                        <ToggleRight size={24} className="text-amber-600" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Custom Prompt Additions (collapsible) */}
              {hasCustomPrompt && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <FileText size={14} className="text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Custom Prompt Addition</span>
                  </div>
                  <textarea
                    value={customPrompts[agent.key] || ''}
                    onChange={(e) => setCustomPrompts((prev) => ({ ...prev, [agent.key]: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500 resize-y"
                    placeholder="Additional instructions appended to this agent's system prompt for this tenant..."
                  />
                  <button
                    onClick={() => handleSaveCustomPrompt(agent.key)}
                    disabled={savingPrompt === agent.key}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {savingPrompt === agent.key ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save Custom Prompt
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Brand Tab ─── */

function BrandTab({ editBrand, setEditBrand, saving, onSave, tenantId }) {
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef(null);

  function update(key, value) {
    setEditBrand((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${tenantId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(path);
      update('brand_logo_url', urlData.publicUrl);
    } catch (err) {
      console.error('Logo upload failed:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-dark-text">Tenant Branding</h2>
          <p className="text-sm text-secondary-text mt-1">
            Configure how this tenant's portal looks. Changes apply when the tenant portal reads these values.
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Brand'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
        {/* Display Name */}
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Display Name</div>
            <div className="text-xs text-secondary-text mt-0.5">Overrides company name in the tenant portal header</div>
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={editBrand.brand_display_name}
              onChange={(e) => update('brand_display_name', e.target.value)}
              placeholder="e.g., A&A Portal"
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Logo */}
        <div className="p-5 flex flex-col md:flex-row md:items-start gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Logo</div>
            <div className="text-xs text-secondary-text mt-0.5">Upload an image or paste a URL. Displayed on login and sidebar.</div>
          </div>
          <div className="flex-1 space-y-3">
            {/* Current logo preview */}
            {editBrand.brand_logo_url && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <img
                  src={editBrand.brand_logo_url}
                  alt="Logo preview"
                  className="h-10 max-w-[160px] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="text-xs text-secondary-text flex-1">Current logo</span>
                <button
                  type="button"
                  onClick={() => update('brand_logo_url', '')}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            )}

            {/* Upload dropzone */}
            <input
              ref={logoInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.svg,.webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-amber-400 hover:bg-amber-50/30 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-secondary-text">
                  <Loader2 size={16} className="animate-spin" /> Uploading...
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-sm text-secondary-text">Click to upload logo</span>
                  <span className="text-xs text-gray-400">PNG, JPG, SVG, or WebP</span>
                </div>
              )}
            </button>

            {/* Paste URL fallback */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">or paste URL:</span>
              <input
                type="text"
                value={editBrand.brand_logo_url}
                onChange={(e) => update('brand_logo_url', e.target.value)}
                placeholder="https://example.com/logo.png"
                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Primary Color */}
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Primary Color</div>
            <div className="text-xs text-secondary-text mt-0.5">Buttons, links, and accents in the tenant portal</div>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <input
              type="color"
              value={editBrand.brand_primary_color}
              onChange={(e) => update('brand_primary_color', e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={editBrand.brand_primary_color}
              onChange={(e) => update('brand_primary_color', e.target.value)}
              className="w-32 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              placeholder="#009ADE"
            />
          </div>
        </div>

        {/* Sidebar Background */}
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Sidebar Background</div>
            <div className="text-xs text-secondary-text mt-0.5">Dark sidebar color in the tenant portal</div>
          </div>
          <div className="flex-1 flex items-center gap-3">
            <input
              type="color"
              value={editBrand.brand_sidebar_bg}
              onChange={(e) => update('brand_sidebar_bg', e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={editBrand.brand_sidebar_bg}
              onChange={(e) => update('brand_sidebar_bg', e.target.value)}
              className="w-32 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              placeholder="#1B2133"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── API Keys Tab ─── */

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

const SERVICE_TYPES = [
  { key: 'anthropic', label: 'Anthropic (Claude)', description: 'Powers all AI agent calls', placeholder: 'sk-ant-...' },
  { key: 'snowflake', label: 'Snowflake', description: 'Data warehouse queries (future)', placeholder: '' },
];

async function credentialFetch(path, options = {}) {
  const token = await getFreshToken();
  if (!token) throw new Error('Not authenticated — please sign in again');

  const res = await fetch(`${BACKEND_URL}/api/credentials${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

function ApiKeysTab({ tenantId }) {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [editingService, setEditingService] = useState(null);
  const [formKey, setFormKey] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test / delete state
  const [testing, setTesting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    loadCredentials();
  }, [tenantId]);

  async function loadCredentials() {
    setLoading(true);
    setError(null);
    try {
      const data = await credentialFetch(`/${tenantId}`);
      setCredentials(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleSave(serviceType) {
    if (!formKey.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const existing = credentials.find((c) => c.service_type === serviceType);

      if (existing) {
        const updated = await credentialFetch(`/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ key: formKey, label: formLabel || null }),
        });
        setCredentials((prev) => prev.map((c) => (c.id === existing.id ? updated : c)));
      } else {
        const created = await credentialFetch(`/${tenantId}`, {
          method: 'POST',
          body: JSON.stringify({ service_type: serviceType, key: formKey, label: formLabel || null }),
        });
        setCredentials((prev) => [...prev, created]);
      }

      setSuccess(`${serviceType} key saved successfully`);
      setTimeout(() => setSuccess(null), 3000);
      setEditingService(null);
      setFormKey('');
      setFormLabel('');
      setShowKey(false);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  async function handleTest(credentialId) {
    setTesting(credentialId);
    setError(null);
    setSuccess(null);

    try {
      const result = await credentialFetch(`/${credentialId}/test`, { method: 'POST' });
      if (result.success) {
        setSuccess('API key verified — connection successful');
      } else {
        setError(`Key test failed: ${result.message}`);
      }
    } catch (err) {
      setError(err.message);
    }
    setTesting(null);
    setTimeout(() => { setSuccess(null); setError(null); }, 4000);
  }

  async function handleDelete(credentialId) {
    setDeleting(credentialId);
    setError(null);

    try {
      await credentialFetch(`/${credentialId}`, { method: 'DELETE' });
      setCredentials((prev) => prev.filter((c) => c.id !== credentialId));
      setSuccess('Credential removed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
    setDeleting(null);
    setConfirmDelete(null);
  }

  function startEdit(serviceType) {
    const existing = credentials.find((c) => c.service_type === serviceType);
    setEditingService(serviceType);
    setFormKey('');
    setFormLabel(existing?.credential_label || '');
    setShowKey(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-dark-text">API Credentials</h2>
        <p className="text-sm text-secondary-text mt-1">
          Manage API keys for this tenant. Keys are encrypted at rest and never visible after saving.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle size={16} className="shrink-0" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SERVICE_TYPES.map((svc) => {
          const cred = credentials.find((c) => c.service_type === svc.key);
          const isEditing = editingService === svc.key;

          return (
            <div
              key={svc.key}
              className={`bg-white rounded-lg border p-5 transition-colors ${
                cred?.is_active ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Key size={16} className={cred?.is_active ? 'text-green-600' : 'text-gray-400'} />
                  <h3 className="text-sm font-semibold text-dark-text">{svc.label}</h3>
                </div>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    cred?.is_active
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {cred?.is_active ? 'Configured' : 'Not Set'}
                </span>
              </div>

              <p className="text-xs text-secondary-text mb-4">{svc.description}</p>

              {/* Credential Details */}
              {cred && !isEditing && (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-secondary-text">Key:</span>
                    <span className="font-mono text-dark-text">{'•'.repeat(20)}{cred.key_hint}</span>
                  </div>
                  {cred.credential_label && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-secondary-text">Label:</span>
                      <span className="text-dark-text">{cred.credential_label}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-secondary-text">
                    Updated {new Date(cred.updated_at).toLocaleDateString()}
                  </div>
                </div>
              )}

              {/* Edit Form */}
              {isEditing && (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-secondary-text mb-1">
                      API Key {cred ? '(replace existing)' : ''}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={formKey}
                        onChange={(e) => setFormKey(e.target.value)}
                        placeholder={svc.placeholder}
                        className="w-full px-3 py-2 pr-10 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary-text mb-1">Label (optional)</label>
                    <input
                      type="text"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      placeholder="e.g., Production Key"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(svc.key)}
                      disabled={saving || !formKey.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Key
                    </button>
                    <button
                      onClick={() => { setEditingService(null); setFormKey(''); setFormLabel(''); setShowKey(false); }}
                      className="px-3 py-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {!isEditing && (
                  <button
                    onClick={() => startEdit(svc.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                  >
                    <Key size={14} />
                    {cred ? 'Replace Key' : 'Add Key'}
                  </button>
                )}

                {cred && !isEditing && (
                  <>
                    <button
                      onClick={() => handleTest(cred.id)}
                      disabled={testing === cred.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {testing === cred.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <FlaskConical size={14} />
                      )}
                      Test
                    </button>

                    {confirmDelete === cred.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-red-600">Delete?</span>
                        <button
                          onClick={() => handleDelete(cred.id)}
                          disabled={deleting === cred.id}
                          className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {deleting === cred.id ? <Loader2 size={12} className="animate-spin" /> : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 text-xs text-secondary-text hover:text-dark-text transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(cred.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Knowledge Tab ─── */

const DEPARTMENTS = [
  { key: 'all', label: 'All' },
  { key: 'hr', label: 'HR' },
  { key: 'finance', label: 'Finance' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'sales', label: 'Sales' },
  { key: 'ops', label: 'Ops' },
  { key: 'admin', label: 'Admin' },
  { key: 'general', label: 'General' },
];

const DOC_TYPES = [
  { key: 'sop', label: 'SOP' },
  { key: 'policy', label: 'Policy' },
  { key: 'reference', label: 'Reference' },
  { key: 'template', label: 'Template' },
  { key: 'other', label: 'Other' },
];

const FILE_TYPE_BADGE = {
  pdf: 'bg-red-50 text-red-700',
  docx: 'bg-blue-50 text-blue-700',
  txt: 'bg-gray-100 text-gray-700',
};

const DOC_TYPE_BADGE = {
  sop: 'bg-amber-50 text-amber-700',
  policy: 'bg-purple-50 text-purple-700',
  reference: 'bg-green-50 text-green-700',
  template: 'bg-cyan-50 text-cyan-700',
  other: 'bg-gray-100 text-gray-600',
};

function KnowledgeTab({ tenantId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDept, setUploadDept] = useState('general');
  const [uploadDocType, setUploadDocType] = useState('sop');
  const [filterDept, setFilterDept] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadDocuments();
  }, [tenantId]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('tenant_documents')
      .select('id, file_name, file_type, file_size, department, doc_type, char_count, page_count, status, title, description, created_at, deleted_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  }

  async function handleFiles(files) {
    const validFiles = Array.from(files).filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.txt');
    });

    if (validFiles.length === 0) {
      setError('No supported files selected. Upload PDF, DOCX, or TXT files.');
      setTimeout(() => setError(null), 4000);
      return;
    }

    if (validFiles.some((f) => f.size > 20 * 1024 * 1024)) {
      setError('One or more files exceed the 20 MB limit.');
      setTimeout(() => setError(null), 4000);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    const { extractText } = await import('../../utils/docExtractor.js');

    let uploaded = 0;
    let failed = 0;

    for (const file of validFiles) {
      try {
        const result = await extractText(file);
        const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'pdf'
          : file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'txt';

        const storagePath = buildDocumentPath(tenantId, uploadDept, file.name);
        const { error: uploadErr } = await supabase.storage
          .from('tenant-documents')
          .upload(storagePath, file);

        if (uploadErr) throw uploadErr;

        const { error: insertErr } = await supabase
          .from('tenant_documents')
          .insert({
            tenant_id: tenantId,
            department: uploadDept,
            doc_type: uploadDocType,
            file_name: file.name,
            file_type: fileType,
            file_size: file.size,
            storage_path: storagePath,
            page_count: result.pageCount || null,
            extracted_text: result.text,
            char_count: result.text.length,
            status: result.warning ? 'failed' : 'extracted',
            status_detail: result.warning || null,
          });

        if (insertErr) throw insertErr;
        uploaded++;
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        failed++;
      }
    }

    setUploading(false);

    if (uploaded > 0) {
      setSuccess(`${uploaded} document${uploaded > 1 ? 's' : ''} uploaded${failed > 0 ? ` (${failed} failed)` : ''}`);
      setTimeout(() => setSuccess(null), 4000);
      loadDocuments();
    }
    if (failed > 0 && uploaded === 0) {
      setError(`Failed to upload ${failed} file${failed > 1 ? 's' : ''}`);
      setTimeout(() => setError(null), 4000);
    }
  }

  async function handleDelete(docId) {
    setDeleting(docId);
    setError(null);

    try {
      const { data: doc, error: fetchErr } = await supabase
        .from('tenant_documents')
        .select('storage_path')
        .eq('id', docId)
        .single();

      if (fetchErr) throw fetchErr;

      const { error: storageErr } = await supabase.storage
        .from('tenant-documents')
        .remove([doc.storage_path]);

      if (storageErr) throw storageErr;

      const { error: deleteErr } = await supabase
        .from('tenant_documents')
        .delete()
        .eq('id', docId);

      if (deleteErr) throw deleteErr;

      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setSuccess('Document deleted');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
    setDeleting(null);
    setConfirmDelete(null);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  const filtered = filterDept === 'all'
    ? documents
    : documents.filter((d) => d.department === filterDept);

  const totalChars = documents.reduce((sum, d) => sum + (d.char_count || 0), 0);
  const deptSet = new Set(documents.map((d) => d.department));
  const deptCounts = {};
  documents.forEach((d) => { deptCounts[d.department] = (deptCounts[d.department] || 0) + 1; });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-dark-text">Knowledge Base</h2>
        <p className="text-sm text-secondary-text mt-1">
          Upload SOPs, policies, and reference documents. Extracted text is used as context for AI agents.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle size={16} className="shrink-0" />
          {success}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text uppercase tracking-wider">Documents</div>
          <div className="text-2xl font-semibold text-dark-text mt-1">{documents.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text uppercase tracking-wider">Extracted Text</div>
          <div className="text-2xl font-semibold text-dark-text mt-1">
            {totalChars >= 1000 ? `${(totalChars / 1000).toFixed(0)}K` : totalChars} chars
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text uppercase tracking-wider">Departments</div>
          <div className="text-2xl font-semibold text-dark-text mt-1">{deptSet.size}</div>
        </div>
      </div>

      {/* Upload section */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-dark-text">Upload Documents</h3>
        <div className="flex gap-3">
          <select
            value={uploadDept}
            onChange={(e) => setUploadDept(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500 bg-white"
          >
            {DEPARTMENTS.filter((d) => d.key !== 'all').map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
          <select
            value={uploadDocType}
            onChange={(e) => setUploadDocType(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500 bg-white"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-amber-400 bg-amber-50'
              : 'border-gray-300 hover:border-amber-300 hover:bg-gray-50'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="text-amber-500 animate-spin" />
              <span className="text-sm text-secondary-text">Extracting text and uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={24} className="text-gray-400" />
              <span className="text-sm text-secondary-text">Drop documents here or click to upload</span>
              <span className="text-xs text-gray-400">PDF, DOCX, TXT — max 20 MB</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => { if (e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ''; }}
            className="hidden"
          />
        </div>
      </div>

      {/* Filter pills */}
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((dept) => {
            const count = dept.key === 'all' ? documents.length : (deptCounts[dept.key] || 0);
            if (dept.key !== 'all' && count === 0) return null;
            const isActive = filterDept === dept.key;
            return (
              <button
                key={dept.key}
                onClick={() => setFilterDept(dept.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  isActive
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'
                }`}
              >
                {dept.label}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* Document list */}
      {filtered.length === 0 && !loading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
          {documents.length === 0 ? 'No documents uploaded yet.' : 'No documents match this filter.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const isExpanded = expandedDoc === doc.id;
            return (
              <div
                key={doc.id}
                className={`bg-white rounded-lg border border-gray-200 overflow-hidden${doc.deleted_at ? ' opacity-60' : ''}`}
              >
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText size={16} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-dark-text truncate">{doc.file_name}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${FILE_TYPE_BADGE[doc.file_type] || 'bg-gray-100 text-gray-600'}`}>
                          {doc.file_type}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${DOC_TYPE_BADGE[doc.doc_type] || 'bg-gray-100 text-gray-600'}`}>
                          {doc.doc_type}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600 capitalize">
                          {doc.department}
                        </span>
                        {doc.deleted_at && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-50 text-red-700">
                            Deleted by tenant
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-secondary-text">
                        <span>{formatFileSize(doc.file_size)}</span>
                        {doc.page_count && <span>· {doc.page_count} pages</span>}
                        {doc.char_count && <span>· {doc.char_count.toLocaleString()} chars</span>}
                        <span>· {new Date(doc.created_at).toLocaleDateString()}</span>
                        {doc.status === 'failed' && (
                          <span className="text-red-500 font-medium">· Extraction failed</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                      className="p-1 text-gray-400 hover:text-amber-600 transition-colors"
                      title={isExpanded ? 'Collapse preview' : 'Preview extracted text'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {confirmDelete === doc.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-red-600">Permanently delete?</span>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {deleting === doc.id ? <Loader2 size={12} className="animate-spin" /> : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 text-xs text-secondary-text hover:text-dark-text transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(doc.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Permanently delete document"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <DocumentTextPreview docId={doc.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Document Text Preview ─── */

function DocumentTextPreview({ docId }) {
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('tenant_documents')
        .select('extracted_text')
        .eq('id', docId)
        .single();

      if (cancelled) return;

      if (err) {
        setError(err.message);
      } else {
        setText(data?.extracted_text || '');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [docId]);

  if (loading) {
    return (
      <div className="border-t border-gray-100 px-4 py-4 flex items-center justify-center">
        <Loader2 size={16} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-gray-100 px-4 py-3 text-xs text-red-500">
        Failed to load text: {error}
      </div>
    );
  }

  if (!text) {
    return (
      <div className="border-t border-gray-100 px-4 py-3 text-xs text-secondary-text italic">
        No extracted text available.
      </div>
    );
  }

  const preview = text.length > 3000 ? text.slice(0, 3000) + '\n\n... (truncated)' : text;

  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <pre className="text-xs font-mono text-gray-700 bg-gray-50 rounded-lg p-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
        {preview}
      </pre>
    </div>
  );
}

/* ─── Automation Tab ─── */

const AUTOMATION_DEPARTMENTS = [
  { key: 'all', label: 'All' },
  { key: 'hr', label: 'HR' },
  { key: 'finance', label: 'Finance' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'sales', label: 'Sales' },
  { key: 'ops', label: 'Ops' },
  { key: 'admin', label: 'Admin' },
  { key: 'general', label: 'General' },
];

const PRIORITY_BADGE = {
  'quick-win': 'bg-green-50 text-green-700',
  'medium-term': 'bg-amber-50 text-amber-700',
  'long-term': 'bg-purple-50 text-purple-700',
};

const EFFORT_BADGE = {
  low: 'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
};

const IMPACT_BADGE = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-green-50 text-green-700',
};

async function sopAnalysisFetch(path, options = {}) {
  const token = await getFreshToken();
  if (!token) throw new Error('Not authenticated — please sign in again');

  const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
  const res = await fetch(`${backendUrl}/api/sop-analysis${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed: ${res.status}`);
  return body;
}

function AutomationTab({ tenantId }) {
  const [documents, setDocuments] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [roadmaps, setRoadmaps] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [filterDept, setFilterDept] = useState('all');
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState(null);
  const [expandedRoadmap, setExpandedRoadmap] = useState(null);
  const [convertingActions, setConvertingActions] = useState(false);
  const [generatingSkillId, setGeneratingSkillId] = useState(null);
  const [activatingSkillId, setActivatingSkillId] = useState(null);
  const [generatingAllSkills, setGeneratingAllSkills] = useState(false);

  useEffect(() => {
    loadData();
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch SOP documents
      const { data: docs } = await supabase
        .from('tenant_documents')
        .select('id, file_name, department, doc_type, char_count, status, created_at')
        .eq('tenant_id', tenantId)
        .eq('doc_type', 'sop')
        .eq('status', 'extracted')
        .order('department')
        .order('file_name');

      setDocuments(docs || []);

      // Fetch existing analyses, roadmaps, and actions
      const [results, actionsResult] = await Promise.all([
        sopAnalysisFetch(`/results?tenant_id=${tenantId}`),
        sopAnalysisFetch(`/actions?tenant_id=${tenantId}`),
      ]);
      setAnalyses(results.analyses || []);
      setRoadmaps(results.roadmaps || []);
      setActions(actionsResult.actions || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleAnalyze(documentIds) {
    setError(null);
    setSuccess(null);
    const newAnalyzing = new Set(analyzingIds);
    documentIds.forEach(id => newAnalyzing.add(id));
    setAnalyzingIds(newAnalyzing);

    try {
      await sopAnalysisFetch('/analyze', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, document_ids: documentIds }),
      });
      setSuccess(`Analyzed ${documentIds.length} SOP${documentIds.length > 1 ? 's' : ''} successfully.`);
      setTimeout(() => setSuccess(null), 4000);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    const cleared = new Set(analyzingIds);
    documentIds.forEach(id => cleared.delete(id));
    setAnalyzingIds(cleared);
  }

  async function handleGenerateRoadmap(department) {
    setError(null);
    setSuccess(null);
    setGeneratingRoadmap(true);

    try {
      await sopAnalysisFetch('/roadmap', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, department }),
      });
      setSuccess(`Roadmap generated for ${department}.`);
      setTimeout(() => setSuccess(null), 4000);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    setGeneratingRoadmap(false);
  }

  async function handleConvertToActions(roadmapId) {
    setError(null);
    setSuccess(null);
    setConvertingActions(true);

    try {
      const result = await sopAnalysisFetch('/convert-to-actions', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, roadmap_id: roadmapId }),
      });
      setSuccess(`Created ${result.count} automation action${result.count !== 1 ? 's' : ''}.`);
      setTimeout(() => setSuccess(null), 4000);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    setConvertingActions(false);
  }

  async function handleGenerateSkill(actionId) {
    setError(null);
    setGeneratingSkillId(actionId);

    try {
      await sopAnalysisFetch('/generate-skill', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, action_id: actionId }),
      });
      setSuccess('Skill prompt generated.');
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    setGeneratingSkillId(null);
  }

  async function handleGenerateAllSkills() {
    setError(null);
    setGeneratingAllSkills(true);

    const planned = actions.filter(
      a => a.status === 'planned' && (a.assignee_type === 'agent' || a.assignee_type === 'hybrid')
    );

    for (const action of planned) {
      try {
        await sopAnalysisFetch('/generate-skill', {
          method: 'POST',
          body: JSON.stringify({ tenant_id: tenantId, action_id: action.id }),
        });
      } catch (err) {
        console.error(`Skill generation failed for ${action.id}:`, err.message);
      }
    }

    setSuccess(`Generated skills for ${planned.length} action(s).`);
    setTimeout(() => setSuccess(null), 4000);
    await loadData();
    setGeneratingAllSkills(false);
  }

  async function handleActivateSkill(actionId) {
    setError(null);
    setActivatingSkillId(actionId);

    try {
      await sopAnalysisFetch('/activate-skill', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: tenantId, action_id: actionId }),
      });
      setSuccess('Skill activated and pushed to tenant agent.');
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    setActivatingSkillId(null);
  }

  async function handleActivateAll() {
    setError(null);
    const ready = actions.filter(a => a.status === 'ready_for_review');

    for (const action of ready) {
      try {
        await sopAnalysisFetch('/activate-skill', {
          method: 'POST',
          body: JSON.stringify({ tenant_id: tenantId, action_id: action.id }),
        });
      } catch (err) {
        console.error(`Activation failed for ${action.id}:`, err.message);
      }
    }

    setSuccess(`Activated ${ready.length} skill(s).`);
    setTimeout(() => setSuccess(null), 4000);
    await loadData();
  }

  async function handleDismissAction(actionId) {
    await supabase
      .from('automation_actions')
      .update({ status: 'dismissed' })
      .eq('id', actionId);
    await loadData();
  }

  // Build lookup: document_id → analysis
  const analysisMap = {};
  for (const a of analyses) {
    analysisMap[a.document_id] = a;
  }

  // Filter documents by department
  const filtered = filterDept === 'all'
    ? documents
    : documents.filter(d => d.department === filterDept);

  // Department counts
  const deptCounts = { all: documents.length };
  for (const d of documents) {
    deptCounts[d.department] = (deptCounts[d.department] || 0) + 1;
  }

  // Summary metrics
  const completedAnalyses = analyses.filter(a => a.status === 'completed');
  const avgScore = completedAnalyses.length
    ? Math.round(completedAnalyses.reduce((sum, a) => sum + (a.analysis?.automation_score || 0), 0) / completedAnalyses.length)
    : 0;
  const quickWinsCount = completedAnalyses.reduce(
    (sum, a) => sum + (a.analysis?.quick_wins?.length || 0), 0
  );

  // Active department roadmap
  const activeRoadmap = filterDept !== 'all'
    ? roadmaps.find(r => r.department === filterDept && r.status === 'completed')
    : null;
  const deptHasAnalyses = filterDept !== 'all'
    ? completedAnalyses.some(a => a.department === filterDept)
    : false;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{success}</div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text mb-1">SOPs Available</div>
          <div className="text-2xl font-semibold text-dark-text">{documents.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text mb-1">SOPs Analyzed</div>
          <div className="text-2xl font-semibold text-dark-text">{completedAnalyses.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text mb-1">Avg Automation Score</div>
          <div className="text-2xl font-semibold text-dark-text">{avgScore}<span className="text-sm text-secondary-text">/100</span></div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-xs font-medium text-secondary-text mb-1">Quick Wins Found</div>
          <div className="text-2xl font-semibold text-dark-text">{quickWinsCount}</div>
        </div>
      </div>

      {/* Department Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {AUTOMATION_DEPARTMENTS.map(dept => {
          const count = deptCounts[dept.key] || 0;
          const isActive = filterDept === dept.key;
          return (
            <button
              key={dept.key}
              onClick={() => setFilterDept(dept.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                isActive
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'
              }`}
            >
              {dept.label} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Batch Actions */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleAnalyze(filtered.map(d => d.id))}
            disabled={analyzingIds.size > 0}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {analyzingIds.size > 0 ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Analyze All ({filtered.length})
          </button>
          <span className="text-xs text-secondary-text">Analyzes {filterDept === 'all' ? 'all' : filterDept} SOPs with Claude</span>
        </div>
      )}

      {/* SOP Documents List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <FileText size={16} className="text-secondary-text" />
          <span className="text-sm font-medium text-dark-text">SOP Documents</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-secondary-text">
            No SOP documents found{filterDept !== 'all' ? ` for ${filterDept}` : ''}. Upload SOPs in the Knowledge tab first.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(doc => {
              const analysis = analysisMap[doc.id];
              const isAnalyzing = analyzingIds.has(doc.id);
              const isExpanded = expandedAnalysis === doc.id;
              const deptColor = DEPT_COLORS[doc.department] || '#6B7280';

              return (
                <div key={doc.id}>
                  <div
                    className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                    style={{ borderLeftColor: deptColor, borderLeftWidth: '3px' }}
                    onClick={() => analysis?.status === 'completed' && setExpandedAnalysis(isExpanded ? null : doc.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-dark-text truncate">{doc.file_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{doc.department}</span>
                        {analysis?.status === 'completed' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            Score: {analysis.analysis?.automation_score}/100
                          </span>
                        )}
                        {analysis?.status === 'failed' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">Failed</span>
                        )}
                        {analysis?.initiated_by_type === 'tenant' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">Tenant-initiated</span>
                        )}
                        {!analysis && (
                          <span className="text-xs text-secondary-text">Not analyzed</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {analysis?.status === 'completed' && (
                        <ChevronRight size={14} className={`text-secondary-text transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAnalyze([doc.id]); }}
                        disabled={isAnalyzing}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        {analysis ? 'Re-analyze' : 'Analyze'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Analysis */}
                  {isExpanded && analysis?.analysis && (
                    <AnalysisDetail analysis={analysis.analysis} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Department Roadmap Section */}
      {filterDept !== 'all' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-secondary-text" />
              <span className="text-sm font-medium text-dark-text">
                {filterDept.charAt(0).toUpperCase() + filterDept.slice(1)} Department Roadmap
              </span>
            </div>
            <div className="flex items-center gap-2">
              {activeRoadmap?.initiated_by_type === 'tenant' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">Tenant-initiated</span>
              )}
            {deptHasAnalyses && (
              <button
                onClick={() => handleGenerateRoadmap(filterDept)}
                disabled={generatingRoadmap}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {generatingRoadmap ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {activeRoadmap ? 'Regenerate Roadmap' : 'Generate Roadmap'}
              </button>
            )}
            </div>
          </div>

          {!deptHasAnalyses ? (
            <div className="px-4 py-8 text-center text-sm text-secondary-text">
              Analyze at least one SOP in this department to generate a roadmap.
            </div>
          ) : !activeRoadmap ? (
            <div className="px-4 py-8 text-center text-sm text-secondary-text">
              Click "Generate Roadmap" to create a phased automation plan for this department.
            </div>
          ) : (
            <>
              <RoadmapDetail roadmap={activeRoadmap.roadmap} />
              <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
                <button
                  onClick={() => handleConvertToActions(activeRoadmap.id)}
                  disabled={convertingActions}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {convertingActions ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Convert to Actions
                </button>
                <span className="text-xs text-secondary-text">
                  Classifies each roadmap item as agent-executable, hybrid, or manual
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Automation Actions Section */}
      {actions.length > 0 && (
        <ActionsSection
          actions={filterDept === 'all' ? actions : actions.filter(a => a.department === filterDept)}
          generatingSkillId={generatingSkillId}
          activatingSkillId={activatingSkillId}
          generatingAllSkills={generatingAllSkills}
          onGenerateSkill={handleGenerateSkill}
          onActivateSkill={handleActivateSkill}
          onDismiss={handleDismissAction}
          onGenerateAllSkills={handleGenerateAllSkills}
          onActivateAll={handleActivateAll}
        />
      )}
    </div>
  );
}

const ASSIGNEE_BADGE = {
  agent: 'bg-green-50 text-green-700 border-green-200',
  hybrid: 'bg-blue-50 text-blue-700 border-blue-200',
  human: 'bg-gray-100 text-gray-600 border-gray-200',
  manual: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_BADGE = {
  planned: 'bg-gray-100 text-gray-600',
  skill_generating: 'bg-amber-50 text-amber-700',
  ready_for_review: 'bg-blue-50 text-blue-700',
  active: 'bg-green-50 text-green-700',
  manual: 'bg-gray-100 text-gray-600',
  dismissed: 'bg-red-50 text-red-400',
};

const STATUS_ORDER = ['planned', 'skill_generating', 'ready_for_review', 'active', 'manual', 'dismissed'];

function ActionsSection({
  actions, generatingSkillId, activatingSkillId, generatingAllSkills,
  onGenerateSkill, onActivateSkill, onDismiss, onGenerateAllSkills, onActivateAll,
}) {
  const grouped = {};
  for (const a of actions) {
    if (!grouped[a.status]) grouped[a.status] = [];
    grouped[a.status].push(a);
  }

  const plannedAgentCount = actions.filter(
    a => a.status === 'planned' && (a.assignee_type === 'agent' || a.assignee_type === 'hybrid')
  ).length;
  const readyCount = actions.filter(a => a.status === 'ready_for_review').length;
  const activeCount = actions.filter(a => a.status === 'active').length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-amber-500" />
          <span className="text-sm font-medium text-dark-text">Automation Actions</span>
          <span className="text-xs text-secondary-text">({actions.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {plannedAgentCount > 0 && (
            <button
              onClick={onGenerateAllSkills}
              disabled={generatingAllSkills}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {generatingAllSkills ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Generate All Skills ({plannedAgentCount})
            </button>
          )}
          {readyCount > 0 && (
            <button
              onClick={onActivateAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              <CheckCircle size={12} />
              Activate All ({readyCount})
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-6 text-xs">
        <span className="text-green-700">{activeCount} active</span>
        <span className="text-blue-700">{readyCount} ready</span>
        <span className="text-gray-600">{plannedAgentCount} planned</span>
        <span className="text-gray-500">
          {actions.filter(a => a.status === 'manual').length} manual
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {STATUS_ORDER.map(status => {
          const group = grouped[status];
          if (!group?.length) return null;

          return (
            <div key={status}>
              <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-secondary-text uppercase tracking-wider">
                {status.replace(/_/g, ' ')} ({group.length})
              </div>
              {group.map(action => (
                <div key={action.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-dark-text">{action.title}</div>
                    <div className="text-xs text-secondary-text mt-0.5 line-clamp-2">{action.description}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${ASSIGNEE_BADGE[action.assignee_type] || ASSIGNEE_BADGE.manual}`}>
                        {action.assignee_type}
                      </span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_BADGE[action.status] || ''}`}>
                        {action.status.replace(/_/g, ' ')}
                      </span>
                      {action.agent_key && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                          {action.agent_key}
                        </span>
                      )}
                      {action.effort && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${EFFORT_BADGE[action.effort] || ''}`}>
                          {action.effort}
                        </span>
                      )}
                      {action.impact && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${IMPACT_BADGE[action.impact] || ''}`}>
                          {action.impact}
                        </span>
                      )}
                      {action.estimated_time_saved && (
                        <span className="text-[11px] text-secondary-text">{action.estimated_time_saved}</span>
                      )}
                      {action.source_sop && (
                        <span className="text-[11px] text-secondary-text">Source: {action.source_sop}</span>
                      )}
                      {action.initiated_by_type === 'tenant' && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          Tenant-initiated
                        </span>
                      )}
                    </div>
                    {action.agent_skill_prompt && action.status === 'ready_for_review' && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-800 max-h-24 overflow-y-auto">
                        <div className="font-medium mb-1">Generated Skill Preview:</div>
                        {action.agent_skill_prompt.slice(0, 300)}
                        {action.agent_skill_prompt.length > 300 && '...'}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {action.status === 'planned' && (action.assignee_type === 'agent' || action.assignee_type === 'hybrid') && (
                      <button
                        onClick={() => onGenerateSkill(action.id)}
                        disabled={generatingSkillId === action.id}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {generatingSkillId === action.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        Generate Skill
                      </button>
                    )}
                    {action.status === 'ready_for_review' && (
                      <button
                        onClick={() => onActivateSkill(action.id)}
                        disabled={activatingSkillId === action.id}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        {activatingSkillId === action.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Activate
                      </button>
                    )}
                    {action.status !== 'dismissed' && action.status !== 'active' && (
                      <button
                        onClick={() => onDismiss(action.id)}
                        className="px-2 py-1.5 text-xs text-secondary-text hover:text-red-600 transition-colors"
                        title="Dismiss"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalysisDetail({ analysis }) {
  return (
    <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 space-y-4">
      {/* Summary */}
      <div>
        <div className="text-xs font-medium text-secondary-text mb-1">Summary</div>
        <div className="text-sm text-dark-text">{analysis.summary}</div>
      </div>

      {/* Readiness */}
      <div className="flex items-center gap-4">
        <div>
          <span className="text-xs text-secondary-text">Automation Score: </span>
          <span className="text-sm font-semibold text-dark-text">{analysis.automation_score}/100</span>
        </div>
        <div>
          <span className="text-xs text-secondary-text">Readiness: </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            analysis.automation_readiness === 'high' ? 'bg-green-50 text-green-700' :
            analysis.automation_readiness === 'medium' ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-700'
          }`}>
            {analysis.automation_readiness}
          </span>
        </div>
      </div>

      {/* Manual Steps */}
      {analysis.manual_steps?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-secondary-text mb-2">Manual Steps ({analysis.manual_steps.length})</div>
          <div className="space-y-1">
            {analysis.manual_steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-secondary-text shrink-0 w-5 text-right">{step.step_number}.</span>
                <span className="text-dark-text flex-1">{step.description}</span>
                <span className="text-secondary-text shrink-0">{step.frequency}</span>
                <span className="text-secondary-text shrink-0">{step.current_effort_minutes}min</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded ${EFFORT_BADGE[step.complexity] || 'bg-gray-100 text-gray-600'}`}>
                  {step.complexity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation Candidates */}
      {analysis.automation_candidates?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-secondary-text mb-2">Automation Candidates ({analysis.automation_candidates.length})</div>
          <div className="space-y-2">
            {analysis.automation_candidates.map((cand, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="text-sm text-dark-text mb-1">{cand.description}</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${PRIORITY_BADGE[cand.priority] || 'bg-gray-100 text-gray-600'}`}>
                    {cand.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${EFFORT_BADGE[cand.effort_to_automate] || ''}`}>
                    Effort: {cand.effort_to_automate}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${IMPACT_BADGE[cand.impact] || ''}`}>
                    Impact: {cand.impact}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {cand.method}
                  </span>
                  {cand.estimated_time_saved_minutes_per_occurrence > 0 && (
                    <span className="text-secondary-text">
                      Saves ~{cand.estimated_time_saved_minutes_per_occurrence}min/occurrence
                    </span>
                  )}
                </div>
                {cand.suggested_tools?.length > 0 && (
                  <div className="mt-1 text-xs text-secondary-text">
                    Tools: {cand.suggested_tools.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Wins */}
      {analysis.quick_wins?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-secondary-text mb-1">Quick Wins</div>
          <ul className="list-disc list-inside text-xs text-dark-text space-y-0.5">
            {analysis.quick_wins.map((qw, i) => <li key={i}>{qw}</li>)}
          </ul>
        </div>
      )}

      {/* Long-term Items */}
      {analysis.long_term_items?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-secondary-text mb-1">Long-term Items</div>
          <ul className="list-disc list-inside text-xs text-dark-text space-y-0.5">
            {analysis.long_term_items.map((lt, i) => <li key={i}>{lt}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function RoadmapDetail({ roadmap }) {
  if (!roadmap) return null;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Summary */}
      <div>
        <div className="text-sm text-dark-text">{roadmap.summary}</div>
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-secondary-text">
            Overall Score: <strong>{roadmap.overall_automation_score}/100</strong>
          </span>
          <span className="text-xs text-secondary-text">
            SOPs Analyzed: <strong>{roadmap.total_sops_analyzed}</strong>
          </span>
          {roadmap.total_estimated_monthly_time_saved && (
            <span className="text-xs text-secondary-text">
              Est. Monthly Savings: <strong>{roadmap.total_estimated_monthly_time_saved}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Phases */}
      {roadmap.phases?.map((phase, pi) => (
        <div key={pi}>
          <div className="text-xs font-semibold text-dark-text mb-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              phase.phase === 'quick-wins' ? 'bg-green-500' :
              phase.phase === 'medium-term' ? 'bg-amber-500' : 'bg-purple-500'
            }`} />
            {phase.label}
          </div>
          {phase.items?.length > 0 ? (
            <div className="space-y-2 ml-4">
              {phase.items.map((item, ii) => (
                <div key={ii} className="flex items-start gap-3 text-xs">
                  <div className="flex-1">
                    <div className="text-dark-text">{item.description}</div>
                    {item.source_sop && (
                      <div className="text-secondary-text mt-0.5">Source: {item.source_sop}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.effort && (
                      <span className={`px-1.5 py-0.5 rounded ${EFFORT_BADGE[item.effort] || 'bg-gray-100 text-gray-600'}`}>
                        {item.effort}
                      </span>
                    )}
                    {item.impact && (
                      <span className={`px-1.5 py-0.5 rounded ${IMPACT_BADGE[item.impact] || 'bg-gray-100 text-gray-600'}`}>
                        {item.impact}
                      </span>
                    )}
                    {item.estimated_time_saved && (
                      <span className="text-secondary-text">{item.estimated_time_saved}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ml-4 text-xs text-secondary-text italic">No items in this phase.</div>
          )}
        </div>
      ))}

      {/* Dependencies */}
      {roadmap.dependencies?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-dark-text mb-1">Dependencies</div>
          <div className="space-y-1 ml-4">
            {roadmap.dependencies.map((dep, i) => (
              <div key={i} className="text-xs text-secondary-text">
                <strong>{dep.item}</strong> depends on <strong>{dep.depends_on}</strong> — {dep.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended First Action */}
      {roadmap.recommended_first_action && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">Recommended First Action</div>
          <div className="text-sm text-amber-900">{roadmap.recommended_first_action}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Dashboards Tab ─── */

const DASHBOARD_KEYS = ['home', 'operations', 'labor', 'quality', 'timekeeping', 'safety'];

function DashboardsTab({ tenantId }) {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [editKey, setEditKey] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // AI Recommendations state
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [recSummary, setRecSummary] = useState('');
  const [acceptedRecs, setAcceptedRecs] = useState(new Set());
  const [applyingRecs, setApplyingRecs] = useState(false);

  // Role Templates state
  const [roleTemplates, setRoleTemplates] = useState([]);
  const [rtLoading, setRtLoading] = useState(true);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [rtSaving, setRtSaving] = useState(false);
  const [rtDeleting, setRtDeleting] = useState(null);
  const [rtConfirmDelete, setRtConfirmDelete] = useState(null);
  const [rtForm, setRtForm] = useState({
    name: '', description: '', metric_tier: 'operational', allowed_domains: [], is_default: false,
  });

  const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

  useEffect(() => {
    loadConfigs();
    loadRoleTemplates();
  }, [tenantId]);

  async function loadConfigs() {
    setLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${backendUrl}/api/dashboards/${tenantId}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setConfigs(json.configs || {});
    } catch (err) {
      console.error('[DashboardsTab] Load error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRoleTemplates() {
    setRtLoading(true);
    const { data, error } = await supabase
      .from('dashboard_role_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at');
    if (!error) setRoleTemplates(data || []);
    setRtLoading(false);
  }

  function resetRtForm() {
    setRtForm({ name: '', description: '', metric_tier: 'operational', allowed_domains: [], is_default: false });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  }

  function startEditTemplate(template) {
    setEditingTemplate(template);
    setRtForm({
      name: template.name,
      description: template.description || '',
      metric_tier: template.metric_tier || 'operational',
      allowed_domains: template.allowed_domains || [],
      is_default: template.is_default || false,
    });
    setShowTemplateForm(true);
  }

  async function handleSaveTemplate() {
    if (!rtForm.name.trim()) return;
    setRtSaving(true);
    setMessage(null);

    // If setting as default, clear others first
    if (rtForm.is_default) {
      const excludeId = editingTemplate?.id;
      const q = supabase.from('dashboard_role_templates').update({ is_default: false }).eq('tenant_id', tenantId);
      if (excludeId) q.neq('id', excludeId);
      await q;
    }

    if (editingTemplate) {
      const { error } = await supabase
        .from('dashboard_role_templates')
        .update({
          name: rtForm.name.trim(),
          description: rtForm.description.trim() || null,
          metric_tier: rtForm.metric_tier,
          allowed_domains: rtForm.allowed_domains,
          is_default: rtForm.is_default,
        })
        .eq('id', editingTemplate.id);
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Template updated' });
        setTimeout(() => setMessage(null), 2000);
      }
    } else {
      const { error } = await supabase
        .from('dashboard_role_templates')
        .insert({
          tenant_id: tenantId,
          name: rtForm.name.trim(),
          description: rtForm.description.trim() || null,
          metric_tier: rtForm.metric_tier,
          allowed_domains: rtForm.allowed_domains,
          is_default: rtForm.is_default,
        });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Template created' });
        setTimeout(() => setMessage(null), 2000);
      }
    }

    setRtSaving(false);
    resetRtForm();
    loadRoleTemplates();
  }

  async function handleDeleteTemplate(templateId) {
    setRtDeleting(templateId);
    const { error } = await supabase.from('dashboard_role_templates').delete().eq('id', templateId);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setRoleTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setMessage({ type: 'success', text: 'Template deleted' });
      setTimeout(() => setMessage(null), 2000);
    }
    setRtDeleting(null);
    setRtConfirmDelete(null);
  }

  function toggleRtDomain(domain) {
    setRtForm((prev) => ({
      ...prev,
      allowed_domains: prev.allowed_domains.includes(domain)
        ? prev.allowed_domains.filter((d) => d !== domain)
        : [...prev.allowed_domains, domain],
    }));
  }

  const RT_DOMAINS = ['operations', 'labor', 'quality', 'timekeeping', 'safety'];
  const RT_TIERS = ['operational', 'managerial', 'financial'];
  const TIER_BADGE = {
    operational: 'bg-green-50 text-green-700',
    managerial: 'bg-blue-50 text-blue-700',
    financial: 'bg-purple-50 text-purple-700',
  };

  async function handleApplyTemplate() {
    if (!selectedTemplate) return;
    setApplying(true);
    setMessage(null);
    try {
      const templateConfigs = getTemplateConfigs(selectedTemplate);
      const token = await getFreshToken();
      const res = await fetch(`${backendUrl}/api/dashboards/${tenantId}/apply-template`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: templateConfigs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessage({ type: 'success', text: `Template applied — ${json.applied} dashboard(s) configured` });
      loadConfigs();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setApplying(false);
    }
  }

  function startEdit(key) {
    setEditKey(key);
    setEditDraft(JSON.stringify(configs[key] || {}, null, 2));
  }

  async function handleSaveEdit() {
    if (!editKey) return;
    setSaving(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(editDraft);
      const token = await getFreshToken();
      const res = await fetch(`${backendUrl}/api/dashboards/${tenantId}/config/${editKey}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setConfigs((prev) => ({ ...prev, [editKey]: json.config }));
      setEditKey(null);
      setEditDraft(null);
      setMessage({ type: 'success', text: `${editKey} config saved` });
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleGetRecommendations() {
    setRecommending(true);
    setRecommendations(null);
    setRecSummary('');
    setAcceptedRecs(new Set());
    setMessage(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${backendUrl}/api/dashboards/${tenantId}/config/recommend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRecommendations(json.recommendations || []);
      setRecSummary(json.summary || '');
    } catch (err) {
      setMessage({ type: 'error', text: 'Recommendation failed: ' + err.message });
    } finally {
      setRecommending(false);
    }
  }

  function toggleRec(idx) {
    setAcceptedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleApplyAccepted() {
    if (acceptedRecs.size === 0 || !recommendations) return;
    setApplyingRecs(true);
    setMessage(null);

    try {
      // Group accepted recommendations by dashboard
      const changes = {};
      for (const idx of acceptedRecs) {
        const rec = recommendations[idx];
        if (!rec) continue;
        const dash = rec.dashboard;
        if (!changes[dash]) changes[dash] = { ...configs[dash] } || {};

        const config = changes[dash];

        if (rec.type === 'rename' && rec.target === 'kpi' && config.kpis) {
          const kpi = config.kpis.find((k) => k.id === rec.targetId);
          if (kpi) kpi.label = rec.suggestedLabel;
        } else if (rec.type === 'rename' && rec.target === 'chart' && config.charts) {
          const chart = config.charts.find((c) => c.id === rec.targetId);
          if (chart) chart.label = rec.suggestedLabel;
        } else if (rec.type === 'rename' && rec.target === 'heroMetric' && config.heroMetrics) {
          const metric = config.heroMetrics.find((m) => m.id === rec.targetId);
          if (metric) metric.label = rec.suggestedLabel;
        } else if ((rec.type === 'hide' || rec.type === 'show') && rec.target === 'kpi' && config.kpis) {
          const kpi = config.kpis.find((k) => k.id === rec.targetId);
          if (kpi) kpi.visible = rec.suggestedVisible ?? (rec.type === 'show');
        } else if ((rec.type === 'hide' || rec.type === 'show') && rec.target === 'chart' && config.charts) {
          const chart = config.charts.find((c) => c.id === rec.targetId);
          if (chart) chart.visible = rec.suggestedVisible ?? (rec.type === 'show');
        }
      }

      // Save each changed dashboard
      const token = await getFreshToken();
      let applied = 0;
      for (const [dash, config] of Object.entries(changes)) {
        if (!config || Object.keys(config).length === 0) continue;
        const res = await fetch(`${backendUrl}/api/dashboards/${tenantId}/config/${dash}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        });
        if (res.ok) {
          const json = await res.json();
          setConfigs((prev) => ({ ...prev, [dash]: json.config }));
          applied++;
        }
      }

      setMessage({ type: 'success', text: `Applied ${acceptedRecs.size} recommendation(s) across ${applied} dashboard(s)` });
      setRecommendations(null);
      setAcceptedRecs(new Set());
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setApplyingRecs(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  const configuredCount = DASHBOARD_KEYS.filter((k) => configs[k]).length;

  return (
    <div className="space-y-6">
      {/* ── Role Templates Section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-dark-text">Role Templates</h2>
            <p className="text-sm text-secondary-text mt-1">
              Control which metrics and domains each role tier can access. Assign templates to users on the Overview tab.
            </p>
          </div>
          {!showTemplateForm && (
            <button
              onClick={() => { resetRtForm(); setShowTemplateForm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
            >
              <Plus size={14} />
              Add Template
            </button>
          )}
        </div>

        {/* Inline form */}
        {showTemplateForm && (
          <div className="bg-white rounded-lg border border-amber-200 p-4 mb-4 space-y-4">
            <h3 className="text-sm font-semibold text-dark-text">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary-text mb-1">Name</label>
                <input
                  type="text"
                  value={rtForm.name}
                  onChange={(e) => setRtForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Site Manager"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-text mb-1">Description</label>
                <input
                  type="text"
                  value={rtForm.description}
                  onChange={(e) => setRtForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Metric Tier */}
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-2">Metric Tier</label>
              <div className="flex gap-3">
                {RT_TIERS.map((tier) => (
                  <label
                    key={tier}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                      rtForm.metric_tier === tier
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metric_tier"
                      value={tier}
                      checked={rtForm.metric_tier === tier}
                      onChange={(e) => setRtForm((prev) => ({ ...prev, metric_tier: e.target.value }))}
                      className="accent-amber-600"
                    />
                    <span className="capitalize">{tier}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Allowed Domains */}
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-2">Allowed Domains</label>
              <div className="flex flex-wrap gap-2">
                {RT_DOMAINS.map((domain) => {
                  const checked = rtForm.allowed_domains.includes(domain);
                  return (
                    <label
                      key={domain}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                        checked
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRtDomain(domain)}
                        className="accent-amber-600"
                      />
                      <span className="capitalize">{domain}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Is Default */}
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={rtForm.is_default}
                onChange={(e) => setRtForm((prev) => ({ ...prev, is_default: e.target.checked }))}
                className="accent-amber-600"
              />
              Set as default template for new users
            </label>

            {/* Form actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveTemplate}
                disabled={rtSaving || !rtForm.name.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {rtSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingTemplate ? 'Update' : 'Create'}
              </button>
              <button
                onClick={resetRtForm}
                className="px-3 py-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Template cards */}
        {rtLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={18} className="text-amber-500 animate-spin" />
          </div>
        ) : roleTemplates.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-secondary-text">
            No role templates defined yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {roleTemplates.map((tmpl) => (
              <div key={tmpl.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-dark-text">{tmpl.name}</span>
                    {tmpl.is_default && (
                      <Star size={14} className="text-amber-500 fill-amber-500" />
                    )}
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full capitalize ${TIER_BADGE[tmpl.metric_tier] || 'bg-gray-100 text-gray-600'}`}>
                    {tmpl.metric_tier}
                  </span>
                </div>
                {tmpl.description && (
                  <p className="text-xs text-secondary-text mb-2">{tmpl.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(tmpl.allowed_domains || []).map((d) => (
                    <span key={d} className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-600 capitalize">
                      {d}
                    </span>
                  ))}
                  {(!tmpl.allowed_domains || tmpl.allowed_domains.length === 0) && (
                    <span className="text-[10px] text-secondary-text">No domain restrictions</span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => startEditTemplate(tmpl)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
                  >
                    Edit
                  </button>
                  {rtConfirmDelete === tmpl.id ? (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-red-600">Delete?</span>
                      <button
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        disabled={rtDeleting === tmpl.id}
                        className="px-2 py-0.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {rtDeleting === tmpl.id ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                      </button>
                      <button
                        onClick={() => setRtConfirmDelete(null)}
                        className="px-2 py-0.5 text-xs text-secondary-text hover:text-dark-text transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRtConfirmDelete(tmpl.id)}
                      className="text-xs text-secondary-text hover:text-red-600 font-medium transition-colors ml-auto"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* ── Dashboard Configuration ── */}
      <div>
        <h2 className="text-lg font-semibold text-dark-text">Dashboard Configuration</h2>
        <p className="text-sm text-secondary-text mt-1">
          {configuredCount} of {DASHBOARD_KEYS.length} dashboards have custom configs. Unconfigured dashboards use default labels.
        </p>
      </div>

      {message && (
        <div className={`text-sm px-4 py-3 rounded-lg border ${
          message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* Template Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-dark-text mb-3">Apply Template</h3>
        <p className="text-xs text-secondary-text mb-3">
          Overwrites existing configs for dashboards defined in the template. Dashboards not in the template are left unchanged.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            >
              <option value="">Select a template...</option>
              {TEMPLATE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {DASHBOARD_TEMPLATES[key].label} — {DASHBOARD_TEMPLATES[key].description}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleApplyTemplate}
            disabled={!selectedTemplate || applying}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {applying && <Loader2 size={14} className="animate-spin" />}
            Apply
          </button>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-dark-text">AI Recommendations</h3>
            <p className="text-xs text-secondary-text mt-0.5">
              Analyze this tenant's data to suggest label renames, visibility changes, and reordering.
            </p>
          </div>
          <button
            onClick={handleGetRecommendations}
            disabled={recommending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {recommending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {recommending ? 'Analyzing...' : 'Get Recommendations'}
          </button>
        </div>

        {recommendations && recommendations.length > 0 && (
          <div className="space-y-3 mt-4">
            {recSummary && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900">{recSummary}</p>
              </div>
            )}

            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    acceptedRecs.has(idx)
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleRec(idx)}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    acceptedRecs.has(idx) ? 'bg-green-500 border-green-500' : 'border-gray-300'
                  }`}>
                    {acceptedRecs.has(idx) && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        {rec.dashboard}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        rec.type === 'rename' ? 'bg-blue-50 text-blue-600' :
                        rec.type === 'hide' ? 'bg-red-50 text-red-600' :
                        rec.type === 'show' ? 'bg-green-50 text-green-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {rec.type}
                      </span>
                      <span className="text-xs text-secondary-text">{rec.target}: {rec.targetId}</span>
                    </div>
                    {rec.type === 'rename' && (
                      <div className="mt-1 text-sm">
                        <span className="text-secondary-text line-through">{rec.currentLabel}</span>
                        <span className="mx-2 text-gray-400">&rarr;</span>
                        <span className="text-dark-text font-medium">{rec.suggestedLabel}</span>
                      </div>
                    )}
                    {(rec.type === 'hide' || rec.type === 'show') && (
                      <div className="mt-1 text-sm text-dark-text">
                        {rec.type === 'hide' ? 'Hide' : 'Show'} <strong>{rec.targetId}</strong>
                      </div>
                    )}
                    <div className="mt-1 text-xs text-secondary-text">{rec.reason}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-secondary-text">
                {acceptedRecs.size} of {recommendations.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setRecommendations(null); setAcceptedRecs(new Set()); }}
                  className="px-3 py-1.5 text-xs font-medium text-secondary-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => setAcceptedRecs(new Set(recommendations.map((_, i) => i)))}
                  className="px-3 py-1.5 text-xs font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={handleApplyAccepted}
                  disabled={acceptedRecs.size === 0 || applyingRecs}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {applyingRecs && <Loader2 size={12} className="animate-spin" />}
                  Apply Selected
                </button>
              </div>
            </div>
          </div>
        )}

        {recommendations && recommendations.length === 0 && (
          <div className="mt-3 text-sm text-secondary-text">
            No recommendations — this tenant's dashboards are already well-configured for their data profile.
          </div>
        )}
      </div>

      {/* Per-Dashboard Config Cards */}
      <div className="space-y-3">
        {DASHBOARD_KEYS.map((key) => {
          const config = configs[key];
          const isEditing = editKey === key;

          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <BarChart3 size={16} className={config ? 'text-amber-500' : 'text-gray-300'} />
                  <div>
                    <span className="text-sm font-medium text-dark-text capitalize">{key}</span>
                    {config ? (
                      <span className="ml-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        Configured
                      </span>
                    ) : (
                      <span className="ml-2 text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {config && !isEditing && (
                    <button
                      onClick={() => {
                        setConfigs((prev) => {
                          const { [key]: _, ...rest } = prev;
                          return rest;
                        });
                        // Delete by saving empty — or we could add a DELETE endpoint.
                        // For now, just clear local state; the tenant portal will fall back to defaults.
                      }}
                      className="text-xs text-secondary-text hover:text-red-600 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => isEditing ? setEditKey(null) : startEdit(key)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
                  >
                    {isEditing ? 'Cancel' : 'Edit JSON'}
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-gray-100 p-4 space-y-3">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500 resize-y"
                    spellCheck={false}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Summary of config contents */}
              {config && !isEditing && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <div className="flex flex-wrap gap-3 text-xs text-secondary-text">
                    {config.kpis && <span>{config.kpis.length} KPIs</span>}
                    {config.charts && <span>{config.charts.length} charts</span>}
                    {config.heroMetrics && <span>{config.heroMetrics.length} hero metrics</span>}
                    {config.workspaceCards && <span>{config.workspaceCards.length} workspace cards</span>}
                    {config.version && <span>v{config.version}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Backup Tab ---

const BACKUP_CATEGORIES = [
  { key: 'profiles', label: 'User Profiles', icon: Users },
  { key: 'sites', label: 'Sites', icon: MapPin },
  { key: 'clientContacts', label: 'Client Contacts', icon: Mail },
  { key: 'documents', label: 'Knowledge Base', icon: BookOpen },
  { key: 'toolSubmissions', label: 'Tool Submissions', icon: FileText },
  { key: 'agentOverrides', label: 'Agent Overrides', icon: Bot },
  { key: 'sopAnalyses', label: 'SOP Analyses', icon: FlaskConical },
  { key: 'automationRoadmaps', label: 'Automation Roadmaps', icon: Zap },
  { key: 'automationActions', label: 'Automation Actions', icon: Zap },
  { key: 'dashboardConfigs', label: 'Dashboard Configs', icon: BarChart3 },
  { key: 'userDashboardConfigs', label: 'User Dashboard Configs', icon: BarChart3 },
  { key: 'roleTemplates', label: 'Role Templates', icon: Users },
  { key: 'siteAssignments', label: 'Site Assignments', icon: MapPin },
  { key: 'qbuSubmissions', label: 'QBU Submissions', icon: FileText },
  { key: 'qbuIntakeData', label: 'QBU Intake Data', icon: FileText },
  { key: 'qbuPhotos', label: 'QBU Photos', icon: FileText },
  { key: 'qbuTestimonials', label: 'QBU Testimonials', icon: FileText },
  { key: 'customTools', label: 'Custom Tools', icon: Wrench },
];

const BACKEND_URL_BACKUP = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

function formatBackupBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function BackupTab({ tenantId, tenantSlug }) {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [recentBackups, setRecentBackups] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadSummary();
    loadRecentBackups();
  }, [tenantId]);

  async function loadSummary() {
    setLoadingSummary(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL_BACKUP}/api/backup/${tenantId}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load summary');
      const data = await res.json();
      setSummary(data.counts);
    } catch (err) {
      console.error('[backup] Summary error:', err);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadRecentBackups() {
    setLoadingHistory(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL_BACKUP}/api/backup/history?tenantId=${tenantId}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setRecentBackups(data);
    } catch (err) {
      console.error('[backup] History error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setExportError(null);
    setSaveResult(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL_BACKUP}/api/backup/${tenantId}/export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      const data = await res.json();
      setSaveResult(data);
      loadRecentBackups();
    } catch (err) {
      console.error('[backup] Save error:', err);
      setExportError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setExportError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL_BACKUP}/api/backup/${tenantId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }

      const disposition = res.headers.get('Content-Disposition');
      let filename = `${(tenantSlug || 'tenant').replace(/[^a-z0-9]/gi, '-')}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[backup] Download error:', err);
      setExportError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const totalRows = summary ? Object.values(summary).reduce((a, b) => a + b, 0) : 0;
  const lastBackup = recentBackups[0];

  return (
    <div className="space-y-6">
      {/* Export Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-dark-text flex items-center gap-2">
              <HardDrive size={20} />
              Tenant Data Export
            </h3>
            <p className="text-sm text-secondary-text mt-1">
              Save a backup to cloud storage or download a JSON snapshot directly.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSave}
              disabled={saving || downloading || loadingSummary}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin" /> Saving...</>
              ) : (
                <><HardDrive size={16} /> Save Backup</>
              )}
            </button>
            <button
              onClick={handleDownload}
              disabled={saving || downloading || loadingSummary}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-dark-text text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? (
                <><Loader2 size={16} className="animate-spin" /> Downloading...</>
              ) : (
                <><Download size={16} /> Download</>
              )}
            </button>
          </div>
        </div>

        {exportError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {exportError}
          </div>
        )}

        {saveResult && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Backup saved — {saveResult.fileSizeFormatted}, {saveResult.totalRows.toLocaleString()} rows</p>
              {saveResult.downloadUrl && (
                <a href={saveResult.downloadUrl} download className="inline-flex items-center gap-1 mt-1 text-green-700 hover:text-green-900 font-medium text-xs">
                  <Download size={12} /> Download
                </a>
              )}
            </div>
          </div>
        )}

        {lastBackup && !saveResult && (
          <p className="mt-3 text-xs text-secondary-text">
            Last backup: {new Date(lastBackup.created_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Data Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-sm font-semibold text-dark-text mb-4">
          What's Included {!loadingSummary && <span className="text-secondary-text font-normal">— {totalRows} total rows</span>}
        </h4>

        {loadingSummary ? (
          <div className="flex items-center gap-2 text-secondary-text text-sm py-4">
            <Loader2 size={16} className="animate-spin" /> Loading summary...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {BACKUP_CATEGORIES.map(({ key, label, icon: Icon }) => {
              const count = summary?.[key] ?? 0;
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 bg-gray-50"
                >
                  <Icon size={14} className="text-secondary-text shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-secondary-text truncate">{label}</p>
                    <p className="text-sm font-medium text-dark-text">{count}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Backups */}
      {!loadingHistory && recentBackups.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-sm font-semibold text-dark-text mb-3">Recent Backups</h4>
          <div className="space-y-2">
            {recentBackups.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-dark-text">{new Date(b.created_at).toLocaleString()}</span>
                  <span className="text-xs font-mono text-secondary-text">{formatBackupBytes(b.file_size_bytes)}</span>
                  <span className="text-xs text-secondary-text">{(b.row_count || 0).toLocaleString()} rows</span>
                </div>
                {b.downloadUrl && (
                  <a href={b.downloadUrl} download className="p-1 text-secondary-text hover:text-dark-text transition-colors" title="Download">
                    <Download size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exclusions Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium mb-1">Excluded from export</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700">
            <li><strong>API credentials</strong> — encrypted keys are never exported for security</li>
            <li><strong>Snowflake sync data</strong> (sf_* tables) — source of truth is external</li>
            <li><strong>Usage logs</strong> — platform telemetry, not tenant-owned</li>
            <li><strong>Generated decks</strong> — binary PPTX files (reference paths only in tool submissions)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ─── Custom Tools Tab ─── */

function CustomToolsTab({ tenantId }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    loadTools();
  }, [tenantId]);

  async function loadTools() {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenant_custom_tools')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at');

    if (!error) setTools(data || []);
    setLoading(false);
  }

  async function handleToggleActive(tool) {
    setTogglingId(tool.id);
    const { error } = await supabase
      .from('tenant_custom_tools')
      .update({ is_active: !tool.is_active, updated_at: new Date().toISOString() })
      .eq('id', tool.id);

    if (!error) {
      setTools(prev => prev.map(t => t.id === tool.id ? { ...t, is_active: !t.is_active } : t));
    }
    setTogglingId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-dark-text">Custom Tools</h3>
          <p className="text-sm text-secondary-text">Tools created by tenant admins via the Tool Builder.</p>
        </div>
        <span className="text-xs text-secondary-text">{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
      </div>

      {tools.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Wrench size={24} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-secondary-text">No custom tools created yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map(tool => (
            <div key={tool.id} className={`bg-white rounded-lg border border-gray-200 p-4 ${!tool.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <Wrench size={14} className="text-amber-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-dark-text">{tool.label}</h4>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${tool.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {tool.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {tool.description && (
                      <p className="text-xs text-secondary-text mt-0.5">{tool.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-secondary-text">
                      <span>{(tool.intake_schema || []).length} fields</span>
                      <span className="text-gray-300">|</span>
                      <span>Output: {tool.output_format}</span>
                      <span className="text-gray-300">|</span>
                      <span>Key: <code className="font-mono text-[11px]">{tool.tool_key}</code></span>
                    </div>
                    {tool.purpose && (
                      <p className="text-xs text-secondary-text mt-2 italic">Purpose: {tool.purpose}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(tool)}
                  disabled={togglingId === tool.id}
                  className="shrink-0"
                  title={tool.is_active ? 'Deactivate tool' : 'Activate tool'}
                >
                  {togglingId === tool.id ? (
                    <Loader2 size={18} className="animate-spin text-gray-400" />
                  ) : tool.is_active ? (
                    <ToggleRight size={22} className="text-green-500" />
                  ) : (
                    <ToggleLeft size={22} className="text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
