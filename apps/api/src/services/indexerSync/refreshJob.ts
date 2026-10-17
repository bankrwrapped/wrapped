import { cursorAfterBlock, cursorAfterEvent, fetchIndexedSwapsPage, isChainFullySynced } from "./envioClient";
import { getDecimals } from "./decimalsService";
import { groupSwapsByDay, priceGroupsConcurrently } from "./syncJob";
import { indexedTokensRepository } from "../../repositories/indexedTokensRepository";
import { tokenVolumeSummaryRepository } from "../../repositories/tokenVolumeSummaryRepository";


export async function runScheduledRefresh(chain: string): Promise<void> {
  if (chain !== "base") {
    throw new Error(`runScheduledRefresh: only 'base' is supported right now — got chain=${chain}`);
  }

  const tokens = await indexedTokensRepository.listCompleteForRefresh(chain);

  for (const token of tokens) {
    const tokenAddress = token.token_address;
    try {
      const decimals = await getDecimals(chain, tokenAddress);
      const divisor = 10 ** decimals;
      const expectedCheckpoint = token.backfill_checkpoint_block;
      const cursorStart = expectedCheckpoint ?? "0";

      let cursor = cursorAfterBlock(cursorStart);
      let addedVolumeUsd = 0;
      let addedSwapCount = 0;
      let excludedCount = 0;
      let highestBlockSeen = BigInt(cursorStart);

      for (;;) {
        const page = await fetchIndexedSwapsPage(chain, tokenAddress, cursor);
        if (page.length === 0) break;

        for (const swap of page) {
          const blockNum = BigInt(swap.blockNumber);
          if (blockNum > highestBlockSeen) highestBlockSeen = blockNum;
        }

        // Same day-grouped, bounded-concurrency pricing as backfillToken -
        // this used to await one price lookup per swap, sequentially.
        const groups = groupSwapsByDay(page);
        const pricesByBucket = await priceGroupsConcurrently(chain, tokenAddress, groups);

        for (const [bucketKey, group] of groups) {
          const price = pricesByBucket.get(bucketKey) ?? null;
          if (price === null) {
            excludedCount += group.swaps.length;
            console.warn(
              `[indexerSync refresh] excluding ${group.swaps.length} unpriced swap(s) ` +
                `(${chain}:${tokenAddress}, day bucket ${new Date(bucketKey * 1000).toISOString().slice(0, 10)})`,
            );
            continue;
          }
          for (const swap of group.swaps) {
            const amountTokenWhole = Number(BigInt(swap.amountToken)) / divisor;
            addedVolumeUsd += amountTokenWhole * price;
            addedSwapCount += 1;
          }
        }

        cursor = cursorAfterEvent(page[page.length - 1]);
        if (page.length < 1000) break;
      }

      // Checkpoint always advances on ANY new swap seen (priced or not) —
      // an unpriced swap must never be retried forever on every future run.
      if (addedSwapCount > 0 || excludedCount > 0) {
        const committed = await tokenVolumeSummaryRepository.addToTotalAndAdvanceCheckpoint(
          chain,
          tokenAddress,
          addedVolumeUsd,
          addedSwapCount,
          expectedCheckpoint,
          highestBlockSeen,
        );
        if (!committed) {
          console.warn(
            `[indexerSync refresh] ${chain}:${tokenAddress} checkpoint moved during this run ` +
              `(another refresh got there first) - discarding this run's delta`,
          );
        }
      }
    } catch (err) {
      // Real infra failure (not an unpriced swap) — leave status/checkpoint
      // as-is, retry next scheduled run. Per playbook: never silently mark
      // complete if a refresh failed partway.
      console.error(`[indexerSync refresh] failed for ${chain}:${tokenAddress}:`, err);
    }
  }
const chainFullySynced = await isChainFullySynced(chain);
  if (!chainFullySynced) {
    console.warn(`[indexerSync refresh] Envio not fully synced for chain=${chain} — some tokens may still be 'in_progress'`);
  }
}
