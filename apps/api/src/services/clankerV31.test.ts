// Clanker v3.1: launches and collects from the indexer, the creator's share
// of uncollected fees from the chain (a fake RPC answers by selector, so the
// hand-written ABI encoding is exercised), and the "not re-indexed yet" case.
import "../test/setupEnv";
import { test, expect, mock, beforeEach, afterAll } from "bun:test";

const WALLET = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000bb";
const TOKEN = "0x00000000000000000000000000000000000000c1";
const WETH = "0x4200000000000000000000000000000000000006";
const LOCKER = "0x33e2Eda238edcF470309b8c6D228986A1204c8f9";
const E = 10n ** 18n;

let launches: any[] = [];
let claims: any[] = [];
let launchesError: Error | null = null;
mock.module("./indexerSync/envioClient", () => ({
  PAGE_SIZE: 1000,
  cursorAfterBlock: (b: string) => ({ blockNumber: b, logIndex: 2147483647 }),
  cursorAfterEvent: (e: any) => ({ blockNumber: e.blockNumber, logIndex: e.logIndex }),
  fetchClankerV31Launches: async () => { if (launchesError) throw launchesError; return launches; },
  fetchClankerV31ClaimsPage: async () => claims,
}));
mock.module("./module8FeesBreakdown", () => ({
  bankrTokenKey: (chain: string, token: string) => `${chain}:${token.toLowerCase()}`,
  // Historical valuation: WETH face value, the launched token at 0.0001 ETH.
  priceRawAmount: async (_c: string, token: string, raw: bigint) =>
    ({ ethAmount: (Number(raw) / 1e18) * (token === WETH ? 1 : 0.0001), usdAmount: 0 }),
}));
mock.module("./indexerSync/decimalsService", () => ({ getDecimals: async () => 18 }));
mock.module("./currentPrices", () => ({
  getCurrentPricesUsd: async (_c: string, addrs: string[]) => new Map(addrs.filter((a) => a === TOKEN).map((a) => [a, 0.4])),
}));

// Fake chain: position 1 pays WALLET (40%), position 2 pays OTHER.
const word = (v: string | bigint) => (typeof v === "bigint" ? v.toString(16) : v.replace(/^0x/, "")).padStart(64, "0");
let rpcFails = false;
const calls: any[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  const call = JSON.parse(String(init?.body)).params[0];
  calls.push(call);
  if (rpcFails) return Response.json({ jsonrpc: "2.0", id: 1, error: { message: "boom" } });
  const sel = call.data.slice(0, 10);
  const pos = BigInt("0x" + call.data.slice(10, 74));
  let result = "";
  if (sel === "0x10eee734") result = word(pos) + word(40n) + word(OTHER) + word(pos === 1n ? WALLET : OTHER) + word(OTHER) + word(OTHER);
  if (sel === "0x99fbab88") result = word(0n) + word(OTHER) + word(TOKEN) + word(WETH) + word(10000n) + "0".repeat(64 * 7);
  if (sel === "0xfc6f7865") result = word(1000n * E) + word(1n * E); // uncollected in the position, before the split
  return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" + result });
}) as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const { getClankerV31 } = await import("./clankerV31");

beforeEach(() => {
  launchesError = null; rpcFails = false; calls.length = 0;
  launches = [
    { positionId: "1", tokenAddress: TOKEN, name: "Old", symbol: "OLD", timestamp: "2025-03-20T10:00:00Z" },
    { positionId: "2", tokenAddress: "0x00000000000000000000000000000000000000c2", name: "Gone", symbol: "GONE", timestamp: "2025-05-01T10:00:00Z" },
  ];
  claims = [{ tokenAddress: TOKEN, tokenAddress1: WETH, launchedToken: TOKEN, amountToken0: String(100n * E), amountToken1: String(E / 2n), blockNumber: "1", logIndex: 0, timestamp: "2025-04-01T00:00:00Z" }];
});

test("collects + the creator's share of uncollected fees, per launch", async () => {
  const r = await getClankerV31(WALLET, 2000);
  // Collected: 0.5 WETH + 100 TOKEN * 0.0001 = 0.51. Uncollected (40%): 0.4 WETH + 400 TOKEN * $0.4 / $2000 = 0.48.
  expect(r.byToken[`base:${TOKEN}`]).toBeCloseTo(0.51 + 0.48, 10);
  expect(r.claimableEth).toBeCloseTo(0.48, 10);
  expect(r.earnedEth).toBeCloseTo(0.99, 10);
  expect(r.tokens.map((t) => [t.symbol, t.source])).toEqual([["OLD", "clanker_v3_1"], ["GONE", "clanker_v3_1"]]);
  expect(r.tokens[1].feesEarnedEth).toBe(0); // position 2's payouts go to someone else
  expect(r.partial).toBe(false);
  expect(r.firstLaunch).toEqual({ tokenAddress: TOKEN, name: "Old", symbol: "OLD", chain: "base", launchedAt: "2025-03-20T10:00:00.000Z" });
  // collect is simulated as the locker (the position's owner), never sent.
  expect(calls.find((c) => c.data.startsWith("0xfc6f7865")).from).toBe(LOCKER);
});

test("an indexer without v3.1 data yet means no v3.1 launches, not a partial number", async () => {
  launchesError = new Error("Envio GraphQL error: field 'ClankerV31Launch' not found in type: 'query_root'");
  expect(await getClankerV31(WALLET, 2000)).toMatchObject({ tokens: [], earnedEth: 0, partial: false });
});

test("any other indexer failure is flagged partial", async () => {
  launchesError = new Error("Envio GraphQL request failed: 502");
  expect((await getClankerV31(WALLET, 2000)).partial).toBe(true);
});

test("a failed on-chain read is flagged partial, collects still count", async () => {
  rpcFails = true;
  const r = await getClankerV31(WALLET, 2000);
  expect(r.partial).toBe(true);
  expect(r.earnedEth).toBeCloseTo(0.51, 10);
});
