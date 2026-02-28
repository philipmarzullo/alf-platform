import { useState, useEffect } from 'react';
import {
  Save, Loader2, Users, MapPin, Activity, Zap,
  Plus, Mail, UserX, UserCheck, Settings2, X,
} from 'lucide-react';
import { supabase, getFreshToken } from '../../../lib/supabase';
import DataTable from '../../../components/shared/DataTable';
import StatCard from '../../../components/shared/StatCard';
import HealthDot from '../../../components/shared/HealthDot';
import { TIER_KEYS, TIER_REGISTRY } from '../../../data/tierRegistry';
import { formatTokens, estimateCost, relativeTime } from '../../../utils/formatters';

const FACTOR_LABELS = {
  apiKey: 'API Key',
  users: 'Users',
  activity: 'Activity',
  brand: 'Brand',
  knowledge: 'Knowledge',
};

const FACTOR_POINTS = {
  apiKey: 30,
  users: 25,
  activity: 25,
  brand: 10,
  knowledge: 10,
};

/**
 * Overview tab extracted from PlatformTenantDetailPage.
 *
 * Receives all state and handlers from parent to avoid duplicating Supabase calls.
 */
export default function TenantOverviewTab({
  tenant,
  users,
  sites,
  usage,
  editName,
  editPlan,
  editStatus,
  setEditName,
  setEditPlan,
  setEditStatus,
  saving,
  onSave,
  error,
  setError,
  saved,
  setSaved,
}) {
  // Health score computation (local — uses same factors as usePlatformData)
  const [healthData, setHealthData] = useState({ score: 0, factors: {} });

  useEffect(() => {
    computeHealth();
  }, [tenant?.id]);

  async function computeHealth() {
    if (!tenant) return;
    let score = 0;
    const factors = {};

    // Users
    factors.users = users.length > 0;
    if (factors.users) score += 25;

    // Brand
    factors.brand = !!(tenant.brand_display_name || tenant.brand_logo_url);
    if (factors.brand) score += 10;

    // Activity (14d)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const recentUsage = usage.filter((u) => u.created_at > fourteenDaysAgo);
    factors.activity = recentUsage.length > 0;
    if (factors.activity) score += 25;

    // API Key — try-catch for RLS
    try {
      const { data } = await supabase
        .from('tenant_api_credentials')
        .select('id')
        .eq('tenant_id', tenant.id)
        .limit(1);
      factors.apiKey = (data || []).length > 0;
    } catch {
      factors.apiKey = false;
    }
    if (factors.apiKey) score += 30;

    // Knowledge docs
    try {
      const { data } = await supabase
        .from('tenant_documents')
        .select('id')
        .eq('tenant_id', tenant.id)
        .limit(1);
      factors.knowledge = (data || []).length > 0;
    } catch {
      factors.knowledge = false;
    }
    if (factors.knowledge) score += 10;

    setHealthData({ score, factors });
  }

  // Token totals from usage
  const totalTokens = usage.reduce((sum, u) => sum + (u.tokens_input || 0) + (u.tokens_output || 0), 0);
  const calls30d = usage.length;

  // Sparkline: daily calls from usage data
  const sparkData = (() => {
    const dayMap = {};
    usage.forEach((u) => {
      const day = u.created_at.slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    });
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, count]) => count);
  })();

  // User management
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(null);
  const [roleUpdating, setRoleUpdating] = useState(null);
  const [localUsers, setLocalUsers] = useState(users);

  // User config modal (template + site assignments)
  const [configUser, setConfigUser] = useState(null);
  const [configTemplates, setConfigTemplates] = useState([]);
  const [configJobs, setConfigJobs] = useState([]);
  const [configAssignedSites, setConfigAssignedSites] = useState([]);
  const [configSelectedTemplate, setConfigSelectedTemplate] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    setLocalUsers(users);
  }, [users]);

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
          tenant_id: tenant.id,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || `Failed to create user (${res.status})`);
      } else {
        setNewUserForm({ name: '', email: '', password: '', role: 'user' });
        setShowAddUser(false);
        const { data } = await supabase.from('profiles').select('id, name, email, role, active, dashboard_template_id').eq('tenant_id', tenant.id).order('name');
        setLocalUsers(data || []);
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
      setLocalUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: newActive } : u));
    }
    setUserActionLoading(null);
  }

  async function handleRoleChange(userId, newRole) {
    setRoleUpdating(userId);
    setError(null);
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setLocalUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    }
    setRoleUpdating(null);
  }

  async function openConfigModal(user) {
    setConfigUser(user);
    setConfigLoading(true);
    setConfigSelectedTemplate(user.dashboard_template_id || '');
    setConfigAssignedSites([]);

    const [templatesRes, jobsRes, assignmentsRes] = await Promise.all([
      supabase.from('dashboard_role_templates').select('*').eq('tenant_id', tenant.id).order('name'),
      supabase.from('sf_dim_job').select('id, job_name, location').eq('tenant_id', tenant.id).order('job_name'),
      supabase.from('user_site_assignments').select('job_id').eq('user_id', user.id).eq('tenant_id', tenant.id),
    ]);

    setConfigTemplates(templatesRes.data || []);
    setConfigJobs(jobsRes.data || []);
    setConfigAssignedSites((assignmentsRes.data || []).map((a) => a.job_id));
    setConfigLoading(false);
  }

  async function saveUserConfig() {
    if (!configUser) return;
    setConfigSaving(true);
    setError(null);

    // Update template
    const { error: templateErr } = await supabase
      .from('profiles')
      .update({ dashboard_template_id: configSelectedTemplate || null })
      .eq('id', configUser.id);

    if (templateErr) {
      setError(templateErr.message);
      setConfigSaving(false);
      return;
    }

    // Replace site assignments
    await supabase.from('user_site_assignments').delete().eq('user_id', configUser.id).eq('tenant_id', tenant.id);

    if (configAssignedSites.length > 0) {
      const rows = configAssignedSites.map((jobId) => ({
        user_id: configUser.id,
        tenant_id: tenant.id,
        job_id: jobId,
      }));
      const { error: insertErr } = await supabase.from('user_site_assignments').insert(rows);
      if (insertErr) {
        setError(insertErr.message);
        setConfigSaving(false);
        return;
      }
    }

    // Update local user state
    setLocalUsers((prev) =>
      prev.map((u) =>
        u.id === configUser.id ? { ...u, dashboard_template_id: configSelectedTemplate || null } : u
      )
    );

    setConfigSaving(false);
    setConfigUser(null);
  }

  function toggleSiteAssignment(jobId) {
    setConfigAssignedSites((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  }

  const ROLE_OPTIONS = ['user', 'manager', 'admin', 'super-admin'];

  const ROLE_STYLES = {
    'platform_owner': 'bg-alf-orange/10 text-alf-orange border-alf-orange/30',
    'super-admin': 'bg-purple-50 text-purple-700 border-purple-200',
    'admin': 'bg-purple-50 text-purple-700 border-purple-200',
    'manager': 'bg-blue-50 text-blue-700 border-blue-200',
    'user': 'bg-gray-50 text-gray-700 border-gray-200',
  };

  const userColumns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email', render: (val) => <span className="text-xs text-secondary-text">{val}</span> },
    {
      key: 'role', label: 'Role',
      render: (val, row) => {
        if (val === 'platform_owner') {
          return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-alf-orange/10 text-alf-orange">platform_owner</span>;
        }
        return (
          <div className="relative inline-flex items-center">
            <select
              value={val}
              onChange={(e) => handleRoleChange(row.id, e.target.value)}
              disabled={roleUpdating === row.id}
              className={`text-xs font-medium rounded-full pl-2.5 pr-6 py-1 border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-alf-orange/40 disabled:opacity-50 ${ROLE_STYLES[val] || ROLE_STYLES.user}`}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {roleUpdating === row.id && (
              <Loader2 size={12} className="absolute right-1.5 animate-spin text-gray-400 pointer-events-none" />
            )}
          </div>
        );
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
          {row.role !== 'platform_owner' && (
            <button
              onClick={(e) => { e.stopPropagation(); openConfigModal(row); }}
              title="Configure template & site assignments"
              className="p-1 text-gray-400 hover:text-alf-orange transition-colors"
            >
              <Settings2 size={14} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleResetPassword(row.email); }}
            disabled={userActionLoading === row.email}
            title="Send password reset email"
            className="p-1 text-gray-400 hover:text-alf-orange transition-colors disabled:opacity-50"
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

  // Recent activity (capped at 10)
  const recentUsage = usage.slice(0, 10);

  return (
    <>
      {/* Tenant Header Card — Inline Edit */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-5 flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Company Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Plan</label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              >
                {TIER_KEYS.map((key) => (
                  <option key={key} value={key}>{TIER_REGISTRY[key].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors shrink-0"
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

      {/* Health Score Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-3">
          <HealthDot score={healthData.score} size="lg" />
          <div>
            <div className="text-sm font-semibold text-dark-text">Tenant Health</div>
            <div className="text-xs text-secondary-text">{healthData.score} / 100</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FACTOR_LABELS).map(([key, label]) => {
            const ok = healthData.factors[key];
            return (
              <span
                key={key}
                className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                  ok ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {label} ({FACTOR_POINTS[key]}pts)
              </span>
            );
          })}
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Users"
          value={localUsers.length}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Sites"
          value={sites.length}
          icon={MapPin}
          color="orange"
        />
        <StatCard
          label="Agent Calls"
          value={calls30d}
          subtitle="last 100 calls"
          icon={Activity}
          color="emerald"
          sparkData={sparkData}
        />
        <StatCard
          label="Tokens"
          value={formatTokens(totalTokens)}
          subtitle={`~$${estimateCost(totalTokens)} est.`}
          icon={Zap}
          color="purple"
        />
      </div>

      {/* Recent Activity (capped at 10) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-dark-text">Recent Activity</h2>
          {usage.length > 10 && (
            <span className="text-xs text-secondary-text">
              Showing 10 of {usage.length}
            </span>
          )}
        </div>
        {recentUsage.length > 0 ? (
          <DataTable
            columns={[
              { key: 'agent_key', label: 'Agent', render: (val) => <span className="font-mono text-xs">{val || '—'}</span> },
              { key: 'tokens_input', label: 'Input', render: (val) => (val || 0).toLocaleString() },
              { key: 'tokens_output', label: 'Output', render: (val) => (val || 0).toLocaleString() },
              { key: 'created_at', label: 'When', render: (val) => <span className="text-xs text-secondary-text">{relativeTime(val)}</span> },
            ]}
            data={recentUsage}
          />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
            No usage data yet.
          </div>
        )}
      </div>

      {/* Users Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-dark-text">Users ({localUsers.length})</h2>
          <button
            onClick={() => setShowAddUser(!showAddUser)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-alf-orange border border-alf-orange/30 rounded-lg hover:bg-alf-orange/10 transition-colors"
          >
            <Plus size={14} />
            Add User
          </button>
        </div>

        {showAddUser && (
          <div className="bg-white rounded-lg border border-alf-orange/30 p-4 mb-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-secondary-text mb-1">Name</label>
                <input
                  type="text"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-text mb-1">Email</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                  placeholder="email@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-text mb-1">Password</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-text mb-1">Role</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="super-admin">Super-Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateUser}
                disabled={creatingUser || !newUserForm.name.trim() || !newUserForm.email.trim() || newUserForm.password.length < 6}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
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

        {localUsers.length > 0 ? (
          <DataTable columns={userColumns} data={localUsers} />
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

      {/* User Config Modal */}
      {configUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !configSaving && setConfigUser(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-dark-text">Configure User</h3>
                <p className="text-xs text-secondary-text mt-0.5">{configUser.name} ({configUser.email})</p>
              </div>
              <button
                onClick={() => !configSaving && setConfigUser(null)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {configLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="text-alf-orange animate-spin" />
                </div>
              ) : (
                <>
                  {/* Dashboard Template */}
                  <div>
                    <label className="block text-xs font-medium text-secondary-text uppercase tracking-wider mb-2">
                      Dashboard Template
                    </label>
                    <select
                      value={configSelectedTemplate}
                      onChange={(e) => setConfigSelectedTemplate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                    >
                      <option value="">No template (full access)</option>
                      {configTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.metric_tier}{t.is_default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    {configTemplates.length === 0 && (
                      <p className="text-xs text-secondary-text mt-1">
                        No role templates defined. Create them in the Dashboards tab.
                      </p>
                    )}
                  </div>

                  {/* Site Assignments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-secondary-text uppercase tracking-wider">
                        Site Assignments
                      </label>
                      <span className="text-xs text-secondary-text">
                        {configAssignedSites.length} of {configJobs.length} selected
                      </span>
                    </div>
                    {configJobs.length === 0 ? (
                      <p className="text-xs text-secondary-text">
                        No sites/jobs in sf_dim_job for this tenant.
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                        {configJobs.map((job) => {
                          const checked = configAssignedSites.includes(job.id);
                          return (
                            <label
                              key={job.id}
                              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                                checked ? 'bg-alf-orange/10 text-alf-orange' : 'hover:bg-gray-50 text-gray-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSiteAssignment(job.id)}
                                className="accent-alf-orange"
                              />
                              <span className="font-medium">{job.job_name}</span>
                              {job.location && (
                                <span className="text-secondary-text ml-auto truncate max-w-[140px]">{job.location}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-secondary-text mt-1.5">
                      Leave empty for access to all sites.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
              <button
                onClick={() => setConfigUser(null)}
                disabled={configSaving}
                className="px-3 py-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveUserConfig}
                disabled={configSaving || configLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
              >
                {configSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
