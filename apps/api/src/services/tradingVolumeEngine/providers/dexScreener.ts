import type { ProviderVolumeResult, TokenRef } from "../types";

const BASE_URL = "https://api.dexscreener.com/latest/dex/tokens";

// Known caveat, confirmed directly against a real Bankr launch (WHYNOT) in
// the prior session: DexScreener returned an empty result for a genuine,
// active token — it simply wasn't indexed. This is the last fallback in the
// waterfall precisely because it's the least reliable for new/thin tokens.
// Also, unlike the other two providers, this stays 24h-only — DexScreener's
// public API doesn't expose historical OHLCV the way GeckoTerminal/BirdEye
// do, so this is a known, accepted gap since it's a last-resort source, not
// the primary one.
export async function fetchDexScreenerVolume(
  token: TokenRef,
): Promise<ProviderVolumeResult | null> {
  const url = `${BASE_URL}/${token.address}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;

    const json = await res.json();
    const pairs = json?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    const totalVolumeUsd = pairs.reduce((sum: number, pair: any) => {
      const v = Number(pair?.volume?.h24 ?? 0);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    if (totalVolumeUsd <= 0) return null;

    return { source: "dexscreener", volumeUsd: totalVolumeUsd };
  } catch {
    return null;
  }
}
