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

// ---- Frontend contract - imported directly by apps/web/src/lib/wrapped-data.ts ----

export interface WrappedTokenEntry {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: Chain;
  // Bankr-sourced: claimed in the last 90 days + claimable now, quote side
  // (WETH, BNKR, stock...) in ETH. The creator total also counts lifetime
  // Doppler WETH claims, so per-token figures can sum to less than it.
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
  // Which volume methodology produced this result (see
  // TRADING_VOLUME_METHOD_VERSION in apps/api wrappedService.ts). Missing on
  // results stored before versioning existed - treated as 0.
  methodVersion?: number;
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
    // The wallet's earliest known Bankr launch, when it was on Clanker v3.1
    // (2025-03-18 to about July 2025) - earlier than anything on v4 or Doppler.
    // Absent otherwise: Bankr's token list has no launch dates.
    firstLaunch?: { tokenAddress: string; name: string; symbol: string; chain: Chain; launchedAt: string };
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
    // Some fee events couldn't be attributed, resolved or priced, so the
    // indexer number understates. Missing on payloads cached before it existed.
    earningsFromIndexerIncomplete?: boolean;
    // Where `earnings` and each token's feesEarnedEth came from. "indexer"
    // only when the API runs with EARNINGS_SOURCE=indexer and the indexer
    // number is ok and complete; Bankr otherwise. Claimable, daily earnings,
    // best day, streak and claim count always come from Bankr. Missing on
    // payloads cached before it existed - those are Bankr.
    earningsSource?: "bankr" | "indexer";
    // Some fees couldn't be valued (a non-WETH quote asset with no price, or
    // the on-chain Clanker read failed) and count as 0: earnings are a floor.
    earningsPartial?: boolean;
    // Clanker wallets only: true when the indexer's Clanker ledger matched
    // the fee locker on-chain (credited - claimed = available, per fee token),
    // so Clanker earnings are the indexer's lifetime figures. false: Bankr's
    // recent claims + the on-chain unclaimed balance.
    clankerVerified?: boolean;
  };
  tradingVolume: WrappedTradingVolume;
  // On-chain earnings from the indexer (Doppler Release payouts + Clanker
  // StoreTokens accrual on the wallet's Bankr launches) plus Doppler fees still
  // unclaimed (both sides, current prices), ETH.
  // Becomes `earnings.totalEth` when meta.earningsSource is "indexer".
  earningsFromIndexer: number;
  // Bankr's own total (creator-fees + beneficiary-fees, claimed + claimable,
  // WETH), kept whichever source is displayed so the two can be compared.
  // Missing on payloads cached before it existed.
  earningsFromBankr?: number;
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
