import {
  BASE_URL,
  NETWORK_SLUGS,
  fetchWithRateLimitRetry,
} from "../tradingVolumeEngine/providers/geckoTerminal";
import type { ChainId } from "../tradingVolumeEngine/types";

// Candle shape confirmed from tradingVolumeEngine/providers/geckoTerminal.ts's
// own destructure: [timestamp, open, high, low, close, volume].
//
// before_timestamp is exclusive-upper-bound — passing unixSeconds + 1 (not
// +3600) is what actually returns the hour-candle CONTAINING unixSeconds; a
// full hour of buffer would risk skipping forward to the NEXT candle instead.
export async function fetchGeckoTerminalPriceAtTimestamp(
  chain: string,
  poolId: string,
  unixSeconds: number,
): Promise<number | null> {
  const network = NETWORK_SLUGS[chain as ChainId];
  if (!network) return null;

  // Skip the network call entirely for anything outside GeckoTerminal's
  // free-tier window (confirmed live 2026-08-09: 180 days) -- otherwise
  // every old swap burns a full throttled (~6s) call we already know will
  // fail, starving the budget for swaps that could actually be priced.
  const ageDays = (Date.now() / 1000 - unixSeconds) / 86400;
  if (ageDays > 179) return null; // 179 not 180: small safety margin against boundary rounding

  const url =
    `${BASE_URL}/networks/${network}/pools/${poolId}/ohlcv/hour` +
    `?aggregate=1&limit=1&currency=usd&before_timestamp=${unixSeconds + 1}`;

  const res = await fetchWithRateLimitRetry(url);
  if (!res) return null;

  const json = await res.json();
  const ohlcvList: number[][] = json?.data?.attributes?.ohlcv_list ?? [];
  if (ohlcvList.length === 0) return null;

  const [, , , , close] = ohlcvList[0];
  return typeof close === "number" ? close : null;
}
