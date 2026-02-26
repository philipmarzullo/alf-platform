import { useState, useEffect, useMemo } from 'react';
import { Building2, Users, Activity, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../../lib/supabase';
import MetricCard from '../../components/shared/MetricCard';

export default function PlatformDashboardPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [tenantsRes, profilesRes, logsRes] = await Promise.all([
      supabase.from('alf_tenants').select('*').order('created_at', { ascending: true }),
      supabase.from('profiles').select('tenant_id'),
      supabase
        .from('alf_usage_logs')
        .select('tenant_id, created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(5000),
    ]);

    if (tenantsRes.error) {
      setError(tenantsRes.error.message);
      setLoading(false);
      return;
    }

    // Aggregate user counts per tenant
    const userCounts = {};
    (profilesRes.data || []).forEach((p) => {
      if (p.tenant_id) userCounts[p.tenant_id] = (userCounts[p.tenant_id] || 0) + 1;
    });

    // Aggregate usage counts per tenant
    const usageCounts = {};
    (logsRes.data || []).forEach((u) => {
      if (u.tenant_id) usageCounts[u.tenant_id] = (usageCounts[u.tenant_id] || 0) + 1;
    });

    const enriched = (tenantsRes.data || []).map((t) => ({
      ...t,
      user_count: userCounts[t.id] || 0,
      usage_30d: usageCounts[t.id] || 0,
    }));

    setTenants(enriched);
    setUsageLogs(logsRes.data || []);
    setLoading(false);
  }

  const totalUsers = tenants.reduce((sum, t) => sum + t.user_count, 0);
  const totalUsage = tenants.reduce((sum, t) => sum + t.usage_30d, 0);

  // Daily chart data from usage logs
  const chartData = useMemo(() => {
    const dayMap = {};
    usageLogs.forEach((log) => {
      const day = log.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { day, calls: 0 };
      dayMap[day].calls += 1;
    });
    return Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day));
  }, [usageLogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-dark-text">Platform Overview</h1>
        <p className="text-sm text-secondary-text mt-1">Alf platform health and tenant activity</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Total Tenants" value={tenants.length} icon={Building2} color="#F59E0B" />
        <MetricCard label="Total Users" value={totalUsers} icon={Users} color="#F59E0B" />
        <MetricCard label="Agent Calls (30d)" value={totalUsage.toLocaleString()} icon={Activity} color="#F59E0B" />
      </div>

      {/* Daily Agent Calls Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-dark-text mb-4">Daily Agent Calls (30d)</h2>
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

      {/* Tenant Overview Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Tenant</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Plan</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-text uppercase tracking-wider">Users</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-text uppercase tracking-wider">Calls (30d)</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr
                key={tenant.id}
                onClick={() => navigate(`/platform/tenants/${tenant.id}`)}
                className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-dark-text">{tenant.company_name}</div>
                  <div className="text-xs text-secondary-text">{tenant.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 capitalize">
                    {tenant.plan || 'free'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
                    tenant.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tenant.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-dark-text">{tenant.user_count}</td>
                <td className="px-4 py-3 text-right font-medium text-dark-text">{tenant.usage_30d.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tenants.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-secondary-text">
          No tenants yet.
        </div>
      )}
    </div>
  );
}
