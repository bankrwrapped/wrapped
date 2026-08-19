import { fetchIndexedSwapsPage, isChainFullySynced } from "./envioClient";
import { getDecimals } from "./decimalsService";
import { getHistoricalPriceUsd } from "../pricingService";
import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";
import { checkAndNotifyWalletsForToken } from "./wrappedNotify";
import { tokenVolumeSummaryRepository } from "../../repositories/tokenVolumeSummaryRepository";
import type { IndexedSwapRow } from "./envioClient";


// Groups swaps within a page by hour bucket -- tokenAddress is invariant
// within a single backfillToken() call (one token per call), so a
// (token, hour) dedupe key collapses to just an hour-bucket key here.
// getHistoricalPriceUsd's own cache is still keyed (chain, token, hour)
// underneath -- this is a run-local dedupe on TOP of that, to avoid
// awaiting the same effective lookup hundreds of times sequentially before
// it would ever get cached.
function hourBucketKey(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600;
}

interface PriceGroup {
  swaps: IndexedSwapRow[];
  representativeTimestamp: number;
  representativePoolId: string;
}

// Fires all unique-bucket price lookups CONCURRENTLY via Promise.all,
// rather than one at a time. getHistoricalPriceUsd already internally
// bounds DeFiLlama concurrency to 25 in-flight (defiLlamaRateLimiter.ts)
// and serializes GeckoTerminal fallback calls via its own module-level
// throttle -- firing everything at once lets that existing infrastructure
// do the real bounding instead of syncJob.ts awaiting sequentially and
// leaving 24 of 25 available slots unused the whole time.
async function priceGroupsConcurrently(
  chain: string,
  tokenAddress: string,
  groups: Map<number, PriceGroup>,
): Promise<Map<number, number | null>> {
  const entries = Array.from(groups.entries());
  const results = await Promise.all(
    entries.map(async ([bucketKey, group]) => {
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
    }),
  );
  return new Map(results);
}

function groupSwapsByHour(swaps: IndexedSwapRow[]): Map<number, PriceGroup> {
  const groups = new Map<number, PriceGroup>();
  for (const swap of swaps) {
    const ts = Math.floor(new Date(swap.timestamp).getTime() / 1000);
    const key = hourBucketKey(ts);
    let group = groups.get(key);
    if (!group) {
      // representativePoolId: swaps in the same hour bucket for this token
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

    let cursor = "0";
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

      const groups = groupSwapsByHour(page);
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

      cursor = page[page.length - 1].blockNumber;
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

    await tokenVolumeSummaryRepository.setTotal(chain, tokenAddress, totalVolumeUsd, swapCount);
    await indexedTokensRepository.updateCheckpoint(chain, tokenAddress, highestBlockSeen);

    if (excludedCount > 0) {
      console.log(
        `[indexerSync] ${chain}:${tokenAddress} backfill complete with ${excludedCount} unpriced swap(s) ` +
        `across ${excludedBucketCount} unpriced hour-bucket(s) excluded, ${swapCount} priced`,
      );
    }

    const chainFullySynced = await isChainFullySynced(chain);
    await indexedTokensRepository.setStatus(
      chain,
      tokenAddress,
      chainFullySynced ? "complete" : "in_progress",
    );
    if (chainFullySynced) {
      await checkAndNotifyWalletsForToken(chain, tokenAddress);
    }
  } catch (err) {
    await indexedTokensRepository.setStatus(chain, tokenAddress, "failed");
    throw err;
  }
}