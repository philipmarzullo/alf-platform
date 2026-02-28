import { AlertTriangle } from 'lucide-react';

/**
 * Conditional attention banner listing tenants that need action.
 * Only renders when `items` has entries.
 *
 * Each item: { tenant, type, severity ('amber'|'red'), message }
 */
export default function AttentionBanner({ items = [], onTenantClick }) {
  if (!items.length) return null;

  const hasRed = items.some((i) => i.severity === 'red');
  const borderColor = hasRed ? 'border-red-300' : 'border-amber-300';
  const bgColor = hasRed ? 'bg-red-50' : 'bg-amber-50';
  const iconColor = hasRed ? 'text-red-500' : 'text-amber-500';

  // Deduplicate by tenant id for display
  const seen = new Set();
  const unique = items.filter((i) => {
    if (seen.has(i.tenant.id)) return false;
    seen.add(i.tenant.id);
    return true;
  });

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className={`${iconColor} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-dark-text mb-1">
            {unique.length} {unique.length === 1 ? 'tenant needs' : 'tenants need'} attention
          </div>
          <div className="space-y-1">
            {unique.slice(0, 5).map((item, i) => (
              <div key={i} className="text-xs text-secondary-text flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.severity === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />
                {onTenantClick ? (
                  <button
                    onClick={() => onTenantClick(item.tenant)}
                    className="hover:text-dark-text hover:underline transition-colors text-left"
                  >
                    {item.message}
                  </button>
                ) : (
                  <span>{item.message}</span>
                )}
              </div>
            ))}
            {unique.length > 5 && (
              <div className="text-xs text-secondary-text">
                +{unique.length - 5} more
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
