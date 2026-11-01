// API contract types come straight from packages/shared - the same types the
// API builds its responses from. This file used to hand-copy them, and the
// copy had already drifted (no tradingVolume, no earningsFromIndexer).
import type {
  BoardDefinition,
  BoardEntry,
  Chain,
  LeaderboardsResponse,
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
  // "pending" = not computed yet (don't show a number); "none" = never will be
  // (no Base/Robinhood launches, which is all the API counts volume for);
  // "unavailable" = gave up waiting for it. isComplete false = a floor that's
  // still being filled in ("at least").
  tradingVolume: Pick<WrappedTradingVolume, "totalVolumeUsd" | "isComplete"> & {
    status: WrappedTradingVolume["status"] | "none" | "unavailable";
  };
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
// The API only computes volume for Base and Robinhood launches
// (buildVolumeTokenRefs); without one, a "pending" result never resolves.
const VOLUME_CHAINS: ReadonlySet<string> = new Set(["base", "robinhood"]);

function readTradingVolume(raw: unknown, tokens: WrappedTokenEntry[]): WrappedProfile["tradingVolume"] {
  let tv = raw;
  if (typeof tv === "string") {
    try {
      tv = JSON.parse(tv);
    } catch {
      tv = null;
    }
  }
  const v = tv as Partial<WrappedTradingVolume> | null;
  if (!v || v.status !== "ok") {
    const counted = tokens.some((t) => VOLUME_CHAINS.has(t.chain));
    return { totalVolumeUsd: 0, status: counted ? "pending" : "none", isComplete: false };
  }
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
    tradingVolume: readTradingVolume(payload.tradingVolume, payload.tokens ?? []),
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

// Raw ETH formatting. Three decimals from 0.01 up, so figures shown side by
// side line up (0.630 next to 6.482, not 0.6300); four below that, where
// three would round small fees to 0.
export const formatEth = (n: number) => {
  if (n === 0) return "0 ETH";
  if (n < 0.0001) return "<0.0001 ETH";
  if (n < 0.01) return `${n.toFixed(4)} ETH`;
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

export type {
  BoardDefinition,
  BoardEntry,
  BoardId,
  BoardResult,
  LeaderboardsResponse,
  MonthEdition,
} from "@bankr-wrapped/shared";
export { BOARDS } from "@bankr-wrapped/shared";

// Category boards. `month` ("YYYY-MM") picks the current or previous edition
// of the monthly board; `handle` adds that handle's row and neighbors.
export async function fetchLeaderboards(opts: { month?: string; handle?: string } = {}): Promise<LeaderboardsResponse> {
  const params = new URLSearchParams();
  if (opts.month) params.set("month", opts.month);
  if (opts.handle) params.set("handle", opts.handle.replace(/^@/, ""));
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/leaderboards${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${res.status}`);
  }
  const data: LeaderboardsResponse = await res.json();
  const upscale = (e: BoardEntry | null) => (e ? { ...e, avatarUrl: upscaleAvatar(e.avatarUrl) } : null);
  return {
    ...data,
    boards: data.boards.map((b) => ({
      ...b,
      entries: b.entries.map((e) => upscale(e)!),
      personal: upscale(b.personal),
      neighbors: { above: upscale(b.neighbors.above), below: upscale(b.neighbors.below) },
    })),
  };
}

export function formatBoardScore(score: number, unit: BoardDefinition["unit"]): string {
  switch (unit) {
    case "eth":
      return formatEth(score);
    case "days":
      return `${score} ${score === 1 ? "day" : "days"}`;
    case "count":
      return String(score);
    case "percent":
      return `${Math.round(score * 100)}%`;
    case "multiple":
      return `${score.toFixed(1)}×`;
  }
}
