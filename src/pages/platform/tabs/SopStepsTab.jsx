import { useState, useEffect } from 'react';
import {
  Loader2, Bot, User, Users, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Plus, Trash2, Eye,
} from 'lucide-react';
import { getFreshToken } from '../../../lib/supabase';
import { supabase } from '../../../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

const CLASS_CONFIG = {
  automated: { label: 'Automated', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: Bot },
  hybrid: { label: 'Hybrid', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Users },
  manual: { label: 'Manual', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: User },
};

const ASSIGNMENT_TYPES = [
  { value: 'owner', label: 'Owner' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'notified', label: 'Notified' },
];

export default function SopStepsTab({ tenantId }) {
  const [steps, setSteps] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDocs, setExpandedDocs] = useState({});
  const [assigningStep, setAssigningStep] = useState(null);
  const [assignForm, setAssignForm] = useState({ type: 'user', user_id: '', role: '', assignment_type: 'owner' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();

      // Fetch steps
      const stepsRes = await fetch(`${BACKEND_URL}/api/sop-analysis/steps?tenant_id=${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const stepsJson = await stepsRes.json();
      if (!stepsRes.ok) throw new Error(stepsJson.error);
      setSteps(stepsJson.steps || []);

      // Fetch coverage
      const covRes = await fetch(`${BACKEND_URL}/api/sop-assignments/coverage?tenant_id=${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const covJson = await covRes.json();
      if (covRes.ok) setCoverage(covJson);

      // Fetch tenant users for assignment dropdown
      const { data: users } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .order('name');
      setTenantUsers(users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(stepId) {
    setSaving(true);
    try {
      const token = await getFreshToken();
      const body = {
        tenant_id: tenantId,
        sop_step_id: stepId,
        assignment_type: assignForm.assignment_type,
      };
      if (assignForm.type === 'user') {
        body.assigned_to_user_id = assignForm.user_id;
      } else {
        body.assigned_to_role = assignForm.role;
      }

      const res = await fetch(`${BACKEND_URL}/api/sop-assignments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setAssigningStep(null);
      setAssignForm({ type: 'user', user_id: '', role: '', assignment_type: 'owner' });
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveAssignment(assignmentId) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/sop-assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  // Group steps by document
  const stepsByDoc = {};
  for (const step of steps) {
    const docKey = step.document_id;
    if (!stepsByDoc[docKey]) {
      stepsByDoc[docKey] = {
        document_id: docKey,
        file_name: step.tenant_documents?.file_name || 'Unknown',
        title: step.tenant_documents?.title || step.tenant_documents?.file_name || 'Unknown',
        steps: [],
      };
    }
    stepsByDoc[docKey].steps.push(step);
  }
  const docGroups = Object.values(stepsByDoc);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Coverage summary */}
      {coverage && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-alf-bone rounded-lg p-4">
            <div className="text-2xl font-bold text-dark-text">{coverage.total_steps}</div>
            <div className="text-xs text-secondary-text mt-1">Total manual/hybrid steps</div>
          </div>
          <div className="bg-white border border-alf-bone rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-600">{coverage.assigned}</div>
            <div className="text-xs text-secondary-text mt-1">Assigned</div>
          </div>
          <div className={`bg-white border rounded-lg p-4 ${coverage.unassigned > 0 ? 'border-amber-300' : 'border-alf-bone'}`}>
            <div className={`text-2xl font-bold ${coverage.unassigned > 0 ? 'text-amber-600' : 'text-dark-text'}`}>
              {coverage.unassigned}
            </div>
            <div className="text-xs text-secondary-text mt-1 flex items-center gap-1">
              {coverage.unassigned > 0 && <AlertTriangle size={12} className="text-amber-500" />}
              Unassigned gaps
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {docGroups.length === 0 && (
        <div className="text-center py-12 text-secondary-text">
          <p className="text-sm">No SOP steps found. Run the SOP analysis pipeline to generate steps.</p>
        </div>
      )}

      {/* Steps grouped by document */}
      {docGroups.map(doc => {
        const isExpanded = expandedDocs[doc.document_id] !== false; // default expanded
        const docSteps = doc.steps.sort((a, b) => a.step_number - b.step_number);
        const classBreakdown = {
          automated: docSteps.filter(s => s.classification === 'automated').length,
          hybrid: docSteps.filter(s => s.classification === 'hybrid').length,
          manual: docSteps.filter(s => s.classification === 'manual').length,
        };

        return (
          <div key={doc.document_id} className="bg-white border border-alf-bone rounded-lg">
            {/* Document header */}
            <button
              onClick={() => setExpandedDocs(prev => ({ ...prev, [doc.document_id]: !isExpanded }))}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-alf-warm-white/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-dark-text truncate">{doc.title}</span>
                <span className="text-xs text-secondary-text">{docSteps.length} steps</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex gap-1.5">
                  {classBreakdown.automated > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{classBreakdown.automated} auto</span>
                  )}
                  {classBreakdown.hybrid > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{classBreakdown.hybrid} hybrid</span>
                  )}
                  {classBreakdown.manual > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{classBreakdown.manual} manual</span>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-secondary-text" /> : <ChevronDown size={16} className="text-secondary-text" />}
              </div>
            </button>

            {/* Step rows */}
            {isExpanded && (
              <div className="border-t border-alf-bone">
                {docSteps.map(step => {
                  const cls = CLASS_CONFIG[step.classification] || CLASS_CONFIG.manual;
                  const Icon = cls.icon;
                  const assignments = step.tenant_sop_assignments || [];
                  const hasOwner = assignments.some(a => a.assignment_type === 'owner');
                  const needsAssignment = ['manual', 'hybrid'].includes(step.classification) && !hasOwner;

                  return (
                    <div key={step.id} className={`px-4 py-3 border-b border-alf-bone/50 last:border-b-0 ${needsAssignment ? 'bg-amber-50/30' : ''}`}>
                      <div className="flex items-start gap-3">
                        {/* Step number */}
                        <div className="w-6 h-6 rounded-full bg-alf-warm-white flex items-center justify-center text-xs font-medium text-secondary-text shrink-0 mt-0.5">
                          {step.step_number}
                        </div>

                        {/* Step content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${cls.bg} ${cls.text}`}>
                              <Icon size={10} />
                              {cls.label}
                            </span>
                            {step.automation_actions && (
                              <span className="text-[10px] text-secondary-text">
                                → {step.automation_actions.title} ({step.automation_actions.status})
                              </span>
                            )}
                            {needsAssignment && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                                <AlertTriangle size={10} /> No owner assigned
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-dark-text">{step.step_description}</p>

                          {/* Existing assignments */}
                          {assignments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {assignments.map(a => (
                                <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-alf-warm-white px-2 py-1 rounded-full">
                                  <span className="text-secondary-text">{a.assignment_type}:</span>
                                  <span className="font-medium text-dark-text">
                                    {a.profiles?.name || a.assigned_to_role || 'Unknown'}
                                  </span>
                                  <button
                                    onClick={() => handleRemoveAssignment(a.id)}
                                    className="text-secondary-text hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Assign button / form */}
                          {assigningStep === step.id ? (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <select
                                value={assignForm.assignment_type}
                                onChange={e => setAssignForm(f => ({ ...f, assignment_type: e.target.value }))}
                                className="text-xs border border-alf-bone rounded px-2 py-1"
                              >
                                {ASSIGNMENT_TYPES.map(t => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>

                              <select
                                value={assignForm.type}
                                onChange={e => setAssignForm(f => ({ ...f, type: e.target.value }))}
                                className="text-xs border border-alf-bone rounded px-2 py-1"
                              >
                                <option value="user">User</option>
                                <option value="role">Role</option>
                              </select>

                              {assignForm.type === 'user' ? (
                                <select
                                  value={assignForm.user_id}
                                  onChange={e => setAssignForm(f => ({ ...f, user_id: e.target.value }))}
                                  className="text-xs border border-alf-bone rounded px-2 py-1 min-w-[160px]"
                                >
                                  <option value="">Select user...</option>
                                  {tenantUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Role name..."
                                  value={assignForm.role}
                                  onChange={e => setAssignForm(f => ({ ...f, role: e.target.value }))}
                                  className="text-xs border border-alf-bone rounded px-2 py-1 w-36"
                                />
                              )}

                              <button
                                onClick={() => handleAssign(step.id)}
                                disabled={saving || (!assignForm.user_id && !assignForm.role)}
                                className="text-xs px-3 py-1 rounded bg-alf-orange text-white hover:bg-alf-orange/90 disabled:opacity-50 flex items-center gap-1"
                              >
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                Assign
                              </button>
                              <button
                                onClick={() => setAssigningStep(null)}
                                className="text-xs text-secondary-text hover:text-dark-text"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setAssigningStep(step.id);
                                setAssignForm({ type: 'user', user_id: '', role: '', assignment_type: 'owner' });
                              }}
                              className="mt-2 text-xs text-alf-orange hover:text-alf-orange/80 flex items-center gap-1"
                            >
                              <Plus size={12} /> Assign
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
