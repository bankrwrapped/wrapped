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

// --- Failure cache: separate from the success cache (priceCacheRepository).
// Keyed at the SAME granularity as the success cache (day bucket, via
// toDateStr) rather than raw unixSeconds - two lookups landing in the same
// calendar day for the same token are the same GoldRush call either way,
// so they should share one failure entry, not fragment into near-duplicates.
// A failed lookup is remembered for FAILURE_TTL_MS so a retried request for
// the same wallet doesn't re-queue an already-doomed GoldRush call and add
// load to a queue that may already be near its 30s cap.
const FAILURE_TTL_MS = 90_000; // long enough to skip a retry-storm window, short enough to self-heal once contention clears
const failedLookupCache = new Map<string, number>(); // key -> expiry timestamp

function failureKey(chain: string, tokenAddress: string, dateStr: string): string {
  return chain + ":" + tokenAddress.toLowerCase() + ":" + dateStr;
}

function isRecentFailure(key: string): boolean {
  const expiry = failedLookupCache.get(key);
  if (expiry === undefined) return false;
  if (Date.now() >= expiry) {
    failedLookupCache.delete(key);
    return false;
  }
  return true;
}

function recordFailure(key: string): void {
  failedLookupCache.set(key, Date.now() + FAILURE_TTL_MS);
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

// --- INSTRUMENTATION (issue #1 diagnosis, 2026-08-18) ---
// Every log line below is additive only -- no control flow changed. Goal:
// distinguish "GoldRush timed out", "GoldRush queue backed up", "GoldRush
// genuinely had no data", "GeckoTerminal fallback recovered it", and
// "GeckoTerminal fallback was skipped because the swap is too old" -- all
// four currently collapse into the same silent `null` at the call site.
// Remove or downgrade to debug-level once the sample run has an answer.

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

  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    console.log(
      `[pricing] goldrush-ok chain=${chain} token=${tokenAddress} date=${dateStr} ` +
      `status=${res.status} elapsedMs=${Date.now() - startedAt}`,
    );
    return res;
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    console.log(
      `[pricing] goldrush-${isTimeout ? "TIMEOUT" : "NETWORK_ERROR"} ` +
      `chain=${chain} token=${tokenAddress} date=${dateStr} ` +
      `elapsedMs=${Date.now() - startedAt} err=${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

async function fetchFromGoldRush(
  chain: string,
  tokenAddress: string,
  unixSeconds: number
): Promise<number> {
  const dateStr = toDateStr(unixSeconds);

  const queueStart = Date.now();
  await goldRushRateLimiter.beforePriceLookup();
  const queueWaitMs = Date.now() - queueStart;
  if (queueWaitMs > 1000) {
    console.log(
      `[pricing] goldrush-queue-wait chain=${chain} token=${tokenAddress} date=${dateStr} waitMs=${queueWaitMs}`,
    );
  }

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
      console.log(
        `[pricing] goldrush-429 chain=${chain} token=${tokenAddress} date=${dateStr} ` +
        `attempt=${attempt} backoffMs=${backoffMs}`,
      );
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
      console.log(
        `[pricing] goldrush-no-data chain=${chain} token=${tokenAddress} date=${dateStr} ` +
        `(token may be unlisted or untraded that day)`,
      );
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
  const dateStr = toDateStr(unixSeconds);

  const cached = await priceCacheRepository.find(chain, tokenAddress, bucket);
  if (cached !== null) return cached;

  const fKey = failureKey(chain, tokenAddress, dateStr);
  if (isRecentFailure(fKey)) {
    console.log(
      `[pricing] EXCLUDED-cached-failure chain=${chain} token=${tokenAddress} date=${dateStr}`,
    );
    throw new Error(
      "getHistoricalPriceUsd: skipping " + chain + ":" + tokenAddress + " on " + dateStr +
      " - recent failure cached, avoiding re-queue on a possibly-still-saturated GoldRush queue"
    );
  }

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
    const fallbackPrice = await fetchGeckoTerminalPriceAtTimestamp(chain, poolId, unixSeconds, tokenAddress);
    if (fallbackPrice !== null) {
      console.log(
        `[pricing] fallback-recovered chain=${chain} token=${tokenAddress} date=${dateStr} ` +
        `goldrushErr="${goldRushErr instanceof Error ? goldRushErr.message : String(goldRushErr)}"`,
      );
      await priceCacheRepository.upsert(chain, tokenAddress, bucket, fallbackPrice);
      return fallbackPrice;
    }
    console.log(
      `[pricing] EXCLUDED chain=${chain} token=${tokenAddress} date=${dateStr} ` +
      `goldrushErr="${goldRushErr instanceof Error ? goldRushErr.message : String(goldRushErr)}" ` +
      `ageDays=${((Date.now() / 1000 - unixSeconds) / 86400).toFixed(1)}`,
    );
    recordFailure(fKey);
    throw goldRushErr;
  }
}