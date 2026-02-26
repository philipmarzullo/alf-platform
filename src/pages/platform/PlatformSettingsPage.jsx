import { useState, useEffect } from 'react';
import {
  Save, Loader2, Database, CheckCircle, Plus, Mail,
  UserX, UserCheck, Eye, EyeOff,
} from 'lucide-react';
import { supabase, getFreshToken } from '../../lib/supabase';
import { getAllSourceAgents } from '../../agents/registry';
import DataTable from '../../components/shared/DataTable';

/* ─── Config constants ─── */

const DEFAULT_CONFIG = {
  default_model: 'claude-sonnet-4-5-20250514',
  max_tokens: 4096,
  rate_limit_per_minute: 10,
};

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4-5-20250514', label: 'Claude Opus 4.5' },
];

/* ─── Main Page ─── */

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-dark-text">Settings</h1>
        <p className="text-sm text-secondary-text mt-1">Platform configuration, agent registry, and user management</p>
      </div>

      <ConfigSection />
      <AgentRegistrySection />
      <PlatformUsersSection />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Section 1: Platform Config
   ═══════════════════════════════════════════════════════════════ */

function ConfigSection() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('alf_platform_config')
      .select('key, value');

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const merged = { ...DEFAULT_CONFIG };
    (data || []).forEach((row) => {
      if (row.key in merged) {
        const num = Number(row.value);
        merged[row.key] = isNaN(num) ? row.value : num;
      }
    });
    setConfig(merged);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const rows = Object.entries(config).map(([key, value]) => ({
      key,
      value: String(value),
    }));

    const { error: upsertErr } = await supabase
      .from('alf_platform_config')
      .upsert(rows, { onConflict: 'key' });

    if (upsertErr) {
      setError(upsertErr.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-dark-text">Platform Config</h2>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-3">{error}</div>}
      {saved && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-3">Configuration saved.</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-amber-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          <ConfigRow label="Default Model" hint="Used when tenants don't specify a model override">
            <select
              value={config.default_model}
              onChange={(e) => setConfig({ ...config, default_model: e.target.value })}
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </ConfigRow>

          <ConfigRow label="Max Tokens" hint="Default max output tokens per request">
            <input
              type="number"
              value={config.max_tokens}
              onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 0 })}
              min={256}
              max={32768}
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </ConfigRow>

          <ConfigRow label="Rate Limit" hint="Max agent calls per user per minute">
            <input
              type="number"
              value={config.rate_limit_per_minute}
              onChange={(e) => setConfig({ ...config, rate_limit_per_minute: parseInt(e.target.value) || 0 })}
              min={1}
              max={100}
              className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            />
          </ConfigRow>
        </div>
      )}
    </section>
  );
}

