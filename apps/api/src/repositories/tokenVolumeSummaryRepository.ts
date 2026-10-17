import { db } from "../db/client";

interface TokenVolumeSummaryRow {
  chain: string;
  token_address: string;
  total_volume_usd: string;
  swap_count: number;
  unpriced_swap_count: number;
  last_updated_at: Date;
}

export const tokenVolumeSummaryRepository = {
  async get(chain: string, tokenAddress: string): Promise<TokenVolumeSummaryRow | null> {
    const rows = (await db`
      select * from token_volume_summary
      where chain = ${chain} and token_address = ${tokenAddress}
      limit 1
    `) as TokenVolumeSummaryRow[];
    return rows[0] ?? null;
  },

  async setTotal(
    chain: string,
    tokenAddress: string,
    totalVolumeUsd: number,
    swapCount: number,
    unpricedSwapCount: number,
  ): Promise<void> {
    await db`
      insert into token_volume_summary (chain, token_address, total_volume_usd, swap_count, unpriced_swap_count, last_updated_at)
      values (${chain}, ${tokenAddress}, ${totalVolumeUsd}, ${swapCount}, ${unpricedSwapCount}, now())
      on conflict (chain, token_address) do update set
        total_volume_usd = excluded.total_volume_usd,
        swap_count = excluded.swap_count,
        unpriced_swap_count = excluded.unpriced_swap_count,
        last_updated_at = now()
    `;
  },

  async addToTotal(
    chain: string,
    tokenAddress: string,
    additionalVolumeUsd: number,
    additionalSwapCount: number,
  ): Promise<void> {
    await db`
      update token_volume_summary
      set total_volume_usd = total_volume_usd + ${additionalVolumeUsd},
          swap_count = swap_count + ${additionalSwapCount},
          last_updated_at = now()
      where chain = ${chain} and token_address = ${tokenAddress}
    `;
  },

  // Incremental refresh commit: adds the new volume AND advances the
  // checkpoint in one transaction, and only if the checkpoint is still the
  // one this run started from. Two separate writes (addToTotal then
  // updateCheckpoint) double-counted on a crash between them (the next run
  // re-read the old checkpoint and re-added the same swaps), and two
  // replicas refreshing the same token both added. Returns false if another
  // run already advanced the checkpoint - this run's delta is discarded.
  async addToTotalAndAdvanceCheckpoint(
    chain: string,
    tokenAddress: string,
    additionalVolumeUsd: number,
    additionalSwapCount: number,
    additionalUnpricedSwapCount: number,
    expectedCheckpointBlock: string | null,
    newCheckpointBlock: bigint,
  ): Promise<boolean> {
    return db.begin(async (tx) => {
      const advanced = (await tx`
        update indexed_tokens
        set backfill_checkpoint_block = ${newCheckpointBlock.toString()},
            last_refreshed_at = now()
        where chain = ${chain} and token_address = ${tokenAddress}
          and backfill_checkpoint_block is not distinct from ${expectedCheckpointBlock}
        returning token_address
      `) as { token_address: string }[];
      if (advanced.length === 0) return false;

      if (additionalSwapCount > 0 || additionalUnpricedSwapCount > 0) {
        await tx`
          update token_volume_summary
          set total_volume_usd = total_volume_usd + ${additionalVolumeUsd},
              swap_count = swap_count + ${additionalSwapCount},
              unpriced_swap_count = unpriced_swap_count + ${additionalUnpricedSwapCount},
              last_updated_at = now()
          where chain = ${chain} and token_address = ${tokenAddress}
        `;
      }
      return true;
    });
  },
};
