import { fetchIndexedSwapsPage, isChainFullySynced } from "./envioClient";
import { getDecimals } from "./decimalsService";
import { getHistoricalPriceUsd } from "../pricingService";
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
      const cursorStart = token.backfill_checkpoint_block ?? "0";

      let cursor = cursorStart;
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

          try {
            const amountTokenWhole = Number(BigInt(swap.amountToken)) / divisor;
            const price = await getHistoricalPriceUsd(
              chain,
              tokenAddress,
              Math.floor(new Date(swap.timestamp).getTime() / 1000),
              swap.poolId,
            );
            addedVolumeUsd += amountTokenWhole * price;
            addedSwapCount += 1;
          } catch (priceErr) {
            excludedCount += 1;
            console.warn(
              `[indexerSync refresh] excluding unpriced swap ${swap.id} (${chain}:${tokenAddress}):`,
              priceErr instanceof Error ? priceErr.message : priceErr,
            );
          }
        }

        cursor = page[page.length - 1].blockNumber;
        if (page.length < 1000) break;
      }

      // Checkpoint always advances on ANY new swap seen (priced or not) —
      // an unpriced swap must never be retried forever on every future run.
      if (addedSwapCount > 0 || excludedCount > 0) {
        if (addedSwapCount > 0) {
          await tokenVolumeSummaryRepository.addToTotal(chain, tokenAddress, addedVolumeUsd, addedSwapCount);
        }
        await indexedTokensRepository.updateCheckpoint(chain, tokenAddress, highestBlockSeen);
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
