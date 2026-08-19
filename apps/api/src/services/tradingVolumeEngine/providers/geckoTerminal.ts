import type { ChainId, ProviderVolumeResult, TokenRef } from "../types";

export const BASE_URL = "https://api.geckoterminal.com/api/v2";

// Verified live 2026-08-06 against GeckoTerminal's own pool-listing pages:
// geckoterminal.com/base/pools and geckoterminal.com/robinhood/pools both
// resolve. "robinhood-chain" (the prior placeholder) does not.
export const NETWORK_SLUGS: Record<ChainId, string> = {
  base: "base",
  robinhood: "robinhood",
};

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000]; // 1s, 2s, 4s

// GeckoTerminal's own hosted API docs (api.geckoterminal.com/docs, checked
// live 2026-08-06) state "approximately 10 calls/minute" for the free
// public tier - their pricing page independently confirms this (paid plans
// go "10 calls/min to 250 calls/min", a 25X jump). Note: other
// GeckoTerminal-adjacent pages (FAQ, third-party wrappers) say 30/min,
// which looks like stale/outdated documentation - the number on the API's
// own docs host is the one actually serving these requests, so that's the
// one this throttle is built around.
//
// Confirmed empirically this session: without this throttle, even fully
// serial (one token at a time, 500ms apart) calls to this provider got
// rate-limited into exhausting their retry budget on the majority of
// requests during a 53-token run. A single token can also make 2+
// sequential calls here (resolveTopPool, then paginated OHLCV pages),
// so throttling only between DIFFERENT tokens isn't enough either -
// every actual outbound request needs to respect this spacing, which is
// why this lives here at the fetch level, not in the caller's loop.
const MIN_REQUEST_INTERVAL_MS = 6100; // ~10/min + small buffer, since GeckoTerminal's own docs say the real figure "may fluctuate based on network traffic"

let nextAllowedRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = nextAllowedRequestTime - now;
  if (wait > 0) {
    await sleep(wait);
  }
  nextAllowedRequestTime = Date.now() + MIN_REQUEST_INTERVAL_MS;
}

/**
 * Retries ONLY on 429. A genuine non-429 failure (404, etc.) returns null
 * immediately — real "no data" for this token/pool, not a rate limit.
 * Every attempt (including retries) goes through throttle() first, so
 * retries themselves can't cause a burst that trips the limit again.
 */
export async function fetchWithRateLimitRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();

    const res = await fetch(url, {
      headers: { Accept: "application/json;version=20230302" },
    });

    if (res.status === 429) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return null;
    }

    if (!res.ok) return null;

    return res;
  }
  return null;
}

interface GeckoPoolAttributes {
  address: string;
  pool_created_at: string;
  reserve_in_usd: string;
  volume_usd: { h24: string };
}

interface GeckoPool {
  id: string;
  attributes: GeckoPoolAttributes;
}

/**
 * OHLCV is pool-scoped, not token-scoped — a token can trade in several
 * pools. Resolve to the single highest-liquidity pool for lifetime volume.
 */
export async function resolveTopPool(
  network: string,
  tokenAddress: string,
): Promise<GeckoPoolAttributes | null> {
  const url = `${BASE_URL}/networks/${network}/tokens/${tokenAddress}/pools`;
  const res = await fetchWithRateLimitRetry(url);
  if (!res) return null;

  const json = await res.json();
  const pools: GeckoPool[] = json?.data ?? [];
  if (!Array.isArray(pools) || pools.length === 0) return null;

  const best = pools.reduce((top, p) => {
    const liq = Number(p.attributes?.reserve_in_usd ?? 0);
    const topLiq = Number(top.attributes?.reserve_in_usd ?? 0);
    return liq > topLiq ? p : top;
  }, pools[0]);

  return best.attributes;
}

/**
 * Paginate backward through daily OHLCV candles via before_timestamp,
 * summing volume, until either an empty response comes back or the
 * earliest candle in a page is on/before the pool's creation DATE.
 *
 * IMPORTANT (bug fixed 2026-08-06): daily candles are bucketed to 00:00 UTC.
 * A pool created mid-day (e.g. 14:48 UTC) still has a full candle for that
 * calendar day covering all trades from creation through midnight. Filtering
 * individual candles with `timestamp < createdAtSec` (an exact moment, not a
 * day) wrongly excluded that entire creation-day candle -- which for this
 * token was the single largest volume day ($54,269.90 of a $54,663.58
 * lifetime total). Do NOT reintroduce a per-candle exact-timestamp filter.
 * The API only returns candles for periods the pool existed, so no
 * post-hoc filtering is needed at all -- every candle returned is valid.
 */
async function getLifetimeVolumeForPool(
  network: string,
  poolAddress: string,
  poolCreatedAt: string,
): Promise<number | null> {
  const createdAtSec = Math.floor(new Date(poolCreatedAt).getTime() / 1000);
  // Start of the creation day (00:00 UTC) — the day-bucket this candle
  // would fall in, used only to decide when to STOP paginating, never to
  // filter out an individual candle.
  const createdDayStartSec = createdAtSec - (createdAtSec % 86400);

  let beforeTimestamp = Math.floor(Date.now() / 1000);
  let totalVolumeUsd = 0;
  let gotAnyData = false;
  let reachedPoolCreation = false;

  const MAX_PAGES = 50; // 50 * 1000 daily candles ≈ 137 years — safety cap only

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${BASE_URL}/networks/${network}/pools/${poolAddress}/ohlcv/day` +
      `?aggregate=1&limit=1000&currency=usd&before_timestamp=${beforeTimestamp}`;

    const res = await fetchWithRateLimitRetry(url);
    if (!res) break;

    const json = await res.json();
    const ohlcvList: number[][] = json?.data?.attributes?.ohlcv_list ?? [];
    if (ohlcvList.length === 0) break;

    for (const candle of ohlcvList) {
      const [, , , , , volume] = candle;
      totalVolumeUsd += volume;
      gotAnyData = true;
    }

    const earliestTimestampThisPage = ohlcvList[ohlcvList.length - 1][0];
    if (earliestTimestampThisPage <= createdDayStartSec) {
      reachedPoolCreation = true;
      break;
    }

    beforeTimestamp = earliestTimestampThisPage;
  }

  if (gotAnyData && !reachedPoolCreation) {
    // eslint-disable-next-line no-console
    console.warn(
      `[geckoTerminal] Lifetime volume for pool ${poolAddress} on ${network} ` +
      `stopped before reaching pool_created_at (${poolCreatedAt}). This may mean ` +
      `the free public API has a lookback depth limit — verify against a known ` +
      `old pool before trusting this number as true lifetime volume.`,
    );
  }

  return gotAnyData ? totalVolumeUsd : null;
}

export async function fetchGeckoTerminalVolume(
  token: TokenRef,
): Promise<ProviderVolumeResult | null> {
  const network = NETWORK_SLUGS[token.chain];
  if (!network) return null;

  const pool = await resolveTopPool(network, token.address);
  if (!pool) return null;

  const volumeUsd = await getLifetimeVolumeForPool(
    network,
    pool.address,
    pool.pool_created_at,
  );
  if (volumeUsd === null || volumeUsd <= 0) return null;

  return { source: "geckoterminal", volumeUsd };
}
