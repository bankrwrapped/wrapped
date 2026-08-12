import { priceCacheRepository } from "../repositories/priceCacheRepository";
import { goldRushRateLimiter } from "../utils/goldRushRateLimiter";
import { fetchGeckoTerminalPriceAtTimestamp } from "./indexerSync/geckoTerminalFallback";
import { env } from "../config/env";

const GOLDRUSH_BASE = "https://api.covalenthq.com";
const FETCH_TIMEOUT_MS = 25000;
const MAX_RETRIES = 3;

// Bucketing: DAILY, not hourly - this is a real precision downgrade from
// the original DeFiLlama-based design, forced by Covalent's actual data
// grain (their historical endpoint returns one price per calendar day,
// there is no finer resolution available). Risk: intra-day volatility on
// a fast-moving token means every swap that day shares one price. Still
// acceptable for this product's aggregate lifetime-total use case (errors
// partially cancel across many swaps) - NOT acceptable if this service is
// ever reused for single-trade accuracy. Flag before any such reuse.
function toDayBucket(unixSeconds: number): Date {
  const d = new Date(unixSeconds * 1000);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().split("T")[0];
}

interface GoldRushPriceItem {
  date: string;
  price: number;
}

interface GoldRushHistoricalResponse {
  data?: Array<{ items?: GoldRushPriceItem[] }>;
  error?: boolean;
  error_message?: string | null;
}

function toGoldRushChainSlug(chain: string): string {
  if (chain === "base") return "base-mainnet";
  throw new Error(`toGoldRushChainSlug: no GoldRush chain slug mapping for chain=${chain}`);
}

async function fetchFromGoldRushOnce(
  chain: string,
  tokenAddress: string,
  dateStr: string
): Promise<Response> {
  const url =
    GOLDRUSH_BASE + "/v1/pricing/historical_by_addresses_v2/" +
    toGoldRushChainSlug(chain) + "/USD/" + tokenAddress + "/" +
    "?from=" + dateStr + "&to=" + dateStr +
    "&key=" + env.GOLDRUSH_API_KEY;

  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function fetchFromGoldRush(
  chain: string,
  tokenAddress: string,
  unixSeconds: number
): Promise<number> {
  const dateStr = toDateStr(unixSeconds);

  await goldRushRateLimiter.beforePriceLookup();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetchFromGoldRushOnce(chain, tokenAddress, dateStr);

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new Error(
          "GoldRush rate-limited " + chain + ":" + tokenAddress + " after " + MAX_RETRIES + " retries - " +
          "contradicts tonight's burst-test results (clean to 10/sec), worth re-opening the OQ with this data point"
        );
      }
      const retryAfterHeader = res.headers.get("retry-after");
      const backoffMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2 ** attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    if (!res.ok) {
      throw new Error("GoldRush historical price fetch failed: " + res.status + " for " + chain + ":" + tokenAddress);
    }

    const data = (await res.json()) as GoldRushHistoricalResponse;
    if (data.error) {
      throw new Error("GoldRush returned an error for " + chain + ":" + tokenAddress + ": " + data.error_message);
    }

    const items = data.data?.[0]?.items;
    if (!items || items.length === 0) {
      throw new Error("GoldRush returned no price data for " + chain + ":" + tokenAddress + " on " + dateStr + " - token may be unlisted or untraded that day");
    }

    // Exact date match expected since from=to=dateStr, but fall back to
    // closest entry defensively rather than assuming index 0 is always right.
    const exact = items.find((it) => it.date.startsWith(dateStr));
    const price = (exact ?? items[0]).price;

    return price;
  }

  throw new Error("unreachable");
}

export async function getHistoricalPriceUsd(
  chain: string,
  tokenAddress: string,
  unixSeconds: number,
  poolId: string
): Promise<number> {
  const bucket = toDayBucket(unixSeconds);

  const cached = await priceCacheRepository.find(chain, tokenAddress, bucket);
  if (cached !== null) return cached;

  try {
    const price = await fetchFromGoldRush(chain, tokenAddress, unixSeconds);
    await priceCacheRepository.upsert(chain, tokenAddress, bucket, price);
    return price;
  } catch (goldRushErr) {
    // GoldRush failed (unlisted, no data that day, rate-limited past
    // retries, etc) - fall back to GeckoTerminal-by-pool before giving up.
    // Returns null (not a throw) if the pool's outside the 180-day free-tier
    // window or GeckoTerminal itself has nothing - in both cases we rethrow
    // the original GoldRush error so callers see one consistent failure
    // reason, and so upstream exclude-not-fail handling still fires.
    const fallbackPrice = await fetchGeckoTerminalPriceAtTimestamp(chain, poolId, unixSeconds);
    if (fallbackPrice !== null) {
      await priceCacheRepository.upsert(chain, tokenAddress, bucket, fallbackPrice);
      return fallbackPrice;
    }
    throw goldRushErr;
  }
}
