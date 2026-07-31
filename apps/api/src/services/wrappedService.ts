import type {
  BankrUserSearchResponse,
  BankrUserSearchResult,
  CreatorFeesResponse,
  BeneficiaryFeesResponse,
  WrappedPayload,
  WrappedCacheRow,
  WrappedTokenEntry,
} from "@bankr-wrapped/shared";
import { wrappedCacheRepository } from "../repositories/wrappedCacheRepository";
import { bankrRateLimiter } from "../utils/bankrRateLimiter";

const BANKR_API_BASE = "https://api.bankr.bot";
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const FETCH_TIMEOUT_MS = 25000; // WSL2 Bun cold-start cost, fine for Railway too

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
  // Bankr's API gives us no field to tell which is "correct". Previously
  // `exact[0]` trusted whatever order the API happened to return, which
  // risks the SAME search resolving to a DIFFERENT wallet across requests
  // if that ordering isn't stable. Sort deterministically ourselves so a
  // repeat search always lands on the same wallet, even though we still
  // can't know which duplicate is the "real" one from this data alone.
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
  await bankrRateLimiter.beforeSearch();
  const url = BANKR_API_BASE + "/users/search?query=" + encodeURIComponent(handle);
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 400) {
    // Bankr rejects malformed/oversized queries with 400 rather than an
    // empty result set. Treat it the same as "no user found" -> 404,
    // not a server error.
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
    // Bankr's dailyEarnings window defaults to 30 days if omitted (per docs) -
    // we never passed a days param at all, silently truncating the chart,
    // streak, and bestDay to a third of the 90-day max Bankr actually allows.
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

// Free, unauthenticated ETH/USD price feed - Bankr's own price data requires
// an API key + paid Club subscription, so this covers the public wrapped flow.
//
// Fragility fix: previously a single-source fetch that threw on any hiccup,
// taking down the ENTIRE /api/wrapped/:handle request even when everything
// else (fee data) succeeded. Now: try primary, fall back to a second
// independent source, and as a last resort reuse the most recent
// successfully-fetched price (in-memory, not persisted) rather than fail
// outright. Only throws if primary AND secondary fail AND no prior price
// has ever been cached in this process's lifetime (e.g. first request ever
// happens during a simultaneous outage of both sources - rare).
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
  // Bankr represents dust-level amounts as "<0.000001" - an upper bound,
  // not an exact value. The true amount could be anywhere from 0 up to
  // just under that threshold. Treating it as literally 0.000001
  // overstates near-zero balances - and since deriveVolumeWeth() divides
  // by a small share fraction, that tiny error gets amplified into a
  // real-looking dollar figure for what is actually ~$0 activity.
  // Treat as 0 instead: the safe, non-overstating choice.
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
  // Neither side is labeled WETH. Every Doppler pool observed this session
  // (Base and Robinhood alike) quotes in WETH, but that isn't guaranteed by
  // the API contract - silently returning 0 here would make real fees
  // vanish with no trace, especially for pleaseBroEarnings, which has no
  // Bankr-side aggregate to fall back on. Log loudly instead of assuming
  // this can't happen.
  console.warn(
    "[wrappedService] wethAmount: neither token0Label nor token1Label is WETH - fee amount defaulting to 0. " +
    "tokenAddress=" + (entry.tokenAddress ?? "unknown") +
    " symbol=" + (entry.symbol ?? "unknown") +
    " token0Label=" + entry.token0Label +
    " token1Label=" + entry.token1Label
  );
  return 0;
}

// Bankr's public API has no direct trading-volume endpoint. Every launch
// carries a fixed 0.7% Doppler swap fee, and each token entry tells us the
// beneficiary's exact share of that fee (e.g. "95.00%"). So pool volume can
// be derived from fees actually earned:
//   volume = feeWeth / (0.007 * share)
// This only accounts for the WETH-denominated side of fees (see wethAmount),
// which is the standard "input-side" convention most DEX UIs use for volume.
function parseShare(raw: string | undefined | null): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace("%", ""));
  return Number.isFinite(n) ? n / 100 : 0;
}

const DOPPLER_SWAP_FEE_RATE = 0.007;

function deriveVolumeWeth(feeWeth: number, shareRaw: string | undefined | null): number {
  const share = parseShare(shareRaw);
  if (share <= 0) return 0;
  return feeWeth / (DOPPLER_SWAP_FEE_RATE * share);
}

