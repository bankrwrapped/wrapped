export type ChainId = "base" | "robinhood";

export type TokenSource = "doppler" | "clanker" | "unknown";

export interface TokenRef {
  address: string;
  chain: ChainId;
  symbol?: string;
  name?: string;
  source?: TokenSource;
  // The wallet this token lookup is being resolved on behalf of. Optional
  // because standalone test scripts (test.ts) resolve a single token with
  // no wallet context at all -- that's legitimate, not a bug. Only
  // providers/indexer.ts's completion-tracking write (item 20) actually
  // needs this; every other provider ignores it entirely.
  walletAddress?: string;
}

export type VolumeSource = "indexer" | "geckoterminal" | "dexpaprika" | "dexscreener";

export interface ProviderVolumeResult {
  source: VolumeSource;
  volumeUsd: number;
}

export interface TokenVolumeResult {
  token: TokenRef;
  volumeUsd: number | null;
  source: VolumeSource | null;
  resolved: boolean;
  cached: boolean;
}

export interface TradingVolumeSummary {
  totalVolumeUsd: number;
  tokensQueried: number;
  tokensResolved: number;
  tokensExcluded: number;
  perToken: TokenVolumeResult[];
}
