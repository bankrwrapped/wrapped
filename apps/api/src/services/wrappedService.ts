import type {
  BankrUserSearchResponse,
  BankrUserSearchResult,
  CreatorFeesResponse,
  BeneficiaryFeesResponse,
  WrappedPayload,
  WrappedCacheRow,
  WrappedTokenEntry,
} from "@bankr-wrapped/shared";
import { wrappedCacheRepository, type PersistedWrappedRow } from "../repositories/wrappedCacheRepository";
import { bankrRateLimiter } from "../utils/bankrRateLimiter";
import type { WrappedTradingVolume } from "@bankr-wrapped/shared";
import { getBestAvailableVolume } from "./tradingVolumeEngine/getBestAvailableVolume";
import type { TokenRef, ChainId, TokenSource } from "./tradingVolumeEngine/types";

const BANKR_API_BASE = "https://api.bankr.bot";
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const FETCH_TIMEOUT_MS = 25000; // WSL2 Bun cold-start cost, fine for Railway too

// How stale an INCOMPLETE trading-volume result must be before we'll
// retry it. Deliberately much longer than STALE_MS (2min, for the fast
// Bankr fee data) - the volume engine is expensive (multi-minute for
// large wallets, see Module 7's measured Surplus timings) and re-firing
// it every 2 minutes for a wallet with pending tokens would waste real
// provider rate-limit budget for no benefit.
const VOLUME_RECHECK_MS = 15 * 60 * 1000; // 15 minutes

const PENDING_TRADING_VOLUME: WrappedTradingVolume = {
  totalVolumeUsd: 0,
  status: "pending",
  isComplete: false,
  tokensTotal: 0,
  tokensComplete: 0,
  tokensInProgress: 0,
  tokensPending: 0,
  tokensFailed: 0,
  updatedAt: new Date(0).toISOString(),
};

// Prevents duplicate concurrent computations for the same wallet if
// multiple requests land while a background run is still in flight.
const volumeComputationsInFlight = new Set<string>();

// Bankr's raw source field is a loose string (see CreatorFeeTokenEntry/
// BeneficiaryFeeTokenEntry). The indexer's indexed_tokens table has a real
// DB constraint accepting ONLY 'doppler'/'clanker' - confirmed live,
// 2026-08-15 (indexed_tokens_source_check). Anything else MUST normalize
// to "unknown" and must NOT be passed through as a raw string, or the
// cold-start backfill write fails with a Postgres constraint violation for
// every single token (real bug, found via live wallet test against
// basedkabeer's 53 tokens - every one hit this before this fix).
function normalizeSource(raw: string): TokenSource {
  if (raw === "doppler" || raw === "clanker") return raw;
  console.warn(
    "[wrappedService] normalizeSource: unrecognized token source \"" + raw + "\" -- treating as unknown"
  );
  return "unknown";
}

function buildVolumeTokenRefs(wallet: string, tokens: WrappedTokenEntry[]): TokenRef[] {
  const refs: TokenRef[] = [];
  for (const t of tokens) {
    // Engine only supports these two chains (see tradingVolumeEngine/types.ts).
    if (t.chain !== "base" && t.chain !== "robinhood") continue;
    refs.push({
      address: t.tokenAddress,
      chain: t.chain as ChainId,
      symbol: t.symbol,
      name: t.name,
      walletAddress: wallet,
      source: normalizeSource(t.source),
    });
  }
  return refs;
}

