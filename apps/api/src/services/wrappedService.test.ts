// wrappedService: volume recheck gate + method versioning, handle -> wallet
// cache, the Bankr token scope handed to the on-chain breakdown, and the
// EARNINGS_SOURCE switch between Bankr's and the indexer's numbers.
import "../test/setupEnv";
import { test, expect, mock, beforeEach, afterAll } from "bun:test";

let capturedScope: Promise<Set<string>> | null = null;
let indexerBreakdown = { totalEth: 0.25, byToken: {} as Record<string, number>, incomplete: false, incompleteReasons: [] as string[] };
mock.module("./module8FeesBreakdown", () => ({
  bankrTokenKey: (chain: string, token: string) => `${chain}:${token.toLowerCase()}`,
  getBeneficiaryFeesBreakdown: async (_addr: string, scope: Promise<Set<string>>) => {
    capturedScope = scope;
    await scope; // rejects -> breakdown rejects, like the real one
    return indexerBreakdown;
  },
}));
mock.module("./tradingVolumeEngine/getBestAvailableVolume", () => ({ getBestAvailableVolume: async () => ({}) }));
mock.module("../utils/bankrRateLimiter", () => ({
  bankrRateLimiter: { beforeSearch: async () => {}, beforeFeesCall: async () => {} },
}));
mock.module("../repositories/wrappedCacheRepository", () => ({ wrappedCacheRepository: {} }));

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
    return Response.json({
      tokens: [{ tokenAddress: "0xAAA", name: "A", symbol: "A", chain: "base", source: "doppler",
        token0Label: "WETH", token1Label: "A", claimable: { token0: "0.05", token1: "0" }, claimed: { token0: "0.05", token1: "0", count: 1 } }],
      dailyEarnings: [], totals: {},
    });
  }
  if (url.includes("beneficiary-fees")) {
    return Response.json({
      tokens: [{ tokenAddress: "0xBBB", name: "B", symbol: "B", chain: "robinhood", source: "doppler",
        token0Label: "WETH", token1Label: "B", claimable: { token0: "0", token1: "0" }, claimed: { token0: "0", token1: "0", count: 0 } }],
    });
  }
  if (url.includes("llama")) return Response.json({ coins: { "coingecko:ethereum": { price: 2000 } } });
  throw new Error("unexpected fetch " + url);
}) as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const { shouldRefreshTradingVolume, mergeWithCache, wrappedService } = await import("./wrappedService");

beforeEach(() => {
  searchCalls = 0; searchStatus = 200; creatorStatus = 200; capturedScope = null;
  indexerBreakdown = { totalEth: 0.25, byToken: {}, incomplete: false, incompleteReasons: [] };
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

test("indexer earnings are scoped to the wallet's Bankr tokens (creator + Please Bro, per chain)", async () => {
  const payload = await wrappedService.fetchFromBankr(match);
  expect(await capturedScope!).toEqual(new Set(["base:0xaaa", "robinhood:0xbbb"]));
  expect(payload.meta.earningsFromIndexerStatus).toBe("ok");
  expect(payload.earningsFromIndexer).toBe(0.25);
});

test("Bankr fees unavailable -> indexer earnings reported unavailable, not unscoped", async () => {
  creatorStatus = 500;
  const payload = await wrappedService.fetchFromBankr(match);
  expect(payload.meta.creatorFeesStatus).toBe("unavailable");
  expect(payload.meta.earningsFromIndexerStatus).toBe("unavailable");
  expect(payload.earningsFromIndexer).toBe(0);
});

// Bankr: 0.1 ETH on 0xAAA (creator), 0 on 0xBBB (Please Bro).
const indexerSays = (byToken: Record<string, number>, incomplete = false) => {
  const totalEth = Object.values(byToken).reduce((a, b) => a + b, 0);
  indexerBreakdown = { totalEth, byToken, incomplete, incompleteReasons: [] };
};

test("switch off: earnings stay Bankr's, both totals are kept", async () => {
  indexerSays({ "base:0xaaa": 0.3, "robinhood:0xbbb": 0.2 });
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.meta.earningsSource).toBe("bankr");
  expect(p.earnings.totalEth).toBeCloseTo(0.1, 10);
  expect(p.tokens[0].feesEarnedEth).toBeCloseTo(0.1, 10);
  expect(p.earningsFromBankr).toBeCloseTo(0.1, 10);
  expect(p.earningsFromIndexer).toBeCloseTo(0.5, 10);
});

test("switch on: per-token, creator, Please Bro and total all come from the indexer", async () => {
  process.env.EARNINGS_SOURCE = "indexer";
  indexerSays({ "base:0xaaa": 0.3, "robinhood:0xbbb": 0.2 });
  const p = await wrappedService.fetchFromBankr(match);
  expect(p.meta.earningsSource).toBe("indexer");
  expect(p.tokens[0].feesEarnedEth).toBeCloseTo(0.3, 10);
  expect(p.pleaseBroTokens[0].feesEarnedEth).toBeCloseTo(0.2, 10);
  expect(p.earnings.creatorEarningsEth).toBeCloseTo(0.3, 10);
  expect(p.earnings.pleaseBroEarningsEth).toBeCloseTo(0.2, 10);
  expect(p.earnings.totalEth).toBeCloseTo(0.5, 10);
  expect(p.earnings.total).toBeCloseTo(0.5 * 2000, 6); // USD at the current ETH price
  expect(p.earningsFromBankr).toBeCloseTo(0.1, 10);
  // Claimable stays Bankr's: the indexer doesn't know what's unclaimed.
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
  expect(merged.earnings.totalEth).toBeCloseTo(0.5, 10);
  expect(merged.tokens[0].feesEarnedEth).toBeCloseTo(0.3, 10);

  // Switched back off: Bankr's number wins again.
  delete process.env.EARNINGS_SOURCE;
  expect(mergeWithCache(fresh, previous).meta.earningsSource).toBe("bankr");
});
