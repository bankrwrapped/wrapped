export type Chain = "base" | "robinhood";

export type TokenEntry = {
  tokenAddress: string;
  name: string;
  symbol: string;
  chain: Chain;
  // null means "can't be derived" (currently: Clanker-source tokens,
  // whose swap fee isn't exposed by Bankr's API) - NOT zero volume.
  volume: number | null;
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
    summary: { tokensLaunched: number; hasActivity: boolean };
    meta: {
      creatorFeesStatus: FeesFetchStatus;
      beneficiaryFeesStatus: FeesFetchStatus;
    };
  };
  updatedAt: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function mapToProfile(row: ApiWrappedCacheRow): WrappedProfile {
  const { payload } = row;
  return {
    handle: payload.user.handle,
    displayName: payload.user.displayName,
    platform: payload.user.platform,
    avatar: payload.user.avatar,
    wallet: payload.user.wallet,
    tokensLaunched: payload.summary.tokensLaunched,
    hasActivity: payload.summary.hasActivity,
    launched: payload.tokens,
    pleaseBro: payload.pleaseBroTokens,
    creatorEarnings: payload.earnings.creatorEarnings,
    pleaseBroEarnings: payload.earnings.pleaseBroEarnings,
    unclaimed: payload.claimable.unclaimed,
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
    return data.results ?? [];
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

// For volume fields that may be null (can't be derived - see TokenEntry.volume).
export const formatUsdOrUnavailable = (n: number | null) =>
  n === null ? "\u2014" : formatUsd(n);

export const formatUsdFull = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export const CHAIN_LABEL: Record<Chain, string> = {
  base: "Base",
  robinhood: "Robinhood",
};
