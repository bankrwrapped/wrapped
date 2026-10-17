// Retry behavior for unpriced swaps in backfillToken / runScheduledRefresh:
// a transient pricing failure must be retried, not silently excluded for
// good, and a permanently unpriceable gap must eventually be accepted.
// Envio, pricing and the repositories are mocked - no DB or network.
import "../../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";


const DAY = 86400;
let swaps: any[] = [];
let badDays = new Set<number>();
let attempts = 0;
let status = "";
const commits: any[] = [];
let setTotalArgs: any[] = [];

mock.module("./envioClient", () => ({
  cursorAfterBlock: (b: string) => ({ blockNumber: b, logIndex: 2147483647 }),
  cursorAfterEvent: (e: any) => ({ blockNumber: e.blockNumber, logIndex: e.logIndex }),
  isChainFullySynced: async () => true,
  fetchIndexedSwapsPage: async (_c: string, _t: string, after: any) =>
    swaps.filter((s) => BigInt(s.blockNumber) > BigInt(after.blockNumber) ||
      (s.blockNumber === after.blockNumber && s.logIndex > after.logIndex)),
}));
mock.module("./decimalsService", () => ({ getDecimals: async () => 0 }));
mock.module("../pricingService", () => ({
  getHistoricalPriceUsd: async (_c: string, _t: string, ts: number) => {
    if (badDays.has(Math.floor(ts / DAY))) throw new Error("no price");
    return 2;
  },
}));
mock.module("./wrappedNotify", () => ({ checkAndNotifyWalletsForToken: async () => {} }));
mock.module("../../repositories/indexedTokensRepository", () => ({
  indexedTokensRepository: {
    listCompleteForRefresh: async () => [{ token_address: "0xt", backfill_checkpoint_block: "100" }],
    incrementPricingAttempts: async () => ++attempts,
    resetPricingAttempts: async () => { attempts = 0; },
    setStatus: async (_c: string, _t: string, s: string) => { status = s; },
    updateCheckpoint: async () => {},
  },
}));
mock.module("../../repositories/tokenVolumeSummaryRepository", () => ({
  tokenVolumeSummaryRepository: {
    setTotal: async (...a: any[]) => { setTotalArgs = a; },
    addToTotalAndAdvanceCheckpoint: async (...a: any[]) => { commits.push(a); return true; },
  },
}));

const { runScheduledRefresh } = await import("./refreshJob");
const { backfillToken } = await import("./syncJob");

const sw = (block: number, logIndex: number, day: number, amount = 1) => ({
  id: block + ":" + logIndex, chain: "base", poolId: "p", tokenAddress: "0xt",
  blockNumber: String(block), logIndex, timestamp: new Date((day * DAY + 60) * 1000).toISOString(),
  amountToken: String(amount),
});

beforeEach(() => { attempts = 0; status = ""; commits.length = 0; badDays = new Set(); setTotalArgs = []; });

test("refresh: holds checkpoint just before the first unpriced swap", async () => {
  swaps = [sw(101, 0, 10), sw(102, 0, 11), sw(102, 1, 12), sw(103, 0, 11)];
  badDays = new Set([12]); // block 102 logIndex 1 is unpriced
  await runScheduledRefresh("base");
  expect(commits.length).toBe(1);
  const [, , vol, count, unpricedAccepted, expected, newCp] = commits[0];
  expect(newCp).toBe(101n);           // cut at block boundary before 102
  expect(count).toBe(1);              // only block 101 committed
  expect(vol).toBe(2);
  expect(unpricedAccepted).toBe(0);
  expect(expected).toBe("100");
  expect(attempts).toBe(1);
});

test("refresh: unpriced in the first new block commits nothing", async () => {
  swaps = [sw(101, 0, 12), sw(102, 0, 10)];
  badDays = new Set([12]);
  await runScheduledRefresh("base");
  expect(commits.length).toBe(0);
  expect(attempts).toBe(1);
});

test("refresh: after max attempts, accepts the gap and advances fully", async () => {
  swaps = [sw(101, 0, 10), sw(102, 0, 12), sw(103, 0, 10)];
  badDays = new Set([12]);
  attempts = 4; // next is the 5th
  await runScheduledRefresh("base");
  const [, , vol, count, unpricedAccepted, , newCp] = commits[0];
  expect(newCp).toBe(103n);
  expect(count).toBe(2);
  expect(vol).toBe(4);
  expect(unpricedAccepted).toBe(1);
  expect(attempts).toBe(0); // reset
});

test("refresh: fully priced run commits everything and resets attempts", async () => {
  swaps = [sw(101, 0, 10), sw(102, 0, 11)];
  attempts = 2;
  await runScheduledRefresh("base");
  expect(commits[0][6]).toBe(103n - 1n);
  expect(commits[0][3]).toBe(2);
  expect(attempts).toBe(0);
});

test("backfill: unpriced swaps leave the token pending, no total written", async () => {
  swaps = [sw(5, 0, 10), sw(6, 0, 12)];
  badDays = new Set([12]);
  await backfillToken("base", "0xt");
  expect(status).toBe("pending");
  expect(setTotalArgs.length).toBe(0);
  expect(attempts).toBe(1);
});

test("backfill: after max attempts, completes with the gap recorded", async () => {
  swaps = [sw(5, 0, 10), sw(6, 0, 12)];
  badDays = new Set([12]);
  attempts = 4;
  await backfillToken("base", "0xt");
  expect(status).toBe("complete");
  expect(setTotalArgs.slice(2)).toEqual([2, 1, 1]); // volume, priced count, unpriced count
  expect(attempts).toBe(0);
});
