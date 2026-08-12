// Throttles outbound requests to GoldRush/Covalent's historical price
// endpoint. Real measured behavior (Module 5, tonight): 10 req/sec
// sustained for 30s, zero 429s, zero connection errors - their own stated
// "5 req/sec free tier" claim does not hold as an enforced wall. Set to
// 8/sec here: comfortably under the 10/sec tested clean, leaves headroom
// rather than running right at the edge of what was actually verified.

interface Limiter {
  windowMs: number;
  max: number;
  timestamps: number[];
}

function createLimiter(windowMs: number, max: number): Limiter {
  return { windowMs, max, timestamps: [] };
}

const MAX_QUEUE_WAIT_MS = 30_000;

async function waitForSlot(limiter: Limiter): Promise<void> {
  const start = Date.now();
  for (;;) {
    const now = Date.now();
    limiter.timestamps = limiter.timestamps.filter((t) => now - t < limiter.windowMs);

    if (limiter.timestamps.length < limiter.max) {
      limiter.timestamps.push(now);
      return;
    }

    const elapsed = now - start;
    if (elapsed >= MAX_QUEUE_WAIT_MS) {
      throw new Error(
        "GoldRush rate-limit queue exceeded " + MAX_QUEUE_WAIT_MS + "ms - too much price-lookup traffic backed up right now"
      );
    }

    const oldest = limiter.timestamps[0];
    const waitMs = Math.max(10, Math.min(limiter.windowMs - (now - oldest) + 10, MAX_QUEUE_WAIT_MS - elapsed));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

const GOLDRUSH_WINDOW_MS = 1000;
const GOLDRUSH_MAX_PER_WINDOW = 8;

const goldRushLimiter = createLimiter(GOLDRUSH_WINDOW_MS, GOLDRUSH_MAX_PER_WINDOW);

export const goldRushRateLimiter = {
  beforePriceLookup: () => waitForSlot(goldRushLimiter),
};
