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
  // Estimated USD trading volume for this token's pool, derived from
  // (claimable + claimed WETH-side fees) / (0.007 * beneficiary share).
  // Bankr's public API has no direct volume endpoint - this is a derived
  // approximation based on the documented 0.7% Doppler swap fee mechanic,
  // not a raw on-chain volume count.
  // ONLY computed for Doppler-source tokens. Clanker's swap fee is
  // configurable per-token at deployment (0.25%-5%, per Clanker's own
  // docs) and not exposed anywhere in this API response, so it cannot be
  // reliably derived for Clanker-source tokens (share: "creator" is a
  // role label there, not a percentage). null means "not derivable", NOT
  // "zero volume" - real earnings/claimable $ for these tokens are still
  // accurate, since those come straight from Bankr's own aggregate totals.
  volume: number | null;
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