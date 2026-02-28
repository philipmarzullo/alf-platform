/**
 * Platform-wide formatting utilities
 */

/** Format large token counts with K/M suffixes */
export function formatTokens(count) {
  if (count == null) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

/** Relative time string from ISO date */
export function relativeTime(isoDate) {
  if (!isoDate) return 'Never';
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

/**
 * Rough cost estimate from token counts.
 * Based on Claude Sonnet 4.5 pricing: $3/M input, $15/M output.
 * Uses a blended estimate when only total tokens are available.
 */
export function estimateCost(totalTokens, { inputTokens, outputTokens } = {}) {
  if (inputTokens != null && outputTokens != null) {
    return ((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(2);
  }
  // Blended: assume ~70% input, ~30% output → ~$6.60/M
  return ((totalTokens * 6.6) / 1_000_000).toFixed(2);
}
