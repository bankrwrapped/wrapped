// wrappedService: volume recheck gate + method versioning, handle -> wallet
// cache, and the Bankr token scope handed to the on-chain breakdown.
import "../test/setupEnv";
import { test, expect, mock, beforeEach, afterAll } from "bun:test";

let capturedScope: Promise<Set<string>> | null = null;
mock.module("./module8FeesBreakdown", () => ({
  bankrTokenKey: (chain: string, token: string) => `${chain}:${token.toLowerCase()}`,
  getBeneficiaryFeesBreakdown: async (_addr: string, scope: Promise<Set<string>>) => {
    capturedScope = scope;
    await scope; // rejects -> breakdown rejects, like the real one
    return { totalEth: 0.25, incomplete: false, incompleteReasons: [] };
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
        token0Label: "WETH", token1Label: "A", claimable: { token0: "0", token1: "0" }, claimed: { token0: "0", token1: "0", count: 0 } }],
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

const { shouldRefreshTradingVolume, wrappedService } = await import("./wrappedService");

beforeEach(() => { searchCalls = 0; searchStatus = 200; creatorStatus = 200; capturedScope = null; });

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
