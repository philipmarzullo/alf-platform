import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, RotateCcw, Zap, BookOpen, Users,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSourceAgentConfig, getAllSourceAgents } from '../../agents/registry';
import { classifyTemplate } from '../../agents/overrides';
import { DEPT_COLORS, MODEL_OPTIONS } from '../../data/constants';
import DataTable from '../../components/shared/DataTable';

const DEPT_OPTIONS = [
  'hr', 'finance', 'purchasing', 'sales', 'ops', 'admin', 'platform', 'tools',
];

const DEPT_LABELS = {
  hr: 'HR', finance: 'Finance', purchasing: 'Purchasing',
  sales: 'Sales', ops: 'Operations', admin: 'Admin',
  platform: 'Platform', tools: 'Tools',
};

export default function PlatformAgentDetailPage() {
  const { agentKey } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Editable form state
  const [form, setForm] = useState({
    name: '',
    department: 'admin',
    model: '',
    status: 'active',
    system_prompt: '',
  });

  // Source-code config for comparison/reset
  const [sourceConfig, setSourceConfig] = useState(null);
  // DB record (null if not yet seeded)
  const [dbRecord, setDbRecord] = useState(null);
  // Source actions for display
  const [sourceActions, setSourceActions] = useState([]);
  // Knowledge modules
  const [knowledgeModules, setKnowledgeModules] = useState([]);
  // Tenant assignments
  const [tenantAssignments, setTenantAssignments] = useState([]);

  useEffect(() => { loadData(); }, [agentKey]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const src = getSourceAgentConfig(agentKey);
      setSourceConfig(src);

      // Extract source actions for read-only display
      if (src?.actions) {
        const actionList = Object.entries(src.actions).map(([key, action]) => {
          const classification = classifyTemplate(action.promptTemplate);
          return {
            key,
            label: action.label || key,
            description: action.description || '',
            templateType: classification.type,
          };
        });
        setSourceActions(actionList);
      } else {
        setSourceActions([]);
      }

      // Knowledge modules
      setKnowledgeModules(src?.knowledgeModules || []);

      // Fetch DB record and tenant overrides in parallel
      const [dbRes, overridesRes] = await Promise.all([
        supabase
          .from('alf_agent_definitions')
          .select('*')
          .eq('agent_key', agentKey)
          .maybeSingle(),
        supabase
          .from('tenant_agent_overrides')
          .select('tenant_id, is_enabled, custom_prompt_additions, alf_tenants(id, name)')
          .eq('agent_key', agentKey),
      ]);

      if (dbRes.error) throw dbRes.error;

      const db = dbRes.data;
      setDbRecord(db);

      // Initialize form from DB if exists, otherwise from source
      if (db) {
        setForm({
          name: db.name || '',
          department: db.department || 'admin',
          model: db.model || '',
          status: db.status || 'active',
          system_prompt: db.system_prompt || '',
        });
      } else if (src) {
        setForm({
          name: src.name || agentKey,
          department: src.department || 'admin',
          model: src.model || '',
          status: src.status || 'active',
          system_prompt: src.systemPrompt || '',
        });
      }

      // Build tenant assignments list
      const overrides = overridesRes.data || [];
      const assignments = overrides.map((o) => {
        const tenant = o.alf_tenants;
        return {
          id: o.tenant_id,
          tenantName: tenant?.name || o.tenant_id,
          tenantId: tenant?.id || o.tenant_id,
          isEnabled: o.is_enabled !== false,
          customPrompt: o.custom_prompt_additions || '',
        };
      });
      setTenantAssignments(assignments);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // Build actions from source for DB storage
      const src = getSourceAgentConfig(agentKey);
      const actionsForDb = src?.actions
        ? Object.entries(src.actions).map(([k, v]) => ({
            key: k,
            label: v.label || k,
            description: v.description || '',
          }))
        : [];

      const row = {
        agent_key: agentKey,
        name: form.name,
        department: form.department,
        model: form.model,
        status: form.status,
        system_prompt: form.system_prompt,
        actions: actionsForDb,
      };

      const { data, error: upsertErr } = await supabase
        .from('alf_agent_definitions')
        .upsert(row, { onConflict: 'agent_key' })
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      setDbRecord(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  function handleResetToSource() {
    if (!sourceConfig) return;
    setForm({
      name: sourceConfig.name || agentKey,
      department: sourceConfig.department || 'admin',
      model: sourceConfig.model || '',
      status: sourceConfig.status || 'active',
      system_prompt: sourceConfig.systemPrompt || '',
    });
  }

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!sourceConfig && !dbRecord) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/platform/agents')} className="flex items-center gap-2 text-sm text-secondary-text hover:text-dark-text transition-colors">
          <ArrowLeft size={16} /> Back to Agents
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Agent "{agentKey}" not found in source code or database.
        </div>
      </div>
    );
  }

  const deptColor = DEPT_COLORS[form.department] || '#6B7280';
  const promptLength = form.system_prompt?.length || 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <button
        onClick={() => navigate('/platform/agents')}
        className="flex items-center gap-2 text-sm text-secondary-text hover:text-dark-text transition-colors"
      >
        <ArrowLeft size={16} /> Back to Agents
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-10 rounded" style={{ backgroundColor: deptColor }} />
          <div>
            <h1 className="text-xl font-semibold text-dark-text">{form.name || agentKey}</h1>
            <p className="text-sm text-secondary-text mt-0.5 font-mono">{agentKey}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!dbRecord && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-500">
              Source Only — save to create DB record
            </span>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          Agent saved successfully.
        </div>
      )}

      {/* Editable Fields */}
      <section className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
        <FieldRow label="Name" hint="Display name shown in the UI">
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
          />
        </FieldRow>

        <FieldRow label="Department" hint="Controls color coding and grouping">
          <select
            value={form.department}
            onChange={(e) => update('department', e.target.value)}
            className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
          >
            {DEPT_OPTIONS.map((d) => (
              <option key={d} value={d}>{DEPT_LABELS[d] || d}</option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Model" hint="Claude model used for this agent's calls">
          <select
            value={form.model}
            onChange={(e) => update('model', e.target.value)}
            className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Status" hint="Inactive agents are hidden from tenants">
          <button
            onClick={() => update('status', form.status === 'active' ? 'inactive' : 'active')}
            className="flex items-center gap-2"
          >
            {form.status === 'active' ? (
              <>
                <ToggleRight size={28} className="text-amber-600" />
                <span className="text-sm font-medium text-green-700">Active</span>
              </>
            ) : (
              <>
                <ToggleLeft size={28} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Inactive</span>
              </>
            )}
          </button>
        </FieldRow>

        <div className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-medium text-dark-text">System Prompt</div>
              <div className="text-xs text-secondary-text mt-0.5">The base instructions sent to the model</div>
            </div>
            <span className="text-xs text-secondary-text">{promptLength.toLocaleString()} chars</span>
          </div>
          <textarea
            value={form.system_prompt}
            onChange={(e) => update('system_prompt', e.target.value)}
            rows={12}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-amber-500 resize-y"
            placeholder="Enter the system prompt..."
          />
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {sourceConfig && (
          <button
            onClick={handleResetToSource}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-secondary-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={16} />
            Reset to Source
          </button>
        )}
      </div>

      {/* Read-only: Actions */}
      {sourceActions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-secondary-text" />
            <h2 className="text-lg font-semibold text-dark-text">Actions ({sourceActions.length})</h2>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {sourceActions.map((action) => (
              <div key={action.key} className="px-4 py-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-dark-text">{action.label}</span>
                    <span className="font-mono text-[10px] text-secondary-text">{action.key}</span>
                  </div>
                  {action.description && (
                    <p className="text-xs text-secondary-text mt-0.5">{action.description}</p>
                  )}
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0 ${
                  action.templateType === 'passthrough' ? 'bg-gray-100 text-gray-600' :
                  action.templateType === 'simple' ? 'bg-blue-50 text-blue-700' :
                  action.templateType === 'complex' ? 'bg-purple-50 text-purple-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {action.templateType}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Read-only: Knowledge Modules */}
      {knowledgeModules.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={16} className="text-secondary-text" />
            <h2 className="text-lg font-semibold text-dark-text">Knowledge Modules</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {knowledgeModules.map((km) => (
              <span key={km} className="px-3 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                {km}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Read-only: Tenant Assignments */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-secondary-text" />
          <h2 className="text-lg font-semibold text-dark-text">Tenant Assignments ({tenantAssignments.length})</h2>
        </div>
        {tenantAssignments.length > 0 ? (
          <DataTable
            columns={[
              {
                key: 'tenantName',
                label: 'Tenant',
                render: (val, row) => (
                  <Link
                    to={`/platform/tenants/${row.tenantId}?tab=agents`}
                    className="text-sm font-medium text-amber-700 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {val}
                  </Link>
                ),
              },
              {
                key: 'isEnabled',
                label: 'Status',
                render: (val) => (
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    val ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {val ? 'Active' : 'Disabled'}
                  </span>
                ),
              },
              {
                key: 'customPrompt',
                label: 'Custom Prompt Additions',
                render: (val) => val
                  ? <span className="text-xs text-secondary-text line-clamp-1">{val.slice(0, 80)}...</span>
                  : <span className="text-xs text-gray-400">—</span>,
              },
            ]}
            data={tenantAssignments}
          />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-secondary-text">
            No tenants have been assigned this agent yet.
          </div>
        )}
      </section>
    </div>
  );
}

function FieldRow({ label, hint, children }) {
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
