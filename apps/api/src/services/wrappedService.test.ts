// wrappedService: volume recheck gate + method versioning, handle -> wallet
// cache, the Bankr token scope handed to the on-chain breakdown, how Bankr's
// fee data is valued (quote side in ETH, lifetime claims, on-chain Clanker
// claimable), and the EARNINGS_SOURCE switch between Bankr's and the
// indexer's numbers.
import "../test/setupEnv";
import { test, expect, mock, beforeEach, afterAll } from "bun:test";

let capturedScope: Promise<Set<string>> | null = null;
const breakdown = (totalEth: number, byToken: Record<string, number> = {}, incomplete = false, clankerIncomplete = false) => ({
  totalEth, byToken, incomplete, incompleteReasons: [] as string[],
  bySource: { doppler: { incomplete: false }, clanker: { incomplete: clankerIncomplete } },
});
let indexerBreakdown = breakdown(0.25);
mock.module("./module8FeesBreakdown", () => ({
  bankrTokenKey: (chain: string, token: string) => `${chain}:${token.toLowerCase()}`,
  getBeneficiaryFeesBreakdown: async (_addr: string, scope: Promise<Set<string>>) => {
    capturedScope = scope;
    await scope; // rejects -> breakdown rejects, like the real one
    return indexerBreakdown;
  },
}));
mock.module("./indexerSync/envioClient", () => ({ fetchWatchedPool: async () => null }));
// Clanker ledger (tested in clankerLedger.test.ts): what the chain and the
// indexer say about the wallet's Clanker fees.
let ledgerCalls = 0;
let clankerLedger: { claimableEth: number; claimableUnpriced: number; check: { reconciled: boolean } | null } = {
  claimableEth: 0, claimableUnpriced: 0, check: null,
};
mock.module("./clankerLedger", () => ({
  getClankerLedger: async () => { ledgerCalls += 1; return clankerLedger; },
}));
mock.module("./tradingVolumeEngine/getBestAvailableVolume", () => ({ getBestAvailableVolume: async () => ({}) }));
mock.module("../utils/bankrRateLimiter", () => ({
  bankrRateLimiter: { beforeSearch: async () => {}, beforeFeesCall: async () => {} },
}));
mock.module("../repositories/wrappedCacheRepository", () => ({ wrappedCacheRepository: {} }));

const BNKR = "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b";

const entry = (over: Record<string, unknown>) => ({
  tokenAddress: "0xAAA", name: "A", symbol: "A", chain: "base", source: "doppler", poolId: "0xpool",
  token0Label: "WETH", token1Label: "A", claimable: { token0: "0", token1: "0" }, claimed: { token0: "0", token1: "0", count: 0 },
  ...over,
});

// Default wallet: 0.05 claimed + 0.05 claimable WETH on 0xAAA (creator), nothing on 0xBBB (Please Bro).
let creatorTokens: any[] = [];
let beneficiaryTokens: any[] = [];
let creatorExtra: Record<string, unknown> = {};
let geckoPrices: Record<string, string> = {};
let searchCalls = 0;
let searchStatus = 200;
let creatorStatus = 200;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes("/users/search")) {
    searchCalls += 1;
    if (searchStatus !== 200) return new Response(null, { status: searchStatus });
    const q = new URL(url).searchParams.get("query")!;
    return Response.json({ results: [{ username: q, platform: "twitter", profileImageUrl: "", evmAddress: "0xW" }] });
  }
  if (url.includes("creator-fees")) {
    if (creatorStatus !== 200) return new Response(null, { status: creatorStatus });
    return Response.json({ tokens: creatorTokens, dailyEarnings: [], totals: {}, lifetimeEarnedWeth: "0", lifetimeBestDay: null, ...creatorExtra });
  }
  if (url.includes("beneficiary-fees")) return Response.json({ tokens: beneficiaryTokens });
  if (url.includes("coingecko:ethereum")) return Response.json({ coins: { "coingecko:ethereum": { price: 2000 } } });
  if (url.includes("llama")) return Response.json({ coins: {} });
  if (url.includes("geckoterminal")) {
    const asked = url.split("/token_price/")[1].split(",");
    const token_prices = Object.fromEntries(asked.filter((a) => a in geckoPrices).map((a) => [a, geckoPrices[a]]));
    return Response.json({ data: { attributes: { token_prices } } });
  }
  throw new Error("unexpected fetch " + url);
}) as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const { shouldRefreshTradingVolume, mergeWithCache, wrappedService } = await import("./wrappedService");
const { clearCurrentPriceCache } = await import("./currentPrices");

