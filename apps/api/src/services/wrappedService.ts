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
import { getBeneficiaryFeesBreakdown } from "./module8FeesBreakdown";

const BANKR_API_BASE = "https://api.bankr.bot";
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const FETCH_TIMEOUT_MS = 25000; // WSL2 Bun cold-start cost, fine for Railway too

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

const volumeComputationsInFlight = new Set<string>();
const wrappedRequestsInFlight = new Map<string, Promise<WrappedCacheRow | null>>();

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

function shouldRefreshTradingVolume(
  tv: WrappedTradingVolume | undefined,
): boolean {
  console.log(
    "[TV DEBUG] shouldRefreshTradingVolume:",
    JSON.stringify({
      tv,
      hasTv: Boolean(tv),
      status: tv?.status,
      isComplete: tv?.isComplete,
      updatedAt: tv?.updatedAt,
    }),
  );

  // No volume result yet: compute it.
  if (!tv || tv.status === "pending") {
    console.log("[TV DEBUG] RESULT=true because missing/pending");
    return true;
  }

  // Complete numbers are authoritative until something explicitly
  // invalidates them. Do not repeatedly recompute them.
  if (tv.isComplete) {
    console.log("[TV DEBUG] RESULT=false because complete");
    return false;
  }

  // IMPORTANT:
  // An incomplete result must be re-checked on the next user request.
  // The previous 15-minute gate allowed a cold-start result to remain
  // stale even after its backfill had already completed.
  console.log(
    "[TV DEBUG] RESULT=true because volume is incomplete; rechecking",
  );

  return true;
}

// NEW — Module 8's real on-chain fee-event breakdown (indexed_fee_events,
// via getBeneficiaryFeesBreakdown). Additive alongside Bankr's own
// creator-fees/beneficiary-fees calls, not a replacement. OQ8's locked
// decision (2026-08-15): expose only the combined doppler+clanker ETH
// total as a single number, nothing per-source.
//
// Originally shipped with no status companion field (OQ8 was locked as a
// bare number) - that gap is now fixed for real: WrappedPayload carries
// meta.earningsFromIndexerStatus, same "ok"/"unavailable" pattern as
// creatorFeesStatus/beneficiaryFeesStatus, and mergeWithCache below uses
// it the same way (see the block near the other two).
//
// FIXED 2026-08-18 (session 2, prod-down bug): getBeneficiaryFeesBreakdown
// was awaited with NO timeout, unlike every sibling fetch* function in this
// file (all of which use AbortSignal.timeout(FETCH_TIMEOUT_MS)). It pages
// indexer events and does per-event USD pricing calls through a pipeline
// with known slow/edge-case behavior (see pricingService's 179-day
// GeckoTerminal fallback window). A hang anywhere in that chain hung this
// entire function forever, which hung Promise.all in fetchFromBankr, which
// hung the whole /api/wrapped/:handle endpoint with zero error and zero
// further logs - reproduced live against basedkabeer, confirmed via
// instrumented logs showing fetchEarningsFromIndexer: start with no
// matching done/failed line, while the other 3 Promise.all branches
// completed normally. Promise.race against a timer bounds this the same
// way AbortSignal bounds a fetch() - getBeneficiaryFeesBreakdown itself
// isn't cancelled (no signal threaded through its internal pipeline), it
// just stops being awaited, which is sufficient to unblock the response.
// Root cause of WHY it was slow/hanging for this wallet is still open -
// this fix addresses the symptom (endpoint returns nothing), not
// necessarily the underlying slowness inside module8FeesBreakdown.ts.
async function fetchEarningsFromIndexer(
  address: string
): Promise<{ data: number; status: "ok" | "unavailable" }> {
  console.log("[wrappedService] fetchEarningsFromIndexer: start");

  // FIXED 2026-08-18 (session 2, second crash bug): getBeneficiaryFeesBreakdown
  // is wrapped in Promise.race against a timeout below. Promise.race only
  // forwards whichever promise settles FIRST - the loser keeps running in
  // the background but is otherwise orphaned. If the loser later REJECTS
  // (a real network error, not just slowness - e.g. observed live:
  // "Unable to connect. Is the computer able to access the url?") with no
  // handler attached to that specific promise, it becomes an unhandled
  // promise rejection. Bun (like Node 15+) CRASHES THE WHOLE PROCESS on an
  // unhandled rejection by default - mid-request, before any response can
  // be written out. This is what was producing curl: (52) Empty reply from
  // server: not a hang, not idleTimeout, not Postgres - the server process
  // itself was dying intermittently, whenever the abandoned background
  // call happened to reject after the race had already settled some other
  // way. Explains why this was non-deterministic across identical-looking
  // requests. Fix: attach .catch() directly to breakdownPromise immediately,
  // independent of the race, so it can never be unhandled regardless of
  // which promise wins.
  const breakdownPromise = getBeneficiaryFeesBreakdown(address).catch((err) => {
    console.error(
      "[wrappedService] fetchEarningsFromIndexer: background breakdown rejected (may be after race already settled), err=" + String(err)
    );
    throw err;
  });

  try {
    const breakdown = await Promise.race([
      breakdownPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`fetchEarningsFromIndexer: timed out after ${FETCH_TIMEOUT_MS}ms`)),
          FETCH_TIMEOUT_MS
        )
      ),
    ]);
    console.log(
      "[wrappedService] fetchEarningsFromIndexer: done, totalEth=" + breakdown.totalEth +
      ", incomplete=" + breakdown.incomplete +
      (breakdown.incomplete ? ", reasons=" + breakdown.incompleteReasons.length : "")
    );
    // breakdown.incomplete (some pools still orphaned, or some events
    // failed pricing) is intentionally NOT treated as "unavailable" here
    // - that's a partial/best-effort real number, same category as
    // Bankr's own API returning a real but partial result. "unavailable"
    // is reserved for the whole fetch throwing outright (Envio/Postgres
    // down, timeout, etc), same meaning as fetchCreatorFees/fetchBeneficiaryFees.
    return { data: breakdown.totalEth, status: "ok" };
  } catch (err) {
    console.log("[wrappedService] fetchEarningsFromIndexer: failed, err=" + String(err));
    return { data: 0, status: "unavailable" };
  }
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
  const [creatorResult, beneficiaryResult, ethUsd, earningsFromIndexerResult] = await Promise.all([
    fetchCreatorFees(match.evmAddress),
    fetchBeneficiaryFees(match.evmAddress),
    fetchEthUsdPrice(),
    fetchEarningsFromIndexer(match.evmAddress),
  ]);
  console.log("[wrappedService] fetchFromBankr: all four resolved");
  const earningsFromIndexer = earningsFromIndexerResult.data;
  const creator = creatorResult.data;
  const beneficiary = beneficiaryResult.data;

  const toUsd = (weth: number) => weth * ethUsd;

  const creatorKeep = dedupeClankerAmounts(creator.tokens);
  const pleaseBroKeep = dedupeClankerAmounts(beneficiary.tokens);

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

  const creatorEarningsEth = creatorClaimedWeth + creatorClaimableWeth;
  const pleaseBroEarningsEth = pleaseBroClaimedWeth + pleaseBroClaimableWeth;
  const totalEth = creatorEarningsEth + pleaseBroEarningsEth;
  const unclaimedEth = creatorClaimableWeth + pleaseBroClaimableWeth;

  const creatorEarnings = toUsd(creatorEarningsEth);
  const pleaseBroEarnings = toUsd(pleaseBroEarningsEth);
  const total = creatorEarnings + pleaseBroEarnings;
  const unclaimed = toUsd(unclaimedEth);

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
      earningsFromIndexerStatus: earningsFromIndexerResult.status,
    },
    tradingVolume: PENDING_TRADING_VOLUME,
    earningsFromIndexer,
  };
}

