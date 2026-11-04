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

// One wallet's fee claims per UTC day over the last 365 days (from..to,
// inclusive), every claim route included, valued in ETH when paid. `days`
// holds only days with a claim. `partial`: some claims couldn't be valued
// and count as 0.
export interface ClaimHistory {
  source: "indexer";
  from: string;
  to: string;
  days: { date: string; eth: number }[];
  claimDays: number;
  bestDay: { date: string; eth: number } | null;
  longestStreakDays: number;
  totalEth: number;
  partial: boolean;
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
  // The full year of claims from the indexer (see the API's claimHistory.ts).
  // Absent until the Base indexer has caught up, or when it's unavailable:
  // then the cards use the 90-day fields above. The leaderboards always use
  // the 90-day fields, so every wallet is ranked on the same data.
  claimHistory?: ClaimHistory;
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

// ---- Category leaderboards (GET /api/leaderboards) ----

export type BoardId =
  | "earnings"
  | "month"
  | "best_day"
  | "streak"
  | "launches"
  | "please_bro"
  | "per_launch"
  | "hit_rate"
  | "breakout";

export type BoardUnit = "eth" | "days" | "count" | "percent" | "multiple";

export interface BoardDefinition {
  id: BoardId;
  title: string;
  // One line on what the board rewards.
  description: string;
  // How the score is computed, shown verbatim under the board so nobody has
  // to guess why they rank where they do.
  formula: string;
  // Minimum to appear on the board, or null when any nonzero score counts.
  qualify: string | null;
  unit: BoardUnit;
}

// Per-token fees are Bankr's recent figures (claimed in the last 90 days +
// claimable now), so the boards built on them say so in their formula.
export const BOARDS: BoardDefinition[] = [
  {
    id: "earnings",
    title: "Top earners",
    description: "Total ETH earned from launch fees, your own launches and Please Bro.",
    formula: "Score = creator earnings + Please Bro earnings, claimed + unclaimed, in ETH",
    qualify: null,
    unit: "eth",
  },
  {
    id: "month",
    title: "This month",
    description: "ETH claimed during the current month. Resets on the 1st (UTC).",
    formula: "Score = sum of ETH claimed on each day of the month (UTC)",
    qualify: null,
    unit: "eth",
  },
  {
    id: "best_day",
    title: "Biggest single day",
    description: "Your best claim day ever.",
    formula: "Score = the most ETH claimed in one UTC day",
    qualify: null,
    unit: "eth",
  },
  {
    id: "streak",
    title: "Longest streak",
    description: "Consecutive days with a claim.",
    formula: "Score = longest run of consecutive claim days in the last 90 days",
    qualify: null,
    unit: "days",
  },
  {
    id: "launches",
    title: "Most launches",
    description: "Tokens launched through Bankr.",
    formula: "Score = tokens launched (Doppler, Clanker v3.1 and v4)",
    qualify: null,
    unit: "count",
  },
  {
    id: "please_bro",
    title: "Please Bro royalty",
    description: "Tokens other people launched with you as a fee beneficiary.",
    formula: "Score = Please Bro tokens",
    qualify: null,
    unit: "count",
  },
  {
    id: "per_launch",
    title: "Most per launch",
    description: "Quality over quantity.",
    formula: "Score = creator earnings ÷ tokens launched, in ETH",
    qualify: "At least 3 launches",
    unit: "eth",
  },
  {
    id: "hit_rate",
    title: "Hit rate",
    description: "How often a launch actually earns.",
    formula: "Score = share of your launches with at least 0.1 ETH in recent fees (claimed in the last 90 days + unclaimed)",
    qualify: "At least 5 launches",
    unit: "percent",
  },
  {
    id: "breakout",
    title: "Breakout",
    description: "One token that blew past the rest of your launches.",
    formula: "Score = your top token's recent fees ÷ the average recent fees of your other launches (at least 0.01 ETH)",
    qualify: "At least 3 launches, top token at least 0.1 ETH",
    unit: "multiple",
  },
];

export interface BoardEntry {
  rank: number;
  // Shares its score (and so its rank) with at least one other wallet.
  tied: boolean;
  score: number;
  walletAddress: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface BoardResult {
  id: BoardId;
  // Wallets that qualify for this board.
  total: number;
  entries: BoardEntry[];
  // The requested handle's row, when it qualifies; and the rows directly
  // above and below it (null at either end of the board).
  personal: BoardEntry | null;
  neighbors: { above: BoardEntry | null; below: BoardEntry | null };
}

export interface MonthEdition {
  // "YYYY-MM", UTC.
  month: string;
  // When the edition ends: the 1st of the following month, 00:00 UTC.
  closesAt: string;
  // A past month: closed to new entrants. Not a snapshot - a profile's
  // October claims indexed in November still count toward October.
  frozen: boolean;
}

export interface LeaderboardsResponse {
  // Applies to the "month" board only; every other board is all-time.
  edition: MonthEdition;
  boards: BoardResult[];
}
