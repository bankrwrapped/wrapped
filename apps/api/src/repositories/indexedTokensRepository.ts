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
  backfill_started_at: Date | null;
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

  // ---- Retry/anti-stall additions ----
  //
  // Atomic claim: single UPDATE...WHERE...RETURNING so two concurrent
  // callers racing on the same token can't both "win" a retry. The row is
  // eligible if it's 'failed', OR it's 'pending'/'in_progress' but has gone
  // silent -- silence is judged by whichever is MORE RECENT of
  // backfill_started_at and last_refreshed_at, not just started_at alone.
  // Using started_at alone would incorrectly reclaim a job that's genuinely
  // still running and updating its checkpoint page-by-page on a long
  // token history; last_refreshed_at moving forward is real evidence of
  // life even if the job has been running longer than the stale threshold.
  async claimForBackfill(
    chain: string,
    tokenAddress: string,
    staleThresholdMs: number,
  ): Promise<boolean> {
    const staleCutoff = new Date(Date.now() - staleThresholdMs);
    const rows = (await db`
      update indexed_tokens
      set backfill_status = 'in_progress', backfill_started_at = now()
      where chain = ${chain}
        and token_address = ${tokenAddress}
        and (
          backfill_status = 'failed'
          or (
            backfill_status in ('pending', 'in_progress')
            and greatest(
              coalesce(backfill_started_at, 'epoch'::timestamptz),
              coalesce(last_refreshed_at, 'epoch'::timestamptz)
            ) < ${staleCutoff}
          )
        )
      returning token_address
    `) as { token_address: string }[];
    return rows.length > 0;
  },

  // Candidates only, for the periodic sweep -- the sweep must still call
  // claimForBackfill per-token before actually retrying, since this list
  // can go stale between being read and being acted on (e.g. a live user
  // request claims the same token in between).
  async listStuckCandidates(chain: string, staleThresholdMs: number): Promise<IndexedTokenRow[]> {
    const staleCutoff = new Date(Date.now() - staleThresholdMs);
    return (await db`
      select * from indexed_tokens
      where chain = ${chain}
        and (
          backfill_status = 'failed'
          or (
            backfill_status in ('pending', 'in_progress')
            and greatest(
              coalesce(backfill_started_at, 'epoch'::timestamptz),
              coalesce(last_refreshed_at, 'epoch'::timestamptz)
            ) < ${staleCutoff}
          )
        )
    `) as IndexedTokenRow[];
  },
};