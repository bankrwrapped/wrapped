export type Chain = "base" | "robinhood";

export type TokenEntry = {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: Chain;
  // Raw ETH earned on this token - no USD conversion, displayed as-is.
  feesEarnedEth: number;
};

export type FeesFetchStatus = "ok" | "unavailable";

export type WrappedProfile = {
  handle: string;
  displayName: string;
  platform: "x" | "farcaster";
  avatar: string;
  wallet: string;
  tokensLaunched: number;
  hasActivity: boolean;
  launched: TokenEntry[];
  pleaseBro: TokenEntry[];
  // USD fields: internal only, used by archetype.ts thresholds - never displayed.
  creatorEarnings: number;
  pleaseBroEarnings: number;
  unclaimed: number;
  // ETH fields: what's actually shown.
  creatorEarningsEth: number;
  pleaseBroEarningsEth: number;
  unclaimedEth: number;
  bestDay: { date: string; eth: number } | null;
  dailyEarnings: { date: string; eth: number }[];
  claimCount: number;
  longestStreakDays: number;
  rank: number;
  totalUsers: number;
  percentile: number;
  creatorFeesStatus: FeesFetchStatus;
  beneficiaryFeesStatus: FeesFetchStatus;
};

export class WrappedNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WrappedNotFoundError";
  }
}

type ApiWrappedCacheRow = {
  walletAddress: string;
  username: string;
  payload: {
    user: {
      handle: string;
      displayName: string;
      platform: "x" | "farcaster";
      avatar: string;
      wallet: string;
    };
    tokens: TokenEntry[];
    pleaseBroTokens: TokenEntry[];
    earnings: {
      creatorEarnings: number;
      pleaseBroEarnings: number;
      total: number;
      creatorEarningsEth: number;
      pleaseBroEarningsEth: number;
      totalEth: number;
    };
    claimable: { unclaimed: number; unclaimedEth: number };
    bestDay: { date: string; eth: number } | null;
    dailyEarnings: { date: string; eth: number }[];
    claimCount: number;
    longestStreakDays: number;
    summary: { tokensLaunched: number; hasActivity: boolean };
    meta: {
      creatorFeesStatus: FeesFetchStatus;
      beneficiaryFeesStatus: FeesFetchStatus;
    };
  };
  updatedAt: string;
  rank: number;
  totalUsers: number;
  percentile: number;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function upscaleAvatar(url: string): string {
  if (url.includes("pbs.twimg.com") && url.includes("_normal.")) {
    return url.replace("_normal.", "_400x400.");
  }
  if (url.includes("imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/")) {
    const lastSlash = url.lastIndexOf("/");
    return url.slice(0, lastSlash + 1) + "original";
  }
  return url;
}

function mapToProfile(row: ApiWrappedCacheRow): WrappedProfile {
  const { payload } = row;
  return {
    handle: payload.user.handle,
    displayName: payload.user.displayName,
    platform: payload.user.platform,
    avatar: upscaleAvatar(payload.user.avatar),
    wallet: payload.user.wallet,
    tokensLaunched: payload.summary.tokensLaunched,
    hasActivity: payload.summary.hasActivity,
    launched: payload.tokens,
    pleaseBro: payload.pleaseBroTokens,
    creatorEarnings: payload.earnings.creatorEarnings,
    pleaseBroEarnings: payload.earnings.pleaseBroEarnings,
    unclaimed: payload.claimable.unclaimed,
    creatorEarningsEth: payload.earnings.creatorEarningsEth,
    pleaseBroEarningsEth: payload.earnings.pleaseBroEarningsEth,
    unclaimedEth: payload.claimable.unclaimedEth,
    bestDay: payload.bestDay,
    dailyEarnings: payload.dailyEarnings,
    claimCount: payload.claimCount,
    longestStreakDays: payload.longestStreakDays,
    rank: row.rank,
    totalUsers: row.totalUsers,
    percentile: row.percentile,
    creatorFeesStatus: payload.meta.creatorFeesStatus,
    beneficiaryFeesStatus: payload.meta.beneficiaryFeesStatus,
  };
}

export async function lookupWrapped(rawHandle: string): Promise<WrappedProfile> {
  const handle = rawHandle.trim().replace(/^@/, "").toLowerCase();
  if (!handle) throw new Error("Handle is required");

  const res = await fetch(`${API_URL}/api/wrapped/${encodeURIComponent(handle)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error ?? `Request failed with status ${res.status}`;
    if (res.status === 404) {
      throw new WrappedNotFoundError(message);
    }
    throw new Error(message);
  }

  const row: ApiWrappedCacheRow = await res.json();
  return mapToProfile(row);
}

export const SUGGESTED = ["jessepollak", "degenMaxi0"];

export type SearchSuggestion = {
  username: string;
  platform: "twitter" | "farcaster";
  profileImageUrl: string;
};

export async function searchHandles(query: string): Promise<SearchSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const res = await fetch(`${API_URL}/api/search?query=${encodeURIComponent(trimmed)}`);
    if (!res.ok) return [];
    const data: { results: SearchSuggestion[] } = await res.json();
    return (data.results ?? []).map((s) => ({ ...s, profileImageUrl: upscaleAvatar(s.profileImageUrl) }));
  } catch {
    return [];
  }
}

// Raw ETH formatting - adaptive precision since amounts are typically small
// decimals. No USD conversion, no pricing methodology, just the real number.
export const formatEth = (n: number) => {
  if (n === 0) return "0 ETH";
  if (n < 0.0001) return "<0.0001 ETH";
  if (n < 1) return `${n.toFixed(4)} ETH`;
  return `${n.toFixed(3)} ETH`;
};

export const CHAIN_LABEL: Record<Chain, string> = {
  base: "Base",
  robinhood: "Robinhood",
};

export type LeaderboardEntry = {
  walletAddress: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  tokensLaunched: number;
  pleaseBroCount: number;
  totalEarningsEth: number;
  unclaimedEth: number;
  updatedAt: string;
};

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard`);
    if (!res.ok) return [];
    const data: { entries: LeaderboardEntry[] } = await res.json();
    return (data.entries ?? []).map((e) => ({ ...e, avatarUrl: upscaleAvatar(e.avatarUrl) }));
  } catch {
    return [];
  }
}
