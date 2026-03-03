import { useState, useEffect } from 'react';
import {
  Loader2, Bot, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Eye, FileText, XCircle,
} from 'lucide-react';
import { supabase, getFreshToken } from '../../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

const STATUS_CONFIG = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700', icon: Clock },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-700', icon: AlertCircle },
  completed: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle },
  dismissed: { label: 'Dismissed', bg: 'bg-slate-50', text: 'text-slate-600', icon: XCircle },
};

export default function PlatformMyWorkPage() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [error, setError] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) loadTasks();
  }, [selectedTenant]);

  async function loadTenants() {
    const { data, error: err } = await supabase
      .from('alf_tenants')
      .select('id, company_name')
      .eq('is_active', true)
      .order('company_name');

    if (err) {
      setError(err.message);
    } else {
      setTenants(data || []);
      if (data?.length === 1) setSelectedTenant(data[0].id);
    }
    setLoading(false);
  }

  async function loadTasks() {
    setLoadingTasks(true);
    setError(null);
    try {
      const token = await getFreshToken();

      const [tasksRes, statsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/user-tasks?tenant_id=${selectedTenant}&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BACKEND_URL}/api/user-tasks/stats?tenant_id=${selectedTenant}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const tasksJson = await tasksRes.json();
      const statsJson = await statsRes.json();

      if (!tasksRes.ok) throw new Error(tasksJson.error);
      setTasks(tasksJson.tasks || []);
      if (statsRes.ok) setStats(statsJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function updateTask(taskId, updates) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/user-tasks/${taskId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }
      loadTasks();
    } catch (err) {
      setError(err.message);
    }
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const dismissedTasks = tasks.filter(t => t.status === 'dismissed');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">My Work</h1>
          <p className="text-sm text-secondary-text mt-1">Task queue across SOP assignments and agent outputs</p>
        </div>
        <select
          value={selectedTenant}
          onChange={e => setSelectedTenant(e.target.value)}
          className="text-sm border border-alf-bone rounded-lg px-3 py-2 bg-white"
        >
          <option value="">Select tenant...</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.company_name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {!selectedTenant && (
        <div className="text-center py-12 text-secondary-text text-sm">
          Select a tenant to view their task queue.
        </div>
      )}

      {selectedTenant && loadingTasks && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-alf-orange animate-spin" />
        </div>
      )}

      {selectedTenant && !loadingTasks && (
        <>
          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Pending" value={stats.pending} color="text-amber-600" />
              <StatCard label="In Progress" value={stats.in_progress} color="text-blue-600" />
              <StatCard label="Completed" value={stats.completed} color="text-emerald-600" />
              <StatCard label="Dismissed" value={stats.dismissed} color="text-slate-500" />
            </div>
          )}

          {/* Pending / In Progress */}
          <Section title="Waiting for Action" count={pendingTasks.length} icon={Clock} defaultOpen>
            {pendingTasks.length === 0 ? (
              <EmptyState text="No pending tasks" />
            ) : (
              pendingTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedTask === task.id}
                  onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  onUpdateStatus={(status) => updateTask(task.id, { status })}
                />
              ))
            )}
          </Section>

          {/* Completed */}
          <Section title="Completed" count={completedTasks.length} icon={CheckCircle}>
            {completedTasks.length === 0 ? (
              <EmptyState text="No completed tasks" />
            ) : (
              completedTasks.slice(0, 20).map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedTask === task.id}
                  onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                />
              ))
            )}
          </Section>

          {/* Dismissed */}
          {dismissedTasks.length > 0 && (
            <Section title="Dismissed" count={dismissedTasks.length} icon={XCircle}>
              {dismissedTasks.slice(0, 10).map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedTask === task.id}
                  onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white border border-alf-bone rounded-lg p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-secondary-text mt-1">{label}</div>
    </div>
  );
}

function Section({ title, count, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-alf-bone rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-alf-warm-white/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-secondary-text" />
          <span className="text-sm font-medium text-dark-text">{title}</span>
          <span className="text-xs text-secondary-text">({count})</span>
        </div>
        {open ? <ChevronUp size={16} className="text-secondary-text" /> : <ChevronDown size={16} className="text-secondary-text" />}
      </button>
      {open && <div className="border-t border-alf-bone">{children}</div>}
    </div>
  );
}

function TaskRow({ task, expanded, onToggle, onUpdateStatus }) {
  const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const stepInfo = task.tenant_sop_steps;

  return (
    <div className="border-b border-alf-bone/50 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <StatusIcon size={16} className={cfg.text} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-dark-text truncate">{task.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
            {task.source_type === 'agent_output' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 flex items-center gap-0.5">
                <Bot size={10} /> Agent
              </span>
            )}
          </div>
          {stepInfo && (
            <div className="text-xs text-secondary-text mt-0.5">
              Step {stepInfo.step_number}: {stepInfo.step_description?.slice(0, 80)}
              {stepInfo.step_description?.length > 80 ? '...' : ''}
              {stepInfo.tenant_documents && (
                <span className="ml-1 text-alf-slate">— {stepInfo.tenant_documents.file_name}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.assignee && (
            <span className="text-xs text-secondary-text">{task.assignee.name}</span>
          )}
          {onUpdateStatus && task.status !== 'completed' && task.status !== 'dismissed' && (
            <>
              <button
                onClick={() => onUpdateStatus('completed')}
                className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                Complete
              </button>
              <button
                onClick={() => onUpdateStatus('dismissed')}
                className="text-xs px-2 py-1 rounded bg-slate-50 text-slate-600 hover:bg-slate-100"
              >
                Dismiss
              </button>
            </>
          )}
          <button onClick={onToggle} className="text-secondary-text hover:text-dark-text">
            {expanded ? <ChevronUp size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {task.description && (
            <p className="text-xs text-secondary-text">{task.description}</p>
          )}
          {task.agent_output?.text && (
            <div className="bg-alf-warm-white rounded-lg p-3 max-h-64 overflow-y-auto">
              <div className="text-[10px] text-secondary-text mb-1 flex items-center gap-1">
                <Bot size={10} /> Agent output ({task.agent_output.agent_key} / {task.agent_output.model})
              </div>
              <pre className="text-xs text-dark-text whitespace-pre-wrap font-mono">{task.agent_output.text.slice(0, 2000)}</pre>
            </div>
          )}
          <div className="flex gap-4 text-[10px] text-alf-slate">
            <span>Created: {new Date(task.created_at).toLocaleString()}</span>
            {task.completed_at && <span>Completed: {new Date(task.completed_at).toLocaleString()}</span>}
            {task.due_date && <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>}
            {task.outcome_notes && <span>Notes: {task.outcome_notes}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-8 text-sm text-secondary-text">{text}</div>
  );
}