// Historical prices for the day-by-day earnings chart/bestDay/streak, so a
// fee earned 60 days ago is priced at THAT day's ETH/USD rate rather than
// today's. Falls back to the current price per-date on any miss/failure -
// this is a display-accuracy improvement, never a hard requirement.
async function fetchHistoricalEthPrices(dates: string[]): Promise<Record<string, number>> {
  if (dates.length === 0) return {};
  console.log("[wrappedService] fetchHistoricalEthPrices: start, dates=" + dates.length);
  try {
    const timestamps = dates.map((d) => Math.floor(new Date(d + "T12:00:00Z").getTime() / 1000));
    const coinsParam = JSON.stringify({ "coingecko:ethereum": timestamps });
    // searchWidth explicitly requested (24h) rather than trusting DefiLlama's
    // unstated default - our own match filter below is widened to match,
    // so we're not silently rejecting a good price because our cutoff was
    // tighter than what we actually asked the API to search.
    const res = await fetch(
      "https://coins.llama.fi/batchHistorical?coins=" + encodeURIComponent(coinsParam) + "&searchWidth=24h",
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    );
    if (!res.ok) throw new Error("batchHistorical failed: " + res.status);
    const data = (await res.json()) as {
      coins?: { "coingecko:ethereum"?: { prices?: { timestamp: number; price: number }[] } };
    };
    const prices = data.coins?.["coingecko:ethereum"]?.prices ?? [];
    const result: Record<string, number> = {};
    for (let i = 0; i < dates.length; i++) {
      const match = prices.find((p) => Math.abs(p.timestamp - timestamps[i]) < 24 * 3600);
      if (match) result[dates[i]] = match.price;
    }
    console.log("[wrappedService] fetchHistoricalEthPrices: done, resolved=" + Object.keys(result).length + "/" + dates.length);
    return result;
  } catch (err) {
    console.log("[wrappedService] fetchHistoricalEthPrices: failed entirely, falling back to current price for all dates, err=" + String(err));
    return {};
  }
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

  const launchedTokens: WrappedTokenEntry[] = creator.tokens.map((t) => {
    const feeWeth = wethAmount(t, "claimable") + wethAmount(t, "claimed");
    // Clanker's swap fee is configurable per-token and not exposed here -
    // only Doppler tokens have a real, derivable volume (see shared type doc-comment).
    const canDeriveVolume = t.source === "doppler";
    return {
      tokenAddress: t.tokenAddress,
      name: t.name,
      symbol: t.symbol,
      chain: t.chain,
      volume: canDeriveVolume ? toUsd(deriveVolumeWeth(feeWeth, t.share)) : null,
    };
  });

  const pleaseBroTokens: WrappedTokenEntry[] = beneficiary.tokens.map((t) => {
    const feeWeth = wethAmount(t, "claimable") + wethAmount(t, "claimed");
    const canDeriveVolume = t.source === "doppler";
    return {
      tokenAddress: t.tokenAddress,
      name: t.name,
      symbol: t.symbol,
      chain: t.chain,
      volume: canDeriveVolume ? toUsd(deriveVolumeWeth(feeWeth, t.share)) : null,
    };
  });

  // "Earnings" now means everything this wallet has generated as a fee
  // beneficiary - claimed AND still-claimable - not just what's been
  // withdrawn. claimableWeth is a live on-chain read per Bankr's own docs
  // (not a cached/windowed estimate), so claimed+claimable is the most
  // accurate "total value generated" figure available from this API.
  // SceneUnclaimed still shows the claimable portion separately as an
  // action item ("go get this"), it's just no longer excluded from the
  // headline earnings total.
  const creatorClaimedWeth = parseAmount(creator.totals.claimedWeth);
  const creatorClaimableWeth = parseAmount(creator.totals.claimableWeth);
  const creatorEarnings = toUsd(creatorClaimedWeth + creatorClaimableWeth);

  const pleaseBroClaimedWeth = beneficiary.tokens.reduce(
    (sum, t) => sum + wethAmount(t, "claimed"),
    0
  );
  const pleaseBroClaimableWeth = beneficiary.tokens.reduce(
    (sum, t) => sum + wethAmount(t, "claimable"),
    0
  );
  const pleaseBroEarnings = toUsd(pleaseBroClaimedWeth + pleaseBroClaimableWeth);

  const unclaimed = toUsd(creatorClaimableWeth + pleaseBroClaimableWeth);

  // Full timeline first - bestDay is derived from this SAME array below,
  // not from Bankr's own lifetimeBestDay field. Confirmed via raw API
  // inspection that lifetimeBestDay can reference a date outside the
  // dailyEarnings window we actually fetch (e.g. lifetimeDays: 1 while
  // dailyEarnings spans ~90 days) - deriving our own keeps the "best day"
  // callout consistent with the chart we render right next to it.
  //
  // Each day is priced at THAT day's ETH/USD rate, not today's - only
  // fetched for dates with nonzero earnings (a $0 day is $0 regardless
  // of price). Falls back to the current price for any date the batch
  // historical call misses or fails on entirely.
  const nonzeroDates = creator.dailyEarnings
    .filter((d) => parseAmount(d.weth) > 0)
    .map((d) => d.date);
  const historicalPrices = await fetchHistoricalEthPrices(nonzeroDates);

  const dailyEarnings = creator.dailyEarnings.map((d) => {
    const weth = parseAmount(d.weth);
    const priceForDay = historicalPrices[d.date] ?? ethUsd;
    return { date: d.date, usd: weth * priceForDay };
  });

  const bestDay = dailyEarnings.reduce(
    (best, d) => (d.usd > (best?.usd ?? 0) ? d : best),
    null as { date: string; usd: number } | null
  );

  // Longest run of consecutive calendar days with nonzero earnings. Assumes
  // dailyEarnings is ascending by date (matches every observed Bankr response).
  const longestStreakDays = (() => {
    let longest = 0;
    let current = 0;
    let prevDate = null as Date | null;
    for (const d of dailyEarnings) {
      if (d.usd <= 0) {
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

  // Creator claims only previously - Please Bro claims (beneficiary.tokens[]
  // each carry their own claimed.count) were silently excluded, undercounting
  // total claim activity now that earnings itself includes both sources.
  const pleaseBroClaimCount = beneficiary.tokens.reduce(
    (sum, t) => sum + (t.claimed?.count ?? 0),
    0
  );
  const claimCount = creator.totals.claimCount + pleaseBroClaimCount;

  const total = creatorEarnings + pleaseBroEarnings;
  const bothFeesOk =
    creatorResult.status === "ok" && beneficiaryResult.status === "ok";
  const allZero =
    creator.tokens.length === 0 &&
    pleaseBroTokens.length === 0 &&
    total === 0 &&
    unclaimed === 0;
  // Only claim "no activity" when we're confident it's actually zero - i.e.
  // everything reads zero AND both endpoints genuinely succeeded. If any
  // signal shows real activity (even with one endpoint down), or if both
  // endpoints are down and we simply don't know, default to hasActivity:
  // true rather than risk telling a real user "you have nothing".
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
      total: creatorEarnings + pleaseBroEarnings,
    },
    claimable: { unclaimed },
    bestDay,
    dailyEarnings,
    claimCount,
    longestStreakDays,
    summary: { tokensLaunched: creator.tokens.length, hasActivity },
    meta: {
      creatorFeesStatus: creatorResult.status,
      beneficiaryFeesStatus: beneficiaryResult.status,
    },
  };
}

async function attachRank(row: WrappedCacheRow): Promise<WrappedCacheRow> {
  const { rank, totalUsers } = await wrappedCacheRepository.getRank(row.walletAddress);
  const percentile = totalUsers > 0 ? Math.ceil((rank / totalUsers) * 100) : 100;
  return { ...row, rank, totalUsers, percentile };
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
    return attachRank(cached);
  }

  const payload = await fetchFromBankr(match);
  console.log("[wrappedService] upserting to db");
  const row = await wrappedCacheRepository.upsert(
    match.evmAddress,
    match.username,
    payload
  );
  console.log("[wrappedService] upsert done");
  return attachRank(row);
}

async function getLeaderboard(limit = 20) {
  return wrappedCacheRepository.getTopTraders(limit);
}

// Cheap, unauthenticated typeahead lookup - deliberately does NOT do
// wallet resolution or fee fetches, just the raw handle matches, so the
// frontend can show a live dropdown as the user types. Degrades to an
// empty array on any failure rather than throwing - it's a suggestions
// list, never worth breaking the page over.
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