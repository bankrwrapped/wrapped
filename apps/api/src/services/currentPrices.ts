import type { Chain } from "@bankr-wrapped/shared";

// Current USD prices for valuing fees that aren't paid in WETH (BNKR- and
// stock-paired pools, and launched tokens). pricingService is historical
// and day-bucketed - today's bucket often has no data yet - so this uses
// spot prices instead. GeckoTerminal's simple token_price takes up to 30
// addresses per call on both chains (verified live 2026-10-17 for BNKR,
// tokenized stocks and Robinhood WETH); DefiLlama backs up Base.
//
// Never throws: an address with no price is simply missing from the result,
// and callers treat it as unpriced.

const GECKO_BASE = "https://api.geckoterminal.com/api/v2/simple/networks";
const LLAMA_BASE = "https://coins.llama.fi/prices/current";
const NETWORK: Record<Chain, string> = { base: "base", robinhood: "robinhood" };
const LLAMA_CHAIN: Partial<Record<Chain, string>> = { base: "base" };
const BATCH_SIZE = 30;
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { usd: number; expiresAt: number }>();
const cacheKey = (chain: Chain, address: string) => `${chain}:${address}`;

async function fromGeckoTerminal(chain: Chain, addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${GECKO_BASE}/${NETWORK[chain]}/token_price/${batch.join(",")}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error("status " + res.status);
      const json = (await res.json()) as { data?: { attributes?: { token_prices?: Record<string, string | null> } } };
      for (const [addr, price] of Object.entries(json.data?.attributes?.token_prices ?? {})) {
        const usd = Number(price);
        if (price !== null && Number.isFinite(usd) && usd > 0) out.set(addr.toLowerCase(), usd);
      }
    } catch (err) {
      console.warn(`[currentPrices] geckoterminal failed chain=${chain} batch=${batch.length}: ${String(err)}`);
    }
  }
  return out;
}

async function fromDefiLlama(chain: Chain, addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const llamaChain = LLAMA_CHAIN[chain];
  if (!llamaChain || addresses.length === 0) return out;
  try {
    const ids = addresses.map((a) => `${llamaChain}:${a}`).join(",");
    const res = await fetch(`${LLAMA_BASE}/${ids}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error("status " + res.status);
    const json = (await res.json()) as { coins?: Record<string, { price?: number }> };
    for (const [id, coin] of Object.entries(json.coins ?? {})) {
      if (typeof coin.price === "number" && coin.price > 0) out.set(id.split(":")[1].toLowerCase(), coin.price);
    }
  } catch (err) {
    console.warn(`[currentPrices] defillama failed chain=${chain}: ${String(err)}`);
  }
  return out;
}

export async function getCurrentPricesUsd(chain: Chain, addresses: string[]): Promise<Map<string, number>> {
  const now = Date.now();
  const result = new Map<string, number>();
  const missing: string[] = [];
  for (const raw of new Set(addresses.map((a) => a.toLowerCase()))) {
    const hit = cache.get(cacheKey(chain, raw));
    if (hit && hit.expiresAt > now) result.set(raw, hit.usd);
    else missing.push(raw);
  }
  if (missing.length === 0) return result;

  const found = await fromGeckoTerminal(chain, missing);
  const stillMissing = missing.filter((a) => !found.has(a));
  for (const [addr, usd] of await fromDefiLlama(chain, stillMissing)) found.set(addr, usd);

  for (const [addr, usd] of found) {
    cache.set(cacheKey(chain, addr), { usd, expiresAt: now + CACHE_TTL_MS });
    result.set(addr, usd);
  }
  return result;
}

// Tests only.
export function clearCurrentPriceCache(): void {
  cache.clear();
}
