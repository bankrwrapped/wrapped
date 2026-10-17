// Protects OUR backend from abusive/burst traffic on public routes.
// Fixed-window counter per key (IP address), rejects over the limit.

interface Bucket {
  count: number;
  resetAt: number;
}

// One bucket map PER limiter. A single shared map keyed only by IP meant
// every limiter counted against the same per-IP bucket, with whichever
// limiter created it deciding the window - typeahead search ate into the
// wrapped-route budget and vice versa.
const allBuckets: Map<string, Bucket>[] = [];

// Sweep stale buckets periodically so the maps don't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const buckets of allBuckets) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  }
}, 60_000);

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function createRateLimiter(windowMs: number, max: number) {
  const buckets = new Map<string, Bucket>();
  allBuckets.push(buckets);
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

// Trusted clients (see trustedClients.ts) - one bucket per client key, sized
// for a bot serving many users.
export const checkTrustedWrappedRouteLimit = createRateLimiter(60_000, 600);

// /api/auth/me runs on every page load (useAuth on mount) and hits the DB,
// plus Bankr for wallet-less sessions - previously unlimited.
export const checkAuthMeRouteLimit = createRateLimiter(60_000, 30);

// Bankr re-resolve for a session that had no wallet at login: at most once
// per 5 minutes per session (keyed by session id), instead of on every
// /api/auth/me call.
export const checkWalletResolveRetryLimit = createRateLimiter(5 * 60_000, 1);

// /api/status is cached for 30s, so this only stops someone hammering it.
export const checkStatusRouteLimit = createRateLimiter(60_000, 30);

// More permissive - this route backs live typeahead-as-you-type, so a
// single user typing one handle can easily fire 5-10 requests.
export const checkSearchSuggestRouteLimit = createRateLimiter(60_000, 60);