// Protects OUR backend from abusive/burst traffic on public routes.
// Fixed-window counter per key (IP address), rejects over the limit.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Sweep stale buckets periodically so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}, 60_000);

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function createRateLimiter(windowMs: number, max: number) {
  return function check(key: string): RateLimitResult {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.count >= max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

// 20 requests per minute per IP on the search/lookup route.
export const checkWrappedRouteLimit = createRateLimiter(60_000, 20);

// More permissive - this route backs live typeahead-as-you-type, so a
// single user typing one handle can easily fire 5-10 requests.
export const checkSearchSuggestRouteLimit = createRateLimiter(60_000, 60);