function ConfigRow({ label, hint, children }) {
  return (
    <div className="p-5 flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
      <div className="md:w-1/3">
        <div className="text-sm font-medium text-dark-text">{label}</div>
        <div className="text-xs text-secondary-text mt-0.5">{hint}</div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Section 2: Agent Registry
   ═══════════════════════════════════════════════════════════════ */

function AgentRegistrySection() {
  const [sourceAgents, setSourceAgents] = useState([]);
  const [dbAgents, setDbAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const agents = getAllSourceAgents();
    setSourceAgents(agents);

    const { data, error: fetchErr } = await supabase
      .from('alf_agent_definitions')
      .select('*')
      .order('agent_key');

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setDbAgents(data || []);
    }
    setLoading(false);
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    setSeedResult(null);

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

    if (upsertErr) {
      setError(upsertErr.message);
    } else {
      setSeedResult(`Seeded ${data.length} agent(s) to database.`);
      setDbAgents(data);
    }
    setSeeding(false);
  }

  const dbKeys = new Set(dbAgents.map((a) => a.agent_key));

  const columns = [
    {
      key: 'key', label: 'Agent Key',
      render: (val) => <span className="font-mono text-xs font-medium text-dark-text">{val}</span>,
    },
    {
      key: 'name', label: 'Name',
      render: (val) => <span className="text-sm">{val || '\u2014'}</span>,
    },
    {
      key: 'description', label: 'Description',
      render: (val) => <span className="text-xs text-secondary-text line-clamp-2">{val || '\u2014'}</span>,
    },
    {
      key: 'model', label: 'Model',
      render: (val) => <span className="text-xs font-mono text-secondary-text">{val || 'default'}</span>,
    },
    {
      key: 'key', label: 'In DB',
      render: (val) => dbKeys.has(val)
        ? <CheckCircle size={16} className="text-green-500" />
        : <span className="text-xs text-secondary-text">\u2014</span>,
    },
  ];

  const tableData = sourceAgents.map((a) => ({
    id: a.key,
    key: a.key,
    name: a.name || a.key,
    description: a.description || '',
    model: a.model || null,
  }));

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-dark-text">Agent Registry</h2>
          {!loading && (
            <p className="text-sm text-secondary-text mt-1">
              {sourceAgents.length} source-code agents &middot; {dbAgents.length} in database
            </p>
          )}
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding || loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {seeding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          {seeding ? 'Seeding...' : 'Seed to Database'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-3">{error}</div>}
      {seedResult && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-3">{seedResult}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-amber-500 animate-spin" />
        </div>
      ) : (
        <DataTable columns={columns} data={tableData} />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Section 3: Platform Users
   ═══════════════════════════════════════════════════════════════ */

function PlatformUsersSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Create user form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'platform_owner' });
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, name, email, role, active')
      .is('tenant_id', null)
      .in('role', ['platform_owner', 'platform_viewer'])
      .order('name');

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) return;
    setCreating(true);
    setError(null);
    setSuccess(null);

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
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          title: '',
          role: form.role,
          modules: [],
          tenant_id: null,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error || `Failed to create user (${res.status})`);
      } else {
        setSuccess(`Created ${form.name.trim()} as ${form.role}`);
        setTimeout(() => setSuccess(null), 3000);
        setForm({ name: '', email: '', password: '', role: 'platform_owner' });
        setShowForm(false);
        setShowPassword(false);
        await loadUsers();
      }
    } catch (err) {
      setError('Could not reach admin-create-user: ' + err.message);
    }
    setCreating(false);
  }

  async function handleResetPassword(userEmail) {
    setActionLoading(userEmail);
    setError(null);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(userEmail);
      if (resetErr) {
        setError(resetErr.message);
      } else {
        setSuccess('Password reset email sent');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err.message);
    }
    setActionLoading(null);
  }

  async function handleToggleActive(user) {
    setActionLoading(user.id);
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
    setActionLoading(null);
  }

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email', render: (val) => <span className="text-xs text-secondary-text">{val}</span> },
    {
      key: 'role', label: 'Role',
      render: (val) => {
        const styles = val === 'platform_owner'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-purple-50 text-purple-700';
        return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles}`}>{val.replace('_', ' ')}</span>;
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
            disabled={actionLoading === row.email}
            title="Send password reset email"
            className="p-1 text-gray-400 hover:text-amber-600 transition-colors disabled:opacity-50"
          >
            {actionLoading === row.email ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleActive(row); }}
            disabled={actionLoading === row.id}
            title={row.active ? 'Deactivate user' : 'Activate user'}
            className={`p-1 transition-colors disabled:opacity-50 ${row.active ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`}
          >
            {actionLoading === row.id ? <Loader2 size={14} className="animate-spin" /> : row.active ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-dark-text">Platform Users</h2>
          <p className="text-sm text-secondary-text mt-1">Users with platform-level access (not tied to any tenant)</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
        >
          <Plus size={14} />
          Add User
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-3">{success}</div>}

      {showForm && (
        <div className="bg-white rounded-lg border border-amber-200 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="email@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary-text mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              >
                <option value="platform_owner">Platform Owner</option>
                <option value="platform_viewer">Platform Viewer</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim() || !form.email.trim() || form.password.length < 6}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create User
            </button>
            <button
              onClick={() => { setShowForm(false); setForm({ name: '', email: '', password: '', role: 'platform_owner' }); setShowPassword(false); }}
              className="px-3 py-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="text-amber-500 animate-spin" />
        </div>
      ) : users.length > 0 ? (
        <DataTable columns={columns} data={users} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-secondary-text">
          No platform users found. Create one to get started.
        </div>
      )}
    </section>
  );
}