beforeEach(() => {
  searchCalls = 0; searchStatus = 200; creatorStatus = 200; capturedScope = null; ledgerCalls = 0;
  indexerBreakdown = breakdown(0.25);
  clankerLedger = { claimableEth: 0, claimableUnpriced: 0, check: null };
  creatorTokens = [entry({ claimable: { token0: "0.05", token1: "0" }, claimed: { token0: "0.05", token1: "0", count: 1 } })];
  beneficiaryTokens = [entry({ tokenAddress: "0xBBB", name: "B", symbol: "B", chain: "robinhood", token1Label: "B" })];
  creatorExtra = {};
  geckoPrices = {};
  clearCurrentPriceCache();
  delete process.env.EARNINGS_SOURCE;
});

const tv = (over: Record<string, unknown>) => ({
  totalVolumeUsd: 1, status: "ok" as const, isComplete: false, tokensTotal: 1, tokensComplete: 0,
  tokensInProgress: 1, tokensPending: 0, tokensFailed: 0, updatedAt: new Date().toISOString(), methodVersion: 1,
  ...over,
});

test("volume refresh rule", () => {
  expect(shouldRefreshTradingVolume(undefined)).toBe(true);
  expect(shouldRefreshTradingVolume(tv({ status: "pending" }))).toBe(true);
  expect(shouldRefreshTradingVolume(tv({ isComplete: true }))).toBe(false);
  // Complete but computed under the old method (with DexScreener): recompute once.
  expect(shouldRefreshTradingVolume(tv({ isComplete: true, methodVersion: undefined }))).toBe(true);
  // Incomplete: gated to once per 15 min instead of every request.
  expect(shouldRefreshTradingVolume(tv({}))).toBe(false);
  expect(shouldRefreshTradingVolume(tv({ updatedAt: new Date(Date.now() - 16 * 60_000).toISOString() }))).toBe(true);
});

test("handle -> wallet is cached (case-insensitive) instead of hitting Bankr every request", async () => {
  const a = await wrappedService.resolveWallet("CacheMe");
  const b = await wrappedService.resolveWallet("cacheme");
  expect(a?.evmAddress).toBe("0xW");
  expect(b?.evmAddress).toBe("0xW");
  expect(searchCalls).toBe(1);
});

test("not-found handles are cached too", async () => {
  searchStatus = 400;
  expect(await wrappedService.resolveWallet("nobody-here")).toBeNull();
  expect(await wrappedService.resolveWallet("nobody-here")).toBeNull();
  expect(searchCalls).toBe(1);
});

const match = { username: "alice", platform: "twitter" as const, profileImageUrl: "", evmAddress: "0xW" };

// ---- Bankr fee valuation ----

test("BNKR-quoted fees are valued in ETH instead of counted as 0", async () => {
  creatorTokens = [entry({
    symbol: "GAMAL", token0Label: "BNKR", token1Label: "GAMAL", tokenIsToken0: false, numeraire: BNKR,
    claimed: { token0: "1000000", token1: "5", count: 1 }, claimable: { token0: "1000000", token1: "5" },
  })];
  geckoPrices = { [BNKR]: "0.0002" }; // 1M BNKR = $200 = 0.1 ETH at $2000
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.tokens[0].feesEarnedEth).toBeCloseTo(0.2, 10);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.2, 10);
  expect(p.claimable.unclaimedEth).toBeCloseTo(0.1, 10);
  expect(p.meta.earningsPartial).toBe(false);
});

test("a Please Bro entry's quote asset resolves from its label; an unpriced one marks earnings partial", async () => {
  beneficiaryTokens = [
    entry({ tokenAddress: "0xC", symbol: "C", token0Label: "BNKR", token1Label: "C", claimable: { token0: "500000", token1: "0" } }),
    entry({ tokenAddress: "0xD", symbol: "D", token0Label: "MYSTERY", token1Label: "D", claimable: { token0: "7", token1: "0" } }),
  ];
  geckoPrices = { [BNKR]: "0.0002" };
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.pleaseBroTokens[0].feesEarnedEth).toBeCloseTo(0.05, 10);
  expect(p.pleaseBroTokens[1].feesEarnedEth).toBe(0); // no address or price for MYSTERY
  expect(p.meta.earningsPartial).toBe(true);
});

const clank = (addr: string, claimed = "0") => entry({
  tokenAddress: addr, symbol: "K", source: "clanker", token0Label: "WETH", token1Label: "K",
  claimable: { token0: "0.067726", token1: "0" }, claimed: { token0: claimed, token1: "0", count: claimed === "0" ? 0 : 1 },
});

