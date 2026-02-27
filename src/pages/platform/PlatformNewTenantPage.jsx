import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { slugify } from '../../utils/slugify';
import { MODULE_REGISTRY, fullModuleConfig } from '../../data/moduleRegistry';
import { TIER_REGISTRY, TIER_KEYS, getTierDefaults } from '../../data/tierRegistry';

const MODULE_OPTIONS = Object.entries(MODULE_REGISTRY).map(([key, mod]) => ({
  key,
  label: mod.label,
}));

export default function PlatformNewTenantPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => {
    const defaults = getTierDefaults('melmac');
    return {
      company_name: '',
      slug: '',
      plan: 'melmac',
      modules: defaults.modules,
      max_users: defaults.maxUsers,
      max_agents: 10,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function handleNameChange(name) {
    setForm({ ...form, company_name: name, slug: slugify(name) });
  }

  function handleTierChange(tierKey) {
    const defaults = getTierDefaults(tierKey);
    if (defaults) {
      setForm((prev) => ({
        ...prev,
        plan: tierKey,
        modules: defaults.modules,
        max_users: defaults.maxUsers,
      }));
    } else {
      setForm((prev) => ({ ...prev, plan: tierKey }));
    }
  }

  function toggleModule(key) {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(key)
        ? prev.modules.filter((m) => m !== key)
        : [...prev.modules, key],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company_name.trim()) {
      setError('Company name is required');
      return;
    }

    setSaving(true);
    setError(null);

    // Build module_config from selected modules — all capabilities on by default
    const moduleConfigObj = {};
    for (const key of form.modules) {
      moduleConfigObj[key] = fullModuleConfig(key);
    }

    const { data, error: insertErr } = await supabase
      .from('alf_tenants')
      .insert({
        company_name: form.company_name.trim(),
        slug: form.slug || slugify(form.company_name),
        plan: form.plan,
        enabled_modules: form.modules,
        module_config: moduleConfigObj,
        max_users: form.max_users,
        max_agents: form.max_agents,
        status: 'active',
      })
      .select()
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    navigate(`/platform/tenants/${data.id}`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <button
        onClick={() => navigate('/platform/tenants')}
        className="flex items-center gap-1.5 text-sm text-secondary-text hover:text-dark-text transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Tenants
      </button>

      <div>
        <h1 className="text-xl font-semibold text-dark-text">New Tenant</h1>
        <p className="text-sm text-secondary-text mt-1">Create a new organization on the platform</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Company Name</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500 font-mono"
              placeholder="acme-corp"
            />
            <p className="text-xs text-secondary-text mt-1">Auto-generated from company name. You can override it.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Tier</label>
            <select
              value={form.plan}
              onChange={(e) => handleTierChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
            >
              {TIER_KEYS.map((key) => (
                <option key={key} value={key}>{TIER_REGISTRY[key].label}</option>
              ))}
            </select>
            <p className="text-xs text-secondary-text mt-1">{TIER_REGISTRY[form.plan]?.description}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-2">Modules</label>
            <div className="flex flex-wrap gap-2">
              {MODULE_OPTIONS.map((mod) => (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => toggleModule(mod.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    form.modules.includes(mod.key)
                      ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-white border-gray-200 text-secondary-text hover:border-gray-300'
                  }`}
                >
                  {mod.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">Max Users</label>
              <input
                type="number"
                value={form.max_users}
                onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) || 0 })}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">Max Agents</label>
              <input
                type="number"
                value={form.max_agents}
                onChange={(e) => setForm({ ...form, max_agents: parseInt(e.target.value) || 0 })}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        <div className="p-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Creating...' : 'Create Tenant'}
          </button>
        </div>
      </form>
    </div>
  );
}
