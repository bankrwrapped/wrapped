import { cursorAfterBlock, cursorAfterEvent, fetchIndexedSwapsPage, isChainFullySynced } from "./envioClient";
import { getDecimals } from "./decimalsService";
import { getHistoricalPriceUsd } from "../pricingService";
import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";
import { checkAndNotifyWalletsForToken } from "./wrappedNotify";
import { tokenVolumeSummaryRepository } from "../../repositories/tokenVolumeSummaryRepository";
import { mapWithConcurrency } from "../../utils/mapWithConcurrency";
import type { IndexedSwapRow } from "./envioClient";


// Groups swaps within a page by UTC day -- the granularity prices actually
// exist at: getHistoricalPriceUsd caches and fetches per day (GoldRush
// daily price, price_cache keyed by day bucket). This used to group by
// hour, so one page could fire up to 24 identical cache-missing lookups per
// day at once - flooding the GoldRush limiter until its queue cap threw,
// which recordFailure() then cached as a failed DAY, dropping every later
// swap that day as "unpriced". tokenAddress is invariant within a single
// backfillToken() call, so the day bucket alone is the dedupe key.
function dayBucketKey(unixSeconds: number): number {
  return Math.floor(unixSeconds / 86400) * 86400;
}

export interface PriceGroup {
  swaps: IndexedSwapRow[];
  representativeTimestamp: number;
  representativePoolId: string;
}

// Bounded, not Promise.all over every bucket: the GoldRush limiter queues
// excess calls and throws past its wait cap, so firing hundreds at once
// turned queueing into failures. 8 matches the limiter's per-second rate.
const PRICE_LOOKUP_CONCURRENCY = 8;

export async function priceGroupsConcurrently(
  chain: string,
  tokenAddress: string,
  groups: Map<number, PriceGroup>,
): Promise<Map<number, number | null>> {
  const entries = Array.from(groups.entries());
  const results = await mapWithConcurrency(
    entries,
    PRICE_LOOKUP_CONCURRENCY,
    async ([bucketKey, group]) => {
      try {
        const price = await getHistoricalPriceUsd(
          chain,
          tokenAddress,
          group.representativeTimestamp,
          group.representativePoolId,
        );
        return [bucketKey, price] as const;
      } catch {
        return [bucketKey, null] as const;
      }
    },
  );
  return new Map(results);
}

export function groupSwapsByDay(swaps: IndexedSwapRow[]): Map<number, PriceGroup> {
  const groups = new Map<number, PriceGroup>();
  for (const swap of swaps) {
    const ts = Math.floor(new Date(swap.timestamp).getTime() / 1000);
    const key = dayBucketKey(ts);
    let group = groups.get(key);
    if (!group) {
      // representativePoolId: swaps in the same day bucket for this token
      // could theoretically span >1 pool -- using the first swap's poolId
      // as representative for the whole bucket's GeckoTerminal fallback
      // lookup is a deliberate approximation, not hidden: flagging this
      // explicitly rather than silently assuming it's always the same pool.
      group = { swaps: [], representativeTimestamp: ts, representativePoolId: swap.poolId };
      groups.set(key, group);
    }
    group.swaps.push(swap);
  }
  return groups;
}

// Runs (backfill or refresh) in a row that may end with unpriced swaps
// before the gap is accepted. With the sweep's 15-min stale spacing, ~1h+
// of retrying.
export const MAX_PRICING_ATTEMPTS = 5;

