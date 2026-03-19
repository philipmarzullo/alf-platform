import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, Zap, Hash, Loader2, DollarSign, Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '../../lib/supabase';
import MetricCard from '../../components/shared/MetricCard';
import DataTable from '../../components/shared/DataTable';
import { estimateCost, estimateSnowflakeCost } from '../../utils/formatters';

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PlatformUsagePage() {
  const [logs, setLogs] = useState([]);
  const [tenantMap, setTenantMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [activePreset, setActivePreset] = useState('30d');
  const [selectedTenant, setSelectedTenant] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);

    const [logsRes, tenantsRes] = await Promise.all([
      supabase
        .from('alf_usage_logs')
        .select('*')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase.from('alf_tenants').select('id, company_name'),
    ]);

    if (logsRes.error) {
      setError(logsRes.error.message);
      setLoading(false);
      return;
    }

    const tMap = {};
    (tenantsRes.data || []).forEach((t) => { tMap[t.id] = t.company_name; });

    setLogs(logsRes.data || []);
    setTenantMap(tMap);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function applyPreset(preset) {
    setActivePreset(preset.label);
    setDateFrom(daysAgo(preset.days));
    setDateTo(today());
  }

  function handleDateChange(field, value) {
    setActivePreset(null);
    if (field === 'from') setDateFrom(value);
    else setDateTo(value);
  }

  // Filter logs by selected tenant
  const filteredLogs = useMemo(() => {
    if (selectedTenant === 'all') return logs;
    return logs.filter((l) => l.tenant_id === selectedTenant);
  }, [logs, selectedTenant]);

  // Sorted tenant list for dropdown
  const tenantOptions = useMemo(() => {
    return Object.entries(tenantMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tenantMap]);

  // Aggregate daily chart data
  const chartData = useMemo(() => {
    const dayMap = {};
    filteredLogs.forEach((log) => {
      const day = log.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { day, calls: 0, tokens: 0, tokens_input: 0, tokens_output: 0, sf_queries: 0 };
      dayMap[day].calls += 1;
      dayMap[day].tokens_input += log.tokens_input || 0;
      dayMap[day].tokens_output += log.tokens_output || 0;
      dayMap[day].tokens += (log.tokens_input || 0) + (log.tokens_output || 0);
      dayMap[day].sf_queries += log.snowflake_queries || 0;
    });
    // Compute daily costs
    return Object.values(dayMap)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        ...d,
        anthropic_cost: parseFloat(estimateCost(0, { inputTokens: d.tokens_input, outputTokens: d.tokens_output })),
        sf_cost: parseFloat(estimateSnowflakeCost(d.sf_queries)),
      }));
  }, [filteredLogs]);

  // By-tenant aggregation
  const byTenant = useMemo(() => {
    const map = {};
    filteredLogs.forEach((log) => {
      const tid = log.tenant_id || 'unknown';
      if (!map[tid]) map[tid] = { tenant_id: tid, tenant_name: tenantMap[tid] || 'Unknown', calls: 0, tokens_input: 0, tokens_output: 0, sf_queries: 0 };
      map[tid].calls += 1;
      map[tid].tokens_input += log.tokens_input || 0;
      map[tid].tokens_output += log.tokens_output || 0;
      map[tid].sf_queries += log.snowflake_queries || 0;
    });
    return Object.values(map)
      .map((t) => ({
        ...t,
        tokens: t.tokens_input + t.tokens_output,
        api_cost: parseFloat(estimateCost(0, { inputTokens: t.tokens_input, outputTokens: t.tokens_output })),
        sf_cost: parseFloat(estimateSnowflakeCost(t.sf_queries)),
        total_cost: parseFloat(estimateCost(0, { inputTokens: t.tokens_input, outputTokens: t.tokens_output })) + parseFloat(estimateSnowflakeCost(t.sf_queries)),
      }))
      .sort((a, b) => b.calls - a.calls);
  }, [filteredLogs, tenantMap]);

  // By-agent aggregation
  const byAgent = useMemo(() => {
    const map = {};
    filteredLogs.forEach((log) => {
      const key = log.agent_key || 'unknown';
      if (!map[key]) map[key] = { agent_key: key, calls: 0, tokens_input: 0, tokens_output: 0, sf_queries: 0 };
      map[key].calls += 1;
      map[key].tokens_input += log.tokens_input || 0;
      map[key].tokens_output += log.tokens_output || 0;
      map[key].sf_queries += log.snowflake_queries || 0;
    });
    return Object.values(map)
      .map((a) => ({
        ...a,
        tokens: a.tokens_input + a.tokens_output,
        api_cost: parseFloat(estimateCost(0, { inputTokens: a.tokens_input, outputTokens: a.tokens_output })),
        sf_cost: parseFloat(estimateSnowflakeCost(a.sf_queries)),
        total_cost: parseFloat(estimateCost(0, { inputTokens: a.tokens_input, outputTokens: a.tokens_output })) + parseFloat(estimateSnowflakeCost(a.sf_queries)),
      }))
      .sort((a, b) => b.calls - a.calls);
  }, [filteredLogs]);

  const totalCalls = filteredLogs.length;
  const totalInput = filteredLogs.reduce((sum, l) => sum + (l.tokens_input || 0), 0);
  const totalOutput = filteredLogs.reduce((sum, l) => sum + (l.tokens_output || 0), 0);
  const totalTokens = totalInput + totalOutput;
  const uniqueUsers = new Set(filteredLogs.map((l) => l.user_id)).size;
  const totalSfQueries = filteredLogs.reduce((sum, l) => sum + (l.snowflake_queries || 0), 0);
  const anthropicCost = estimateCost(0, { inputTokens: totalInput, outputTokens: totalOutput });
  const sfCost = estimateSnowflakeCost(totalSfQueries);

  const rangeLabel = activePreset ? `last ${activePreset}` : `${dateFrom} — ${dateTo}`;
  const tenantLabel = selectedTenant === 'all' ? 'all tenants' : (tenantMap[selectedTenant] || 'Unknown');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-dark-text">Usage Dashboard</h1>
        <p className="text-sm text-secondary-text mt-1">Agent usage across {tenantLabel} ({rangeLabel})</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          className="border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white"
        >
          <option value="all">All Tenants</option>
          {tenantOptions.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                activePreset === p.label
                  ? 'bg-alf-orange text-white border-alf-orange'
                  : 'bg-white text-secondary-text border-gray-200 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateChange('from', e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-xs"
          />
          <span className="text-secondary-text">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateChange('to', e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-xs"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Total Calls" value={totalCalls.toLocaleString()} icon={Activity} color="#C84B0A" />
        <MetricCard label="Total Tokens" value={totalTokens.toLocaleString()} icon={Zap} color="#C84B0A" />
        <MetricCard label="Unique Users" value={uniqueUsers} icon={Hash} color="#C84B0A" />
        <MetricCard
          label="Anthropic Cost"
          value={`$${anthropicCost}`}
          icon={DollarSign}
          color="#C84B0A"
          trend={`${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out`}
        />
        <MetricCard
          label="Snowflake Cost"
          value={`$${sfCost}`}
          icon={Database}
          color="#C84B0A"
          trend={`${totalSfQueries.toLocaleString()} queries`}
        />
      </div>

      {/* Daily Agent Calls Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-dark-text mb-4">Daily Agent Calls</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="day"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 11, fill: '#5A5D62' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#5A5D62' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                labelFormatter={(d) => `Date: ${d}`}
              />
              <Bar dataKey="calls" fill="#C84B0A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-secondary-text">
            No usage data in selected range.
          </div>
        )}
      </div>

      {/* Daily Cost Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-dark-text mb-4">Daily Cost Breakdown</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="day"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 11, fill: '#5A5D62' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#5A5D62' }}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                labelFormatter={(d) => `Date: ${d}`}
                formatter={(value, name) => [`$${value.toFixed(2)}`, name === 'anthropic_cost' ? 'Anthropic' : 'Snowflake']}
              />
              <Legend formatter={(value) => (value === 'anthropic_cost' ? 'Anthropic' : 'Snowflake')} />
              <Bar dataKey="anthropic_cost" stackId="cost" fill="#C84B0A" radius={[0, 0, 0, 0]} />
              <Bar dataKey="sf_cost" stackId="cost" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-secondary-text">
            No cost data in selected range.
          </div>
        )}
      </div>

      {/* By Tenant */}
      <div>
        <h2 className="text-sm font-semibold text-dark-text mb-3">By Tenant</h2>
        <DataTable
          columns={[
            { key: 'tenant_name', label: 'Tenant' },
            { key: 'calls', label: 'Calls', render: (val) => val.toLocaleString() },
            { key: 'tokens', label: 'Tokens', render: (val) => val.toLocaleString() },
            { key: 'api_cost', label: 'API Cost', render: (val) => `$${val.toFixed(2)}` },
            { key: 'sf_queries', label: 'SF Queries', render: (val) => val.toLocaleString() },
            { key: 'sf_cost', label: 'SF Cost', render: (val) => `$${val.toFixed(2)}` },
            { key: 'total_cost', label: 'Total Cost', render: (val) => <span className="font-semibold">${val.toFixed(2)}</span> },
          ]}
          data={byTenant}
        />
      </div>

      {/* By Agent */}
      <div>
        <h2 className="text-sm font-semibold text-dark-text mb-3">By Agent</h2>
        <DataTable
          columns={[
            { key: 'agent_key', label: 'Agent', render: (val) => <span className="font-mono text-xs">{val}</span> },
            { key: 'calls', label: 'Calls', render: (val) => val.toLocaleString() },
            { key: 'tokens', label: 'Tokens', render: (val) => val.toLocaleString() },
            { key: 'api_cost', label: 'API Cost', render: (val) => `$${val.toFixed(2)}` },
            { key: 'sf_queries', label: 'SF Queries', render: (val) => val.toLocaleString() },
            { key: 'sf_cost', label: 'SF Cost', render: (val) => `$${val.toFixed(2)}` },
            { key: 'total_cost', label: 'Total Cost', render: (val) => <span className="font-semibold">${val.toFixed(2)}</span> },
          ]}
          data={byAgent}
        />
      </div>
    </div>
  );
}
