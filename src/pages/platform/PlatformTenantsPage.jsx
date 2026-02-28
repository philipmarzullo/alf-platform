import { useState } from 'react';
import { Plus, Loader2, LayoutGrid, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import usePlatformData from '../../hooks/usePlatformData';
import TenantCard from '../../components/shared/TenantCard';
import TierBadge from '../../components/shared/TierBadge';
import HealthDot from '../../components/shared/HealthDot';
import { relativeTime } from '../../utils/formatters';

export default function PlatformTenantsPage() {
  const navigate = useNavigate();
  const { tenants, loading, error } = usePlatformData();
  const [view, setView] = useState('grid'); // 'grid' | 'list'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dark-text">Tenants</h1>
          <p className="text-sm text-secondary-text mt-1">
            {tenants.length} {tenants.length === 1 ? 'organization' : 'organizations'} on the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                view === 'grid' ? 'bg-white text-dark-text shadow-sm' : 'text-secondary-text hover:text-dark-text'
              }`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-md transition-colors ${
                view === 'list' ? 'bg-white text-dark-text shadow-sm' : 'text-secondary-text hover:text-dark-text'
              }`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
          <button
            onClick={() => navigate('/platform/tenants/new')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            <Plus size={16} />
            New Tenant
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Grid View */}
      {view === 'grid' && tenants.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((tenant) => (
            <TenantCard
              key={tenant.id}
              tenant={tenant}
              onClick={(t) => navigate(`/platform/tenants/${t.id}`)}
            />
          ))}
        </div>
      )}

      {/* List View */}
      {view === 'list' && tenants.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Health</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-text uppercase tracking-wider">Tier</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-text uppercase tracking-wider">Users</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-text uppercase tracking-wider">Calls (30d)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-secondary-text uppercase tracking-wider">Last Active</th>
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
                    <HealthDot score={tenant.health_score} label={`${tenant.health_score}/100`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-dark-text">{tenant.company_name}</div>
                    <div className="text-xs text-secondary-text">{tenant.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tierKey={tenant.plan} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-dark-text">{tenant.user_count}</td>
                  <td className="px-4 py-3 text-right font-medium text-dark-text">{tenant.usage_30d.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs text-secondary-text">{relativeTime(tenant.last_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tenants.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-secondary-text">
          No tenants yet. Create one to get started.
        </div>
      )}
    </div>
  );
}
