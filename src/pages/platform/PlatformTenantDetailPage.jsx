import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Users, MapPin, Activity,
  Puzzle, Bot, Lock, ToggleLeft, ToggleRight,
  FileText, BookOpen, Upload, ChevronUp, ChevronDown,
  Key, Trash2, CheckCircle, XCircle, Eye, EyeOff, FlaskConical,
  Plus, Mail, UserX, UserCheck, Palette,
} from 'lucide-react';
import { supabase, getFreshToken } from '../../lib/supabase';
import DataTable from '../../components/shared/DataTable';
import { getAllSourceAgents } from '../../agents/registry';
import { DEPT_COLORS } from '../../data/constants';
import { buildDocumentPath, formatFileSize } from '../../utils/storagePaths';

const MODULE_OPTIONS = [
  { key: 'hr', label: 'HR', description: 'Benefits, payroll, leave management' },
  { key: 'finance', label: 'Finance', description: 'AR, collections, budget tracking' },
  { key: 'purchasing', label: 'Purchasing', description: 'Reorders, vendor management' },
  { key: 'sales', label: 'Sales', description: 'Contracts, renewals, pipeline' },
  { key: 'ops', label: 'Operations', description: 'Inspections, KPIs, incidents' },
  { key: 'qbu', label: 'QBU Builder', description: 'Quarterly business update decks' },
  { key: 'salesDeck', label: 'Sales Deck', description: 'Sales presentation builder' },
];

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [savingOverride, setSavingOverride] = useState(null);
  const [error, setError] = useState(null);

  // User management state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(null);

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

    const [tenantRes, usersRes, sitesRes, usageRes, overridesRes, dbAgentsRes] = await Promise.all([
      supabase.from('alf_tenants').select('*').eq('id', id).single(),
      supabase.from('profiles').select('id, name, email, role, active').eq('tenant_id', id).order('name'),
      supabase.from('tenant_sites').select('*').eq('tenant_id', id).order('name'),
      supabase.from('alf_usage_logs').select('id, agent_key, tokens_input, tokens_output, created_at').eq('tenant_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('tenant_agent_overrides').select('*').eq('tenant_id', id),
      supabase.from('alf_agent_definitions').select('*').order('agent_key'),
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
    setEditPlan(t.plan || 'free');
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

    const currentModules = tenant.modules || [];
    const newModules = currentModules.includes(moduleKey)
      ? currentModules.filter((m) => m !== moduleKey)
      : [...currentModules, moduleKey];

    // Write to whichever column the DB uses
    const colName = tenant.enabled_modules !== undefined ? 'enabled_modules' : 'modules';
    const { error: updateErr } = await supabase
      .from('alf_tenants')
      .update({ [colName]: newModules })
      .eq('id', id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setTenant((prev) => ({ ...prev, modules: newModules, ...(colName === 'enabled_modules' ? { enabled_modules: newModules } : {}) }));
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

  async function handleCreateUser() {
    if (!newUserForm.name.trim() || !newUserForm.email.trim() || !newUserForm.password || newUserForm.password.length < 6) return;
    setCreatingUser(true);
    setError(null);

    try {
      const token = await getFreshToken();
      if (!token) throw new Error('Not authenticated — please sign in again');
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`;

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newUserForm.email.trim(),
          password: newUserForm.password,
          name: newUserForm.name.trim(),
          title: '',
          role: newUserForm.role,
          modules: [],
          tenant_id: id,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || `Failed to create user (${res.status})`);
      } else {
        setNewUserForm({ name: '', email: '', password: '', role: 'user' });
        setShowAddUser(false);
        // Refresh users
        const { data } = await supabase.from('profiles').select('id, name, email, role, active').eq('tenant_id', id).order('name');
        setUsers(data || []);
      }
    } catch (err) {
      setError('Could not reach admin-create-user: ' + err.message);
    }
    setCreatingUser(false);
  }

  async function handleResetPassword(userEmail) {
    setUserActionLoading(userEmail);
    setError(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(userEmail);
      if (resetErr) {
        setError(resetErr.message);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      setError(err.message);
    }
    setUserActionLoading(null);
  }

  async function handleToggleUserActive(user) {
    setUserActionLoading(user.id);
    setError(null);
    const newActive = !user.active;
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ active: newActive })
      .eq('id', user.id);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: newActive } : u));
    }
    setUserActionLoading(null);
  }

  function setTab(tabKey) {
    setSearchParams({ tab: tabKey }, { replace: true });
  }

  const totalTokens = usage.reduce((sum, u) => sum + (u.tokens_input || 0) + (u.tokens_output || 0), 0);

  const userColumns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email', render: (val) => <span className="text-xs text-secondary-text">{val}</span> },
    {
      key: 'role', label: 'Role',
      render: (val) => {
        const styles = val === 'platform_owner' ? 'bg-amber-50 text-amber-700'
          : (val === 'admin' || val === 'super-admin') ? 'bg-purple-50 text-purple-700'
          : val === 'manager' ? 'bg-blue-50 text-blue-700'
          : 'bg-gray-100 text-gray-700';
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${styles}`}>{val}</span>;
      },
    },
    {
      key: 'active', label: 'Status',
      render: (val) => (
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${val ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {val ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'id', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleResetPassword(row.email); }}
            disabled={userActionLoading === row.email}
            title="Send password reset email"
            className="p-1 text-gray-400 hover:text-amber-600 transition-colors disabled:opacity-50"
          >
            {userActionLoading === row.email ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleUserActive(row); }}
            disabled={userActionLoading === row.id}
            title={row.active ? 'Deactivate user' : 'Activate user'}
            className={`p-1 transition-colors disabled:opacity-50 ${row.active ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`}
          >
            {userActionLoading === row.id ? <Loader2 size={14} className="animate-spin" /> : row.active ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
        </div>
      ),
    },
  ];

  const siteColumns = [
    { key: 'name', label: 'Site Name' },
    { key: 'address', label: 'Address', render: (val) => <span className="text-xs text-secondary-text">{val || '—'}</span> },
  ];

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
        <>
          {/* Info Card — Inline Edit */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-5 flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-secondary-text mb-1">Company Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary-text mb-1">Plan</label>
                  <select
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                  >
                    {['free', 'starter', 'pro', 'enterprise'].map((p) => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary-text mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
            <div className="border-t border-gray-100 px-5 py-3 flex gap-6 text-xs text-secondary-text">
              <span>Slug: <strong className="font-mono">{tenant.slug}</strong></span>
              <span>Created: {new Date(tenant.created_at).toLocaleDateString()}</span>
              {tenant.modules && <span>Modules: {tenant.modules.join(', ')}</span>}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg"><Users size={18} className="text-amber-500" /></div>
              <div>
                <div className="text-2xl font-semibold text-dark-text">{users.length}</div>
                <div className="text-xs text-secondary-text">Users</div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg"><MapPin size={18} className="text-amber-500" /></div>
              <div>
                <div className="text-2xl font-semibold text-dark-text">{sites.length}</div>
                <div className="text-xs text-secondary-text">Sites</div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg"><Activity size={18} className="text-amber-500" /></div>
              <div>
                <div className="text-2xl font-semibold text-dark-text">{totalTokens.toLocaleString()}</div>
                <div className="text-xs text-secondary-text">Total Tokens (last 100 calls)</div>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-dark-text">Users ({users.length})</h2>
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
              >
                <Plus size={14} />
                Add User
              </button>
            </div>

            {showAddUser && (
              <div className="bg-white rounded-lg border border-amber-200 p-4 mb-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-secondary-text mb-1">Name</label>
                    <input
                      type="text"
                      value={newUserForm.name}
                      onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary-text mb-1">Email</label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                      placeholder="email@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary-text mb-1">Password</label>
                    <input
                      type="password"
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                      placeholder="Min 6 characters"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary-text mb-1">Role</label>
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                    >
                      <option value="user">User</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateUser}
                    disabled={creatingUser || !newUserForm.name.trim() || !newUserForm.email.trim() || newUserForm.password.length < 6}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {creatingUser ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Create User
                  </button>
                  <button
                    onClick={() => { setShowAddUser(false); setNewUserForm({ name: '', email: '', password: '', role: 'user' }); }}
                    className="px-3 py-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {users.length > 0 ? (
              <DataTable columns={userColumns} data={users} />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
                No users assigned to this tenant.
              </div>
            )}
          </div>

          {/* Sites Table */}
          <div>
            <h2 className="text-sm font-semibold text-dark-text mb-3">Sites ({sites.length})</h2>
            {sites.length > 0 ? (
              <DataTable columns={siteColumns} data={sites} />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
                No sites configured for this tenant.
              </div>
            )}
          </div>

          {/* Usage Summary */}
          <div>
            <h2 className="text-sm font-semibold text-dark-text mb-3">Recent Usage ({usage.length} calls)</h2>
            {usage.length > 0 ? (
              <DataTable
                columns={[
                  { key: 'agent_key', label: 'Agent', render: (val) => <span className="font-mono text-xs">{val || '—'}</span> },
                  { key: 'tokens_input', label: 'Input Tokens', render: (val) => (val || 0).toLocaleString() },
                  { key: 'tokens_output', label: 'Output Tokens', render: (val) => (val || 0).toLocaleString() },
                  { key: 'created_at', label: 'Date', render: (val) => new Date(val).toLocaleString() },
                ]}
                data={usage}
              />
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
                No usage data yet.
              </div>
            )}
          </div>
        </>
      )}

      {/* Features Tab */}
      {activeTab === 'features' && (
        <FeaturesTab
          tenant={tenant}
          sourceAgents={sourceAgents}
          savingModules={savingModules}
          onToggleModule={handleToggleModule}
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
        />
      )}

      {/* Knowledge Tab */}
      {activeTab === 'knowledge' && (
        <KnowledgeTab tenantId={id} />
      )}
    </div>
  );
}

/* ─── Features Tab ─── */

function FeaturesTab({ tenant, sourceAgents, savingModules, onToggleModule }) {
  const tenantModules = tenant.modules || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-dark-text">Feature Modules</h2>
        <p className="text-sm text-secondary-text mt-1">
          Enable or disable modules for this tenant. Toggling a module controls which agents are available.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULE_OPTIONS.map((mod) => {
          const isEnabled = tenantModules.includes(mod.key);
          const relatedAgents = getAgentsForModule(mod.key, sourceAgents);

          return (
            <div
              key={mod.key}
              className={`bg-white rounded-lg border p-4 transition-colors ${
                isEnabled ? 'border-amber-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Puzzle size={16} className={isEnabled ? 'text-amber-500' : 'text-gray-400'} />
                  <h3 className="text-sm font-semibold text-dark-text">{mod.label}</h3>
                </div>
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
              <p className="text-xs text-secondary-text mb-3">{mod.description}</p>
              {relatedAgents.length > 0 && (
                <div>
                  <p className="text-xs text-secondary-text mb-1">Unlocks:</p>
                  <div className="flex flex-wrap gap-1">
                    {relatedAgents.map((a) => (
                      <span key={a.key} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                        {a.name}
                      </span>
                    ))}
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

function BrandTab({ editBrand, setEditBrand, saving, onSave }) {
  function update(key, value) {
    setEditBrand((prev) => ({ ...prev, [key]: value }));
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

        {/* Logo URL */}
        <div className="p-5 flex flex-col md:flex-row md:items-start gap-2 md:gap-8">
          <div className="md:w-1/3">
            <div className="text-sm font-medium text-dark-text">Logo URL</div>
            <div className="text-xs text-secondary-text mt-0.5">Full URL to the tenant's logo image</div>
          </div>
          <div className="flex-1 space-y-3">
            <input
              type="text"
              value={editBrand.brand_logo_url}
              onChange={(e) => update('brand_logo_url', e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            />
            {editBrand.brand_logo_url && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <img
                  src={editBrand.brand_logo_url}
                  alt="Logo preview"
                  className="h-10 max-w-[160px] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="text-xs text-secondary-text">Preview</span>
              </div>
            )}
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
      .select('id, file_name, file_type, file_size, department, doc_type, char_count, page_count, status, title, description, created_at')
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
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
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
                        <span className="text-xs text-red-600">Delete?</span>
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
                        title="Delete document"
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
