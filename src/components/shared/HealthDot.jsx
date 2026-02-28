/**
 * Green / amber / red health indicator dot with tooltip.
 * `score`: 0-100 (>= 80 green, >= 50 amber, < 50 red)
 * `label`: optional tooltip text
 */
const COLORS = {
  healthy: 'bg-green-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-gray-400',
};

export function getHealthLevel(score) {
  if (score == null) return 'unknown';
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'warning';
  return 'critical';
}

export default function HealthDot({ score, size = 'md', label }) {
  const level = getHealthLevel(score);
  const sizeClass = size === 'lg' ? 'w-3 h-3' : size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span className="relative group inline-flex items-center">
      <span className={`${sizeClass} rounded-full ${COLORS[level]} inline-block`} />
      {label && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          {label}
        </span>
      )}
    </span>
  );
}
