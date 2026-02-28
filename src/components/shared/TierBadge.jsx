import { getTierBadge, TIER_REGISTRY } from '../../data/tierRegistry';

/**
 * Reusable tier badge pill.
 * `tierKey`: 'melmac' | 'orbit' | 'galaxy'
 */
export default function TierBadge({ tierKey }) {
  const badge = getTierBadge(tierKey);
  const label = TIER_REGISTRY[tierKey]?.label || tierKey || 'Melmac';

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}>
      {label}
    </span>
  );
}