function triggerTradingVolumeRefresh(wallet: string, tokens: WrappedTokenEntry[]): void {
  if (volumeComputationsInFlight.has(wallet)) {
    console.log("[wrappedService] triggerTradingVolumeRefresh: already in flight for " + wallet + ", skipping");
    return;
  }
  const refs = buildVolumeTokenRefs(wallet, tokens);
  if (refs.length === 0) {
    console.log("[wrappedService] triggerTradingVolumeRefresh: no base/robinhood tokens for " + wallet + ", skipping");
    return;
  }

  volumeComputationsInFlight.add(wallet);
  console.log("[wrappedService] triggerTradingVolumeRefresh: starting background compute for " + wallet + ", " + refs.length + " token(s)");

  // Deliberately NOT awaited by the caller - this can take minutes for a
  // large wallet (measured, not assumed - see Module 7's Surplus test:
  // ~6-49s per token, serial). Blocking a live request on this would blow
  // past any reasonable HTTP timeout. Result is persisted independently
  // when it finishes; the NEXT request picks it up.
  getBestAvailableVolume(wallet, refs)
    .then(async (result) => {
      const tradingVolume: WrappedTradingVolume = {
        totalVolumeUsd: result.summary.totalVolumeUsd,
        status: "ok",
        isComplete: result.isComplete,
        tokensTotal: result.tokensTotal,
        tokensComplete: result.tokensComplete,
        tokensInProgress: result.tokensInProgress,
        tokensPending: result.tokensPending,
        tokensFailed: result.tokensFailed,
        updatedAt: new Date().toISOString(),
      };
      await wrappedCacheRepository.updateTradingVolume(wallet, tradingVolume);
      console.log(
        "[wrappedService] triggerTradingVolumeRefresh: done for " + wallet +
        ", total=$" + tradingVolume.totalVolumeUsd + ", isComplete=" + tradingVolume.isComplete
      );
    })
    .catch((err) => {
      console.error("[wrappedService] triggerTradingVolumeRefresh: failed for " + wallet, err);
    })
    .finally(() => {
      volumeComputationsInFlight.delete(wallet);
    });
}

function shouldRefreshTradingVolume(tv: WrappedTradingVolume | undefined): boolean {
  if (!tv || tv.status === "pending") return true;
  if (tv.isComplete) return false; // fully resolved, nothing to gain from recomputing
  const age = Date.now() - Date.parse(tv.updatedAt);
  return age >= VOLUME_RECHECK_MS;
}

function pickBestMatch(
  query: string,
  results: BankrUserSearchResult[]
): BankrUserSearchResult | null {
  if (results.length === 0) return null;
  const exact = results.filter(
    (r) => r.username.toLowerCase() === query.toLowerCase()
  );
  if (exact.length === 0) return results[0];
  const twitterExact = exact.find((r) => r.platform === "twitter");
  if (twitterExact) return twitterExact;
  if (exact.length === 1) return exact[0];
  // Multiple non-Twitter accounts share this exact handle (seen in practice -
  // two separate jessepollak0 Farcaster entries with different wallets) and
  // Bankr's API gives us no field to tell which is "correct". Sort
  // deterministically ourselves so a repeat search always lands on the same
  // wallet, even though we still can't know which duplicate is "real".
  console.warn(
    "[wrappedService] pickBestMatch: " + exact.length +
    " duplicate exact-match accounts for '" + query +
    "', no Twitter match to disambiguate - picking deterministically by wallet address"
  );
  const sorted = [...exact].sort((a, b) => a.evmAddress.localeCompare(b.evmAddress));
  return sorted[0];
}

async function resolveWallet(handle: string): Promise<BankrUserSearchResult | null> {
  console.log("[wrappedService] resolveWallet: start, handle=" + handle);
  const rateLimitStart = Date.now();
  await bankrRateLimiter.beforeSearch();
  console.log("[wrappedService] resolveWallet: rate-limit wait took " + (Date.now() - rateLimitStart) + "ms");
  const url = BANKR_API_BASE + "/users/search?query=" + encodeURIComponent(handle);
  const fetchStart = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  console.log("[wrappedService] resolveWallet: outbound fetch took " + (Date.now() - fetchStart) + "ms");
  if (res.status === 400) {
    console.log("[wrappedService] resolveWallet: Bankr returned 400, treating as not-found");
    return null;
  }
  if (!res.ok) throw new Error("Bankr search failed: " + res.status);
  const data = (await res.json()) as BankrUserSearchResponse;
  console.log("[wrappedService] resolveWallet: done, results=" + data.results.length);
  return pickBestMatch(handle, data.results);
}

