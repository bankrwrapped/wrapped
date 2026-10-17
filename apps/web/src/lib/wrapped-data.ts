// API contract types come straight from packages/shared - the same types the
// API builds its responses from. This file used to hand-copy them, and the
// copy had already drifted (no tradingVolume, no earningsFromIndexer).
import type {
  Chain,
  FeesFetchStatus,
  WrappedCacheRow,
  WrappedPayload,
  WrappedTokenEntry,
  WrappedTradingVolume,
} from "@bankr-wrapped/shared";

export type { Chain, FeesFetchStatus };

// feesEarnedEth is raw ETH, displayed as-is. source is "doppler", "clanker"
// (v4) or "clanker_v3_1" (Bankr's 2025 Clanker launches, which Bankr's own
// list omits) - not rendered yet, available for e.g. a badge.
export type TokenEntry = WrappedTokenEntry;

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
  totalEth: number;
  // Some fees couldn't be valued and count as 0: show earnings as "at least".
  earningsPartial: boolean;
  // Earliest known Bankr launch (Clanker v3.1, 2025) when there is one.
  firstLaunch: NonNullable<WrappedPayload["summary"]["firstLaunch"]> | null;
  // "pending" = not computed yet (don't show a number); isComplete false =
  // a floor that's still being filled in ("at least").
  tradingVolume: Pick<WrappedTradingVolume, "totalVolumeUsd" | "status" | "isComplete">;
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

type ApiWrappedCacheRow = WrappedCacheRow;

// Single source for the API base - use-auth.ts imports this too. Defaults to
// "" (same origin): src/server.ts proxies /api/* and /auth/* to the Railway
// API, which keeps the session cookie first-party - required for Safari/iOS,
// which block third-party cookies. Only set VITE_API_URL to bypass the proxy
// (e.g. pointing a dev build straight at a local API).
export const API_URL = import.meta.env.VITE_API_URL ?? "";

// Starts X OAuth (apps/api authController.startXLogin). Must go through the
// same origin as API_URL so the PKCE + session cookies land first-party.
export const X_LOGIN_URL = `${API_URL}/auth/x/login`;

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

// Older cached rows hold tradingVolume as a JSON string (fixed in the API;
// repaired by schema.sql) - read either form.
function readTradingVolume(raw: unknown): WrappedProfile["tradingVolume"] {
  let tv = raw;
  if (typeof tv === "string") {
    try {
      tv = JSON.parse(tv);
    } catch {
      tv = null;
    }
  }
  const v = tv as Partial<WrappedTradingVolume> | null;
  if (!v || v.status !== "ok") return { totalVolumeUsd: 0, status: "pending", isComplete: false };
  return { totalVolumeUsd: v.totalVolumeUsd ?? 0, status: "ok", isComplete: v.isComplete === true };
}

export function mapToProfile(row: ApiWrappedCacheRow): WrappedProfile {
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
    totalEth: payload.earnings.totalEth,
    earningsPartial: payload.meta.earningsPartial === true,
    firstLaunch: payload.summary.firstLaunch ?? null,
    tradingVolume: readTradingVolume(payload.tradingVolume),
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
    return (data.results ?? []).map((s) => ({
      ...s,
      profileImageUrl: upscaleAvatar(s.profileImageUrl),
    }));
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

// Routes an external avatar through our own image-proxy so it can be
// canvas-captured (share-card download/native share) without hitting the
// browser's cross-origin canvas-tainting restriction - only needed where
// a captured image is involved, not for normal display.
export function proxiedImageUrl(url: string): string {
  // Already pointing at our proxy (relative or absolute) - don't wrap twice.
  // (A bare startsWith(API_URL) is always true once API_URL is "".)
  if (url.includes("/api/image-proxy?")) return url;
  return `${API_URL}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

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
