/**
 * Per-tenant sliding-window rate limiter.
 * Tracks calls in memory per tenant key over a configurable window.
 *
 * Config via env:
 *   RATE_LIMIT_MAX  — max calls per window (default 50)
 *   RATE_LIMIT_WINDOW_MS — window in ms (default 3600000 = 1 hour)
 */

const DEFAULT_MAX = 50;
const DEFAULT_WINDOW = 3600000; // 1 hour

const buckets = new Map();

// Periodic cleanup — remove expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const window = Number(process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW;
  for (const [key, timestamps] of buckets) {
    const active = timestamps.filter(t => t > now - window);
    if (active.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, active);
    }
  }
}, 600000);

export default function rateLimit(req, res, next) {
  const max = Number(process.env.RATE_LIMIT_MAX) || DEFAULT_MAX;
  const window = Number(process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW;
  const key = req.tenantId || 'platform';
  const now = Date.now();

  if (!buckets.has(key)) buckets.set(key, []);

  const timestamps = buckets.get(key).filter(t => t > now - window);

  if (timestamps.length >= max) {
    const oldestExpiry = timestamps[0] + window;
    const retryAfter = Math.ceil((oldestExpiry - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: max,
      window_seconds: window / 1000,
      retry_after_seconds: retryAfter,
    });
  }

  timestamps.push(now);
  buckets.set(key, timestamps);

  // Expose remaining quota in headers
  res.set('X-RateLimit-Limit', String(max));
  res.set('X-RateLimit-Remaining', String(max - timestamps.length));

  next();
}
