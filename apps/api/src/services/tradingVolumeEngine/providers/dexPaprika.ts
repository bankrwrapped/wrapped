import type { ChainId, ProviderVolumeResult, TokenRef } from "../types";

const DEXPAPRIKA_BASE_URL = "https://api.dexpaprika.com";

// Verified live 2026-08-06 against GET /networks:
//   {"display_name":"Base","id":"base",...}
//   {"display_name":"Robinhood Chain","id":"robinhood",...}
const NETWORK_SLUGS: Record<ChainId, string> = {
  base: "base",
  robinhood: "robinhood",
};

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRateLimitRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
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

interface DexPaprikaSearchPool {
  id: string;
  dex_name: string;
  chain: string;
  volume_usd: number; // confirmed live 2026-08-06: this is lifetime volume for
  // the pool, not a 24h rolling figure -- matches known 4-trade/4-day-old pool
  // total of $17.46. No OHLCV pagination needed for this endpoint.
  created_at: string;
  transactions: number;
  tokens: { id: string; symbol: string; chain: string }[];
}

interface DexPaprikaSearchResponse {
  tokens: unknown[];
  pools: DexPaprikaSearchPool[];
  dexes: unknown[];
}

// GET /search is a GLOBAL endpoint (not network-scoped), and can return pools
// across chains and unrelated tokens that happen to match the query text.
// We must explicitly filter to: right chain + pool actually contains our
// token's address. If several pools qualify, take the highest-volume one --
// this mirrors the "top pool" logic the old per-token /pools endpoint used
// to do server-side before it was removed (410).
async function resolveTopPoolViaSearch(
  network: string,
  tokenAddress: string,
): Promise<DexPaprikaSearchPool | null> {
  const url = `${DEXPAPRIKA_BASE_URL}/search?query=${tokenAddress}`;
  const res = await fetchWithRateLimitRetry(url);
  if (!res) return null;

  const data = (await res.json()) as DexPaprikaSearchResponse;
  if (!data.pools || data.pools.length === 0) return null;

  const lowerAddress = tokenAddress.toLowerCase();
  const matching = data.pools.filter(
    (p) =>
      p.chain === network &&
      p.tokens.some((t) => t.id.toLowerCase() === lowerAddress),
  );
  if (matching.length === 0) return null;

  return matching.reduce((best, p) => (p.volume_usd > best.volume_usd ? p : best), matching[0]);
}

export async function fetchDexPaprikaVolume(
  token: TokenRef,
): Promise<ProviderVolumeResult | null> {
  const network = NETWORK_SLUGS[token.chain];
  if (!network) return null;

  const pool = await resolveTopPoolViaSearch(network, token.address);
  if (!pool || pool.volume_usd <= 0) return null;

  return { source: "dexpaprika", volumeUsd: pool.volume_usd };
}
