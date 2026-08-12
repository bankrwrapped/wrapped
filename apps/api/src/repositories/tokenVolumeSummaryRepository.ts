import { db } from "../db/client";

interface TokenVolumeSummaryRow {
  chain: string;
  token_address: string;
  total_volume_usd: string;
  swap_count: number;
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
  ): Promise<void> {
    await db`
      insert into token_volume_summary (chain, token_address, total_volume_usd, swap_count, last_updated_at)
      values (${chain}, ${tokenAddress}, ${totalVolumeUsd}, ${swapCount}, now())
      on conflict (chain, token_address) do update set
        total_volume_usd = excluded.total_volume_usd,
        swap_count = excluded.swap_count,
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
};