async function attachRank(row: PersistedWrappedRow): Promise<WrappedCacheRow> {
  console.log("[wrappedService] attachRank: start, wallet=" + row.walletAddress);
  const { rank, totalUsers } = await wrappedCacheRepository.getRank(row.walletAddress);
  console.log("[wrappedService] attachRank: getRank done, rank=" + rank + " totalUsers=" + totalUsers);
  const percentile = totalUsers > 0 ? Math.ceil((rank / totalUsers) * 100) : 100;
  return { ...row, rank, totalUsers, percentile };
}

function mergeWithCache(
  fresh: WrappedPayload,
  previous: WrappedPayload | null
): WrappedPayload {
  if (!previous) return fresh;

  const merged: WrappedPayload = { ...fresh };

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

  const eitherDegraded =
    fresh.meta.creatorFeesStatus === "unavailable" || fresh.meta.beneficiaryFeesStatus === "unavailable";
  if (eitherDegraded && (previous.meta.creatorFeesStatus === "ok" && previous.meta.beneficiaryFeesStatus === "ok")) {
    merged.claimable = previous.claimable;
    merged.claimCount = previous.claimCount;
  }

  // Module 8 - same real degraded-carry-forward pattern as
  // creator/beneficiary above, now that earningsFromIndexerStatus exists.
  // No more guessing from a zero value; this is an exact status check.
  if (fresh.meta.earningsFromIndexerStatus === "unavailable" && previous.meta.earningsFromIndexerStatus === "ok") {
    console.log("[wrappedService] mergeWithCache: earnings-from-indexer degraded this fetch, keeping previous cached value");
    merged.earningsFromIndexer = previous.earningsFromIndexer;
    merged.meta = { ...merged.meta, earningsFromIndexerStatus: "ok" };
  }

  return merged;
}

async function getWrapped(handle: string): Promise<WrappedCacheRow | null> {
  const key = handle.toLowerCase();
  const existing = wrappedRequestsInFlight.get(key);
  if (existing) {
    console.log("[wrappedService] getWrapped: request already in flight for " + key + ", joining it");
    return existing;
  }

  const promise = getWrappedInner(handle).finally(() => {
    wrappedRequestsInFlight.delete(key);
  });
  wrappedRequestsInFlight.set(key, promise);
  return promise;
}

async function getWrappedInner(handle: string): Promise<WrappedCacheRow | null> {
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
    } else {
      const tv = cached.payload.tradingVolume;
      console.log(
        "[wrappedService] trading volume refresh skipped (cache-hit path): status=" + tv?.status +
        " isComplete=" + tv?.isComplete +
        " updatedAt=" + tv?.updatedAt +
        " ageMs=" + (tv?.updatedAt ? Date.now() - Date.parse(tv.updatedAt) : "n/a") +
        " thresholdMs=" + VOLUME_RECHECK_MS
      );
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
  } else {
    const tv = row.payload.tradingVolume;
    console.log(
      "[wrappedService] trading volume refresh skipped (fresh-fetch path): status=" + tv?.status +
      " isComplete=" + tv?.isComplete +
      " updatedAt=" + tv?.updatedAt +
      " ageMs=" + (tv?.updatedAt ? Date.now() - Date.parse(tv.updatedAt) : "n/a") +
      " thresholdMs=" + VOLUME_RECHECK_MS
    );
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
