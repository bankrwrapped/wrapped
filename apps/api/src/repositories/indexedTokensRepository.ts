import { db } from "../db/client";

export type BackfillStatus = "pending" | "in_progress" | "complete" | "failed";

interface IndexedTokenRow {
  token_address: string;
  chain: string;
  pool_id: string | null;
  source: string;
  deployer_wallet: string | null;
  first_seen_block: string | null;
  backfill_status: BackfillStatus;
  backfill_checkpoint_block: string | null;
  last_refreshed_at: Date | null;
  decimals: number | null;
}

export const indexedTokensRepository = {
  async find(chain: string, tokenAddress: string): Promise<IndexedTokenRow | null> {
    const rows = (await db`
      select * from indexed_tokens
      where chain = ${chain} and token_address = ${tokenAddress}
      limit 1
    `) as IndexedTokenRow[];
    return rows[0] ?? null;
  },

  async createPending(
    chain: string,
    tokenAddress: string,
    source: string,
  ): Promise<void> {
    await db`
      insert into indexed_tokens (chain, token_address, source, backfill_status)
      values (${chain}, ${tokenAddress}, ${source}, 'pending')
      on conflict (chain, token_address) do nothing
    `;
  },

  async setStatus(chain: string, tokenAddress: string, status: BackfillStatus): Promise<void> {
    await db`
      update indexed_tokens set backfill_status = ${status}
      where chain = ${chain} and token_address = ${tokenAddress}
    `;
  },

  async setDecimals(chain: string, tokenAddress: string, decimals: number): Promise<void> {
    await db`
      update indexed_tokens set decimals = ${decimals}
      where chain = ${chain} and token_address = ${tokenAddress}
    `;
  },

  async updateCheckpoint(
    chain: string,
    tokenAddress: string,
    checkpointBlock: bigint,
  ): Promise<void> {
    await db`
      update indexed_tokens
      set backfill_checkpoint_block = ${checkpointBlock.toString()},
          last_refreshed_at = now()
      where chain = ${chain} and token_address = ${tokenAddress}
    `;
  },

  async listCompleteForRefresh(chain: string): Promise<IndexedTokenRow[]> {
    return (await db`
      select * from indexed_tokens
      where chain = ${chain} and backfill_status = 'complete'
    `) as IndexedTokenRow[];
  },
};
