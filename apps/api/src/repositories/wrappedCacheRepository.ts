import type { WrappedCacheRow, WrappedPayload, TopTraderEntry } from "@bankr-wrapped/shared";
import { db } from "../db/client";

interface ProfileRow {
  wallet_address: string;
  username: string;
  payload: WrappedPayload;
  updated_at: string;
}

// The subset of WrappedCacheRow this repository actually persists/returns.
// rank/totalUsers/percentile are deliberately excluded here - per
// WrappedCacheRow's own doc comment, those are computed live on every
// request (see wrappedService.attachRank), never persisted, so this
// repository never has real values for them and shouldn't claim to.
export type PersistedWrappedRow = Omit<WrappedCacheRow, "rank" | "totalUsers" | "percentile">;
function toCacheRow(row: ProfileRow): PersistedWrappedRow {
  return {
    walletAddress: row.wallet_address,
    username: row.username,
    payload: row.payload,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const wrappedCacheRepository = {
  async findByWallet(wallet: string): Promise<PersistedWrappedRow | null> {
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
  ): Promise<PersistedWrappedRow> {
    const now = new Date();

    const savedRow = await db.begin(async (tx) => {
      const [profile] = (await tx`
        insert into wrapped_profiles (
          wallet_address, username, platform, display_name, avatar_url,
          tokens_launched, please_bro_count,
          creator_earnings_usd, please_bro_earnings_usd, total_earnings_usd, unclaimed_usd,
          creator_earnings_eth, please_bro_earnings_eth, total_earnings_eth, unclaimed_eth,
          payload, updated_at
        ) values (
          ${wallet}, ${username}, ${payload.user.platform}, ${payload.user.displayName}, ${payload.user.avatar},
          ${payload.summary.tokensLaunched}, ${payload.pleaseBroTokens.length},
          ${payload.earnings.creatorEarnings}, ${payload.earnings.pleaseBroEarnings},
          ${payload.earnings.total}, ${payload.claimable.unclaimed},
          ${payload.earnings.creatorEarningsEth}, ${payload.earnings.pleaseBroEarningsEth},
          ${payload.earnings.totalEth}, ${payload.claimable.unclaimedEth},
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
          creator_earnings_eth = excluded.creator_earnings_eth,
          please_bro_earnings_eth = excluded.please_bro_earnings_eth,
          total_earnings_eth = excluded.total_earnings_eth,
          unclaimed_eth = excluded.unclaimed_eth,
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
            wallet_address, token_address, name, symbol, chain, category, fees_earned_eth, updated_at
          ) values (
            ${wallet}, ${t.tokenAddress}, ${t.name}, ${t.symbol}, ${t.chain}, ${t.category}, ${t.feesEarnedEth}, ${now}
          )
        `;
      }

      return profile;
    });

    return toCacheRow(savedRow);
  },

  // Live rank + total user count for a single wallet. Recomputed on every
  // request - never cached alongside payload, since other users being
  // wrapped constantly shifts this. Returns rank 1 = highest earner.
  // Ranking stays USD-based per explicit decision - a simple, stable metric
  // for ordering even though displayed figures are ETH.
  async getRank(wallet: string): Promise<{ rank: number; totalUsers: number }> {
    const [totalRow] = (await db`
      select count(*)::int as total from wrapped_profiles
    `) as Array<{ total: number }>;
    const totalUsers = totalRow?.total ?? 0;

    const [rankRow] = (await db`
      select count(*)::int as higher
      from wrapped_profiles
      where total_earnings_usd > (
        select total_earnings_usd from wrapped_profiles where wallet_address = ${wallet}
      )
      or (
        total_earnings_usd = (
          select total_earnings_usd from wrapped_profiles where wallet_address = ${wallet}
        )
        and updated_at < (
          select updated_at from wrapped_profiles where wallet_address = ${wallet}
        )
      )
    `) as Array<{ higher: number }>;
    const rank = (rankRow?.higher ?? 0) + 1;

    return { rank, totalUsers };
  },

  // Powers the marketing / partnership leaderboard. Wired to GET /api/leaderboard.
  // Ordering stays USD-based; the ETH columns are what's actually rendered.
  async getTopTraders(limit = 20): Promise<TopTraderEntry[]> {
    const rows = (await db`
      select wallet_address, username, display_name, avatar_url,
             tokens_launched, please_bro_count,
             total_earnings_usd, unclaimed_usd,
             total_earnings_eth, unclaimed_eth, updated_at
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
      total_earnings_eth: string;
      unclaimed_eth: string;
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
      totalEarningsEth: Number(r.total_earnings_eth),
      unclaimedEth: Number(r.unclaimed_eth),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  },

  // Background trading-volume computations finish independently of the
  // normal fetch/upsert cycle (can take minutes for a large wallet - see
  // Module 7's real measured timings). A full upsert here would require
  // re-deriving the whole payload and risks clobbering newer data written
  // by a concurrent normal request. This does a narrow, additive patch
  // instead: touches only payload.tradingVolume, nothing else.
  async updateTradingVolume(
    wallet: string,
    tradingVolume: WrappedPayload["tradingVolume"]
  ): Promise<void> {
    await db`
      update wrapped_profiles
      set payload = jsonb_set(payload, '{tradingVolume}', ${JSON.stringify(tradingVolume)}::jsonb)
      where wallet_address = ${wallet}
    `;
  },
};
