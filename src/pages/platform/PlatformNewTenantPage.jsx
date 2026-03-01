import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase, getFreshToken } from '../../lib/supabase';
import { slugify } from '../../utils/slugify';
import { MODULE_REGISTRY, fullModuleConfig } from '../../data/moduleRegistry';
import { TIER_REGISTRY, TIER_KEYS, getTierDefaults } from '../../data/tierRegistry';
import { DASHBOARD_TEMPLATES, TEMPLATE_KEYS, getTemplateConfigs } from '../../data/dashboardTemplates';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

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
      dashboardTemplate: 'default',
      industryTemplate: '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [industryTemplates, setIndustryTemplates] = useState([]);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const { data } = await supabase
      .from('industry_templates')
      .select('id, industry_key, name, description')
      .order('name');
    setIndustryTemplates(data || []);
  }

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

    // Apply dashboard template if not 'default' (default = no configs needed)
    if (form.dashboardTemplate && form.dashboardTemplate !== 'default') {
      try {
        const templateConfigs = getTemplateConfigs(form.dashboardTemplate);
        if (Object.keys(templateConfigs).length > 0) {
          const token = await getFreshToken();
          await fetch(`${BACKEND_URL}/api/dashboards/${data.id}/apply-template`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ configs: templateConfigs }),
          });
        }
      } catch (err) {
        // Non-blocking — tenant is created, template just didn't apply
        console.warn('[NewTenant] Dashboard template apply failed:', err.message);
      }
    }

    // Create company profile from industry template if selected
    if (form.industryTemplate) {
      try {
        const { data: templateRow } = await supabase
          .from('industry_templates')
          .select('template_data')
          .eq('industry_key', form.industryTemplate)
          .single();

        if (templateRow?.template_data) {
          const token = await getFreshToken();
          await fetch(`${BACKEND_URL}/api/company-profile/${data.id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...templateRow.template_data,
              profile_status: 'draft',
            }),
          });
        }
      } catch (err) {
        console.warn('[NewTenant] Industry template apply failed:', err.message);
      }
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange font-mono"
              placeholder="acme-corp"
            />
            <p className="text-xs text-secondary-text mt-1">Auto-generated from company name. You can override it.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Tier</label>
            <select
              value={form.plan}
              onChange={(e) => handleTierChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            >
              {TIER_KEYS.map((key) => (
                <option key={key} value={key}>{TIER_REGISTRY[key].label}</option>
              ))}
            </select>
            <p className="text-xs text-secondary-text mt-1">{TIER_REGISTRY[form.plan]?.description}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Start from Template</label>
            <select
              value={form.industryTemplate}
              onChange={(e) => setForm({ ...form, industryTemplate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            >
              <option value="">No template — blank profile</option>
              {industryTemplates.map((t) => (
                <option key={t.industry_key} value={t.industry_key}>{t.name}</option>
              ))}
            </select>
            <p className="text-xs text-secondary-text mt-1">
              {form.industryTemplate
                ? industryTemplates.find((t) => t.industry_key === form.industryTemplate)?.description || ''
                : 'Pre-populates the company profile with industry-specific departments, services, and differentiators.'}
            </p>
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
                      ? 'bg-alf-orange/10 border-alf-orange/40 text-alf-orange'
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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1">Max Agents</label>
              <input
                type="number"
                value={form.max_agents}
                onChange={(e) => setForm({ ...form, max_agents: parseInt(e.target.value) || 0 })}
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              />
            </div>
          </div>
        </div>

        {/* Dashboard Template */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1">Dashboard Template</label>
            <select
              value={form.dashboardTemplate}
              onChange={(e) => setForm({ ...form, dashboardTemplate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            >
              {TEMPLATE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {DASHBOARD_TEMPLATES[key].label}
                </option>
              ))}
            </select>
            <p className="text-xs text-secondary-text mt-1">
              {DASHBOARD_TEMPLATES[form.dashboardTemplate]?.description}
            </p>
          </div>
        </div>

        <div className="p-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Creating...' : 'Create Tenant'}
          </button>
        </div>
      </form>
    </div>
  );
}
