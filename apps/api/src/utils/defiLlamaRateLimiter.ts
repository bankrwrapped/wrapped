// Bounds concurrent outbound requests to DeFiLlama's historical price
// endpoint. Uses a concurrency semaphore, not a time-window request-count
// limiter - OQ5 testing (30x and 100x concurrent bursts, zero 429s, zero
// rate-limit headers in either response) found no evidence of a count-based
// throttle, but latency is real (2-6s) and worth bounding concurrency for
// regardless, to avoid self-inflicted timeout pileup during a real indexing
// run processing thousands of swaps.
//
// STILL UNVERIFIED: sustained volume over a long-running real indexing job
// (thousands of calls over minutes), as opposed to short bursts. That's why
// fetchFromDefiLlama (pricingService.ts) has real retry-with-backoff on 429 -
// the actual safety net if a limit surfaces in production these short burst
// tests didn't catch.

const MAX_CONCURRENT = 25; // comfortably under the 100 tested clean; leaves headroom
let inFlight = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  inFlight++;
}

function release(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

export const defiLlamaRateLimiter = {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  },
};
