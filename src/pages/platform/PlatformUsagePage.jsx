import { useState, useEffect, useMemo } from 'react';
import { Activity, Zap, Hash, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../lib/supabase';
import MetricCard from '../../components/shared/MetricCard';
import DataTable from '../../components/shared/DataTable';

export default function PlatformUsagePage() {
  const [logs, setLogs] = useState([]);
  const [tenantMap, setTenantMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [logsRes, tenantsRes] = await Promise.all([
      supabase
        .from('alf_usage_logs')
        .select('*')
        .gte('created_at', thirtyDaysAgo)
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
  }

  // Aggregate daily chart data
  const chartData = useMemo(() => {
    const dayMap = {};
    logs.forEach((log) => {
      const day = log.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { day, calls: 0, tokens: 0 };
      dayMap[day].calls += 1;
      dayMap[day].tokens += (log.tokens_input || 0) + (log.tokens_output || 0);
    });
    return Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day));
  }, [logs]);

  // By-tenant aggregation
  const byTenant = useMemo(() => {
    const map = {};
    logs.forEach((log) => {
      const tid = log.tenant_id || 'unknown';
      if (!map[tid]) map[tid] = { tenant_id: tid, tenant_name: tenantMap[tid] || 'Unknown', calls: 0, tokens: 0 };
      map[tid].calls += 1;
      map[tid].tokens += (log.tokens_input || 0) + (log.tokens_output || 0);
    });
    return Object.values(map).sort((a, b) => b.calls - a.calls);
  }, [logs, tenantMap]);

  // By-agent aggregation
  const byAgent = useMemo(() => {
    const map = {};
    logs.forEach((log) => {
      const key = log.agent_key || 'unknown';
      if (!map[key]) map[key] = { agent_key: key, calls: 0, tokens: 0 };
      map[key].calls += 1;
      map[key].tokens += (log.tokens_input || 0) + (log.tokens_output || 0);
    });
    return Object.values(map).sort((a, b) => b.calls - a.calls);
  }, [logs]);

  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + (l.tokens_input || 0) + (l.tokens_output || 0), 0);
  const uniqueUsers = new Set(logs.map((l) => l.user_id)).size;

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
        <p className="text-sm text-secondary-text mt-1">Agent usage across all tenants (last 30 days)</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Total Calls" value={totalCalls.toLocaleString()} icon={Activity} color="#F59E0B" />
        <MetricCard label="Total Tokens" value={totalTokens.toLocaleString()} icon={Zap} color="#F59E0B" />
        <MetricCard label="Unique Users" value={uniqueUsers} icon={Hash} color="#F59E0B" />
      </div>

      {/* Daily Bar Chart */}
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
              <Bar dataKey="calls" fill="#F59E0B" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-secondary-text">
            No usage data in the last 30 days.
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
          ]}
          data={byAgent}
        />
      </div>
    </div>
  );
}