test("Clanker, not verified: Bankr's claimable is ignored; recent claims + on-chain unclaimed, once per wallet", async () => {
  creatorTokens = [clank("0xK1", "0.01"), clank("0xK2", "0.01"), clank("0xK3")];
  clankerLedger = { claimableEth: 0.003, claimableUnpriced: 0, check: { reconciled: false } };
  const p = await wrappedService.fetchFromBankr(match);
  expect(ledgerCalls).toBe(1);
  // 0.01 claimed (the second identical claim is a duplicate) + 0.003 on-chain.
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.013, 10);
  expect(p.claimable.unclaimedEth).toBeCloseTo(0.003, 10);
  expect(p.tokens.map((t) => t.feesEarnedEth)).toEqual([0.01, 0, 0]); // several Clanker tokens: the balance isn't attributed
  expect(p.meta.clankerVerified).toBe(false);
  expect(p.meta.earningsFromIndexerIncomplete).toBe(true); // can't trust the indexer's Clanker part either
});

test("Clanker, verified: each launch shows its lifetime credits from the indexer (unclaimed included)", async () => {
  creatorTokens = [clank("0xK1", "0.01"), clank("0xK2")];
  indexerBreakdown = breakdown(0.5, { "base:0xk1": 0.4, "base:0xk2": 0.1 });
  clankerLedger = { claimableEth: 0.05, claimableUnpriced: 0, check: { reconciled: true } };
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.meta.clankerVerified).toBe(true);
  expect(p.tokens.map((t) => t.feesEarnedEth)).toEqual([0.4, 0.1]);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.5, 10); // not 0.5 + 0.05: credits already include unclaimed
  expect(p.claimable.unclaimedEth).toBeCloseTo(0.05, 10);
  expect(p.meta.earningsFromIndexerIncomplete).toBe(false);
});

test("Clanker: reconciled but some credits unattributed -> not verified", async () => {
  creatorTokens = [clank("0xK1", "0.01")];
  indexerBreakdown = breakdown(0.4, { "base:0xk1": 0.4 }, true, true);
  clankerLedger = { claimableEth: 0.05, claimableUnpriced: 0, check: { reconciled: true } };
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.meta.clankerVerified).toBe(false);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.06, 10); // fallback: claim + on-chain unclaimed
});

test("no Clanker tokens -> no Clanker ledger read", async () => {
  const p = await wrappedService.fetchFromBankr(match);
  expect(ledgerCalls).toBe(0);
  expect(p.meta.clankerVerified).toBeUndefined();
});

test("creator total uses lifetime Doppler WETH claims; best day uses the lifetime best", async () => {
  creatorExtra = {
    lifetimeEarnedWeth: "2.5", // includes the 0.05 claimed in the window
    lifetimeBestDay: { date: "2026-05-18", weth: "1.2" },
    dailyEarnings: [{ date: "2026-09-01", weth: "0.05" }],
  };
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(2.55, 10); // 2.5 lifetime + 0.05 claimable
  expect(p.tokens[0].feesEarnedEth).toBeCloseTo(0.1, 10); // per token stays 90 days + claimable
  expect(p.bestDay).toEqual({ date: "2026-05-18", eth: 1.2 });
});

test("a lagging lifetime figure never undercuts the 90-day data", async () => {
  creatorExtra = {
    lifetimeEarnedWeth: "0",
    lifetimeBestDay: null,
    dailyEarnings: [{ date: "2026-09-01", weth: "0.05" }],
  };
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.1, 10);
  expect(p.bestDay).toEqual({ date: "2026-09-01", eth: 0.05 });
});

// ---- indexer number and the EARNINGS_SOURCE switch ----

test("indexer earnings are scoped to the wallet's Bankr tokens (creator + Please Bro, per chain)", async () => {
  const payload = await wrappedService.fetchFromBankr(match);
  expect(await capturedScope!).toEqual(new Set(["base:0xaaa", "robinhood:0xbbb"]));
  expect(payload.meta.earningsFromIndexerStatus).toBe("ok");
  // 0.25 paid out + 0.05 still claimable on 0xAAA.
  expect(payload.earningsFromIndexer).toBeCloseTo(0.3, 10);
});

