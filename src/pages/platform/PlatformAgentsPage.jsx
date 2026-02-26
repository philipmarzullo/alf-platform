import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Database, Bot } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAllSourceAgents } from '../../agents/registry';
import { DEPT_COLORS, MODEL_OPTIONS } from '../../data/constants';

const DEPT_LABELS = {
  hr: 'HR', finance: 'Finance', purchasing: 'Purchasing',
  sales: 'Sales', ops: 'Operations', admin: 'Admin',
  platform: 'Platform', tools: 'Tools', general: 'General',
};

function modelLabel(modelId) {
  const found = MODEL_OPTIONS.find((m) => m.value === modelId);
  return found ? found.label : modelId || 'default';
}

export default function PlatformAgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [tenantCounts, setTenantCounts] = useState({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const sourceAgents = getAllSourceAgents();

      // Fetch DB agents and tenant overrides in parallel
      const [dbRes, overridesRes] = await Promise.all([
        supabase.from('alf_agent_definitions').select('*').order('agent_key'),
        supabase.from('tenant_agent_overrides').select('agent_key, is_enabled'),
      ]);

      if (dbRes.error) throw dbRes.error;

      const dbAgents = dbRes.data || [];
      const dbMap = new Map(dbAgents.map((a) => [a.agent_key, a]));

      // Count enabled tenants per agent
      const counts = {};
      (overridesRes.data || []).forEach((o) => {
        if (o.is_enabled !== false) {
          counts[o.agent_key] = (counts[o.agent_key] || 0) + 1;
        }
      });
      setTenantCounts(counts);

      // Merge: DB preferred, source-code fallback
      const merged = sourceAgents.map((src) => {
        const db = dbMap.get(src.key);
        return {
          key: src.key,
          name: db?.name || src.name || src.key,
          department: db?.department || src.department || 'general',
          model: db?.model || src.model || null,
          status: db?.status || 'active',
          systemPrompt: db?.system_prompt || src.systemPrompt || '',
          actions: db?.actions || (src.actions ? Object.keys(src.actions) : []),
          inDb: !!db,
          sourceKey: src.key,
        };
      });

      // Add any DB-only agents not in source
      for (const db of dbAgents) {
        if (!sourceAgents.find((s) => s.key === db.agent_key)) {
          merged.push({
            key: db.agent_key,
            name: db.name || db.agent_key,
            department: db.department || 'general',
            model: db.model || null,
            status: db.status || 'active',
            systemPrompt: db.system_prompt || '',
            actions: db.actions || [],
            inDb: true,
            sourceKey: null,
          });
        }
      }

      setAgents(merged);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    setSeedResult(null);

    try {
      const sourceAgents = getAllSourceAgents();
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

      if (upsertErr) throw upsertErr;

      setSeedResult(`Seeded ${data.length} agent(s) to database.`);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
    setSeeding(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">Agents</h1>
          <p className="text-sm text-secondary-text mt-1">
            Manage global agent definitions — models, system prompts, and status
          </p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding || loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {seeding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          {seeding ? 'Seeding...' : 'Seed All to Database'}
        </button>
      </div>

      {/* Seed warning */}
      {seedResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          {seedResult}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-amber-500 animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Bot size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-secondary-text">No agents found. Click "Seed All to Database" to populate from source.</p>
        </div>
      ) : (
        /* Agent Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const deptColor = DEPT_COLORS[agent.department] || '#6B7280';
            const isActive = agent.status === 'active';
            const actionCount = Array.isArray(agent.actions) ? agent.actions.length : 0;
            const enabledCount = tenantCounts[agent.key] || 0;

            return (
              <button
                key={agent.key}
                onClick={() => navigate(`/platform/agents/${agent.key}`)}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden text-left hover:shadow-md hover:border-gray-300 transition-all group"
                style={{ borderLeftColor: deptColor, borderLeftWidth: '3px' }}
              >
                <div className="p-4 space-y-3">
                  {/* Top row: name + badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-dark-text truncate group-hover:text-amber-700 transition-colors">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                          style={{ backgroundColor: deptColor + '18', color: deptColor }}
                        >
                          {DEPT_LABELS[agent.department] || agent.department}
                        </span>
                        <span className="text-[10px] font-mono text-secondary-text">
                          {modelLabel(agent.model)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                        isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                        agent.inDb ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {agent.inDb ? 'In DB' : 'Source Only'}
                      </span>
                    </div>
                  </div>

                  {/* System prompt preview */}
                  <p className="text-xs text-secondary-text line-clamp-2 leading-relaxed">
                    {agent.systemPrompt
                      ? agent.systemPrompt.slice(0, 120) + (agent.systemPrompt.length > 120 ? '...' : '')
                      : '— No system prompt —'}
                  </p>

                  {/* Footer stats */}
                  <div className="flex items-center gap-4 pt-1 border-t border-gray-100 text-[11px] text-secondary-text">
                    <span>{actionCount} action{actionCount !== 1 ? 's' : ''}</span>
                    <span>Enabled for {enabledCount} tenant{enabledCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Seed help text */}
      <p className="text-xs text-secondary-text text-center">
        "Seed All to Database" resets all agents in the database to their source-code defaults.
      </p>
    </div>
  );
}
