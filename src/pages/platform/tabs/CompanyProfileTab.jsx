import { useState, useEffect } from 'react';
import {
  Save, Loader2, Plus, Trash2, GripVertical, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Building, MapPin, Users, Award, Briefcase,
  Shield, Cpu, BookOpen, UserCheck, Zap,
} from 'lucide-react';
import { getFreshToken } from '../../../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

const STATUS_COLORS = {
  draft: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  enriched: 'bg-blue-100 text-blue-800',
};

const CHECKLIST_ITEMS = [
  { key: 'profile_confirmed', label: 'Company profile confirmed' },
  { key: 'documents_uploaded', label: 'Documents uploaded' },
  { key: 'data_source_connected', label: 'Data source connected' },
];

const EMPTY_DEPARTMENT = { key: '', name: '', description: '', icon: 'clipboard-list' };
const EMPTY_SERVICE_CATEGORY = { category: '', services: [''] };
const EMPTY_DIFFERENTIATOR = { key: '', label: '', description: '' };
const EMPTY_TECH_PLATFORM = { name: '', description: '' };
const EMPTY_LEADER = { name: '', title: '' };

export default function CompanyProfileTab({ tenantId, hasWorkspaces, onPortalGenerated }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generationBanner, setGenerationBanner] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    departments: true,
    services: false,
    differentiators: false,
    leadership: false,
    technology: false,
    training: false,
    clients: false,
    onboarding: true,
  });

  useEffect(() => {
    loadProfile();
  }, [tenantId]);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/company-profile/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load profile');

      if (json.profile) {
        setProfile(json.profile);
      } else {
        // No profile yet — initialize empty
        setProfile({
          tenant_id: tenantId,
          industry: '',
          sub_vertical: '',
          company_description: '',
          founded_year: null,
          employee_count: '',
          headquarters: '',
          ownership_model: '',
          geographic_coverage: [],
          certifications: [],
          departments: [],
          service_catalog: [],
          differentiators: [],
          key_clients: [],
          union_partnerships: [],
          technology_platforms: [],
          training_programs: [],
          key_leadership: [],
          profile_status: 'draft',
          onboarding_checklist: {},
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getFreshToken();
      const { id, created_at, updated_at, ...body } = profile;
      const res = await fetch(`${BACKEND_URL}/api/company-profile/${tenantId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setProfile(json.profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/company-profile/${tenantId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile_status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update status');
      setProfile(json.profile);

      // Show banner if auto-generation happened
      if (json.auto_generated && json.generation_result) {
        const r = json.generation_result;
        setGenerationBanner(
          `Generated ${r.workspaces.length} workspaces, ${r.agents.length} agents, ${r.tools.length} tools, ${r.domains.length} dashboard domains`
        );
        onPortalGenerated?.();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGeneratePortal() {
    setGenerating(true);
    setError(null);
    setGenerationBanner(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-portal/${tenantId}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate portal');
      setGenerationBanner(
        `Generated ${json.workspaces} workspaces, ${json.agents} agents, ${json.tools} tools, ${json.domains} dashboard domains`
      );
      onPortalGenerated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleChecklistToggle(key) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/company-profile/${tenantId}/checklist`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [key]: !profile.onboarding_checklist?.[key] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update checklist');
      setProfile(json.profile);
    } catch (err) {
      setError(err.message);
    }
  }

  // Field updater
  function updateField(field, value) {
    setProfile((p) => ({ ...p, [field]: value }));
  }

  // Array helpers for JSONB arrays of strings
  function addStringItem(field) {
    setProfile((p) => ({ ...p, [field]: [...(p[field] || []), ''] }));
  }
  function updateStringItem(field, index, value) {
    setProfile((p) => {
      const arr = [...(p[field] || [])];
      arr[index] = value;
      return { ...p, [field]: arr };
    });
  }
  function removeStringItem(field, index) {
    setProfile((p) => ({
      ...p,
      [field]: (p[field] || []).filter((_, i) => i !== index),
    }));
  }

  // Array helpers for JSONB arrays of objects
  function addObjectItem(field, template) {
    setProfile((p) => ({ ...p, [field]: [...(p[field] || []), { ...template }] }));
  }
  function updateObjectItem(field, index, key, value) {
    setProfile((p) => {
      const arr = [...(p[field] || [])];
      arr[index] = { ...arr[index], [key]: value };
      return { ...p, [field]: arr };
    });
  }
  function removeObjectItem(field, index) {
    setProfile((p) => ({
      ...p,
      [field]: (p[field] || []).filter((_, i) => i !== index),
    }));
  }
  function moveObjectItem(field, index, direction) {
    setProfile((p) => {
      const arr = [...(p[field] || [])];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= arr.length) return p;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return { ...p, [field]: arr };
    });
  }

  // Service catalog helpers
  function addServiceToCategory(catIndex) {
    setProfile((p) => {
      const catalog = [...(p.service_catalog || [])];
      catalog[catIndex] = {
        ...catalog[catIndex],
        services: [...catalog[catIndex].services, ''],
      };
      return { ...p, service_catalog: catalog };
    });
  }
  function updateServiceInCategory(catIndex, svcIndex, value) {
    setProfile((p) => {
      const catalog = [...(p.service_catalog || [])];
      const services = [...catalog[catIndex].services];
      services[svcIndex] = value;
      catalog[catIndex] = { ...catalog[catIndex], services };
      return { ...p, service_catalog: catalog };
    });
  }
  function removeServiceFromCategory(catIndex, svcIndex) {
    setProfile((p) => {
      const catalog = [...(p.service_catalog || [])];
      catalog[catIndex] = {
        ...catalog[catIndex],
        services: catalog[catIndex].services.filter((_, i) => i !== svcIndex),
      };
      return { ...p, service_catalog: catalog };
    });
  }

  function toggleSection(key) {
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12 text-secondary-text">
        Failed to load company profile.
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
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          Company profile saved successfully.
        </div>
      )}
      {generationBanner && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <Zap size={14} />
          {generationBanner}
        </div>
      )}

      {/* Header with status + save */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-dark-text">Company Profile</h2>
          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[profile.profile_status] || STATUS_COLORS.draft}`}>
            {profile.profile_status || 'draft'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {profile.profile_status === 'draft' && (
            <button
              onClick={() => handleStatusChange('confirmed')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
            >
              <CheckCircle size={14} />
              Confirm Profile
            </button>
          )}
          {profile.profile_status === 'confirmed' && (
            <button
              onClick={() => handleStatusChange('enriched')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <CheckCircle size={14} />
              Mark Enriched
            </button>
          )}
          {(profile.profile_status === 'confirmed' || profile.profile_status === 'enriched') && !hasWorkspaces && (
            <button
              onClick={handleGeneratePortal}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-alf-orange rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {generating ? 'Generating...' : 'Generate Portal'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-1.5 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* ─── Basic Info Section ─── */}
      <Section
        title="Company Information"
        icon={Building}
        expanded={expandedSections.basic}
        onToggle={() => toggleSection('basic')}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Industry" value={profile.industry} onChange={(v) => updateField('industry', v)} />
          <Field label="Sub-Vertical" value={profile.sub_vertical} onChange={(v) => updateField('sub_vertical', v)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1">Company Description</label>
          <textarea
            value={profile.company_description || ''}
            onChange={(e) => updateField('company_description', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Founded Year" type="number" value={profile.founded_year || ''} onChange={(v) => updateField('founded_year', v ? parseInt(v) : null)} />
          <Field label="Employee Count" value={profile.employee_count} onChange={(v) => updateField('employee_count', v)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Headquarters" value={profile.headquarters} onChange={(v) => updateField('headquarters', v)} icon={MapPin} />
          <Field label="Ownership Model" value={profile.ownership_model} onChange={(v) => updateField('ownership_model', v)} />
        </div>

        {/* Geographic Coverage — string array */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1">Geographic Coverage</label>
          <TagList
            items={profile.geographic_coverage || []}
            onAdd={() => addStringItem('geographic_coverage')}
            onUpdate={(i, v) => updateStringItem('geographic_coverage', i, v)}
            onRemove={(i) => removeStringItem('geographic_coverage', i)}
            placeholder="e.g. Northeast"
          />
        </div>

        {/* Certifications — string array */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1">Certifications</label>
          <TagList
            items={profile.certifications || []}
            onAdd={() => addStringItem('certifications')}
            onUpdate={(i, v) => updateStringItem('certifications', i, v)}
            onRemove={(i) => removeStringItem('certifications', i)}
            placeholder="e.g. MBE"
          />
        </div>
      </Section>

      {/* ─── Departments ─── */}
      <Section
        title="Departments"
        icon={Users}
        expanded={expandedSections.departments}
        onToggle={() => toggleSection('departments')}
        count={profile.departments?.length}
      >
        {(profile.departments || []).map((dept, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-0.5 pt-1">
                <button onClick={() => moveObjectItem('departments', i, -1)} className="text-gray-400 hover:text-gray-600" disabled={i === 0}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveObjectItem('departments', i, 1)} className="text-gray-400 hover:text-gray-600" disabled={i === profile.departments.length - 1}>
                  <ChevronDown size={12} />
                </button>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  value={dept.key || ''}
                  onChange={(e) => updateObjectItem('departments', i, 'key', e.target.value)}
                  placeholder="Key (e.g. operations)"
                  className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange font-mono"
                />
                <input
                  value={dept.name || ''}
                  onChange={(e) => updateObjectItem('departments', i, 'name', e.target.value)}
                  placeholder="Display Name"
                  className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                />
              </div>
              <button onClick={() => removeObjectItem('departments', i)} className="text-red-400 hover:text-red-600 pt-1">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="ml-6 grid grid-cols-[1fr_120px] gap-2">
              <input
                value={dept.description || ''}
                onChange={(e) => updateObjectItem('departments', i, 'description', e.target.value)}
                placeholder="Description"
                className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              />
              <input
                value={dept.icon || ''}
                onChange={(e) => updateObjectItem('departments', i, 'icon', e.target.value)}
                placeholder="Icon"
                className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange font-mono"
              />
            </div>
          </div>
        ))}
        <button
          onClick={() => addObjectItem('departments', EMPTY_DEPARTMENT)}
          className="flex items-center gap-1.5 text-sm text-alf-orange hover:text-alf-orange/80 transition-colors"
        >
          <Plus size={14} />
          Add Department
        </button>
      </Section>

      {/* ─── Service Catalog ─── */}
      <Section
        title="Service Catalog"
        icon={Briefcase}
        expanded={expandedSections.services}
        onToggle={() => toggleSection('services')}
        count={profile.service_catalog?.length}
      >
        {(profile.service_catalog || []).map((cat, ci) => (
          <div key={ci} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveObjectItem('service_catalog', ci, -1)} className="text-gray-400 hover:text-gray-600" disabled={ci === 0}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveObjectItem('service_catalog', ci, 1)} className="text-gray-400 hover:text-gray-600" disabled={ci === (profile.service_catalog?.length || 0) - 1}>
                  <ChevronDown size={12} />
                </button>
              </div>
              <input
                value={cat.category || ''}
                onChange={(e) => updateObjectItem('service_catalog', ci, 'category', e.target.value)}
                placeholder="Category (e.g. Janitorial)"
                className="flex-1 px-2.5 py-1.5 text-sm font-medium border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
              />
              <button onClick={() => removeObjectItem('service_catalog', ci)} className="text-red-400 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="ml-6 space-y-1.5">
              {(cat.services || []).map((svc, si) => (
                <div key={si} className="flex items-center gap-2">
                  <input
                    value={svc}
                    onChange={(e) => updateServiceInCategory(ci, si, e.target.value)}
                    placeholder="Service name"
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                  />
                  <button onClick={() => removeServiceFromCategory(ci, si)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addServiceToCategory(ci)}
                className="flex items-center gap-1 text-xs text-alf-orange hover:text-alf-orange/80"
              >
                <Plus size={12} />
                Add Service
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => addObjectItem('service_catalog', EMPTY_SERVICE_CATEGORY)}
          className="flex items-center gap-1.5 text-sm text-alf-orange hover:text-alf-orange/80 transition-colors"
        >
          <Plus size={14} />
          Add Category
        </button>
      </Section>

      {/* ─── Differentiators ─── */}
      <Section
        title="Differentiators"
        icon={Award}
        expanded={expandedSections.differentiators}
        onToggle={() => toggleSection('differentiators')}
        count={profile.differentiators?.length}
      >
        {(profile.differentiators || []).map((d, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-0.5 pt-1">
                <button onClick={() => moveObjectItem('differentiators', i, -1)} className="text-gray-400 hover:text-gray-600" disabled={i === 0}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveObjectItem('differentiators', i, 1)} className="text-gray-400 hover:text-gray-600" disabled={i === profile.differentiators.length - 1}>
                  <ChevronDown size={12} />
                </button>
              </div>
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={d.key || ''}
                    onChange={(e) => updateObjectItem('differentiators', i, 'key', e.target.value)}
                    placeholder="Key"
                    className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange font-mono"
                  />
                  <input
                    value={d.label || ''}
                    onChange={(e) => updateObjectItem('differentiators', i, 'label', e.target.value)}
                    placeholder="Label"
                    className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                  />
                </div>
                <input
                  value={d.description || ''}
                  onChange={(e) => updateObjectItem('differentiators', i, 'description', e.target.value)}
                  placeholder="Description"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
                />
              </div>
              <button onClick={() => removeObjectItem('differentiators', i)} className="text-red-400 hover:text-red-600 pt-1">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => addObjectItem('differentiators', EMPTY_DIFFERENTIATOR)}
          className="flex items-center gap-1.5 text-sm text-alf-orange hover:text-alf-orange/80 transition-colors"
        >
          <Plus size={14} />
          Add Differentiator
        </button>
      </Section>

      {/* ─── Key Leadership ─── */}
      <Section
        title="Key Leadership"
        icon={UserCheck}
        expanded={expandedSections.leadership}
        onToggle={() => toggleSection('leadership')}
        count={profile.key_leadership?.length}
      >
        {(profile.key_leadership || []).map((leader, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveObjectItem('key_leadership', i, -1)} className="text-gray-400 hover:text-gray-600" disabled={i === 0}>
                <ChevronUp size={12} />
              </button>
              <button onClick={() => moveObjectItem('key_leadership', i, 1)} className="text-gray-400 hover:text-gray-600" disabled={i === profile.key_leadership.length - 1}>
                <ChevronDown size={12} />
              </button>
            </div>
            <input
              value={leader.name || ''}
              onChange={(e) => updateObjectItem('key_leadership', i, 'name', e.target.value)}
              placeholder="Name"
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            />
            <input
              value={leader.title || ''}
              onChange={(e) => updateObjectItem('key_leadership', i, 'title', e.target.value)}
              placeholder="Title"
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            />
            <button onClick={() => removeObjectItem('key_leadership', i)} className="text-red-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={() => addObjectItem('key_leadership', EMPTY_LEADER)}
          className="flex items-center gap-1.5 text-sm text-alf-orange hover:text-alf-orange/80 transition-colors"
        >
          <Plus size={14} />
          Add Leader
        </button>
      </Section>

      {/* ─── Technology Platforms ─── */}
      <Section
        title="Technology Platforms"
        icon={Cpu}
        expanded={expandedSections.technology}
        onToggle={() => toggleSection('technology')}
        count={profile.technology_platforms?.length}
      >
        {(profile.technology_platforms || []).map((tp, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex flex-col gap-0.5 pt-1">
              <button onClick={() => moveObjectItem('technology_platforms', i, -1)} className="text-gray-400 hover:text-gray-600" disabled={i === 0}>
                <ChevronUp size={12} />
              </button>
              <button onClick={() => moveObjectItem('technology_platforms', i, 1)} className="text-gray-400 hover:text-gray-600" disabled={i === profile.technology_platforms.length - 1}>
                <ChevronDown size={12} />
              </button>
            </div>
            <input
              value={tp.name || ''}
              onChange={(e) => updateObjectItem('technology_platforms', i, 'name', e.target.value)}
              placeholder="Platform name"
              className="w-40 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            />
            <input
              value={tp.description || ''}
              onChange={(e) => updateObjectItem('technology_platforms', i, 'description', e.target.value)}
              placeholder="Description"
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
            />
            <button onClick={() => removeObjectItem('technology_platforms', i)} className="text-red-400 hover:text-red-600 pt-1.5">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          onClick={() => addObjectItem('technology_platforms', EMPTY_TECH_PLATFORM)}
          className="flex items-center gap-1.5 text-sm text-alf-orange hover:text-alf-orange/80 transition-colors"
        >
          <Plus size={14} />
          Add Platform
        </button>
      </Section>

      {/* ─── Training Programs ─── */}
      <Section
        title="Training Programs"
        icon={BookOpen}
        expanded={expandedSections.training}
        onToggle={() => toggleSection('training')}
        count={profile.training_programs?.length}
      >
        <TagList
          items={profile.training_programs || []}
          onAdd={() => addStringItem('training_programs')}
          onUpdate={(i, v) => updateStringItem('training_programs', i, v)}
          onRemove={(i) => removeStringItem('training_programs', i)}
          placeholder="Program name"
        />
      </Section>

      {/* ─── Clients & Partnerships ─── */}
      <Section
        title="Clients & Partnerships"
        icon={Shield}
        expanded={expandedSections.clients}
        onToggle={() => toggleSection('clients')}
      >
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1">Key Clients</label>
          <TagList
            items={profile.key_clients || []}
            onAdd={() => addStringItem('key_clients')}
            onUpdate={(i, v) => updateStringItem('key_clients', i, v)}
            onRemove={(i) => removeStringItem('key_clients', i)}
            placeholder="Client name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1">Union Partnerships</label>
          <TagList
            items={profile.union_partnerships || []}
            onAdd={() => addStringItem('union_partnerships')}
            onUpdate={(i, v) => updateStringItem('union_partnerships', i, v)}
            onRemove={(i) => removeStringItem('union_partnerships', i)}
            placeholder="Union name"
          />
        </div>
      </Section>

      {/* ─── Onboarding Checklist ─── */}
      <Section
        title="Onboarding Checklist"
        icon={CheckCircle}
        expanded={expandedSections.onboarding}
        onToggle={() => toggleSection('onboarding')}
      >
        <div className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => {
            const checked = profile.onboarding_checklist?.[item.key] || false;
            return (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                <button
                  onClick={() => handleChecklistToggle(item.key)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    checked
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 group-hover:border-gray-400'
                  }`}
                >
                  {checked && <CheckCircle size={12} />}
                </button>
                <span className={`text-sm ${checked ? 'text-dark-text' : 'text-secondary-text'}`}>
                  {item.label}
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Bottom save bar */}
      <div className="flex justify-end pt-2 pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}

/* ─── Reusable sub-components ─── */

function Section({ title, icon: Icon, expanded, onToggle, children, count }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-secondary-text" />}
          <span className="text-sm font-semibold text-dark-text">{title}</span>
          {count != null && (
            <span className="text-xs text-secondary-text bg-gray-100 px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-secondary-text" /> : <ChevronDown size={16} className="text-secondary-text" />}
      </button>
      {expanded && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', icon: Icon, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-dark-text mb-1">{label}</label>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary-text" />}
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || label}
          className={`w-full py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange ${
            Icon ? 'pl-8 pr-3' : 'px-3'
          }`}
        />
      </div>
    </div>
  );
}

function TagList({ items, onAdd, onUpdate, onRemove, placeholder }) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(e) => onUpdate(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
          />
          <button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-xs text-alf-orange hover:text-alf-orange/80 transition-colors"
      >
        <Plus size={12} />
        Add
      </button>
    </div>
  );
}
