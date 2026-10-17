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
import { bankrTokenKey, getBeneficiaryFeesBreakdown } from "./module8FeesBreakdown";
import {
  learnQuoteAddresses,
  parseAmount,
  valueLaunchedClaimable,
  valueQuoteLegs,
  type FeeEntry,
  type QuoteLegValue,
} from "./bankrFeeValuation";
import { getClankerClaimableWeth } from "./clankerFeeLocker";

const BANKR_API_BASE = "https://api.bankr.bot";
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const FETCH_TIMEOUT_MS = 25000; // WSL2 Bun cold-start cost, fine for Railway too

const VOLUME_RECHECK_MS = 15 * 60 * 1000; // 15 minutes

// Bump whenever how trading volume is computed changes, so stored results -
// including ones marked complete, which are otherwise never recomputed - get
// recomputed once under the new method.
//   1: DexScreener (24h volume) dropped from the waterfall; unpriced swaps
//      are retried instead of being silently excluded for good.
const TRADING_VOLUME_METHOD_VERSION = 1;

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

async function computeAndStoreTradingVolume(wallet: string, refs: TokenRef[]): Promise<WrappedTradingVolume> {
  const result = await getBestAvailableVolume(wallet, refs);
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
    methodVersion: TRADING_VOLUME_METHOD_VERSION,
  };
  await wrappedCacheRepository.updateTradingVolume(wallet, tradingVolume);
  return tradingVolume;
}

