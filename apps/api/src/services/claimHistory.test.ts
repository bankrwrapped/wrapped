// The year of claims: which claim events count for a wallet (Bankr scope),
// how they're valued and bucketed per UTC day, the best day and streak, and
// the fallbacks (indexer not caught up, query failure, unresolved pools).
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

const WALLET = "0x00000000000000000000000000000000000000aa";
const LAUNCH = "0x00000000000000000000000000000000000000c1"; // a Bankr launch
const OTHER_LAUNCH = "0x00000000000000000000000000000000000000c2"; // not Bankr's
const WETH = "0x4200000000000000000000000000000000000006";
const E = 10n ** 18n;

let synced = true;
let pages: any[][] = [];
let queryError: Error | null = null;
const seenSince: string[] = [];
const pools: Record<string, any> = {
  p1: { currency0: WETH, currency1: LAUNCH, tokenIsToken0: false },
  unresolved: { currency0: WETH, currency1: LAUNCH, tokenIsToken0: null },
};

mock.module("./indexerSync/envioClient", () => ({
  PAGE_SIZE: 2,
  cursorAfterBlock: (b: string) => ({ blockNumber: b, logIndex: 2147483647 }),
  cursorAfterEvent: (e: any) => ({ blockNumber: e.blockNumber, logIndex: e.logIndex }),
  isChainFullySynced: async () => synced,
  fetchWatchedPool: async (_c: string, id: string) => pools[id] ?? null,
  fetchClaimEventsPage: async (_c: string, _w: string, since: string) => {
    if (queryError) throw queryError;
    seenSince.push(since);
    return pages.shift() ?? [];
  },
}));
mock.module("./module8FeesBreakdown", () => ({
  bankrTokenKey: (chain: string, token: string) => `${chain}:${token.toLowerCase()}`,
  isEthLike: (_c: string, token: string) => token === WETH,
  // WETH at face value; the launched token at 0.001 ETH; anything else fails.
  priceRawAmount: async (_c: string, token: string, raw: bigint) => {
    if (token === WETH) return { ethAmount: Number(raw) / 1e18, usdAmount: 0 };
    if (token === LAUNCH) return { ethAmount: (Number(raw) / 1e18) * 0.001, usdAmount: 0 };
    throw new Error("no price");
  },
}));

const { getClaimHistory, longestRun, summarize } = await import("./claimHistory");

const NOW = new Date("2026-11-04T15:00:00Z");
const scope = { bankrTokens: new Set([`base:${LAUNCH}`]), hasClankerV4: true };
let n = 0;
const ev = (eventType: string, timestamp: string, fields: Record<string, unknown>) => ({
  poolId: null,
  tokenAddress: WETH,
  tokenAddress1: null,
  amountToken0: "0",
  amountToken1: "0",
  blockNumber: String(++n),
  logIndex: 0,
  txHash: "0x" + n,
  timestamp,
  eventType,
  ...fields,
});

beforeEach(() => {
  synced = true;
  queryError = null;
  pages = [];
  seenSince.length = 0;
});

test("longestRun counts consecutive UTC days", () => {
  expect(longestRun([])).toBe(0);
  expect(longestRun(["2026-01-01"])).toBe(1);
  expect(longestRun(["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05", "2026-01-06"])).toBe(3);
  // across a month boundary
  expect(longestRun(["2026-02-28", "2026-03-01"])).toBe(2);
});

test("summarize drops dust days and picks the best day", () => {
  const h = summarize(
    new Map([
      ["2026-03-02", 0.5],
      ["2026-03-01", 0.2],
      ["2026-03-05", 1e-12],
    ]),
    "2025-11-05",
    "2026-11-04",
    false,
  );
  expect(h.days).toEqual([
    { date: "2026-03-01", eth: 0.2 },
    { date: "2026-03-02", eth: 0.5 },
  ]);
  expect(h.claimDays).toBe(2);
  expect(h.bestDay).toEqual({ date: "2026-03-02", eth: 0.5 });
  expect(h.longestStreakDays).toBe(2);
  expect(h.totalEth).toBeCloseTo(0.7);
});

test("counts every claim route in scope, per UTC day, over the last 365 days", async () => {
  pages = [
    [
      // Doppler: both sides of the pool, on a Bankr launch
      ev("Release", "2026-01-10T08:00:00Z", { poolId: "p1", tokenAddress: LAUNCH, amountToken0: String(1n * E), amountToken1: String(100n * E) }),
      // Clanker v4 claim in WETH, same day
      ev("ClaimTokens", "2026-01-10T23:59:00Z", { amountToken0: String(2n * E) }),
    ],
    [
      // Clanker v3.1 collect, both tokens, next day
      ev("ClankerV31ClaimedRewards", "2026-01-11T01:00:00Z", { tokenAddress: WETH, amountToken0: String(1n * E), tokenAddress1: LAUNCH, amountToken1: String(1000n * E) }),
      // Doppler release on a launch that isn't Bankr's: ignored
      ev("Release", "2026-01-12T00:00:00Z", { poolId: "p1", tokenAddress: OTHER_LAUNCH, amountToken0: String(5n * E) }),
    ],
    [
      // Clanker v4 claim paid in a token outside the scope: ignored
      ev("ClaimTokensPermissioned", "2026-01-13T00:00:00Z", { tokenAddress: OTHER_LAUNCH, amountToken0: String(9n * E) }),
    ],
  ];
  const h = (await getClaimHistory(WALLET, scope, NOW))!;
  expect(h.from).toBe("2025-11-05");
  expect(h.to).toBe("2026-11-04");
  expect(seenSince[0]).toBe("2025-11-05T00:00:00.000Z");
  expect(h.days.map((d) => d.date)).toEqual(["2026-01-10", "2026-01-11"]);
  expect(h.days[0].eth).toBeCloseTo(1 + 0.1 + 2); // 1 WETH + 100 LAUNCH + 2 WETH
  expect(h.days[1].eth).toBeCloseTo(1 + 1); // 1 WETH + 1000 LAUNCH
  expect(h.bestDay?.date).toBe("2026-01-10");
  expect(h.longestStreakDays).toBe(2);
  expect(h.partial).toBe(false);
});

test("Clanker v4 claims don't count without a Bankr Clanker launch", async () => {
  pages = [[ev("ClaimTokens", "2026-02-01T00:00:00Z", { amountToken0: String(3n * E) })]];
  const h = (await getClaimHistory(WALLET, { ...scope, hasClankerV4: false }, NOW))!;
  expect(h.days).toEqual([]);
  expect(h.bestDay).toBeNull();
});

test("an unresolved pool or an unpriceable leg marks it partial", async () => {
  pages = [
    [
      ev("Release", "2026-02-01T00:00:00Z", { poolId: "unresolved", tokenAddress: LAUNCH, amountToken0: String(1n * E) }),
      ev("ClankerV31ClaimedRewards", "2026-02-02T00:00:00Z", { tokenAddress: WETH, amountToken0: String(1n * E), tokenAddress1: OTHER_LAUNCH, amountToken1: String(1n * E) }),
    ],
  ];
  const h = (await getClaimHistory(WALLET, scope, NOW))!;
  expect(h.partial).toBe(true);
  // the WETH side still counts
  expect(h.days).toEqual([{ date: "2026-02-02", eth: 1 }]);
});

test("falls back (null) while the indexer is catching up or when the query fails", async () => {
  synced = false;
  expect(await getClaimHistory(WALLET, scope, NOW)).toBeNull();
  synced = true;
  queryError = new Error("hasura down");
  expect(await getClaimHistory(WALLET, scope, NOW)).toBeNull();
});
