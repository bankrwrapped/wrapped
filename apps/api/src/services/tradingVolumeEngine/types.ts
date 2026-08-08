export type ChainId = "base" | "robinhood";

export interface TokenRef {
  address: string;
  chain: ChainId;
  symbol?: string;
  name?: string;
}

export type VolumeSource = "geckoterminal" | "dexpaprika" | "dexscreener";

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