// Awaited (not fire-and-forget) recompute for a wallet's cached tokens, for
// callers that must act on the fresh result - wrappedNotify, after a token's
// backfill completes. Returns null if there's no cached profile, nothing to
// compute, or a computation for this wallet is already in flight (that one
// will store its own result).
async function refreshTradingVolumeNow(wallet: string): Promise<WrappedTradingVolume | null> {
  if (volumeComputationsInFlight.has(wallet)) return null;
  const cached = await wrappedCacheRepository.findByWallet(wallet);
  if (!cached) return null;
  const refs = buildVolumeTokenRefs(wallet, cached.payload.tokens);
  if (refs.length === 0) return null;

  volumeComputationsInFlight.add(wallet);
  try {
    return await computeAndStoreTradingVolume(wallet, refs);
  } finally {
    volumeComputationsInFlight.delete(wallet);
  }
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

  computeAndStoreTradingVolume(wallet, refs)
    .then((tradingVolume) => {
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

export function shouldRefreshTradingVolume(
  tv: WrappedTradingVolume | undefined,
): boolean {
  // No volume result yet: compute it.
  if (!tv || tv.status === "pending") return true;

  // Computed under an older methodology: recompute once, even if complete.
  if ((tv.methodVersion ?? 0) < TRADING_VOLUME_METHOD_VERSION) return true;

  // Complete numbers are authoritative until something explicitly
  // invalidates them. Do not repeatedly recompute them.
  if (tv.isComplete) return false;

  // Incomplete: recheck at most every VOLUME_RECHECK_MS. Rechecking on
  // EVERY request (the previous behavior) re-ran the whole per-token
  // waterfall on each page load for any wallet with a stuck token. The
  // original reason for dropping this gate - a result staying stale after
  // its backfill had completed - is now handled at the source:
  // wrappedNotify recomputes and stores the volume when a token's backfill
  // finishes.
  const ageMs = Date.now() - Date.parse(tv.updatedAt);
  return !(ageMs < VOLUME_RECHECK_MS);
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
interface IndexerEarningsResult {
  data: number;
  status: "ok" | "unavailable";
  byToken: Record<string, number>;
  incomplete: boolean;
}

async function fetchEarningsFromIndexer(
  address: string,
  bankrTokens: Promise<Set<string>>
): Promise<IndexerEarningsResult> {
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
  const breakdownPromise = getBeneficiaryFeesBreakdown(address, bankrTokens).catch((err) => {
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
    return { data: breakdown.totalEth, status: "ok", byToken: breakdown.byToken, incomplete: breakdown.incomplete };
  } catch (err) {
    console.log("[wrappedService] fetchEarningsFromIndexer: failed, err=" + String(err));
    return { data: 0, status: "unavailable", byToken: {}, incomplete: false };
  }
}

// EARNINGS_SOURCE=indexer makes the indexer's number the displayed one (and
// so the leaderboard's, which ranks by earnings.totalEth). Off by default
// until the indexer and Bankr numbers have been compared on real wallets -
// see scripts/diagnostics/compare-earnings.ts. Read per call so tests can
// toggle it.
function indexerEarningsEnabled(): boolean {
  return process.env.EARNINGS_SOURCE === "indexer";
}

// Logged, not acted on: a big gap between the two sources is worth a look,
// but the indexer is expected to read higher (Bankr's figure is WETH-only
// and limited to ?days=90), so this flags rather than vetoes.
const EARNINGS_DISAGREEMENT_RATIO = 0.2;
const EARNINGS_DISAGREEMENT_MIN_ETH = 0.01;

function warnOnEarningsDisagreement(wallet: string, bankrEth: number, indexerEth: number, incomplete: boolean): void {
  const diff = Math.abs(indexerEth - bankrEth);
  if (diff < EARNINGS_DISAGREEMENT_MIN_ETH) return;
  if (diff / Math.max(bankrEth, indexerEth) < EARNINGS_DISAGREEMENT_RATIO) return;
  console.warn(
    "[wrappedService] earnings disagreement, wallet=" + wallet +
    " bankrEth=" + bankrEth + " indexerEth=" + indexerEth + " incomplete=" + incomplete
  );
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

// handle -> Bankr account, cached in-process. Every /api/wrapped request
// resolved the handle against Bankr's search BEFORE checking the payload
// cache, so even a cache hit spent a Bankr rate-limit slot and an outbound
// round-trip (observed 2.3-6.4s). Not-found is cached briefly so a typo'd
// handle can't be used to hammer Bankr, but a new Bankr account shows up
// soon after creation.
const RESOLVE_CACHE_TTL_MS = 10 * 60 * 1000;
const RESOLVE_NOT_FOUND_TTL_MS = 2 * 60 * 1000;
const RESOLVE_CACHE_MAX_ENTRIES = 10_000;
const resolveCache = new Map<string, { match: BankrUserSearchResult | null; expiresAt: number }>();

function cacheResolved(key: string, match: BankrUserSearchResult | null): void {
  if (resolveCache.size >= RESOLVE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of resolveCache) {
      if (v.expiresAt <= now) resolveCache.delete(k);
    }
    // Still full of live entries: drop the oldest (Map keeps insertion order).
    if (resolveCache.size >= RESOLVE_CACHE_MAX_ENTRIES) {
      const oldest = resolveCache.keys().next().value;
      if (oldest !== undefined) resolveCache.delete(oldest);
    }
  }
  const ttl = match ? RESOLVE_CACHE_TTL_MS : RESOLVE_NOT_FOUND_TTL_MS;
  resolveCache.set(key, { match, expiresAt: Date.now() + ttl });
}

async function resolveWallet(handle: string): Promise<BankrUserSearchResult | null> {
  const key = handle.toLowerCase();
  const hit = resolveCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.match;

  const match = await resolveWalletFromBankr(handle);
  cacheResolved(key, match);
  return match;
}

async function resolveWalletFromBankr(handle: string): Promise<BankrUserSearchResult | null> {
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

// Bankr can list one Clanker claim on several of a wallet's Clanker
// tokens. Duplicate nonzero claimed amounts count once. Claimable isn't in
// the key any more: it comes from the chain (see fetchClankerClaimable).
function dedupeClankerClaims(tokens: FeeEntry[]): boolean[] {
  const seen = new Set<string>();
  return tokens.map((t) => {
    if (t.source !== "clanker") return true;
    if (parseAmount(t.claimed.token0) + parseAmount(t.claimed.token1) === 0) return true;
    const key = t.claimed.token0 + "|" + t.claimed.token1;
    if (seen.has(key)) {
      console.warn("[wrappedService] dedupeClankerClaims: dropping duplicate Clanker claim, key=" + key);
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Wallet-level Clanker claimable WETH, read on-chain - Bankr's figure is
// bogus (see clankerFeeLocker.ts). Skipped for wallets with no Clanker
// tokens; a failed read counts as 0 and marks earnings partial.
async function fetchClankerClaimable(
  wallet: string,
  entries: FeeEntry[]
): Promise<{ eth: number; failed: boolean }> {
  if (!entries.some((t) => t.source === "clanker")) return { eth: 0, failed: false };
  try {
    return { eth: await getClankerClaimableWeth(wallet), failed: false };
  } catch (err) {
    console.warn("[wrappedService] fetchClankerClaimable: failed, counting 0, err=" + String(err));
    return { eth: 0, failed: true };
  }
}

interface SideSummary {
  tokens: WrappedTokenEntry[];
  claimedEth: number;
  claimableEth: number;
  // Doppler WETH claims in Bankr's 90-day window - what lifetimeEarnedWeth replaces.
  dopplerWethClaimedEth: number;
  claimCount: number;
  unpriced: number;
}

// One side's (creator or Please Bro) fees in ETH. Per token: claimed in the
// last 90 days + claimable now, quote side only. Clanker tokens count their
// claims only; the wallet's on-chain Clanker claimable is added to the side
// total, and to the token itself when it's the side's only Clanker token.
function summarizeSide(
  entries: FeeEntry[],
  legs: QuoteLegValue[],
  clankerClaimableEth: number
): SideSummary {
  const keep = dedupeClankerClaims(entries);
  const clankerIdx = entries.flatMap((t, i) => (t.source === "clanker" && keep[i] ? [i] : []));
  const out: SideSummary = {
    tokens: [], claimedEth: 0, claimableEth: clankerClaimableEth, dopplerWethClaimedEth: 0, claimCount: 0, unpriced: 0,
  };
  entries.forEach((t, i) => {
    const leg = legs[i];
    if (!leg.priced) out.unpriced += 1;
    let fees = 0;
    if (keep[i]) {
      const clanker = t.source === "clanker";
      const claimable = clanker ? 0 : leg.claimableEth;
      fees = leg.claimedEth + claimable;
      if (clanker && clankerIdx.length === 1) fees += clankerClaimableEth;
      out.claimedEth += leg.claimedEth;
      out.claimableEth += claimable;
      if (!clanker && leg.isWethQuote) out.dopplerWethClaimedEth += leg.claimedEth;
      out.claimCount += t.claimed?.count ?? 0;
    }
    out.tokens.push({
      tokenAddress: t.tokenAddress,
      name: t.name,
      symbol: t.symbol,
      chain: t.chain,
      feesEarnedEth: fees,
      source: t.source,
    });
  });
  return out;
}

// The wallet's Bankr-launched tokens (creator + Please Bro sides), keyed by
// bankrTokenKey - what scopes the indexer's on-chain earnings to Bankr. Rejects
// if either Bankr call degraded: a partial list would silently drop real
// Bankr earnings, so the indexer number is reported unavailable instead.
async function bankrTokenScope(
  creator: Promise<{ data: CreatorFeesResponse; status: "ok" | "unavailable" }>,
  beneficiary: Promise<{ data: BeneficiaryFeesResponse; status: "ok" | "unavailable" }>
): Promise<Set<string>> {
  const [c, b] = await Promise.all([creator, beneficiary]);
  if (c.status !== "ok" || b.status !== "ok") {
    throw new Error("bankrTokenScope: Bankr creator/beneficiary fees unavailable, can't scope indexer earnings to Bankr launches");
  }
  const keys = new Set<string>();
  for (const t of [...c.data.tokens, ...b.data.tokens]) {
    keys.add(bankrTokenKey(t.chain, t.tokenAddress));
  }
  return keys;
}

const CLAIMABLE_PRICING_TIMEOUT_MS = 10_000;

// The indexer sees Doppler fees only when they're paid out (Release), so on
// its own it misses everything unclaimed - jessepollak read 0.00 ETH against
// 2.07 unclaimed. Adds each Doppler pool's claimable fees, both sides like
// Release, from Bankr's per-pool amounts at current prices. Clanker needs
// nothing: its StoreTokens accrual already includes unclaimed fees. A token
// on both sides counts once. Anything unpriced marks the number incomplete,
// so the EARNINGS_SOURCE switch falls back to Bankr for that wallet.
async function withDopplerClaimable(
  result: IndexerEarningsResult,
  sides: { entries: FeeEntry[]; legs: QuoteLegValue[] }[],
  ethUsd: number
): Promise<IndexerEarningsResult> {
  const seen = new Set<string>();
  const doppler: { key: string; entry: FeeEntry; leg: QuoteLegValue }[] = [];
  for (const { entries, legs } of sides) {
    entries.forEach((entry, i) => {
      if (entry.source !== "doppler") return;
      const key = bankrTokenKey(entry.chain, entry.tokenAddress);
      if (seen.has(key)) return;
      seen.add(key);
      doppler.push({ key, entry, leg: legs[i] });
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let launched: { eth: number[]; unpriced: number };
  try {
    launched = await Promise.race([
      valueLaunchedClaimable(doppler.map((d) => d.entry), ethUsd),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), CLAIMABLE_PRICING_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn("[wrappedService] withDopplerClaimable: launched-side pricing failed, err=" + String(err));
    return { ...result, incomplete: true };
  } finally {
    clearTimeout(timer);
  }

  const byToken = { ...result.byToken };
  let added = 0;
  let unpriced = launched.unpriced;
  doppler.forEach((d, i) => {
    if (!d.leg.priced) unpriced += 1;
    const eth = d.leg.claimableEth + launched.eth[i];
    if (eth > 0) {
      byToken[d.key] = (byToken[d.key] ?? 0) + eth;
      added += eth;
    }
  });
  return { ...result, data: result.data + added, byToken, incomplete: result.incomplete || unpriced > 0 };
}

function bothFeesOkFor(creator: { status: string }, beneficiary: { status: string }): boolean {
  return creator.status === "ok" && beneficiary.status === "ok";
}

async function fetchFromBankr(match: BankrUserSearchResult): Promise<WrappedPayload> {
  console.log("[wrappedService] fetchFromBankr: start, wallet=" + match.evmAddress);
  const creatorPromise = fetchCreatorFees(match.evmAddress);
  const beneficiaryPromise = fetchBeneficiaryFees(match.evmAddress);
  const [creatorResult, beneficiaryResult, ethUsd, earningsFromIndexerResult] = await Promise.all([
    creatorPromise,
    beneficiaryPromise,
    fetchEthUsdPrice(),
    fetchEarningsFromIndexer(match.evmAddress, bankrTokenScope(creatorPromise, beneficiaryPromise)),
  ]);
  console.log("[wrappedService] fetchFromBankr: all four resolved");
  const creator = creatorResult.data;
  const beneficiary = beneficiaryResult.data;

  const toUsd = (weth: number) => weth * ethUsd;

  const learned = learnQuoteAddresses(creator.tokens);
  const [creatorLegs, pleaseBroLegs, clanker] = await Promise.all([
    valueQuoteLegs(creator.tokens, learned, ethUsd),
    valueQuoteLegs(beneficiary.tokens, learned, ethUsd),
    fetchClankerClaimable(match.evmAddress, [...creator.tokens, ...beneficiary.tokens]),
  ]);
  // The locker balance is per wallet: it goes to the creator side when the
  // wallet launched Clanker tokens, else to Please Bro.
  const clankerOnCreator = creator.tokens.some((t) => t.source === "clanker");
  const c = summarizeSide(creator.tokens, creatorLegs, clankerOnCreator ? clanker.eth : 0);
  const p = summarizeSide(beneficiary.tokens, pleaseBroLegs, clankerOnCreator ? 0 : clanker.eth);
  const launchedTokens = c.tokens;
  const pleaseBroTokens = p.tokens;
  const earningsPartial = c.unpriced + p.unpriced > 0 || clanker.failed;

  // Creator side: Bankr's lifetimeEarnedWeth (lifetime Doppler WETH claims -
  // matches the daily series exactly where they overlap; excludes Clanker)
  // replaces the 90-day Doppler WETH claims. Please Bro has no lifetime
  // field, so it stays 90 days + claimable.
  const lifetimeDopplerWeth = Math.max(parseAmount(creator.lifetimeEarnedWeth), c.dopplerWethClaimedEth);
  const bankrCreatorEth = lifetimeDopplerWeth + (c.claimedEth - c.dopplerWethClaimedEth) + c.claimableEth;
  const bankrPleaseBroEth = p.claimedEth + p.claimableEth;
  const bankrTotalEth = bankrCreatorEth + bankrPleaseBroEth;

  const indexer =
    earningsFromIndexerResult.status === "ok"
      ? await withDopplerClaimable(
          earningsFromIndexerResult,
          [
            { entries: creator.tokens, legs: creatorLegs },
            { entries: beneficiary.tokens, legs: pleaseBroLegs },
          ],
          ethUsd
        )
      : earningsFromIndexerResult;
  if (indexer.status === "ok" && bothFeesOkFor(creatorResult, beneficiaryResult)) {
    warnOnEarningsDisagreement(match.evmAddress, bankrTotalEth, indexer.data, indexer.incomplete);
  }

  // Indexer-sourced: every displayed fee figure (per token, creator, Please
  // Bro, total) comes from the indexer so they add up. A token listed on
  // both sides, or twice, shows its fees on each entry but counts once.
  // Incomplete indexer numbers understate, so those fall back to Bankr.
  const useIndexer = indexerEarningsEnabled() && indexer.status === "ok" && !indexer.incomplete;
  let tokens = launchedTokens;
  let pleaseBro = pleaseBroTokens;
  let creatorEarningsEth = bankrCreatorEth;
  let pleaseBroEarningsEth = bankrPleaseBroEth;
  if (useIndexer) {
    const counted = new Set<string>();
    const side = (entries: WrappedTokenEntry[]) => {
      let sum = 0;
      const out = entries.map((t) => {
        const key = bankrTokenKey(t.chain, t.tokenAddress);
        const feesEarnedEth = indexer.byToken[key] ?? 0;
        if (!counted.has(key)) {
          counted.add(key);
          sum += feesEarnedEth;
        }
        return { ...t, feesEarnedEth };
      });
      return { out, sum };
    };
    const c = side(launchedTokens);
    const p = side(pleaseBroTokens);
    tokens = c.out;
    pleaseBro = p.out;
    creatorEarningsEth = c.sum;
    pleaseBroEarningsEth = p.sum;
  }
  const totalEth = creatorEarningsEth + pleaseBroEarningsEth;
  const unclaimedEth = c.claimableEth + p.claimableEth;

  const creatorEarnings = toUsd(creatorEarningsEth);
  const pleaseBroEarnings = toUsd(pleaseBroEarningsEth);
  const total = creatorEarnings + pleaseBroEarnings;
  const unclaimed = toUsd(unclaimedEth);

  const dailyEarnings = creator.dailyEarnings.map((d) => ({
    date: d.date,
    eth: parseAmount(d.weth),
  }));

  // Lifetime best claim day from Bankr, unless the 90-day series has a
  // bigger one (Bankr's lifetime fields occasionally lag the daily series).
  const recentBestDay = dailyEarnings.reduce(
    (best, d) => (d.eth > (best?.eth ?? 0) ? d : best),
    null as { date: string; eth: number } | null
  );
  const lifetimeBestDay = creator.lifetimeBestDay
    ? { date: creator.lifetimeBestDay.date, eth: parseAmount(creator.lifetimeBestDay.weth) }
    : null;
  const bestDay =
    lifetimeBestDay && lifetimeBestDay.eth > 0 && lifetimeBestDay.eth >= (recentBestDay?.eth ?? 0)
      ? lifetimeBestDay
      : recentBestDay;

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

  const claimCount = c.claimCount + p.claimCount;

  const bothFeesOk = bothFeesOkFor(creatorResult, beneficiaryResult);
  const allZero =
    creator.tokens.length === 0 &&
    pleaseBro.length === 0 &&
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
    tokens,
    pleaseBroTokens: pleaseBro,
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
      earningsFromIndexerIncomplete: indexer.incomplete,
      earningsPartial,
      earningsSource: useIndexer ? "indexer" : "bankr",
    },
    tradingVolume: PENDING_TRADING_VOLUME,
    earningsFromIndexer: indexer.data,
    earningsFromBankr: bankrTotalEth,
  };
}

async function attachRank(row: PersistedWrappedRow): Promise<WrappedCacheRow> {
  console.log("[wrappedService] attachRank: start, wallet=" + row.walletAddress);
  const { rank, totalUsers } = await wrappedCacheRepository.getRank(row.walletAddress);
  console.log("[wrappedService] attachRank: getRank done, rank=" + rank + " totalUsers=" + totalUsers);
  const percentile = totalUsers > 0 ? Math.ceil((rank / totalUsers) * 100) : 100;
  return { ...row, rank, totalUsers, percentile };
}

export function mergeWithCache(
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

  // Last time the displayed earnings came from the indexer, this time they
  // couldn't (indexer unavailable - which it is whenever a Bankr call
  // degraded - or incomplete). Keep the previous indexer-sourced figures
  // whole instead of flipping the wallet back to Bankr's number, or mixing
  // the two through the Bankr carry-forward above.
  if (
    indexerEarningsEnabled() &&
    fresh.meta.earningsSource !== "indexer" &&
    previous.meta.earningsSource === "indexer"
  ) {
    console.log("[wrappedService] mergeWithCache: indexer earnings not usable this fetch, keeping previous indexer-sourced earnings");
    merged.earnings = previous.earnings;
    merged.tokens = previous.tokens;
    merged.pleaseBroTokens = previous.pleaseBroTokens;
    merged.meta = { ...merged.meta, earningsSource: "indexer" };
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
  refreshTradingVolumeNow,
  fetchFromBankr,
  getWrapped,
  searchHandles,
  getLeaderboard,
};
