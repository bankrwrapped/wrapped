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
  // NOTE: this top-level field is unreliable - observed as "base" even when
  // every token inside was actually "robinhood". Always read chain from each
  // individual token entry, never from here.
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
  // Same caveat as CreatorFeesResponse.chain - ignore, use per-token chain.
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
  // Actual USD fees (claimable + claimed) attributable to this specific
  // token, for both Doppler and Clanker sources - unlike the old derived
  // "volume" estimate, this is real and never null, since fee amounts
  // come straight from Bankr's own claimable/claimed data regardless of
  // source. Trading volume itself still isn't derivable for Clanker
  // tokens (their swap fee rate isn't exposed), so this represents
  // earnings, not volume.
  feesEarned: number;
}

export interface WrappedUser {
  handle: string;
  displayName: string;
  platform: "x" | "farcaster";
  avatar: string;
  wallet: string;
}

export type FeesFetchStatus = "ok" | "unavailable";

export interface WrappedPayload {
  user: WrappedUser;
  tokens: WrappedTokenEntry[]; // "launched" tokens - from creator-fees
  pleaseBroTokens: WrappedTokenEntry[]; // from beneficiary-fees
  earnings: {
    creatorEarnings: number;
    pleaseBroEarnings: number;
    total: number;
  };
  claimable: { unclaimed: number };
  // Best single day of creator earnings, converted to USD. null if Bankr
  // never reported one (e.g. no earnings history at all).
  bestDay: { date: string; usd: number } | null;
  // Full day-by-day creator earnings timeline (USD), ascending by date, as
  // returned by Bankr's dailyEarnings window - already fetched for bestDay,
  // previously discarded.
  dailyEarnings: { date: string; usd: number }[];
  // Total number of times this wallet has claimed creator fees (lifetime).
  claimCount: number;
  // Longest run of consecutive calendar days with nonzero creator earnings.
  longestStreakDays: number;
  summary: {
    tokensLaunched: number;
    // False only when every activity signal is genuinely zero AND both fee
    // endpoints returned "ok" - a Bankr outage must never be mistaken for
    // "this user has no activity" (see meta.*FeesStatus).
    hasActivity: boolean;
  };
  // Distinguishes "genuinely zero" from "Bankr's endpoint failed" so the
  // frontend can show an honest error state instead of a fake empty one.
  meta: {
    creatorFeesStatus: FeesFetchStatus;
    beneficiaryFeesStatus: FeesFetchStatus;
  };
}

export interface WrappedCacheRow {
  walletAddress: string;
  username: string;
  payload: WrappedPayload;
  updatedAt: string;
  // Computed live on every request (not persisted) - a user's rank shifts
  // as other users get wrapped, so caching it alongside payload would go stale.
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
  updatedAt: string;
}