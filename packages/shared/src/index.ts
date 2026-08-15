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
  // Raw WETH (claimable + claimed) attributable to this specific token, for
  // both Doppler and Clanker sources. Displayed as-is, no USD conversion -
  // decision made after a session of confusing price-conversion swings:
  // ETH is an objective fact with no pricing-methodology debate attached.
  feesEarnedEth: number;
  // Carried straight through from Bankr's raw CreatorFeeTokenEntry/
  // BeneficiaryFeeTokenEntry.source. Kept as a loose string here (matching
  // the raw API type) rather than a strict union - the Trading Volume
  // Engine's TokenRef normalizes it into a real TokenSource ("doppler" |
  // "clanker" | "unknown") at the point of use (wrappedService.
  // buildVolumeTokenRefs), not here. Added specifically to fix a real bug:
  // without this field, every token hit the indexer's cold-start path with
  // no real source, which the DB's indexed_tokens_source_check constraint
  // correctly rejects (only 'doppler'/'clanker' are valid there).
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
  // "pending" = never successfully computed yet for this wallet.
  // "ok" = at least one computation has completed and this is real data.
  status: "pending" | "ok";
  isComplete: boolean;
  tokensTotal: number;
  tokensComplete: number;
  tokensInProgress: number;
  tokensPending: number;
  tokensFailed: number;
  updatedAt: string; // ISO -- when this was last (re)computed
}

export interface WrappedPayload {
  user: WrappedUser;
  tokens: WrappedTokenEntry[]; // "launched" tokens - from creator-fees
  pleaseBroTokens: WrappedTokenEntry[]; // from beneficiary-fees
  earnings: {
    // USD fields kept INTERNAL ONLY - never displayed, used solely for
    // archetype thresholds and leaderboard ranking (explicit decision:
    // display switches fully to ETH, but ranking/archetype stay USD-based).
    creatorEarnings: number;
    pleaseBroEarnings: number;
    total: number;
    // ETH fields - what's actually shown to users.
    creatorEarningsEth: number;
    pleaseBroEarningsEth: number;
    totalEth: number;
  };
  claimable: {
    unclaimed: number; // USD, internal only (archetype thresholds)
    unclaimedEth: number; // ETH, displayed
  };
  // Best single day of creator earnings, in raw ETH. No longer priced at
  // all (previously historically-priced in USD) - since we display raw
  // ETH now, there's no conversion step, and no historical-price fetching
  // needed for this feature anymore.
  bestDay: { date: string; eth: number } | null;
  // Full day-by-day creator earnings timeline, raw ETH, ascending by date.
  dailyEarnings: { date: string; eth: number }[];
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
  // Computed out-of-band by the Trading Volume Engine (item 20,
  // getBestAvailableVolume) - NEVER computed synchronously inside a
  // request. Seeded from the previous cached value (or a "pending" stub
  // on first-ever fetch) and refreshed by a background job triggered
  // from wrappedService.getWrapped. Can legitimately be incomplete
  // (isComplete: false) - the frontend must handle that state, not
  // assume totalVolumeUsd is final.
  tradingVolume: WrappedTradingVolume;
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
  // USD kept for internal ranking use only (getTopTraders orders by this
  // column server-side) - not necessarily displayed by the frontend.
  totalEarningsUsd: number;
  unclaimedUsd: number;
  // ETH - what's actually shown on the leaderboard page.
  totalEarningsEth: number;
  unclaimedEth: number;
  updatedAt: string;
}
