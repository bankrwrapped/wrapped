// Spot prices: GeckoTerminal batches of 30, DefiLlama for what it misses on
// Base, a 5-minute cache, and never a throw. Plus the on-chain Clanker read's
// calldata, which has to match availableFees(address,address) exactly.
import "../test/setupEnv";
import { test, expect, beforeEach, afterAll } from "bun:test";

const calls: string[] = [];
let geckoDown = false;
let rpcBody: any = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push(url);
  if (url.includes("geckoterminal")) {
    if (geckoDown) return new Response(null, { status: 429 });
    const asked = url.split("/token_price/")[1].split(",");
    return Response.json({ data: { attributes: { token_prices: Object.fromEntries(asked.filter((a) => a !== "0xllama").map((a) => [a, "1.5"])) } } });
  }
  if (url.includes("llama")) return Response.json({ coins: { "base:0xllama": { price: 7 } } });
  if (url === "http://base-rpc.test") {
    rpcBody = JSON.parse(String(init?.body));
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" + (25n * 10n ** 14n).toString(16).padStart(64, "0") });
  }
  throw new Error("unexpected fetch " + url);
}) as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const { getCurrentPricesUsd, clearCurrentPriceCache } = await import("./currentPrices");
const { getClankerClaimableWeth } = await import("./clankerFeeLocker");

beforeEach(() => { calls.length = 0; geckoDown = false; clearCurrentPriceCache(); });

test("batches 30 addresses per GeckoTerminal call and lowercases them", async () => {
  const addrs = Array.from({ length: 31 }, (_, i) => "0xA" + i);
  const prices = await getCurrentPricesUsd("base", addrs);
  expect(calls.filter((c) => c.includes("geckoterminal")).length).toBe(2);
  expect(prices.get("0xa0")).toBe(1.5);
  expect(prices.size).toBe(31);
});

test("DefiLlama fills what GeckoTerminal misses on Base; results are cached", async () => {
  const first = await getCurrentPricesUsd("base", ["0xllama"]);
  expect(first.get("0xllama")).toBe(7);
  calls.length = 0;
  await getCurrentPricesUsd("base", ["0xllama"]);
  expect(calls.length).toBe(0);
});

test("a failing provider means missing prices, not a throw", async () => {
  geckoDown = true;
  const prices = await getCurrentPricesUsd("robinhood", ["0xr"]); // no DefiLlama for robinhood
  expect(prices.size).toBe(0);
});

test("Clanker availableFees calldata and decoding", async () => {
  const eth = await getClankerClaimableWeth("0xAEBA54988AFBBB38BF842985288CE1EE2D8BFE45");
  expect(eth).toBeCloseTo(0.0025, 12);
  expect(rpcBody.params[0].to).toBe("0xF3622742b1E446D92e45E22923Ef11C2fcD55D68");
  // Same encoding viem produces for availableFees(wallet, Base WETH).
  expect(rpcBody.params[0].data).toBe(
    "0x8296535a000000000000000000000000aeba54988afbbb38bf842985288ce1ee2d8bfe45" +
      "0000000000000000000000004200000000000000000000000000000000000006",
  );
});
