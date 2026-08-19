import { fetchIndexerVolume } from "./providers/indexer";
import { fetchGeckoTerminalVolume } from "./providers/geckoTerminal";
import { fetchDexPaprikaVolume } from "./providers/dexPaprika";
import { fetchDexScreenerVolume } from "./providers/dexScreener";
import { getCached, setCached, setNotFoundCached } from "./cache";
import type {
  ProviderStopResult,
  ProviderVolumeResult,
  TokenRef,
  TokenVolumeResult,
} from "./types";

type VolumeProvider = (
  token: TokenRef,
) => Promise<ProviderVolumeResult | ProviderStopResult | null>;

// Module 7:
// The indexer is priority-0.
//
// IMPORTANT:
// If the indexer reports that a token exists but its historical backfill is
// incomplete, the waterfall MUST stop. It must not bypass our indexer with
// external providers. The token remains unresolved until the backfill is
// complete. This case is intentionally NOT negative-cached (see below) --
// it should stay cheap to recheck every run since indexer lookups are fast
// and the token can finish backfilling at any time.
//
// For tokens that do not exist in our index yet, the normal fallback chain
// remains available:
// GeckoTerminal -> DexPaprika -> DexScreener.
const PROVIDERS: VolumeProvider[] = [
  fetchIndexerVolume,
  fetchGeckoTerminalVolume,
  fetchDexPaprikaVolume,
  fetchDexScreenerVolume,
];

export async function resolveTokenVolume(
  token: TokenRef,
): Promise<TokenVolumeResult> {
  const cached = await getCached(token.chain, token.address);

  if (cached) {
    return {
      token,
      volumeUsd: cached.resolved ? cached.volumeUsd : null,
      source: cached.resolved ? (cached.source as TokenVolumeResult["source"]) : null,
      resolved: cached.resolved,
      cached: true,
    };
  }

  for (const provider of PROVIDERS) {
    const result = await provider(token);

    /*
     * IMPORTANT FIX 3:
     *
     * The indexer can explicitly stop fallback when a token is already
     * indexed but historical backfill is incomplete.
     *
     * Not negative-cached on purpose -- see comment above PROVIDERS.
     */
    if (result && "stopFallback" in result) {
      return {
        token,
        volumeUsd: null,
        source: null,
        resolved: false,
        cached: false,
      };
    }

    if (result) {
      await setCached(
        token.chain,
        token.address,
        result.volumeUsd,
        result.source,
      );

      return {
        token,
        volumeUsd: result.volumeUsd,
        source: result.source,
        resolved: true,
        cached: false,
      };
    }
  }

  /*
   * No provider had this token after the full waterfall.
   *
   * Per decision: excluded from the total, not $0.
   *
   * IMPORTANT FIX (negative cache): this is the expensive path -- every
   * provider was tried and none had the token, which is where the 3-60s
   * durations come from. Persist that outcome under a short TTL so a
   * rerun (or a restart mid-batch) doesn't re-pay the full waterfall for
   * a token that has already been confirmed to have no data anywhere.
   */
  await setNotFoundCached(token.chain, token.address);

  return {
    token,
    volumeUsd: null,
    source: null,
    resolved: false,
    cached: false,
  };
}