import MiniSparkline from './MiniSparkline';

/**
 * Semantic stat card with colored left border + icon circle.
 *
 * color: 'amber' | 'emerald' | 'blue' | 'purple' | 'red' | 'gray'
 */
const COLOR_MAP = {
  amber:   { border: 'border-l-amber-500',   iconBg: 'bg-amber-50',   iconText: 'text-amber-500',   sparkline: '#F59E0B' },
  emerald: { border: 'border-l-emerald-500', iconBg: 'bg-emerald-50', iconText: 'text-emerald-500', sparkline: '#10B981' },
  blue:    { border: 'border-l-blue-500',     iconBg: 'bg-blue-50',     iconText: 'text-blue-500',     sparkline: '#3B82F6' },
  purple:  { border: 'border-l-purple-500',   iconBg: 'bg-purple-50',   iconText: 'text-purple-500',   sparkline: '#8B5CF6' },
  red:     { border: 'border-l-red-500',       iconBg: 'bg-red-50',       iconText: 'text-red-500',       sparkline: '#EF4444' },
  gray:    { border: 'border-l-gray-400',     iconBg: 'bg-gray-50',     iconText: 'text-gray-400',     sparkline: '#9CA3AF' },
};

export default function StatCard({ label, value, subtitle, icon: Icon, color = 'amber', sparkData }) {
  const c = COLOR_MAP[color] || COLOR_MAP.amber;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${c.border} p-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`p-2 rounded-lg ${c.iconBg}`}>
              <Icon size={18} className={c.iconText} />
            </div>
          )}
          <div>
            <div className="text-xs text-secondary-text mb-0.5">{label}</div>
            <div className="text-2xl font-semibold text-dark-text">{value}</div>
            {subtitle && <div className="text-xs text-secondary-text mt-0.5">{subtitle}</div>}
          </div>
        </div>
        {sparkData && sparkData.length >= 2 && (
          <MiniSparkline data={sparkData} color={c.sparkline} />
        )}
      </div>
    </div>
  );
}
