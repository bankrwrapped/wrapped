import type { WrappedCacheRow, WrappedPayload, TopTraderEntry } from "@bankr-wrapped/shared";
import { db } from "../db/client";

interface ProfileRow {
  wallet_address: string;
  username: string;
  payload: WrappedPayload;
  updated_at: string;
}

function toCacheRow(row: ProfileRow): WrappedCacheRow {
  return {
    walletAddress: row.wallet_address,
    username: row.username,
    payload: row.payload,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const wrappedCacheRepository = {
  async findByWallet(wallet: string): Promise<WrappedCacheRow | null> {
    const rows = (await db`
      select wallet_address, username, payload, updated_at
      from wrapped_profiles
      where wallet_address = ${wallet}
      limit 1
    `) as ProfileRow[];

    const row = rows[0];
    return row ? toCacheRow(row) : null;
  },

  async upsert(
    wallet: string,
    username: string,
    payload: WrappedPayload
  ): Promise<WrappedCacheRow> {
    const now = new Date();

    const savedRow = await db.begin(async (tx) => {
      const [profile] = (await tx`
        insert into wrapped_profiles (
          wallet_address, username, platform, display_name, avatar_url,
          tokens_launched, please_bro_count,
          creator_earnings_usd, please_bro_earnings_usd, total_earnings_usd, unclaimed_usd,
          payload, updated_at
        ) values (
          ${wallet}, ${username}, ${payload.user.platform}, ${payload.user.displayName}, ${payload.user.avatar},
          ${payload.summary.tokensLaunched}, ${payload.pleaseBroTokens.length},
          ${payload.earnings.creatorEarnings}, ${payload.earnings.pleaseBroEarnings},
          ${payload.earnings.total}, ${payload.claimable.unclaimed},
          ${payload}, ${now}
        )
        on conflict (wallet_address) do update set
          username = excluded.username,
          platform = excluded.platform,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          tokens_launched = excluded.tokens_launched,
          please_bro_count = excluded.please_bro_count,
          creator_earnings_usd = excluded.creator_earnings_usd,
          please_bro_earnings_usd = excluded.please_bro_earnings_usd,
          total_earnings_usd = excluded.total_earnings_usd,
          unclaimed_usd = excluded.unclaimed_usd,
          payload = excluded.payload,
          updated_at = excluded.updated_at
        returning wallet_address, username, payload, updated_at
      `) as ProfileRow[];

      // Token list can change on every refresh - simplest correct approach
      // is delete-then-insert rather than diffing row by row.
      await tx`delete from wrapped_tokens where wallet_address = ${wallet}`;

      const tokenRows = [
        ...payload.tokens.map((t) => ({ ...t, category: "launched" as const })),
        ...payload.pleaseBroTokens.map((t) => ({ ...t, category: "please_bro" as const })),
      ];

      for (const t of tokenRows) {
        await tx`
          insert into wrapped_tokens (
            wallet_address, token_address, name, symbol, chain, category, volume_usd, updated_at
          ) values (
            ${wallet}, ${t.tokenAddress}, ${t.name}, ${t.symbol}, ${t.chain}, ${t.category}, ${t.volume}, ${now}
          )
        `;
      }

      return profile;
    });

    return toCacheRow(savedRow);
  },

  // Powers the marketing / partnership leaderboard. Not wired to a route yet -
  // that's the next step once this lands.
  async getTopTraders(limit = 20): Promise<TopTraderEntry[]> {
    const rows = (await db`
      select wallet_address, username, display_name, avatar_url,
             tokens_launched, please_bro_count,
             total_earnings_usd, unclaimed_usd, updated_at
      from wrapped_profiles
      order by total_earnings_usd desc
      limit ${limit}
    `) as Array<{
      wallet_address: string;
      username: string;
      display_name: string;
      avatar_url: string;
      tokens_launched: number;
      please_bro_count: number;
      total_earnings_usd: string;
      unclaimed_usd: string;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      walletAddress: r.wallet_address,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      tokensLaunched: r.tokens_launched,
      pleaseBroCount: r.please_bro_count,
      totalEarningsUsd: Number(r.total_earnings_usd),
      unclaimedUsd: Number(r.unclaimed_usd),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  },
};