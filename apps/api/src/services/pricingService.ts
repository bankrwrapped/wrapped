import { priceCacheRepository } from "../repositories/priceCacheRepository";
import { defiLlamaRateLimiter } from "../utils/defiLlamaRateLimiter";

const DEFILLAMA_BASE = "https://coins.llama.fi";
const FETCH_TIMEOUT_MS = 25000;
const MAX_RETRIES = 3;

function toHourBucket(unixSeconds: number): Date {
  const d = new Date(unixSeconds * 1000);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

interface DefiLlamaHistoricalResponse {
  coins?: Record<string, { price?: number; timestamp?: number }>;
}

async function fetchFromDefiLlamaOnce(coinKey: string, unixSeconds: number): Promise<Response> {
  const url = DEFILLAMA_BASE + "/prices/historical/" + unixSeconds + "/" + coinKey;
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function fetchFromDefiLlama(
  chain: string,
  tokenAddress: string,
  unixSeconds: number
): Promise<number> {
  const coinKey = chain + ":" + tokenAddress;

  return defiLlamaRateLimiter.run(async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetchFromDefiLlamaOnce(coinKey, unixSeconds);

      if (res.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            "DeFiLlama rate-limited " + coinKey + " after " + MAX_RETRIES + " retries - " +
            "real production-scale limit found, OQ5 needs re-opening with this data point"
          );
        }
        const retryAfterHeader = res.headers.get("retry-after");
        const backoffMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2 ** attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!res.ok) {
        throw new Error("DeFiLlama historical price fetch failed: " + res.status + " for " + coinKey);
      }

      const data = (await res.json()) as DefiLlamaHistoricalResponse;
      const price = data.coins?.[coinKey]?.price;
      if (typeof price !== "number") {
        throw new Error("DeFiLlama returned no price for " + coinKey + " at " + unixSeconds + " - token may be unlisted");
      }
      return price;
    }
    throw new Error("unreachable");
  });
}

export async function getHistoricalPriceUsd(
  chain: string,
  tokenAddress: string,
  unixSeconds: number
): Promise<number> {
  const bucket = toHourBucket(unixSeconds);

  const cached = await priceCacheRepository.find(chain, tokenAddress, bucket);
  if (cached !== null) return cached;

  const price = await fetchFromDefiLlama(chain, tokenAddress, unixSeconds);
  await priceCacheRepository.upsert(chain, tokenAddress, bucket, price);
  return price;
}
