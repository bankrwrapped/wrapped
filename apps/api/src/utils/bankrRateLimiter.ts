// Protects BANKR's public API from bursts caused by our own traffic.
// Unlike the incoming middleware, this never rejects - it makes the caller
// wait until a slot opens, since we still need the data, just not right now.

interface Limiter {
  windowMs: number;
  max: number;
  timestamps: number[];
}

function createLimiter(windowMs: number, max: number): Limiter {
  return { windowMs, max, timestamps: [] };
}

async function waitForSlot(limiter: Limiter): Promise<void> {
  for (;;) {
    const now = Date.now();
    limiter.timestamps = limiter.timestamps.filter((t) => now - t < limiter.windowMs);

    if (limiter.timestamps.length < limiter.max) {
      limiter.timestamps.push(now);
      return;
    }

    const oldest = limiter.timestamps[0];
    const waitMs = limiter.windowMs - (now - oldest) + 10;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

// Matches Bankr's own documented, confirmed-via-curl limits:
//   /users/search       -> 30 requests / 60s  (seen live: "ratelimit-limit: 30")
//   /addresses/resolve  -> 20 requests / 60s
// The doppler fee endpoints have no documented limit, but we throttle them
// too since a search burst fans out into 2 fee calls each.
const searchLimiter = createLimiter(60_000, 30);
const resolveLimiter = createLimiter(60_000, 20);
const feesLimiter = createLimiter(60_000, 40);

export const bankrRateLimiter = {
  beforeSearch: () => waitForSlot(searchLimiter),
  beforeResolve: () => waitForSlot(resolveLimiter),
  beforeFeesCall: () => waitForSlot(feesLimiter),
};