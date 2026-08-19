import { db } from "../db/client";

export interface WalletTokenStatus {
  chain: string;
  token_address: string;
  backfill_status: string | null; // null = requested but indexed_tokens row not yet created
}

export interface WalletCompletionSummary {
  total: number;
  complete: number;
  inProgress: number;
  pending: number;
  failed: number;
  tokens: WalletTokenStatus[];
}

export const walletBackfillRequestsRepository = {
  // Call whenever Module 7's cold-start path fires for a wallet's token --
  // idempotent (on conflict do nothing), so re-asking doesn't duplicate rows.
  async recordRequest(walletAddress: string, chain: string, tokenAddress: string): Promise<void> {
    await db`
      insert into wallet_backfill_requests (wallet_address, chain, token_address)
      values (${walletAddress}, ${chain}, ${tokenAddress})
      on conflict (wallet_address, chain, token_address) do nothing
    `;
  },

  // The actual "serve best available number on re-ask" query Module 7 needs
  // (item 20) -- joins against indexed_tokens for real per-token status
  // rather than tracking status twice in two tables.
  async getCompletionSummary(walletAddress: string): Promise<WalletCompletionSummary> {
    const rows = (await db`
      select
        r.chain,
        r.token_address,
        t.backfill_status
      from wallet_backfill_requests r
      left join indexed_tokens t
        on t.chain = r.chain and t.token_address = r.token_address
      where r.wallet_address = ${walletAddress}
    `) as WalletTokenStatus[];

    const summary: WalletCompletionSummary = {
      total: rows.length,
      complete: 0,
      inProgress: 0,
      pending: 0,
      failed: 0,
      tokens: rows,
    };

    for (const row of rows) {
      switch (row.backfill_status) {
        case "complete":
          summary.complete += 1;
          break;
        case "in_progress":
          summary.inProgress += 1;
          break;
        case "failed":
          summary.failed += 1;
          break;
        default:
          summary.pending += 1;
      }
    }

    return summary;
  },

  // New: needed because backfill completion is written per-TOKEN
  // (indexed_tokens.backfill_status), but notification needs to happen
  // per-WALLET. One token finishing can affect several wallets at once
  // (any wallet holding that token) -- this finds all of them so each
  // can be re-checked individually for full completion.
  async getWalletsForToken(chain: string, tokenAddress: string): Promise<string[]> {
    const rows = (await db`
      select distinct wallet_address
      from wallet_backfill_requests
      where chain = ${chain} and token_address = ${tokenAddress}
    `) as { wallet_address: string }[];
    return rows.map((r) => r.wallet_address);
  },
};