test("indexer number adds Doppler claimable on BOTH sides, at current prices", async () => {
  creatorTokens = [entry({ claimable: { token0: "0.05", token1: "1000" } })];
  geckoPrices = { "0xaaa": "0.2" }; // 1000 A = $200 = 0.1 ETH
  indexerBreakdown = breakdown(0.25, { "base:0xaaa": 0.25 });
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.earningsFromIndexer).toBeCloseTo(0.4, 10);
  expect(p.meta.earningsFromIndexerIncomplete).toBe(false);

  geckoPrices = {};
  clearCurrentPriceCache();
  const unpriced = await wrappedService.fetchFromBankr(match);
  expect(unpriced.meta.earningsFromIndexerIncomplete).toBe(true);
});

test("Bankr fees unavailable -> indexer earnings reported unavailable, not unscoped", async () => {
  creatorStatus = 500;
  const payload = await wrappedService.fetchFromBankr(match);
  expect(payload.meta.creatorFeesStatus).toBe("unavailable");
  expect(payload.meta.earningsFromIndexerStatus).toBe("unavailable");
  expect(payload.earningsFromIndexer).toBe(0);
});

// Indexer payouts per token; the 0.05 still claimable on 0xAAA is added on top.
const indexerSays = (byToken: Record<string, number>, incomplete = false) => {
  const totalEth = Object.values(byToken).reduce((a, b) => a + b, 0);
  indexerBreakdown = breakdown(totalEth, byToken, incomplete);
};

test("switch off: earnings stay Bankr's, both totals are kept", async () => {
  indexerSays({ "base:0xaaa": 0.3, "robinhood:0xbbb": 0.2 });
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.meta.earningsSource).toBe("bankr");
  expect(p.earnings.totalEth).toBeCloseTo(0.1, 10);
  expect(p.tokens[0].feesEarnedEth).toBeCloseTo(0.1, 10);
  expect(p.earningsFromBankr).toBeCloseTo(0.1, 10);
  expect(p.earningsFromIndexer).toBeCloseTo(0.55, 10);
});

test("switch on: per-token, creator, Please Bro and total all come from the indexer", async () => {
  process.env.EARNINGS_SOURCE = "indexer";
  indexerSays({ "base:0xaaa": 0.3, "robinhood:0xbbb": 0.2 });
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.meta.earningsSource).toBe("indexer");
  expect(p.tokens[0].feesEarnedEth).toBeCloseTo(0.35, 10);
  expect(p.pleaseBroTokens[0].feesEarnedEth).toBeCloseTo(0.2, 10);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.35, 10);
  expect(p.earnings.pleaseBroEarningsEth).toBeCloseTo(0.2, 10);
  expect(p.earnings.totalEth).toBeCloseTo(0.55, 10);
  expect(p.earnings.total).toBeCloseTo(0.55 * 2000, 6); // USD at the current ETH price
  expect(p.earningsFromBankr).toBeCloseTo(0.1, 10);
  // Claimable (what's still unclaimed) stays Bankr's.
  expect(p.claimable.unclaimedEth).toBeCloseTo(0.05, 10);
});

test("switch on: an incomplete or unavailable indexer number falls back to Bankr", async () => {
  process.env.EARNINGS_SOURCE = "indexer";
  indexerSays({ "base:0xaaa": 0.3 }, true);
  const incomplete = await wrappedService.fetchFromBankr(match);
  expect(incomplete.meta.earningsSource).toBe("bankr");
  expect(incomplete.meta.earningsFromIndexerIncomplete).toBe(true);
  expect(incomplete.earnings.totalEth).toBeCloseTo(0.1, 10);

  creatorStatus = 500;
  const unavailable = await wrappedService.fetchFromBankr(match);
  expect(unavailable.meta.earningsSource).toBe("bankr");
});

test("switch on: a previous indexer-sourced result is kept rather than flipping back to Bankr", async () => {
  process.env.EARNINGS_SOURCE = "indexer";
  indexerSays({ "base:0xaaa": 0.3, "robinhood:0xbbb": 0.2 });
  const previous = await wrappedService.fetchFromBankr(match);
  indexerSays({ "base:0xaaa": 0.3 }, true);
  const fresh = await wrappedService.fetchFromBankr(match);

  const merged = mergeWithCache(fresh, previous);
  expect(merged.meta.earningsSource).toBe("indexer");
  expect(merged.earnings.totalEth).toBeCloseTo(0.55, 10);
  expect(merged.tokens[0].feesEarnedEth).toBeCloseTo(0.35, 10);

  // Switched back off: Bankr's number wins again.
  delete process.env.EARNINGS_SOURCE;
  expect(mergeWithCache(fresh, previous).meta.earningsSource).toBe("bankr");
});
