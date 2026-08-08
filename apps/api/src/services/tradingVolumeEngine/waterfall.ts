import { fetchGeckoTerminalVolume } from "./providers/geckoTerminal";
import { fetchDexPaprikaVolume } from "./providers/dexPaprika";
import { fetchDexScreenerVolume } from "./providers/dexScreener";
import { getCached, setCached } from "./cache";
import type { TokenRef, TokenVolumeResult } from "./types";

// Priority order per spec: GeckoTerminal -> DexPaprika -> DexScreener.
// Not hardcoded to one — swapping/reordering providers only touches this list.
const PROVIDERS = [
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

  // No provider had this token. Per decision: this gets excluded from the
  // total, not treated as $0 — the aggregator is what enforces "excluded",
  // this just reports the honest unresolved state.
  return {
    token,
    volumeUsd: null,
    source: null,
    resolved: false,
    cached: false,
  };
}
