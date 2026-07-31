export type Chain = "base" | "robinhood";

export type TokenEntry = {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: Chain;
  // Actual USD fees earned on this specific token - real for both Doppler
  // and Clanker sources, never null (see shared package doc-comment).
  feesEarned: number;
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
  creatorEarnings: number;
  pleaseBroEarnings: number;
  unclaimed: number;
  bestDay: { date: string; usd: number } | null;
  dailyEarnings: { date: string; usd: number }[];
  claimCount: number;
  longestStreakDays: number;
  // Live-computed, not cached with payload - see backend getRank().
  rank: number;
  totalUsers: number;
  percentile: number;
  creatorFeesStatus: FeesFetchStatus;
  beneficiaryFeesStatus: FeesFetchStatus;
};

// Thrown specifically when Bankr has no account for this handle at all
// (404) - distinct from other failures, so the UI can route to the
// "create an account" state instead of a generic error message.
export class WrappedNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WrappedNotFoundError";
  }
}

/** Shape returned by the API (@bankr-wrapped/shared WrappedCacheRow). */
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
    };
    claimable: { unclaimed: number };
    bestDay: { date: string; usd: number } | null;
    dailyEarnings: { date: string; usd: number }[];
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
  // Farcaster/Warpcast avatars go through Cloudflare Images with a named
  // variant as the final path segment (e.g. "/rectcrop3"). "original" is
  // confirmed as the standard full-resolution variant for this exact CF
  // Images account (imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/...) across
  // Neynar's API docs, Farcaster's own Mini Apps docs, and Farcaster's blog.
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

/** Real lookup — calls the Bankr Wrapped API. Throws on failure; caller handles it. */
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

/** Static suggestions shown on the search screen — no "trending" endpoint exists yet. */
export const SUGGESTED = ["jessepollak", "degenMaxi0"];

export type SearchSuggestion = {
  username: string;
  platform: "twitter" | "farcaster";
  profileImageUrl: string;
};

/** Live typeahead suggestions as the user types. Never throws - degrades to []. */
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

export const formatUsd = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`
      : `$${n.toFixed(0)}`;


export const formatUsdFull = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

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
  totalEarningsUsd: number;
  unclaimedUsd: number;
  updatedAt: string;
};

/** Top-20 earners. Degrades to [] on any failure - a leaderboard page
 * showing "no data" is better than a hard crash. */
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
