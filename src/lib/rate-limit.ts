/**
 * Minimal in-memory token bucket, keyed by client IP. Good enough for a
 * single-process local app; swap for Redis if this is ever deployed.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export function rateLimit(key: string, limit = 20, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) ?? "local";
}
