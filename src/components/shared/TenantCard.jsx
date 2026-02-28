import { Users, MapPin, Activity } from 'lucide-react';
import HealthDot from './HealthDot';
import TierBadge from './TierBadge';
import { relativeTime } from '../../utils/formatters';

/**
 * Rich tenant card for Dashboard health grid and Tenants grid view.
 *
 * Expects enriched tenant object from usePlatformData:
 *   { company_name, slug, plan, status, health_score, health_factors,
 *     user_count, site_count, usage_30d, last_active }
 */

const FACTOR_LABELS = {
  apiKey: 'API Key',
  users: 'Users',
  activity: 'Activity',
  brand: 'Brand',
  knowledge: 'Knowledge',
};

export default function TenantCard({ tenant, onClick }) {
  const factors = tenant.health_factors || {};

  return (
    <button
      onClick={() => onClick?.(tenant)}
      className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-amber-300 hover:shadow-sm transition-all w-full"
    >
      {/* Header: name, health dot, tier badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <HealthDot score={tenant.health_score} label={`Health: ${tenant.health_score}/100`} />
          <div className="min-w-0">
            <div className="font-medium text-dark-text text-sm truncate">{tenant.company_name}</div>
            <div className="text-xs text-secondary-text">{relativeTime(tenant.last_active)}</div>
          </div>
        </div>
        <TierBadge tierKey={tenant.plan} />
      </div>

      {/* Inline metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-secondary-text">
          <Users size={12} />
          <span className="font-medium text-dark-text">{tenant.user_count}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-secondary-text">
          <MapPin size={12} />
          <span className="font-medium text-dark-text">{tenant.site_count}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-secondary-text">
          <Activity size={12} />
          <span className="font-medium text-dark-text">{tenant.usage_30d}</span>
        </div>
      </div>

      {/* Health factor pills */}
      <div className="flex flex-wrap gap-1">
        {Object.entries(FACTOR_LABELS).map(([key, label]) => {
          const ok = factors[key];
          return (
            <span
              key={key}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                ok ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </button>
  );
}
