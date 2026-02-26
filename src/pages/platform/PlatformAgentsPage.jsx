import { useState, useEffect } from 'react';
import { Database, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAllSourceAgents } from '../../agents/registry';
import DataTable from '../../components/shared/DataTable';

export default function PlatformAgentsPage() {
  const [sourceAgents, setSourceAgents] = useState([]);
  const [dbAgents, setDbAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // Source-code agents
    const agents = getAllSourceAgents();
    setSourceAgents(agents);

    // DB agents
    const { data, error: fetchErr } = await supabase
      .from('alf_agent_definitions')
      .select('*')
      .order('agent_key');

    if (fetchErr) {
      setError(fetchErr.message);
    } else {
      setDbAgents(data || []);
    }

    setLoading(false);
  }

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    setSeedResult(null);

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

    if (upsertErr) {
      setError(upsertErr.message);
    } else {
      setSeedResult(`Seeded ${data.length} agent(s) to database.`);
      setDbAgents(data);
    }
    setSeeding(false);
  }

  const dbKeys = new Set(dbAgents.map((a) => a.agent_key));

  const columns = [
    {
      key: 'key',
      label: 'Agent Key',
      render: (val) => <span className="font-mono text-xs font-medium text-dark-text">{val}</span>,
    },
    {
      key: 'name',
      label: 'Name',
      render: (val) => <span className="text-sm">{val || '—'}</span>,
    },
    {
      key: 'description',
      label: 'Description',
      render: (val) => <span className="text-xs text-secondary-text line-clamp-2">{val || '—'}</span>,
    },
    {
      key: 'model',
      label: 'Model',
      render: (val) => <span className="text-xs font-mono text-secondary-text">{val || 'default'}</span>,
    },
    {
      key: 'key',
      label: 'In DB',
      render: (val) => dbKeys.has(val)
        ? <CheckCircle size={16} className="text-green-500" />
        : <span className="text-xs text-secondary-text">—</span>,
    },
  ];

  // Map source agents to table-friendly shape
  const tableData = sourceAgents.map((a) => ({
    id: a.key,
    key: a.key,
    name: a.name || a.key,
    description: a.description || '',
    model: a.model || null,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">Agent Definitions</h1>
          <p className="text-sm text-secondary-text mt-1">
            {sourceAgents.length} source-code agents &middot; {dbAgents.length} in database
          </p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {seeding ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
          {seeding ? 'Seeding...' : 'Seed to Database'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {seedResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
          {seedResult}
        </div>
      )}

      <DataTable columns={columns} data={tableData} />
    </div>
  );
}
