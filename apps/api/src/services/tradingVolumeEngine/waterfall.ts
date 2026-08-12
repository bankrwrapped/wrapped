import { fetchIndexerVolume } from "./providers/indexer";
import { fetchGeckoTerminalVolume } from "./providers/geckoTerminal";
import { fetchDexPaprikaVolume } from "./providers/dexPaprika";
import { fetchDexScreenerVolume } from "./providers/dexScreener";
import { getCached, setCached } from "./cache";
import type { TokenRef, TokenVolumeResult } from "./types";

// Module 7: the indexer is now priority-0. GeckoTerminal -> DexPaprika ->
// DexScreener remain the fallback chain for any token not yet in our own
// index (new tokens mid-backfill, or during rollout before a wallet's ever
// been indexed). Do not delete/weaken geckoTerminal.ts's throttle/retry --
// it's still load-bearing for that fallback path.
const PROVIDERS = [
  fetchIndexerVolume,
  fetchGeckoTerminalVolume,
  fetchDexPaprikaVolume,
  fetchDexScreenerVolume,
];

export async function resolveTokenVolume(
  token: TokenRef,
): Promise<TokenVolumeResult> {
  const cached = getCached(token.chain, token.address);
  if (cached) {
    return {
      token,
      volumeUsd: cached.volumeUsd,
      source: cached.source,
      resolved: true,
      cached: true,
    };
  }

  for (const provider of PROVIDERS) {
    const result = await provider(token);
    if (result) {
      setCached(token.chain, token.address, result.volumeUsd, result.source);
      return {
        token,
        volumeUsd: result.volumeUsd,
        source: result.source,
        resolved: true,
        cached: false,
      };
    }
  }

  // No provider had this token. Per decision: excluded from the total,
  // not $0 -- the aggregator enforces "excluded", this just reports the
  // honest unresolved state.
  return {
    token,
    volumeUsd: null,
    source: null,
    resolved: false,
    cached: false,
  };
}
