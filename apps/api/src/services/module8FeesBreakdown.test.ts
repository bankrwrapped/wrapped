// On-chain earnings breakdown: both Doppler fee sides (incl. native ETH),
// Clanker counted at accrual via launchedToken, Bankr-only scope, chains
// failing independently, Bankr-scope failure propagation, keyset paging.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

const ETH = 10n ** 18n;
const NATIVE = "0x0000000000000000000000000000000000000000";
const WETH = "0x4200000000000000000000000000000000000006";

type Ev = {
  id: string; chain: string; poolId: string | null; tokenAddress: string;
  eventType: string; recipient: string; amountToken0: string | null;
  amountToken1: string | null; blockNumber: string; txHash: string;
  logIndex: number; timestamp: string; launchedToken?: string | null;
};

let events: Record<string, Ev[]> = {};
let failingChains = new Set<string>();
let pools: Record<string, { currency0: string; currency1: string; tokenIsToken0: boolean | null }> = {};
const pageCalls: { chain: string; cursor: { blockNumber: string; logIndex: number } }[] = [];

mock.module("./indexerSync/envioClient", () => ({
  PAGE_SIZE: 2,
  cursorAfterBlock: (b: string) => ({ blockNumber: b, logIndex: 2147483647 }),
  cursorAfterEvent: (e: Ev) => ({ blockNumber: e.blockNumber, logIndex: e.logIndex }),
  fetchIndexedFeeEventsPage: async (chain: string, _addr: string, cursor: { blockNumber: string; logIndex: number }) => {
    pageCalls.push({ chain, cursor });
    if (failingChains.has(chain)) throw new Error(`envio ${chain} down`);
    const after = (e: Ev) =>
      BigInt(e.blockNumber) > BigInt(cursor.blockNumber) ||
      (BigInt(e.blockNumber) === BigInt(cursor.blockNumber) && e.logIndex > cursor.logIndex);
    return (events[chain] ?? []).filter(after).slice(0, 2);
  },
  fetchWatchedPool: async (chain: string, poolId: string) => {
    const p = pools[`${chain}:${poolId}`];
    return p ? { id: poolId, chain, poolId, tokenAddress: null, ...p } : null;
  },
}));
mock.module("./indexerSync/decimalsService", () => ({ getDecimals: async () => 18 }));
// Every launched token trades at $1; WETH at $2000.
mock.module("./pricingService", () => ({
  getHistoricalPriceUsd: async (_c: string, token: string) => (token.toLowerCase() === WETH ? 2000 : 1),
}));

const { getBeneficiaryFeesBreakdown, bankrTokenKey } = await import("./module8FeesBreakdown");

let n = 0;
function ev(chain: string, partial: Partial<Ev>): Ev {
  n += 1;
  return {
    id: `${chain}:tx${n}:${n}`, chain, poolId: null, tokenAddress: WETH, eventType: "StoreTokens",
    recipient: "0xme", amountToken0: "0", amountToken1: null, blockNumber: String(n), txHash: `tx${n}`,
    logIndex: n, timestamp: "2026-09-01T00:00:00.000Z", ...partial,
  };
}
const scope = (...keys: string[]) => Promise.resolve(new Set(keys));

beforeEach(() => {
  events = {}; failingChains = new Set(); pools = {}; pageCalls.length = 0; n = 0;
});

test("Doppler Release counts BOTH fee sides, native ETH at face value", async () => {
  pools["base:p1"] = { currency0: NATIVE, currency1: "0xlaunch", tokenIsToken0: false };
  events.base = [ev("base", {
    eventType: "Release", poolId: "p1", tokenAddress: "0xlaunch",
    amountToken0: String(1n * ETH), amountToken1: String(1000n * ETH),
  })];
  const r = await getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xlaunch")));
  // 1 ETH (native side) + 1000 tokens * $1 / $2000 = 1.5 ETH. The old code
  // counted only the launched-token side (0.5 ETH).
  expect(r.bySource.doppler.totalEth).toBeCloseTo(1.5, 10);
  expect(r.totalEth).toBeCloseTo(1.5, 10);
  expect(r.incomplete).toBe(false);
});

test("Doppler WETH-numeraire side is counted too", async () => {
  pools["base:p2"] = { currency0: "0xlaunch", currency1: WETH, tokenIsToken0: true };
  events.base = [ev("base", {
    eventType: "Release", poolId: "p2", tokenAddress: "0xlaunch",
    amountToken0: "0", amountToken1: String(2n * ETH),
  })];
  const r = await getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xlaunch")));
  expect(r.totalEth).toBeCloseTo(2, 10);
});

