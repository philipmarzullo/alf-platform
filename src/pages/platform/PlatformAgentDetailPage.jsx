import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Users,
  ToggleLeft, ToggleRight, MessageSquareText, Plus, Check, X as XIcon,
  Globe, Building2, Upload,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
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

  // DB record (null if not yet created)
  const [dbRecord, setDbRecord] = useState(null);
  // Tenant assignments
  const [tenantAssignments, setTenantAssignments] = useState([]);
  // Agent instructions
  const [instructions, setInstructions] = useState([]);
  const [allTenants, setAllTenants] = useState([]);
  const [instrForm, setInstrForm] = useState({ scope: 'global', tenantId: '', text: '' });
  const [instrFile, setInstrFile] = useState(null);
  const [submittingInstr, setSubmittingInstr] = useState(false);
  const instrFileRef = useRef(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => { loadData(); }, [agentKey]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      // Fetch DB record, overrides, instructions, and tenants in parallel
      const [dbRes, overridesRes, instrRes, tenantsRes] = await Promise.all([
        supabase
          .from('alf_agent_definitions')
          .select('*')
          .eq('agent_key', agentKey)
          .maybeSingle(),
        supabase
          .from('tenant_agent_overrides')
          .select('tenant_id, is_enabled, custom_prompt_additions, alf_tenants(id, name)')
          .eq('agent_key', agentKey),
        supabase
          .from('agent_instructions')
          .select('*, profiles:created_by(name), reviewer:reviewed_by(name), alf_tenants:tenant_id(name)')
          .eq('agent_key', agentKey)
          .order('created_at', { ascending: false }),
        supabase
          .from('alf_tenants')
          .select('id, name, company_name')
          .order('company_name'),
      ]);

      if (dbRes.error) throw dbRes.error;

      const db = dbRes.data;
      setDbRecord(db);

      // Initialize form from DB
      if (db) {
        setForm({
          name: db.name || '',
          department: db.department || 'admin',
          model: db.model || '',
          status: db.status || 'active',
          system_prompt: db.system_prompt || '',
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
      setInstructions(instrRes.data || []);
      setAllTenants(tenantsRes.data || []);
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
      const row = {
        agent_key: agentKey,
        name: form.name,
        department: form.department,
        model: form.model,
        status: form.status,
        system_prompt: form.system_prompt,
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

  async function handleAddInstruction() {
    if (!instrForm.text.trim()) return;
    setSubmittingInstr(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const tenantId = instrForm.scope === 'global' ? null : instrForm.tenantId || null;

      let fileFields = {};
      if (instrFile) {
        const storagePath = `instructions/${agentKey}/${Date.now()}_${instrFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: uploadErr } = await supabase.storage
          .from('tenant-documents')
          .upload(storagePath, instrFile);
        if (uploadErr) throw uploadErr;

        // Extract text from file
        let extractedText = '';
        if (instrFile.name.toLowerCase().endsWith('.txt')) {
          extractedText = await instrFile.text();
        }

        fileFields = {
          file_name: instrFile.name,
          file_type: instrFile.name.split('.').pop().toLowerCase(),
          file_size: instrFile.size,
          storage_path: storagePath,
          extracted_text: extractedText || null,
        };
      }

      const { error: insertErr } = await supabase
        .from('agent_instructions')
        .insert({
          tenant_id: tenantId,
          agent_key: agentKey,
          instruction_text: instrForm.text.trim(),
          source: 'platform',
          status: 'approved',
          created_by: user.id,
          ...fileFields,
        });

      if (insertErr) throw insertErr;

      setInstrForm({ scope: 'global', tenantId: '', text: '' });
      setInstrFile(null);
      loadData();
    } catch (err) {
      setError(err.message);
    }
    setSubmittingInstr(false);
  }

  async function handleReviewInstruction(instrId, newStatus) {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateErr } = await supabase
        .from('agent_instructions')
        .update({
          status: newStatus,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote.trim() || null,
        })
        .eq('id', instrId);

      if (updateErr) throw updateErr;
      setReviewingId(null);
      setReviewNote('');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteInstruction(instrId) {
    setError(null);
    try {
      const { error: delErr } = await supabase
        .from('agent_instructions')
        .delete()
        .eq('id', instrId);
      if (delErr) throw delErr;
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  if (!dbRecord) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/platform/agents')} className="flex items-center gap-2 text-sm text-secondary-text hover:text-dark-text transition-colors">
          <ArrowLeft size={16} /> Back to Agents
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Agent "{agentKey}" not found in the database.
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
      <div className="flex items-center gap-3">
        <div className="w-1 h-10 rounded" style={{ backgroundColor: deptColor }} />
        <div>
          <h1 className="text-xl font-semibold text-dark-text">{form.name || agentKey}</h1>
          <p className="text-sm text-secondary-text mt-0.5 font-mono">{agentKey}</p>
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
            className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
          />
        </FieldRow>

        <FieldRow label="Department" hint="Controls color coding and grouping">
          <select
            value={form.department}
            onChange={(e) => update('department', e.target.value)}
            className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
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
            className="w-full md:w-80 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange"
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
                <ToggleRight size={28} className="text-alf-orange" />
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
            className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange resize-y"
            placeholder="Enter the system prompt..."
          />
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

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
                    className="text-sm font-medium text-alf-orange hover:underline"
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

      {/* Agent Instructions */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquareText size={16} className="text-secondary-text" />
          <h2 className="text-lg font-semibold text-dark-text">
            Agent Instructions ({instructions.length})
          </h2>
        </div>

        {/* Add instruction form */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-3">
          <div className="text-sm font-medium text-dark-text">Add Instruction</div>

          <div className="flex items-center gap-3">
            <select
              value={instrForm.scope}
              onChange={(e) => setInstrForm(f => ({ ...f, scope: e.target.value, tenantId: '' }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange bg-white"
            >
              <option value="global">Global (all tenants)</option>
              <option value="tenant">Specific tenant</option>
            </select>
            {instrForm.scope === 'tenant' && (
              <select
                value={instrForm.tenantId}
                onChange={(e) => setInstrForm(f => ({ ...f, tenantId: e.target.value }))}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange bg-white"
              >
                <option value="">Select tenant...</option>
                {allTenants.map(t => (
                  <option key={t.id} value={t.id}>{t.company_name || t.name}</option>
                ))}
              </select>
            )}
          </div>

          <textarea
            value={instrForm.text}
            onChange={(e) => setInstrForm(f => ({ ...f, text: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange resize-none"
            placeholder="Enter instruction text..."
          />

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-secondary-text border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload size={14} />
              {instrFile ? instrFile.name : 'Attach file (optional)'}
              <input
                ref={instrFileRef}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => { if (e.target.files[0]) setInstrFile(e.target.files[0]); }}
                className="hidden"
              />
            </label>
            {instrFile && (
              <button onClick={() => setInstrFile(null)} className="text-xs text-gray-400 hover:text-red-500">
                <XIcon size={14} />
              </button>
            )}

            <button
              onClick={handleAddInstruction}
              disabled={submittingInstr || !instrForm.text.trim() || (instrForm.scope === 'tenant' && !instrForm.tenantId)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-alf-orange text-white text-sm font-medium rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
            >
              {submittingInstr ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add
            </button>
          </div>
        </div>

        {/* Instructions list */}
        {instructions.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-secondary-text">
            No instructions for this agent yet.
          </div>
        ) : (
          <div className="space-y-2">
            {instructions.map((instr) => {
              const isPending = instr.status === 'pending';
              const isReviewing = reviewingId === instr.id;

              return (
                <div key={instr.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {/* Scope badge */}
                          {instr.tenant_id ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700">
                              <Building2 size={10} />
                              {instr.alf_tenants?.name || 'Tenant'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-50 text-purple-700">
                              <Globe size={10} />
                              Global
                            </span>
                          )}
                          {/* Source badge */}
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            instr.source === 'platform' ? 'bg-alf-orange/10 text-alf-orange' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {instr.source}
                          </span>
                          {/* Status badge */}
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            instr.status === 'approved' ? 'bg-green-50 text-green-700' :
                            instr.status === 'rejected' ? 'bg-red-50 text-red-600' :
                            'bg-orange-50 text-orange-700'
                          }`}>
                            {instr.status}
                          </span>
                          {instr.file_name && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600">
                              {instr.file_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-dark-text whitespace-pre-wrap">{instr.instruction_text}</p>
                        <div className="text-xs text-secondary-text mt-1">
                          {instr.profiles?.name || 'Unknown'} · {new Date(instr.created_at).toLocaleDateString()}
                          {instr.review_note && (
                            <span className="ml-2 text-gray-400">Note: {instr.review_note}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isPending && !isReviewing && (
                          <>
                            <button
                              onClick={() => handleReviewInstruction(instr.id, 'approved')}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Approve"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => setReviewingId(instr.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Reject"
                            >
                              <XIcon size={16} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteInstruction(instr.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="Delete"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Reject with note */}
                    {isReviewing && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Review note (optional)..."
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-alf-orange"
                        />
                        <button
                          onClick={() => handleReviewInstruction(instr.id, 'rejected')}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => { setReviewingId(null); setReviewNote(''); }}
                          className="px-3 py-1.5 text-xs text-secondary-text hover:text-dark-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
