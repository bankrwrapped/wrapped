import {
  BASE_URL,
  NETWORK_SLUGS,
  fetchWithRateLimitRetry,
  resolveTopPool,
} from "../tradingVolumeEngine/providers/geckoTerminal";
import type { ChainId } from "../tradingVolumeEngine/types";

// Candle shape confirmed from tradingVolumeEngine/providers/geckoTerminal.ts's
// own destructure: [timestamp, open, high, low, close, volume].
//
// before_timestamp is exclusive-upper-bound — passing unixSeconds + 1 (not
// +3600) is what actually returns the hour-candle CONTAINING unixSeconds; a
// full hour of buffer would risk skipping forward to the NEXT candle instead.
//
// tokenAddress added 2026-08-18: poolId is frequently "" for indexed fee
// events with no associated pool (event.poolId === null upstream in
// module8FeesBreakdown.ts). Previously this meant an automatic null return
// here — GeckoTerminal was never even queried, even though it can resolve
// a pool from the token address alone (same lookup the trading volume
// engine already relies on via resolveTopPool). Now: if no poolId is
// given, resolve the top pool by address first, same as the volume engine
// does, before giving up.
//
// INSTRUMENTATION (issue #1 diagnosis, 2026-08-18): every early-return below
// previously looked identical to the caller (`null`). Each now logs a
// `reason` so "outside the 179-day window" is distinguishable from "asked
// GeckoTerminal and it had nothing" -- additive only, no logic changed.
export async function fetchGeckoTerminalPriceAtTimestamp(
  chain: string,
  poolId: string,
  unixSeconds: number,
  tokenAddress?: string,
): Promise<number | null> {
  const network = NETWORK_SLUGS[chain as ChainId];
  if (!network) {
    console.log(`[pricing] gecko-skip reason=no-network-slug chain=${chain}`);
    return null;
  }

  // Skip the network call entirely for anything outside GeckoTerminal's
  // free-tier window (confirmed live 2026-08-09: 180 days) -- otherwise
  // every old swap burns a full throttled (~6s) call we already know will
  // fail, starving the budget for swaps that could actually be priced.
  const ageDays = (Date.now() / 1000 - unixSeconds) / 86400;
  if (ageDays > 179) {
    // 179 not 180: small safety margin against boundary rounding
    console.log(
      `[pricing] gecko-skip reason=outside-179d-window chain=${chain} ` +
      `token=${tokenAddress ?? "(none)"} ageDays=${ageDays.toFixed(1)}`,
    );
    return null;
  }

  let resolvedPoolId = poolId;
  if (!resolvedPoolId) {
    if (!tokenAddress) {
      console.log(`[pricing] gecko-skip reason=no-poolid-no-token chain=${chain}`);
      return null; // nothing to resolve a pool from
    }
    const pool = await resolveTopPool(network, tokenAddress);
    if (!pool) {
      console.log(`[pricing] gecko-skip reason=no-pool-found chain=${chain} token=${tokenAddress}`);
      return null; // no pool anywhere for this token — genuinely unpriceable via this path
    }
    resolvedPoolId = pool.address;
  }

  const url =
    `${BASE_URL}/networks/${network}/pools/${resolvedPoolId}/ohlcv/hour` +
    `?aggregate=1&limit=1&currency=usd&before_timestamp=${unixSeconds + 1}`;

  const res = await fetchWithRateLimitRetry(url);
  if (!res) {
    console.log(
      `[pricing] gecko-skip reason=fetch-null chain=${chain} token=${tokenAddress ?? "(none)"} pool=${resolvedPoolId}`,
    );
    return null;
  }

  const json = await res.json();
  const ohlcvList: number[][] = json?.data?.attributes?.ohlcv_list ?? [];
  if (ohlcvList.length === 0) {
    console.log(
      `[pricing] gecko-skip reason=empty-ohlcv chain=${chain} token=${tokenAddress ?? "(none)"} pool=${resolvedPoolId}`,
    );
    return null;
  }

  const [, , , , close] = ohlcvList[0];
  if (typeof close === "number") {
    console.log(
      `[pricing] gecko-ok chain=${chain} token=${tokenAddress ?? "(none)"} pool=${resolvedPoolId} close=${close}`,
    );
    return close;
  }
  console.log(
    `[pricing] gecko-skip reason=non-numeric-close chain=${chain} token=${tokenAddress ?? "(none)"} pool=${resolvedPoolId}`,
  );
  return null;
}