async function fetchCreatorFees(
  address: string
): Promise<{ data: CreatorFeesResponse; status: "ok" | "unavailable" }> {
  console.log("[wrappedService] fetchCreatorFees: start");
  try {
    await bankrRateLimiter.beforeFeesCall();
    const res = await fetch(BANKR_API_BASE + "/public/doppler/creator-fees/" + address + "?days=90", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("creator-fees failed: " + res.status);
    const data = (await res.json()) as CreatorFeesResponse;
    console.log("[wrappedService] fetchCreatorFees: done");
    return { data, status: "ok" };
  } catch (err) {
    console.log("[wrappedService] fetchCreatorFees: failed, degrading to empty, err=" + String(err));
    return {
      data: {
        address,
        chain: "base",
        days: 30,
        tokens: [],
        dailyEarnings: [],
        lifetimeEarnedWeth: "0",
        lifetimeDays: 0,
        lifetimeBestDay: null,
        totals: { claimedWeth: "0", claimableWeth: "0", claimCount: 0 },
      },
      status: "unavailable",
    };
  }
}

async function fetchBeneficiaryFees(
  address: string
): Promise<{ data: BeneficiaryFeesResponse; status: "ok" | "unavailable" }> {
  console.log("[wrappedService] fetchBeneficiaryFees: start");
  try {
    await bankrRateLimiter.beforeFeesCall();
    const res = await fetch(BANKR_API_BASE + "/public/doppler/beneficiary-fees/" + address + "?days=90", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("beneficiary-fees failed: " + res.status);
    const data = (await res.json()) as BeneficiaryFeesResponse;
    console.log("[wrappedService] fetchBeneficiaryFees: done");
    return { data, status: "ok" };
  } catch (err) {
    console.log("[wrappedService] fetchBeneficiaryFees: failed, degrading to empty, err=" + String(err));
    return {
      data: {
        address,
        chain: "base",
        totalLaunches: 0,
        poolsWithShares: 0,
        tokens: [],
      },
      status: "unavailable",
    };
  }
}

// ETH/USD price - only needed now for the INTERNAL usd figures (archetype
// thresholds, leaderboard ranking). Display is pure ETH, no conversion.
let lastKnownEthUsdPrice: number | null = null;

async function fetchFromDefiLlama(): Promise<number> {
  const res = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("DefiLlama price fetch failed: " + res.status);
  const data = (await res.json()) as {
    coins?: { "coingecko:ethereum"?: { price?: number } };
  };
  const price = data.coins?.["coingecko:ethereum"]?.price;
  if (typeof price !== "number") throw new Error("unexpected DefiLlama response shape");
  return price;
}

async function fetchFromCoinbase(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("Coinbase price fetch failed: " + res.status);
  const data = (await res.json()) as { data?: { amount?: string } };
  const price = data.data?.amount ? parseFloat(data.data.amount) : NaN;
  if (!Number.isFinite(price)) throw new Error("unexpected Coinbase response shape");
  return price;
}

async function fetchEthUsdPrice(): Promise<number> {
  console.log("[wrappedService] fetchEthUsdPrice: start");
  try {
    const price = await fetchFromDefiLlama();
    lastKnownEthUsdPrice = price;
    console.log("[wrappedService] fetchEthUsdPrice: done via DefiLlama, price=" + price);
    return price;
  } catch (err) {
    console.log("[wrappedService] fetchEthUsdPrice: DefiLlama failed, trying Coinbase, err=" + String(err));
  }
  try {
    const price = await fetchFromCoinbase();
    lastKnownEthUsdPrice = price;
    console.log("[wrappedService] fetchEthUsdPrice: done via Coinbase fallback, price=" + price);
    return price;
  } catch (err) {
    console.log("[wrappedService] fetchEthUsdPrice: Coinbase also failed, err=" + String(err));
  }
  if (lastKnownEthUsdPrice !== null) {
    console.log("[wrappedService] fetchEthUsdPrice: both sources down, reusing last known price=" + lastKnownEthUsdPrice);
    return lastKnownEthUsdPrice;
  }
  throw new Error("ETH/USD price unavailable - both sources failed and no cached price exists");
}

function parseAmount(raw: string | undefined | null): number {
  if (!raw) return 0;
  if (raw.trim().startsWith("<")) return 0;
  const cleaned = raw.replace(/^[^0-9.\-]+/, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function wethAmount(
  entry: {
    tokenAddress?: string;
    symbol?: string;
    token0Label: string;
    token1Label: string;
    claimable: { token0: string; token1: string };
    claimed: { token0: string; token1: string };
  },
  field: "claimable" | "claimed"
): number {
  if (entry.token0Label === "WETH") return parseAmount(entry[field].token0);
  if (entry.token1Label === "WETH") return parseAmount(entry[field].token1);
  console.warn(
    "[wrappedService] wethAmount: neither token0Label nor token1Label is WETH - fee amount defaulting to 0. " +
    "tokenAddress=" + (entry.tokenAddress ?? "unknown") +
    " symbol=" + (entry.symbol ?? "unknown") +
    " token0Label=" + entry.token0Label +
    " token1Label=" + entry.token1Label
  );
  return 0;
}

// Bankr's Clanker-sourced token entries have been observed reporting the
// EXACT SAME claimable+claimed amounts across multiple genuinely different
// tokens for the same wallet. Doppler tokens use a clean per-pool read and
// have never shown this pattern - scoped to source === "clanker" only.
type ClankerDedupeEntry = {
  source: string;
  claimable: { token0: string; token1: string };
  claimed: { token0: string; token1: string; count: number };
};

function dedupeClankerAmounts(tokens: ClankerDedupeEntry[]): boolean[] {
  const seen = new Set<string>();
  return tokens.map((t) => {
    if (t.source !== "clanker") return true;
    const key = t.claimable.token0 + "|" + t.claimable.token1 + "|" + t.claimed.token0 + "|" + t.claimed.token1;
    if (seen.has(key)) {
      console.warn("[wrappedService] dedupeClankerAmounts: dropping duplicate Clanker fee entry, key=" + key);
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchFromBankr(match: BankrUserSearchResult): Promise<WrappedPayload> {
  console.log("[wrappedService] fetchFromBankr: start, wallet=" + match.evmAddress);
  const [creatorResult, beneficiaryResult, ethUsd] = await Promise.all([
    fetchCreatorFees(match.evmAddress),
    fetchBeneficiaryFees(match.evmAddress),
    fetchEthUsdPrice(),
  ]);
  console.log("[wrappedService] fetchFromBankr: all three resolved");
  const creator = creatorResult.data;
  const beneficiary = beneficiaryResult.data;

  const toUsd = (weth: number) => weth * ethUsd;

  const creatorKeep = dedupeClankerAmounts(creator.tokens);
  const pleaseBroKeep = dedupeClankerAmounts(beneficiary.tokens);

  // Tokens now carry raw ETH only - no per-token USD conversion needed.
  const launchedTokens: WrappedTokenEntry[] = creator.tokens.map((t, i) => {
    const feeWeth = creatorKeep[i] ? wethAmount(t, "claimable") + wethAmount(t, "claimed") : 0;
    return {
      tokenAddress: t.tokenAddress,
      name: t.name,
      symbol: t.symbol,
      chain: t.chain,
      feesEarnedEth: feeWeth,
      source: t.source,
    };
  });

  const pleaseBroTokens: WrappedTokenEntry[] = beneficiary.tokens.map((t, i) => {
    const feeWeth = pleaseBroKeep[i] ? wethAmount(t, "claimable") + wethAmount(t, "claimed") : 0;
    return {
      tokenAddress: t.tokenAddress,
      name: t.name,
      symbol: t.symbol,
      chain: t.chain,
      feesEarnedEth: feeWeth,
      source: t.source,
    };
  });

  const creatorClaimedWeth = creator.tokens.reduce(
    (sum, t, i) => sum + (creatorKeep[i] ? wethAmount(t, "claimed") : 0),
    0
  );
  const creatorClaimableWeth = creator.tokens.reduce(
    (sum, t, i) => sum + (creatorKeep[i] ? wethAmount(t, "claimable") : 0),
    0
  );

  const pleaseBroClaimedWeth = beneficiary.tokens.reduce(
    (sum, t, i) => sum + (pleaseBroKeep[i] ? wethAmount(t, "claimed") : 0),
    0
  );
  const pleaseBroClaimableWeth = beneficiary.tokens.reduce(
    (sum, t, i) => sum + (pleaseBroKeep[i] ? wethAmount(t, "claimable") : 0),
    0
  );

  // ETH totals - what's actually displayed.
  const creatorEarningsEth = creatorClaimedWeth + creatorClaimableWeth;
  const pleaseBroEarningsEth = pleaseBroClaimedWeth + pleaseBroClaimableWeth;
  const totalEth = creatorEarningsEth + pleaseBroEarningsEth;
  const unclaimedEth = creatorClaimableWeth + pleaseBroClaimableWeth;

  // USD totals - internal only, priced at today's rate (locked-in decision
  // after a session of confusing multi-day-pricing swings). Used solely for
  // archetype thresholds and leaderboard ranking, never displayed directly.
  const creatorEarnings = toUsd(creatorEarningsEth);
  const pleaseBroEarnings = toUsd(pleaseBroEarningsEth);
  const total = creatorEarnings + pleaseBroEarnings;
  const unclaimed = toUsd(unclaimedEth);

  // dailyEarnings/bestDay - now raw ETH, no price conversion at all. This
  // removes the entire historical-pricing fetch that previously ran here -
  // a genuine simplification, not just a display change.
  const dailyEarnings = creator.dailyEarnings.map((d) => ({
    date: d.date,
    eth: parseAmount(d.weth),
  }));

  const bestDay = dailyEarnings.reduce(
    (best, d) => (d.eth > (best?.eth ?? 0) ? d : best),
    null as { date: string; eth: number } | null
  );

  const longestStreakDays = (() => {
    let longest = 0;
    let current = 0;
    let prevDate = null as Date | null;
    for (const d of dailyEarnings) {
      if (d.eth <= 0) {
        current = 0;
        prevDate = null;
        continue;
      }
      const thisDate = new Date(d.date + "T00:00:00Z");
      if (prevDate) {
        const diffDays = Math.round((thisDate.getTime() - prevDate.getTime()) / 86400000);
        current = diffDays === 1 ? current + 1 : 1;
      } else {
        current = 1;
      }
      longest = Math.max(longest, current);
      prevDate = thisDate;
    }
    return longest;
  })();

  const creatorClaimCount = creator.tokens.reduce(
    (sum, t, i) => sum + (creatorKeep[i] ? (t.claimed?.count ?? 0) : 0),
    0
  );
  const pleaseBroClaimCount = beneficiary.tokens.reduce(
    (sum, t, i) => sum + (pleaseBroKeep[i] ? (t.claimed?.count ?? 0) : 0),
    0
  );
  const claimCount = creatorClaimCount + pleaseBroClaimCount;

  const bothFeesOk =
    creatorResult.status === "ok" && beneficiaryResult.status === "ok";
  const allZero =
    creator.tokens.length === 0 &&
    pleaseBroTokens.length === 0 &&
    total === 0 &&
    unclaimed === 0;
  const hasActivity = !(allZero && bothFeesOk);

  return {
    user: {
      handle: match.username,
      displayName: match.username,
      platform: match.platform === "twitter" ? "x" : "farcaster",
      avatar: match.profileImageUrl,
      wallet: match.evmAddress,
    },
    tokens: launchedTokens,
    pleaseBroTokens,
    earnings: {
      creatorEarnings,
      pleaseBroEarnings,
      total,
      creatorEarningsEth,
      pleaseBroEarningsEth,
      totalEth,
    },
    claimable: { unclaimed, unclaimedEth },
    bestDay,
    dailyEarnings,
    claimCount,
    longestStreakDays,
    summary: { tokensLaunched: creator.tokens.length, hasActivity },
    meta: {
      creatorFeesStatus: creatorResult.status,
      beneficiaryFeesStatus: beneficiaryResult.status,
    },
    // Always seeded as pending here - fetchFromBankr never computes this
    // itself (see triggerTradingVolumeRefresh). getWrapped/mergeWithCache
    // are responsible for carrying forward a real previously-computed
    // value instead of letting this stub overwrite it.
    tradingVolume: PENDING_TRADING_VOLUME,
  };
}

async function attachRank(row: PersistedWrappedRow): Promise<WrappedCacheRow> {
  const { rank, totalUsers } = await wrappedCacheRepository.getRank(row.walletAddress);
  const percentile = totalUsers > 0 ? Math.ceil((rank / totalUsers) * 100) : 100;
  return { ...row, rank, totalUsers, percentile };
}

// If a refresh partially fails (e.g. Bankr's creator-fees 500ing), the
// fresh payload comes back with that side genuinely zeroed out - correct
// for what THIS fetch got, but blindly overwriting the cache with it means
// a transient upstream failure permanently stomps last-known-good numbers
// for anyone else who searches this wallet in the following minutes.
// Confirmed happening in production (basedkabeer, 2026-08-02 22:29 UTC:
// creator-fees 500'd, card showed 0 ETH / 0 tokens launched, and that zero
// got written into our own DB). Fix: on a degraded side, keep the
// PREVIOUS cached payload's values for that side instead of the fresh
// zeroed ones, while still taking whatever DID fetch successfully.
function mergeWithCache(
  fresh: WrappedPayload,
  previous: WrappedPayload | null
): WrappedPayload {
  if (!previous) return fresh;

  const merged: WrappedPayload = { ...fresh };

  // Trading volume is computed and persisted OUT OF BAND by a background
  // job (triggerTradingVolumeRefresh), independent of this fetch/merge
  // cycle. fresh.tradingVolume is always just the PENDING_TRADING_VOLUME
  // stub (see fetchFromBankr) - it is never real data at this point.
  // Always carry the previous real value forward here, or a background
  // job's completed result would get silently overwritten by the stub
  // on the very next normal refresh.
  if (previous.tradingVolume) {
    merged.tradingVolume = previous.tradingVolume;
  }

  if (fresh.meta.creatorFeesStatus === "unavailable" && previous.meta.creatorFeesStatus === "ok") {
    console.log("[wrappedService] mergeWithCache: creator-fees degraded this fetch, keeping previous cached creator data");
    merged.tokens = previous.tokens;
    merged.dailyEarnings = previous.dailyEarnings;
    merged.bestDay = previous.bestDay;
    merged.longestStreakDays = previous.longestStreakDays;
    merged.summary = { ...fresh.summary, tokensLaunched: previous.summary.tokensLaunched };
    merged.earnings = {
      ...fresh.earnings,
      creatorEarnings: previous.earnings.creatorEarnings,
      creatorEarningsEth: previous.earnings.creatorEarningsEth,
      total: previous.earnings.creatorEarnings + fresh.earnings.pleaseBroEarnings,
      totalEth: previous.earnings.creatorEarningsEth + fresh.earnings.pleaseBroEarningsEth,
    };
    merged.meta = { ...fresh.meta, creatorFeesStatus: "ok" };
  }

  if (fresh.meta.beneficiaryFeesStatus === "unavailable" && previous.meta.beneficiaryFeesStatus === "ok") {
    console.log("[wrappedService] mergeWithCache: beneficiary-fees degraded this fetch, keeping previous cached please-bro data");
    merged.pleaseBroTokens = previous.pleaseBroTokens;
    merged.earnings = {
      ...merged.earnings,
      pleaseBroEarnings: previous.earnings.pleaseBroEarnings,
      pleaseBroEarningsEth: previous.earnings.pleaseBroEarningsEth,
      total: merged.earnings.total - fresh.earnings.pleaseBroEarnings + previous.earnings.pleaseBroEarnings,
      totalEth: merged.earnings.totalEth - fresh.earnings.pleaseBroEarningsEth + previous.earnings.pleaseBroEarningsEth,
    };
    merged.meta = { ...merged.meta, beneficiaryFeesStatus: "ok" };
  }

  // Unclaimed/claimCount are wallet-level aggregates spanning both sides -
  // if EITHER side degraded, these can't be trusted fresh either, so fall
  // back to the previous cached values in that case too.
  const eitherDegraded =
    fresh.meta.creatorFeesStatus === "unavailable" || fresh.meta.beneficiaryFeesStatus === "unavailable";
  if (eitherDegraded && (previous.meta.creatorFeesStatus === "ok" && previous.meta.beneficiaryFeesStatus === "ok")) {
    merged.claimable = previous.claimable;
    merged.claimCount = previous.claimCount;
  }

  return merged;
}

async function getWrapped(handle: string): Promise<WrappedCacheRow | null> {
  const match = await resolveWallet(handle);
  if (!match) return null;

  console.log("[wrappedService] checking cache for " + match.evmAddress);
  const cached = await wrappedCacheRepository.findByWallet(match.evmAddress);
  console.log("[wrappedService] cache check done, hit=" + Boolean(cached));
  const now = Date.now();
  if (cached && now - Date.parse(cached.updatedAt) < STALE_MS) {
    console.log("[wrappedService] serving from cache, no Bankr refetch");
    if (shouldRefreshTradingVolume(cached.payload.tradingVolume)) {
      triggerTradingVolumeRefresh(match.evmAddress, cached.payload.tokens);
    }
    return attachRank(cached);
  }

  const fetched = await fetchFromBankr(match);
  const payload = mergeWithCache(fetched, cached?.payload ?? null);
  console.log("[wrappedService] upserting to db");
  const row = await wrappedCacheRepository.upsert(
    match.evmAddress,
    match.username,
    payload
  );
  console.log("[wrappedService] upsert done");

  if (shouldRefreshTradingVolume(row.payload.tradingVolume)) {
    triggerTradingVolumeRefresh(match.evmAddress, row.payload.tokens);
  }

  return attachRank(row);
}

async function getLeaderboard(limit = 20) {
  return wrappedCacheRepository.getTopTraders(limit);
}

async function searchHandles(query: string): Promise<BankrUserSearchResult[]> {
  console.log("[wrappedService] searchHandles: start, query=" + query);
  try {
    await bankrRateLimiter.beforeSearch();
    const url = BANKR_API_BASE + "/users/search?query=" + encodeURIComponent(query);
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.log("[wrappedService] searchHandles: non-ok status " + res.status + ", returning empty");
      return [];
    }
    const data = (await res.json()) as BankrUserSearchResponse;
    console.log("[wrappedService] searchHandles: done, results=" + data.results.length);
    return data.results;
  } catch (err) {
    console.log("[wrappedService] searchHandles: failed, returning empty, err=" + String(err));
    return [];
  }
}

export const wrappedService = {
  resolveWallet,
  fetchFromBankr,
  getWrapped,
  searchHandles,
  getLeaderboard,
};
