import { TIER_REGISTRY } from '../../data/tierRegistry';

const BAR_COLORS = {
  melmac: 'bg-gray-400',
  orbit: 'bg-blue-500',
  galaxy: 'bg-purple-500',
};

/**
 * Horizontal bar visualization showing tenant count per tier.
 * `tierCounts`: { melmac: N, orbit: N, galaxy: N }
 */
export default function TierDistribution({ tierCounts = {} }) {
  const total = Object.values(tierCounts).reduce((s, n) => s + n, 0) || 1;
  const tiers = ['melmac', 'orbit', 'galaxy'];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-dark-text mb-4">Tier Distribution</h2>
      <div className="space-y-3">
        {tiers.map((key) => {
          const count = tierCounts[key] || 0;
          const pct = Math.round((count / total) * 100);
          const label = TIER_REGISTRY[key]?.label || key;
          const badge = TIER_REGISTRY[key]?.badge || {};

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg || 'bg-gray-100'} ${badge.text || 'text-gray-700'}`}>
                  {label}
                </span>
                <span className="text-xs text-secondary-text">
                  {count} {count === 1 ? 'tenant' : 'tenants'}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[key] || 'bg-gray-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
