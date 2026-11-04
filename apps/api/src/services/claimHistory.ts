// A wallet's fee claims over the last 365 days, one entry per day, from the
// indexer. It powers the claim calendar, best claim day and streak on the
// Wrapped cards. Bankr's API only gives 90 days of Doppler WETH claims;
// this covers the whole year and every claim route:
//   - Doppler Release (both sides of the pool, valued when paid)
//   - Clanker v4 ClaimTokens / ClaimTokensPermissioned
//   - Clanker v3.1 collects (ClankerV31ClaimedRewards)
//
// It's a separate payload field (claimHistory) on purpose: the leaderboards
// rank on Bankr's 90-day dailyEarnings/bestDay/longestStreakDays, and
// changing those for some wallets but not others would make the boards
// compare unlike numbers.
//
// Returns null - and the cards fall back to Bankr's 90 days - when the Base
// indexer hasn't caught up to the chain head (a half-indexed year would
// quietly understate it) or a query fails.
import type { Chain, ClaimHistory } from "@bankr-wrapped/shared";
import {
  cursorAfterBlock,
  cursorAfterEvent,
  fetchClaimEventsPage,
  fetchWatchedPool,
  isChainFullySynced,
  PAGE_SIZE,
  type ClaimEventRow,
  type WatchedPoolRow,
} from "./indexerSync/envioClient";
import { bankrTokenKey, isEthLike, priceRawAmount } from "./module8FeesBreakdown";
import { mapWithConcurrency } from "../utils/mapWithConcurrency";

const CHAIN: Chain = "base";
export const CLAIM_HISTORY_DAYS = 365;
// Claims smaller than this are rounding noise, not a claim day.
const DUST_ETH = 1e-9;
const DAY_MS = 86_400_000;

export interface ClaimScope {
  // bankrTokenKey(chain, token) for every Bankr launch the wallet earns on
  // (its own launches and Please Bro), the same scope as the earnings.
  bankrTokens: Set<string>;
  // Clanker v4 claims pay out a pooled balance that can't be tied to one
  // launch, so they only count for wallets with a Bankr Clanker launch.
  hasClankerV4: boolean;
}

interface Leg {
  token: string;
  raw: bigint;
}

const utcDate = (t: number) => new Date(t).toISOString().slice(0, 10);

// The legs of a claim this wallet received that fall inside the Bankr scope,
// or null to skip the event. "unresolved" means it's in scope but its pool
// isn't resolved yet, so its value is unknown.
async function legsOf(
  row: ClaimEventRow,
  scope: ClaimScope,
  pool: (poolId: string) => Promise<WatchedPoolRow | null>,
): Promise<Leg[] | null | "unresolved"> {
  const raw = (v: string | null) => BigInt(v ?? "0");
  switch (row.eventType) {
    case "Release": {
      // Doppler rows carry the pool's launched token as tokenAddress.
      if (!scope.bankrTokens.has(bankrTokenKey(CHAIN, row.tokenAddress))) return null;
      if (!row.poolId) return "unresolved";
      const p = await pool(row.poolId);
      if (!p || p.tokenIsToken0 == null) return "unresolved";
      return [
        { token: p.currency0, raw: raw(row.amountToken0) },
        { token: p.currency1, raw: raw(row.amountToken1) },
      ];
    }
    case "ClaimTokens":
    case "ClaimTokensPermissioned": {
      if (!scope.hasClankerV4) return null;
      // tokenAddress is the fee token paid out: ETH/WETH, or a launched token.
      const inScope =
        isEthLike(CHAIN, row.tokenAddress) ||
        scope.bankrTokens.has(bankrTokenKey(CHAIN, row.tokenAddress));
      return inScope ? [{ token: row.tokenAddress, raw: raw(row.amountToken0) }] : null;
    }
    case "ClankerV31ClaimedRewards": {
      // The indexer only records v3.1 positions launched by Bankr's deployer.
      const legs: Leg[] = [{ token: row.tokenAddress, raw: raw(row.amountToken0) }];
      if (row.tokenAddress1) legs.push({ token: row.tokenAddress1, raw: raw(row.amountToken1) });
      return legs;
    }
  }
}

// Longest run of consecutive UTC dates in a sorted list of dates.
export function longestRun(dates: string[]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of dates) {
    const t = Date.parse(d + "T00:00:00Z");
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

// Totals per UTC day into the summary the payload carries.
export function summarize(
  byDay: Map<string, number>,
  from: string,
  to: string,
  partial: boolean,
): ClaimHistory {
  const days = [...byDay.entries()]
    .filter(([, eth]) => eth > DUST_ETH)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, eth]) => ({ date, eth }));
  const bestDay = days.reduce<ClaimHistory["bestDay"]>(
    (best, d) => (d.eth > (best?.eth ?? 0) ? d : best),
    null,
  );
  return {
    source: "indexer",
    from,
    to,
    days,
    claimDays: days.length,
    bestDay,
    longestStreakDays: longestRun(days.map((d) => d.date)),
    totalEth: days.reduce((s, d) => s + d.eth, 0),
    partial,
  };
}

export async function getClaimHistory(
  wallet: string,
  scope: ClaimScope,
  now: Date = new Date(),
): Promise<ClaimHistory | null> {
  try {
    if (!(await isChainFullySynced(CHAIN))) return null;
  } catch (err) {
    console.warn("[claimHistory] indexer sync status unavailable, err=" + String(err));
    return null;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fromMs = today - (CLAIM_HISTORY_DAYS - 1) * DAY_MS;
  const from = utcDate(fromMs);
  const to = utcDate(today);

  const pools = new Map<string, Promise<WatchedPoolRow | null>>();
  const pool = (poolId: string) => {
    if (!pools.has(poolId)) pools.set(poolId, fetchWatchedPool(CHAIN, poolId));
    return pools.get(poolId)!;
  };

  const byDay = new Map<string, number>();
  let partial = false;
  try {
    let cursor = cursorAfterBlock("0");
    for (;;) {
      const page = await fetchClaimEventsPage(CHAIN, wallet, new Date(fromMs).toISOString(), cursor);
      const priced = await mapWithConcurrency(page, 5, async (row) => {
        const legs = await legsOf(row, scope, pool);
        if (legs === null) return 0;
        if (legs === "unresolved") {
          partial = true;
          return 0;
        }
        let eth = 0;
        for (const leg of legs) {
          if (leg.raw === 0n) continue;
          try {
            eth += (await priceRawAmount(CHAIN, leg.token, leg.raw, row.timestamp, row.poolId ?? ""))
              .ethAmount;
          } catch {
            partial = true; // an unpriced leg counts as 0
          }
        }
        return eth;
      });
      page.forEach((row, i) => {
        if (priced[i] <= 0) return;
        const day = utcDate(Date.parse(row.timestamp));
        byDay.set(day, (byDay.get(day) ?? 0) + priced[i]);
      });
      if (page.length < PAGE_SIZE) break;
      cursor = cursorAfterEvent(page[page.length - 1]);
    }
  } catch (err) {
    console.warn("[claimHistory] claims unavailable, falling back to Bankr's 90 days, err=" + String(err));
    return null;
  }

  return summarize(byDay, from, to, partial);
}