// NOTE: callers must claim this token via
// indexedTokensRepository.claimForBackfill() BEFORE calling this function.
// backfillToken() no longer sets 'in_progress' itself on entry -- that's
// now done atomically as part of the claim (see backfillTrigger.ts /
// backfillSweep.ts), so two concurrent callers can't both start working on
// the same token. This function assumes the claim already happened and
// only concerns itself with doing the work and recording the outcome.
export async function backfillToken(chain: string, tokenAddress: string): Promise<void> {
  if (chain !== "base") {
    throw new Error(`backfillToken: only 'base' is supported right now — got chain=${chain}`);
  }

  try {
    const decimals = await getDecimals(chain, tokenAddress);
    const divisor = 10 ** decimals;

    let cursor = cursorAfterBlock("0");
    let totalVolumeUsd = 0;
    let swapCount = 0;
    let excludedCount = 0;
    let excludedBucketCount = 0;
    let highestBlockSeen = 0n;

    
    for (;;) {
      const page = await fetchIndexedSwapsPage(chain, tokenAddress, cursor);
      if (page.length === 0) break;

      for (const swap of page) {
        const blockNum = BigInt(swap.blockNumber);
        if (blockNum > highestBlockSeen) highestBlockSeen = blockNum;
      }

      const groups = groupSwapsByDay(page);
      const pricesByBucket = await priceGroupsConcurrently(chain, tokenAddress, groups);

      for (const [bucketKey, group] of groups) {
        const price = pricesByBucket.get(bucketKey) ?? null;

        if (price === null) {
          excludedCount += group.swaps.length;
          excludedBucketCount += 1;
          continue;
        }

        for (const swap of group.swaps) {
          const amountTokenWhole = Number(BigInt(swap.amountToken)) / divisor;
          totalVolumeUsd += amountTokenWhole * price;
          swapCount += 1;
        }
      }

      cursor = cursorAfterEvent(page[page.length - 1]);
      if (page.length < 1000) break;

      // Long-running backfill: touch last_refreshed_at as we go, not just
      // at the very end. This is what lets claimForBackfill's staleness
      // check tell "still actively working through a long token history"
      // apart from "died after starting" -- without this, a job with many
      // pages would look stale (and be eligible for the sweep to steal)
      // purely because backfill_started_at is old, even while genuinely
      // healthy. updateCheckpoint() below already sets last_refreshed_at,
      // so this reuses that same write on every page, not just the last.
      await indexedTokensRepository.updateCheckpoint(chain, tokenAddress, highestBlockSeen);
    }

    // Unpriced swaps used to be dropped and the token marked complete anyway
    // - so one GoldRush blip (rate limit, timeout, the 90s failure cache)
    // permanently understated its volume, with no record of what was lost.
    // Now: leave the token 'pending' for the sweep to retry once it's been
    // idle for STALE_THRESHOLD_MS (spacing that lets a transient outage
    // clear; already-priced days come from price_cache, so a retry only
    // re-fetches the failed days). After MAX_PRICING_ATTEMPTS the gap is
    // accepted - a genuinely unpriceable day must not block the wallet
    // forever - and recorded in unpriced_swap_count.
    if (excludedCount > 0) {
      const attempt = await indexedTokensRepository.incrementPricingAttempts(chain, tokenAddress);
      if (attempt < MAX_PRICING_ATTEMPTS) {
        console.warn(
          `[indexerSync] ${chain}:${tokenAddress} backfill has ${excludedCount} unpriced swap(s) across ` +
          `${excludedBucketCount} day-bucket(s) - attempt ${attempt}/${MAX_PRICING_ATTEMPTS}, leaving pending for retry`,
        );
        await indexedTokensRepository.setStatus(chain, tokenAddress, "pending");
        return;
      }
      console.warn(
        `[indexerSync] ${chain}:${tokenAddress} still has ${excludedCount} unpriced swap(s) across ` +
        `${excludedBucketCount} day-bucket(s) after ${attempt} attempts - accepting them as excluded, ${swapCount} priced`,
      );
    }

    await tokenVolumeSummaryRepository.setTotal(chain, tokenAddress, totalVolumeUsd, swapCount, excludedCount);
    await indexedTokensRepository.updateCheckpoint(chain, tokenAddress, highestBlockSeen);
    await indexedTokensRepository.resetPricingAttempts(chain, tokenAddress);

    const chainFullySynced = await isChainFullySynced(chain);
    await indexedTokensRepository.setStatus(
      chain,
      tokenAddress,
      chainFullySynced ? "complete" : "in_progress",
    );
    if (chainFullySynced) {
      // Outside the status-setting path on purpose: a notify failure must
      // not fall into the catch below and re-mark a finished token 'failed'.
      await checkAndNotifyWalletsForToken(chain, tokenAddress).catch((err) =>
        console.error(`[indexerSync] notify after backfill failed for ${chain}:${tokenAddress}`, err),
      );
    }
  } catch (err) {
    await indexedTokensRepository.setStatus(chain, tokenAddress, "failed");
    throw err;
  }
}