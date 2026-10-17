import { cursorAfterBlock, cursorAfterEvent, fetchIndexedSwapsPage, isChainFullySynced } from "./envioClient";
import { getDecimals } from "./decimalsService";
import { groupSwapsByDay, MAX_PRICING_ATTEMPTS, priceGroupsConcurrently } from "./syncJob";
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
      const priced: { block: bigint; volumeUsd: number }[] = [];
      const unpriced: { block: bigint }[] = [];
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
          for (const swap of group.swaps) {
            const block = BigInt(swap.blockNumber);
            if (price === null) {
              unpriced.push({ block });
            } else {
              const amountTokenWhole = Number(BigInt(swap.amountToken)) / divisor;
              priced.push({ block, volumeUsd: amountTokenWhole * price });
            }
          }
        }

        cursor = cursorAfterEvent(page[page.length - 1]);
        if (page.length < 1000) break;
      }

      if (priced.length === 0 && unpriced.length === 0) {
        continue; // nothing new since the checkpoint
      }

      // The checkpoint used to advance past unpriced swaps unconditionally,
      // so a transient pricing failure dropped them forever. Now, while
      // under MAX_PRICING_ATTEMPTS, commit only swaps in blocks BEFORE the
      // first unpriced one and leave the checkpoint just before it, so the
      // next run retries from there. The checkpoint is block-granular, so
      // the cut is at a block boundary: priced swaps in that block are
      // re-read next run rather than counted twice.
      let commitBlock = highestBlockSeen;
      let acceptedUnpriced = 0;
      if (unpriced.length > 0) {
        const attempt = await indexedTokensRepository.incrementPricingAttempts(chain, tokenAddress);
        const firstUnpricedBlock = unpriced.reduce((min, u) => (u.block < min ? u.block : min), unpriced[0].block);
        if (attempt < MAX_PRICING_ATTEMPTS) {
          commitBlock = firstUnpricedBlock - 1n;
          console.warn(
            `[indexerSync refresh] ${chain}:${tokenAddress} has ${unpriced.length} unpriced swap(s) from block ` +
              `${firstUnpricedBlock} - attempt ${attempt}/${MAX_PRICING_ATTEMPTS}, holding the checkpoint there for retry`,
          );
        } else {
          acceptedUnpriced = unpriced.length;
          console.warn(
            `[indexerSync refresh] ${chain}:${tokenAddress} still has ${unpriced.length} unpriced swap(s) after ` +
              `${attempt} attempts - accepting them as excluded`,
          );
        }
      }

      const toCommit = priced.filter((p) => p.block <= commitBlock);
      const committedBlockMovesForward = commitBlock > BigInt(cursorStart);
      if (committedBlockMovesForward) {
        const committed = await tokenVolumeSummaryRepository.addToTotalAndAdvanceCheckpoint(
          chain,
          tokenAddress,
          toCommit.reduce((sum, p) => sum + p.volumeUsd, 0),
          toCommit.length,
          acceptedUnpriced,
          expectedCheckpoint,
          commitBlock,
        );
        if (!committed) {
          console.warn(
            `[indexerSync refresh] ${chain}:${tokenAddress} checkpoint moved during this run ` +
              `(another refresh got there first) - discarding this run's delta`,
          );
          continue;
        }
      }
      if (unpriced.length === 0 || acceptedUnpriced > 0) {
        await indexedTokensRepository.resetPricingAttempts(chain, tokenAddress);
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
