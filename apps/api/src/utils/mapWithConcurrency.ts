// Runs fn over items with at most `limit` in flight at once, preserving
// input order in the returned array. Added to fix fetchEarningsFromIndexer
// timing out at 25s: priceOneEvent was being awaited one at a time per
// event in getBeneficiaryFeesBreakdown's inner loop, and per-call latency
// (GoldRush 400ms-3000ms, GeckoTerminal fallback throttled at 6100ms min)
// stacks linearly against wallets with more than a handful of fee events.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
