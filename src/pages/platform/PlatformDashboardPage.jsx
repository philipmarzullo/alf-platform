import { useMemo } from 'react';
import { Building2, Users, Activity, Loader2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import usePlatformData from '../../hooks/usePlatformData';
import StatCard from '../../components/shared/StatCard';
import TenantCard from '../../components/shared/TenantCard';
import TierDistribution from '../../components/shared/TierDistribution';
import AttentionBanner from '../../components/shared/AttentionBanner';
import { formatTokens, estimateCost } from '../../utils/formatters';

export default function PlatformDashboardPage() {
  const navigate = useNavigate();
  const {
    tenants, loading, error,
    totals, chartData, sparklineData, tierCounts, attentionItems,
  } = usePlatformData();

  // Sort tenants: worst health first
  const sortedTenants = useMemo(
    () => [...tenants].sort((a, b) => a.health_score - b.health_score),
    [tenants],
  );

  const costEstimate = estimateCost(totals.totalTokens);

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

      {/* Attention Banner */}
      <AttentionBanner
        items={attentionItems}
        onTenantClick={(t) => navigate(`/platform/tenants/${t.id}`)}
      />

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Tenants"
          value={tenants.filter((t) => t.status === 'active').length}
          subtitle={`${tenants.length} total`}
          icon={Building2}
          color="amber"
        />
        <StatCard
          label="Total Users"
          value={totals.totalUsers}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Agent Calls (30d)"
          value={totals.totalUsage.toLocaleString()}
          icon={Activity}
          color="emerald"
          sparkData={sparklineData}
        />
        <StatCard
          label="Token Usage"
          value={formatTokens(totals.totalTokens)}
          subtitle={`~$${costEstimate} est.`}
          icon={Zap}
          color="purple"
        />
      </div>

      {/* Chart + Tier Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Usage Trend — 2/3 width */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-dark-text mb-4">Usage Trend (30d)</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Area
                  type="monotone"
                  dataKey="calls"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#areaFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-secondary-text">
              No usage data in the last 30 days.
            </div>
          )}
        </div>

        {/* Tier Distribution — 1/3 width */}
        <TierDistribution tierCounts={tierCounts} />
      </div>

      {/* Tenant Health Grid */}
      {sortedTenants.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-text mb-3">Tenant Health</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedTenants.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onClick={(t) => navigate(`/platform/tenants/${t.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {tenants.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-secondary-text">
          No tenants yet.
        </div>
      )}
    </div>
  );
}
