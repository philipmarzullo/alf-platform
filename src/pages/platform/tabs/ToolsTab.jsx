import { useState, useEffect } from 'react';
import {
  Loader2, RefreshCw, Zap, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Save, AlertTriangle,
  ClipboardList, Users, DollarSign, Shield, FileText,
  BarChart3, Bot, Hammer,
} from 'lucide-react';
import { getFreshToken } from '../../../lib/supabase';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/** Map icon strings from tool definitions to Lucide components */
const ICON_MAP = {
  'bar-chart': BarChart3,
  'file-text': FileText,
  'dollar-sign': DollarSign,
  'clipboard-list': ClipboardList,
  'shield': Shield,
  'users': Users,
};

const OUTPUT_FORMAT_LABELS = {
  slides: 'Slides',
  document: 'Document',
  report: 'Report',
  checklist: 'Checklist',
};

function getIcon(iconStr) {
  return ICON_MAP[iconStr] || Hammer;
}

export default function ToolsTab({ tenantId, profileStatus, hasWorkspaces }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});
  const [editingPrompt, setEditingPrompt] = useState(null);
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
      const res = await fetch(`${BACKEND_URL}/api/tenant-tools/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load tools');
      setTools(json.tools || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (tools.length > 0 && !confirmGenerate) {
      setConfirmGenerate(true);
      return;
    }
    setConfirmGenerate(false);
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-tools/${tenantId}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      setTools(json.tools || []);
      setSuccess(`Generated ${json.tools?.length || 0} tools`);
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
      const res = await fetch(`${BACKEND_URL}/api/tenant-tools/${tenantId}/regenerate-prompts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Prompt regeneration failed');
      setTools(json.tools || []);
      setSuccess('Tool prompts regenerated from latest profile');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleTool(toolId) {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-tools/${tenantId}/${toolId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Toggle failed');
      setTools((prev) => prev.map((t) => t.id === toolId ? json.tool : t));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSavePrompt(toolId) {
    setSavingPrompt(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${BACKEND_URL}/api/tenant-tools/${tenantId}/${toolId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ system_prompt: promptDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setTools((prev) => prev.map((t) => t.id === toolId ? json.tool : t));
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

  function startEditPrompt(tool) {
    setEditingPrompt(tool.id);
    setPromptDraft(tool.system_prompt || '');
  }

  const hasTools = tools.length > 0;
  const profileReady = profileStatus && profileStatus !== 'draft';
  const canGenerate = profileReady && hasWorkspaces;

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
          <h2 className="text-lg font-semibold text-dark-text">Dynamic Tools</h2>
          {hasTools && (
            <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
              {tools.length} tools
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasTools && (
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
            disabled={generating || !canGenerate}
            title={
              !profileReady
                ? 'Company profile must be confirmed or enriched before generating'
                : !hasWorkspaces
                  ? 'Generate workspaces first before generating tools'
                  : ''
            }
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
                This will replace all existing tools for this tenant.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Custom prompt edits, active/inactive toggles, and intake schema changes will be lost. This cannot be undone.
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

      {/* No profile or workspaces warning */}
      {!canGenerate && !hasTools && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Hammer size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-secondary-text">
            {!profileReady
              ? 'Confirm the Company Profile first, then generate workspaces, then generate tools.'
              : 'Generate workspaces first, then generate dynamic tools.'}
          </p>
        </div>
      )}

      {/* Empty state with profile + workspaces ready */}
      {canGenerate && !hasTools && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Zap size={32} className="text-alf-orange/40 mx-auto mb-3" />
          <p className="text-sm text-secondary-text">
            No tools generated yet. Click "Generate from Profile" to create company-specific tool prompts and intake forms.
          </p>
        </div>
      )}

      {/* Tool cards */}
      {tools.map((tool) => {
        const Icon = getIcon(tool.icon);
        const expanded = expandedCards[tool.id];
        const intakeFields = tool.intake_schema || [];

        return (
          <div
            key={tool.id}
            className={`bg-white rounded-lg border transition-colors ${
              tool.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
            }`}
          >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => toggleCard(tool.id)}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <Icon size={18} className="text-alf-orange shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-dark-text">{tool.name}</span>
                    <span className="text-xs text-secondary-text font-mono">{tool.tool_key}</span>
                  </div>
                  {tool.description && (
                    <p className="text-xs text-secondary-text mt-0.5 truncate">{tool.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto mr-3 shrink-0">
                  <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
                    {OUTPUT_FORMAT_LABELS[tool.output_format] || tool.output_format}
                  </span>
                  <span className="text-xs text-secondary-text bg-gray-100 px-2 py-0.5 rounded-full">
                    {intakeFields.length} fields
                  </span>
                </div>
                {expanded ? (
                  <ChevronUp size={16} className="text-secondary-text shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-secondary-text shrink-0" />
                )}
              </button>
              <button
                onClick={() => handleToggleTool(tool.id)}
                className="ml-2 shrink-0"
                title={tool.is_active ? 'Deactivate tool' : 'Activate tool'}
              >
                {tool.is_active ? (
                  <ToggleRight size={22} className="text-green-500" />
                ) : (
                  <ToggleLeft size={22} className="text-gray-300" />
                )}
              </button>
            </div>

            {/* Expanded: prompt + intake schema */}
            {expanded && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
                {/* System Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="text-secondary-text" />
                      <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                        System Prompt
                      </span>
                    </div>
                    <span className="text-xs text-secondary-text">
                      {tool.max_tokens?.toLocaleString()} max tokens
                    </span>
                  </div>

                  {editingPrompt === tool.id ? (
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
                          onClick={() => handleSavePrompt(tool.id)}
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
                      onClick={() => startEditPrompt(tool)}
                      className="text-xs text-secondary-text font-mono whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto cursor-pointer hover:bg-gray-100 transition-colors"
                      title="Click to edit"
                    >
                      {tool.system_prompt || '(no prompt)'}
                    </div>
                  )}
                </div>

                {/* Intake Schema */}
                {intakeFields.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardList size={14} className="text-secondary-text" />
                      <span className="text-xs font-medium text-secondary-text uppercase tracking-wide">
                        Intake Form Fields
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {intakeFields.map((field) => (
                          <div key={field.key} className="flex items-center gap-1.5 text-xs">
                            <span className="text-dark-text">{field.label}</span>
                            {field.required && (
                              <span className="text-red-400 text-[10px]">*</span>
                            )}
                            <span className="text-secondary-text/60 font-mono text-[10px]">
                              {field.type}
                            </span>
                            {field.section && (
                              <span className="text-secondary-text/40 text-[10px]">
                                ({field.section})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
