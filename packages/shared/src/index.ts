export type Platform = "twitter" | "farcaster";

// Confirmed via Bankr's own docs (docs.bankr.bot): launches/fees are only
// supported on Base and Robinhood Chain. No Ethereum, Polygon, Unichain,
// World Chain, Arbitrum, BNB Chain, or Solana support exists in this API.
export type Chain = "base" | "robinhood";

export interface BankrUserSearchResult {
  username: string;
  platform: Platform;
  profileImageUrl: string;
  evmAddress: string;
}

export interface BankrUserSearchResponse {
  results: BankrUserSearchResult[];
}

export interface BankrAddressResolveResponse {
  resolved: boolean;
  address: string;
  displayName: string;
}

export interface TokenAmountPair {
  token0: string;
  token1: string;
}

export interface ClaimedAmounts extends TokenAmountPair {
  count: number;
}

export interface CreatorFeeTokenEntry {
  tokenAddress: string;
  name: string;
  symbol: string;
  poolId: string;
  initializer: string;
  share: string;
  token0Label: string;
  token1Label: string;
  numeraire: string;
  tokenIsToken0: boolean;
  claimable: TokenAmountPair;
  claimed: ClaimedAmounts;
  source: string;
  chain: Chain;
  alignment: string | null;
}

export interface DailyEarning {
  date: string;
  weth: string;
}

export interface CreatorFeesResponse {
  address: string;
  chain: string;
  days: number;
  tokens: CreatorFeeTokenEntry[];
  dailyEarnings: DailyEarning[];
  lifetimeEarnedWeth: string;
  lifetimeDays: number;
  lifetimeBestDay: { date: string; weth: string } | null;
  totals: {
    claimableWeth: string;
    claimedWeth: string;
    claimCount: number;
  };
}

export interface BeneficiaryFeeTokenEntry {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: Chain;
  poolId: string;
  initializer: string;
  share: string;
  token0Label: string;
  token1Label: string;
  claimable: TokenAmountPair;
  claimed: ClaimedAmounts;
  source: string;
}

export interface BeneficiaryFeesResponse {
  address: string;
  chain: string;
  totalLaunches: number;
  poolsWithShares: number;
  tokens: BeneficiaryFeeTokenEntry[];
}

// ---- Frontend contract - must match apps/web/src/lib/wrapped-data.ts ----

export interface WrappedTokenEntry {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: Chain;
  feesEarnedEth: number;
  source: string;
}

export interface WrappedUser {
  handle: string;
  displayName: string;
  platform: "x" | "farcaster";
  avatar: string;
  wallet: string;
}

export type FeesFetchStatus = "ok" | "unavailable";

export interface WrappedTradingVolume {
  totalVolumeUsd: number;
  status: "pending" | "ok";
  isComplete: boolean;
  tokensTotal: number;
  tokensComplete: number;
  tokensInProgress: number;
  tokensPending: number;
  tokensFailed: number;
  updatedAt: string;
}

export interface WrappedPayload {
  user: WrappedUser;
  tokens: WrappedTokenEntry[];
  pleaseBroTokens: WrappedTokenEntry[];
  earnings: {
    creatorEarnings: number;
    pleaseBroEarnings: number;
    total: number;
    creatorEarningsEth: number;
    pleaseBroEarningsEth: number;
    totalEth: number;
  };
  claimable: {
    unclaimed: number;
    unclaimedEth: number;
  };
  bestDay: { date: string; eth: number } | null;
  dailyEarnings: { date: string; eth: number }[];
  claimCount: number;
  longestStreakDays: number;
  summary: {
    tokensLaunched: number;
    hasActivity: boolean;
  };
  // Distinguishes "genuinely zero" from "Bankr's endpoint failed" (or, as
  // of Module 8, the indexer failing) so the frontend can show an honest
  // error state instead of a fake empty one.
  meta: {
    creatorFeesStatus: FeesFetchStatus;
    beneficiaryFeesStatus: FeesFetchStatus;
    // Module 8 - added alongside earningsFromIndexer below. Originally
    // OQ8 locked earningsFromIndexer as a bare number with no status
    // field; that gap (no way to tell "genuinely zero" from "this
    // specific fetch failed", the exact problem creatorFeesStatus/
    // beneficiaryFeesStatus already solve for the Bankr side) is fixed
    // for real here, same pattern, not a special case.
    earningsFromIndexerStatus: FeesFetchStatus;
  };
  tradingVolume: WrappedTradingVolume;
  // Module 8's real on-chain earnings breakdown (indexed_fee_events,
  // Doppler Release + Clanker ClaimTokens/ClaimTokensPermissioned),
  // doppler+clanker summed. OQ8 FINAL, 2026-08-15: single combined ETH
  // total, no per-source split exposed. Additive alongside `earnings`
  // above, which stays sourced from Bankr's own creator-fees/
  // beneficiary-fees API - this is a separate, independently-fetched
  // number, not a replacement for or component of `earnings.totalEth`.
  earningsFromIndexer: number;
}

export interface WrappedCacheRow {
  walletAddress: string;
  username: string;
  payload: WrappedPayload;
  updatedAt: string;
  rank: number;
  totalUsers: number;
  percentile: number;
}

// ---- Marketing / partnership leaderboard ----

export interface TopTraderEntry {
  walletAddress: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  tokensLaunched: number;
  pleaseBroCount: number;
  totalEarningsUsd: number;
  unclaimedUsd: number;
  totalEarningsEth: number;
  unclaimedEth: number;
  updatedAt: string;
}
