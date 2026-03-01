import { useState, useEffect } from 'react';
import {
  Loader2, RefreshCw, Zap, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Save, AlertTriangle,
  ClipboardList, Users, DollarSign, Building, ShoppingCart,
  Shield, Bot, BarChart3, Settings2,
} from 'lucide-react';
import { getFreshToken } from '../../../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Map icon strings from company profile to Lucide components */
const ICON_MAP = {
  'clipboard-list': ClipboardList,
  'users': Users,
  'dollar-sign': DollarSign,
  'building': Building,
  'shopping-cart': ShoppingCart,
  'shield': Shield,
  'bot': Bot,
  'bar-chart': BarChart3,
  'settings': Settings2,
};

function getIcon(iconStr) {
  return ICON_MAP[iconStr] || ClipboardList;
}

export default function WorkspacesTab({ tenantId, profileStatus }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});
  const [editingPrompt, setEditingPrompt] = useState(null); // agent id being edited
  const [promptDraft, setPromptDraft] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  useEffect(() => {
    loadData();
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-workspaces/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load workspaces');
      setWorkspaces(json.workspaces || []);
      setAgents(json.agents || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    // If workspaces already exist, require confirmation
    if (workspaces.length > 0 && !confirmGenerate) {
      setConfirmGenerate(true);
      return;
    }
    setConfirmGenerate(false);
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-workspaces/${tenantId}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      setWorkspaces(json.workspaces || []);
      setAgents(json.agents || []);
      setSuccess(`Generated ${json.workspaces?.length || 0} workspaces and ${json.agents?.length || 0} agents`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegeneratePrompts() {
    setRegenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-workspaces/${tenantId}/regenerate-prompts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Prompt regeneration failed');
      setAgents(json.agents || []);
      setSuccess('Agent prompts regenerated from latest profile');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleWorkspace(workspaceId) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-workspaces/${tenantId}/workspaces/${workspaceId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Toggle failed');
      setWorkspaces((prev) => prev.map((ws) => ws.id === workspaceId ? json.workspace : ws));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleAgent(agentId) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-workspaces/${tenantId}/agents/${agentId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Toggle failed');
      setAgents((prev) => prev.map((a) => a.id === agentId ? json.agent : a));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSavePrompt(agentId) {
    setSavingPrompt(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-workspaces/${tenantId}/agents/${agentId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ system_prompt: promptDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setAgents((prev) => prev.map((a) => a.id === agentId ? json.agent : a));
      setEditingPrompt(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPrompt(false);
    }
  }

  function toggleCard(id) {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function startEditPrompt(agent) {
    setEditingPrompt(agent.id);
    setPromptDraft(agent.system_prompt || '');
  }

  // Split agents into workspace-linked and cross-functional
  const workspaceAgentMap = {};
  const crossFunctionalAgents = [];
  agents.forEach((a) => {
    if (a.workspace_id) {
      workspaceAgentMap[a.workspace_id] = a;
    } else {
      crossFunctionalAgents.push(a);
    }
  });

  const hasWorkspaces = workspaces.length > 0;
  const profileReady = profileStatus && profileStatus !== 'draft';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
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
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-dark-text">Dynamic Workspaces</h2>
          {hasWorkspaces && (
            <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
              {workspaces.length} workspaces
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasWorkspaces && (
            <button
              onClick={handleRegeneratePrompts}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-secondary-text bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {regenerating ? 'Regenerating...' : 'Regenerate Prompts'}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || !profileReady}
            title={!profileReady ? 'Company profile must be confirmed or enriched before generating' : ''}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-alf-orange rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {generating ? 'Generating...' : 'Generate from Profile'}
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmGenerate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                This will replace all existing workspaces and agents for this tenant.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Custom prompt edits, active/inactive toggles, and name changes will be lost. This cannot be undone.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleGenerate}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Yes, regenerate all
                </button>
                <button
                  onClick={() => setConfirmGenerate(false)}
                  className="px-3 py-1.5 text-sm font-medium text-amber-800 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No profile warning */}
      {!profileReady && !hasWorkspaces && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Bot size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-secondary-text">
            Confirm the Company Profile first, then generate dynamic workspaces and agents.
          </p>
        </div>
      )}

      {/* Empty state with profile ready */}
      {profileReady && !hasWorkspaces && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Zap size={32} className="text-alf-orange/40 mx-auto mb-3" />
          <p className="text-sm text-secondary-text">
            No workspaces generated yet. Click "Generate from Profile" to create workspaces and agents from the company profile.
          </p>
        </div>
      )}

      {/* Workspace cards */}
      {workspaces.map((ws) => {
        const agent = workspaceAgentMap[ws.id];
        const Icon = getIcon(ws.icon);
        const expanded = expandedCards[ws.id];

        return (
          <div
            key={ws.id}
            className={`bg-white rounded-lg border transition-colors ${
              ws.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
            }`}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => toggleCard(ws.id)}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <Icon size={18} className="text-alf-orange shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-dark-text">{ws.name}</span>
                    <span className="text-xs text-secondary-text font-mono">{ws.department_key}</span>
                  </div>
                  {ws.description && (
                    <p className="text-xs text-secondary-text mt-0.5 truncate">{ws.description}</p>
                  )}
                </div>
                {agent && (
                  <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full ml-auto mr-3 shrink-0">
                    {agent.name}
                  </span>
                )}
                {expanded ? (
                  <ChevronUp size={16} className="text-secondary-text shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-secondary-text shrink-0" />
                )}
              </button>
              <button
                onClick={() => handleToggleWorkspace(ws.id)}
                className="ml-2 shrink-0"
                title={ws.is_active ? 'Deactivate workspace' : 'Activate workspace'}
              >
                {ws.is_active ? (
                  <ToggleRight size={22} className="text-green-500" />
                ) : (
                  <ToggleLeft size={22} className="text-gray-300" />
                )}
              </button>
            </div>

            {/* Expanded: agent prompt */}
            {expanded && agent && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot size={14} className="text-secondary-text" />
                    <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                      System Prompt
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {agent.is_active ? (
                      <span className="text-xs text-green-600">Active</span>
                    ) : (
                      <span className="text-xs text-gray-400">Inactive</span>
                    )}
                    <button
                      onClick={() => handleToggleAgent(agent.id)}
                      title={agent.is_active ? 'Deactivate agent' : 'Activate agent'}
                    >
                      {agent.is_active ? (
                        <ToggleRight size={18} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={18} className="text-gray-300" />
                      )}
                    </button>
                  </div>
                </div>

                {editingPrompt === agent.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange resize-y bg-gray-50"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditingPrompt(null)}
                        className="px-3 py-1 text-xs text-secondary-text hover:text-dark-text transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSavePrompt(agent.id)}
                        disabled={savingPrompt}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-alf-orange rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
                      >
                        {savingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => startEditPrompt(agent)}
                    className="text-xs text-secondary-text font-mono whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto cursor-pointer hover:bg-gray-100 transition-colors"
                    title="Click to edit"
                  >
                    {agent.system_prompt || '(no prompt)'}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Cross-functional agents */}
      {crossFunctionalAgents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-secondary-text uppercase tracking-wide">
            Cross-Functional Agents
          </h3>
          {crossFunctionalAgents.map((agent) => {
            const expanded = expandedCards[`agent-${agent.id}`];
            return (
              <div
                key={agent.id}
                className={`bg-white rounded-lg border transition-colors ${
                  agent.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => toggleCard(`agent-${agent.id}`)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <Bot size={18} className="text-alf-orange shrink-0" />
                    <div>
                      <span className="text-sm font-semibold text-dark-text">{agent.name}</span>
                      <span className="text-xs text-secondary-text font-mono ml-2">{agent.agent_key}</span>
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="text-secondary-text ml-auto shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-secondary-text ml-auto shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={() => handleToggleAgent(agent.id)}
                    className="ml-2 shrink-0"
                    title={agent.is_active ? 'Deactivate agent' : 'Activate agent'}
                  >
                    {agent.is_active ? (
                      <ToggleRight size={22} className="text-green-500" />
                    ) : (
                      <ToggleLeft size={22} className="text-gray-300" />
                    )}
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                        System Prompt
                      </span>
                    </div>

                    {editingPrompt === agent.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={promptDraft}
                          onChange={(e) => setPromptDraft(e.target.value)}
                          rows={12}
                          className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-alf-orange resize-y bg-gray-50"
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditingPrompt(null)}
                            className="px-3 py-1 text-xs text-secondary-text hover:text-dark-text transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSavePrompt(agent.id)}
                            disabled={savingPrompt}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-alf-orange rounded-lg hover:bg-alf-orange/90 disabled:opacity-50 transition-colors"
                          >
                            {savingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => startEditPrompt(agent)}
                        className="text-xs text-secondary-text font-mono whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto cursor-pointer hover:bg-gray-100 transition-colors"
                        title="Click to edit"
                      >
                        {agent.system_prompt || '(no prompt)'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
