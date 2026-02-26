import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Users, MapPin, Activity,
  Puzzle, Bot, Lock, ToggleLeft, ToggleRight,
  ChevronDown, ChevronRight, FileText, Zap, BookOpen,
  Key, Trash2, CheckCircle, XCircle, Eye, EyeOff, FlaskConical,
  Plus, Mail, UserX, UserCheck,
} from 'lucide-react';
import { supabase, getFreshToken } from '../../lib/supabase';
import DataTable from '../../components/shared/DataTable';
import { getAllSourceAgents } from '../../agents/registry';
import { DEPT_COLORS } from '../../data/constants';

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
  const [expandedAgent, setExpandedAgent] = useState(null);
  const tenantModules = tenant.modules || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-dark-text">Agent Configuration</h2>
        <p className="text-sm text-secondary-text mt-1">
          View and manage agent access for this tenant. Agents require their module to be enabled.
        </p>
      </div>

      <div className="space-y-3">
        {sourceAgents.map((agent) => {
          const requiredModule = AGENT_MODULE_MAP[agent.key];
          const moduleEnabled = requiredModule === null || tenantModules.includes(requiredModule);
          const override = agentOverrides.find((o) => o.agent_key === agent.key);
          const dbAgent = dbAgents.find((d) => d.agent_key === agent.key);
          const isExpanded = expandedAgent === agent.key;

          // Determine status
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
          const actionKeys = agent.actions ? Object.keys(agent.actions) : [];

          return (
            <div
              key={agent.key}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              style={{ borderLeftColor: deptColor, borderLeftWidth: '3px' }}
            >
              {/* Agent Header */}
              <button
                onClick={() => setExpandedAgent(isExpanded ? null : agent.key)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded
                    ? <ChevronDown size={16} className="text-gray-400" />
                    : <ChevronRight size={16} className="text-gray-400" />
                  }
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-dark-text">{agent.name}</span>
                      {override && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-700">
                          Override
                        </span>
                      )}
                      {dbAgent && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-50 text-amber-600">
                          DB Seeded
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-secondary-text capitalize">{agent.department}</span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-secondary-text">{agent.model}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor}`}>
                    {statusLabel}
                  </span>
                  {moduleEnabled && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleAgent(agent.key, override);
                      }}
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
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
                  {/* System Prompt */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileText size={14} className="text-secondary-text" />
                      <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">System Prompt</span>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {agent.systemPrompt
                        ? agent.systemPrompt.slice(0, 500) + (agent.systemPrompt.length > 500 ? '...' : '')
                        : '— No system prompt —'}
                    </div>
                  </div>

                  {/* Custom Prompt Additions (if override exists) */}
                  {override && override.custom_prompt_additions && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <FileText size={14} className="text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Custom Prompt Addition</span>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap">
                        {override.custom_prompt_additions}
                      </div>
                    </div>
                  )}

                  {/* Knowledge Modules */}
                  {agent.knowledgeModules && agent.knowledgeModules.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <BookOpen size={14} className="text-secondary-text" />
                        <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Knowledge Modules</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.knowledgeModules.map((km) => (
                          <span key={km} className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700">
                            {km}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {actionKeys.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Zap size={14} className="text-secondary-text" />
                        <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">Actions ({actionKeys.length})</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {actionKeys.map((ak) => {
                          const action = agent.actions[ak];
                          return (
                            <div key={ak} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                              <div className="text-xs font-medium text-dark-text">{action.label || ak}</div>
                              {action.description && (
                                <div className="text-xs text-secondary-text mt-0.5">{action.description}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