test("only Bankr launches count; Clanker attributed via launchedToken; unattributed flagged", async () => {
  events.base = [
    ev("base", { amountToken0: String(ETH / 2n), launchedToken: "0xbankrclank" }),   // Bankr launch: counted
    ev("base", { amountToken0: String(5n * ETH), launchedToken: "0xsomeoneelse" }),  // not Bankr: excluded
    ev("base", { amountToken0: String(3n * ETH), launchedToken: null }),             // unattributed: flagged
  ];
  const r = await getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xBankrClank")));
  expect(r.bySource.clanker.totalEth).toBeCloseTo(0.5, 10);
  expect(r.bySource.clanker.eventCount).toBe(1);
  expect(r.incomplete).toBe(true);
  expect(r.incompleteReasons.some((x) => x.startsWith("launch-unattributed:"))).toBe(true);
});

test("byToken splits the total per launched token and sums to totalEth", async () => {
  pools["base:p4"] = { currency0: NATIVE, currency1: "0xlaunch", tokenIsToken0: false };
  events.base = [
    ev("base", { eventType: "Release", poolId: "p4", tokenAddress: "0xlaunch", amountToken0: String(ETH), amountToken1: "0" }),
    ev("base", { amountToken0: String(ETH / 4n), launchedToken: "0xclank" }),
    ev("base", { amountToken0: String(ETH / 4n), launchedToken: "0xclank" }),
    ev("base", { amountToken0: String(9n * ETH), launchedToken: "0xnotbankr" }),
  ];
  const r = await getBeneficiaryFeesBreakdown(
    "0xme", scope(bankrTokenKey("base", "0xlaunch"), bankrTokenKey("base", "0xClank")),
  );
  expect(Object.keys(r.byToken).sort()).toEqual(["base:0xclank", "base:0xlaunch"]);
  expect(r.byToken["base:0xlaunch"]).toBeCloseTo(1, 10);
  expect(r.byToken["base:0xclank"]).toBeCloseTo(0.5, 10);
  expect(r.totalEth).toBeCloseTo(1.5, 10);
});

test("non-Bankr Doppler pools are excluded even when the wallet is the beneficiary", async () => {
  pools["base:p3"] = { currency0: NATIVE, currency1: "0xnotbankr", tokenIsToken0: false };
  events.base = [ev("base", {
    eventType: "Release", poolId: "p3", tokenAddress: "0xnotbankr", amountToken0: String(ETH), amountToken1: "0",
  })];
  const r = await getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xlaunch")));
  expect(r.totalEth).toBe(0);
});

test("a chain failing is ignored when the wallet has no Bankr launches there", async () => {
  failingChains.add("robinhood");
  events.base = [ev("base", { amountToken0: String(ETH), launchedToken: "0xa" })];
  const r = await getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xa")));
  expect(r.totalEth).toBeCloseTo(1, 10);
});

test("a chain failing still fails the whole number when the wallet has launches there", async () => {
  failingChains.add("robinhood");
  events.base = [ev("base", { amountToken0: String(ETH), launchedToken: "0xa" })];
  await expect(
    getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xa"), bankrTokenKey("robinhood", "0xr"))),
  ).rejects.toThrow("envio robinhood down");
});

test("Bankr scope failure rejects the breakdown (never an unscoped total)", async () => {
  events.base = [ev("base", { amountToken0: String(ETH), launchedToken: "0xa" })];
  await expect(getBeneficiaryFeesBreakdown("0xme", Promise.reject(new Error("bankr down")))).rejects.toThrow(
    "bankr down",
  );
});

test("Bankr scope failure rejects even with zero fee events, and isn't unhandled", async () => {
  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on("unhandledRejection", onUnhandled);
  // Envio itself fails before the scope is ever awaited in the page loop.
  failingChains.add("base");
  failingChains.add("robinhood");
  await expect(getBeneficiaryFeesBreakdown("0xme", Promise.reject(new Error("bankr down")))).rejects.toThrow();
  await new Promise((r) => setTimeout(r, 20));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toBe(false);
});

test("keyset paging doesn't skip events when a page ends mid-block", async () => {
  // Three events in block 10; PAGE_SIZE is 2, so the page boundary falls
  // inside the block. `blockNumber > lastBlock` paging lost the third.
  events.base = [
    ev("base", { blockNumber: "10", logIndex: 1, amountToken0: String(ETH), launchedToken: "0xa" }),
    ev("base", { blockNumber: "10", logIndex: 2, amountToken0: String(ETH), launchedToken: "0xa" }),
    ev("base", { blockNumber: "10", logIndex: 3, amountToken0: String(ETH), launchedToken: "0xa" }),
  ];
  const r = await getBeneficiaryFeesBreakdown("0xme", scope(bankrTokenKey("base", "0xa")));
  expect(r.bySource.clanker.eventCount).toBe(3);
  expect(r.totalEth).toBeCloseTo(3, 10);
  const baseCursors = pageCalls.filter((c) => c.chain === "base").map((c) => c.cursor);
  expect(baseCursors[1]).toEqual({ blockNumber: "10", logIndex: 2 });
});
