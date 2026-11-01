// Category leaderboards: qualification minimums, competition ranking with
// stable tie order, the personal row and its neighbors, and which month
// editions can be asked for.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";
import type { BoardMetrics } from "../repositories/wrappedCacheRepository";

let rows: BoardMetrics[] = [];
const queried: Array<[string, string]> = [];

mock.module("../repositories/wrappedCacheRepository", () => ({
  wrappedCacheRepository: {
    listBoardMetrics: async (from: string, to: string) => {
      queried.push([from, to]);
      return rows;
    },
  },
}));

const { rankBoard, resolveEdition, getLeaderboards, clearLeaderboardsCache } = await import("./leaderboards");

function row(username: string, over: Partial<BoardMetrics> = {}): BoardMetrics {
  return {
    walletAddress: "0x" + username,
    username,
    displayName: username,
    avatarUrl: "",
    totalEth: 0,
    creatorEth: 0,
    tokensLaunched: 0,
    pleaseBroCount: 0,
    firstIndexedAt: "2026-09-01T00:00:00.000Z",
    bestDayEth: 0,
    streakDays: 0,
    monthEth: 0,
    tokenFees: [],
    ...over,
  };
}

beforeEach(() => {
  rows = [];
  queried.length = 0;
  clearLeaderboardsCache();
});

test("ties share a rank, keep first-indexed order, and the next rank skips", () => {
  const board = rankBoard(
    "earnings",
    [
      row("late", { totalEth: 2, firstIndexedAt: "2026-10-02T00:00:00.000Z" }),
      row("early", { totalEth: 2, firstIndexedAt: "2026-10-01T00:00:00.000Z" }),
      row("top", { totalEth: 5 }),
      row("last", { totalEth: 1 }),
    ],
    { limit: 10 }
  );
  expect(board.entries.map((e) => [e.username, e.rank, e.tied])).toEqual([
    ["top", 1, false],
    ["early", 2, true],
    ["late", 2, true],
    ["last", 4, false],
  ]);
});

test("zero scores and wallets below a board's minimum don't qualify", () => {
  const metrics = [
    row("zero"),
    row("two", { tokensLaunched: 2, creatorEth: 10 }),
    row("three", { tokensLaunched: 3, creatorEth: 3 }),
  ];
  expect(rankBoard("launches", metrics, { limit: 10 }).total).toBe(2);
  const perLaunch = rankBoard("per_launch", metrics, { limit: 10 });
  expect(perLaunch.entries.map((e) => [e.username, e.score])).toEqual([["three", 1]]);
});

test("hit rate needs 5 launches and counts tokens at 0.1 ETH or more", () => {
  const board = rankBoard(
    "hit_rate",
    [
      row("four", { tokenFees: [1, 1, 1, 1] }),
      row("five", { tokenFees: [0.1, 0.5, 0.01, 0, 0.09] }),
    ],
    { limit: 10 }
  );
  expect(board.entries.map((e) => [e.username, e.score])).toEqual([["five", 0.4]]);
});

test("breakout is top ÷ average of the others (0.01 ETH floor), needs 3 launches and a 0.1 ETH top token", () => {
  const board = rankBoard(
    "breakout",
    [
      row("small", { tokenFees: [0.05, 0.01, 0.01] }),
      row("big", { tokenFees: [0.05, 0.9, 0.05] }),
      row("even", { tokenFees: [1, 1, 1] }),
    ],
    { limit: 10 }
  );
  expect(board.entries.map((e) => e.username)).toEqual(["big", "even"]);
  expect(board.entries[0].score).toBeCloseTo(18, 9);
  expect(board.entries[1].score).toBeCloseTo(1, 9);
});

test("breakout rewards one standout token, not launch count", () => {
  const many = [0.1, ...Array(99).fill(0)];
  const board = rankBoard(
    "breakout",
    [row("spray", { tokenFees: many }), row("hit", { tokenFees: [10, 0.1, 0.1] })],
    { limit: 10 }
  );
  expect(board.entries.map((e) => [e.username, e.score])).toEqual([
    ["hit", 100],
    ["spray", 10],
  ]);
});

test("near-equal float sums tie and keep first-indexed order", () => {
  const board = rankBoard(
    "earnings",
    [
      row("late", { totalEth: 0.1 + 0.2, firstIndexedAt: "2026-10-02T00:00:00.000Z" }),
      row("early", { totalEth: 0.3, firstIndexedAt: "2026-10-01T00:00:00.000Z" }),
    ],
    { limit: 10 }
  );
  expect(board.entries.map((e) => [e.username, e.rank, e.tied])).toEqual([
    ["early", 1, true],
    ["late", 1, true],
  ]);
});

test("personal row and neighbors, matched case-insensitively", () => {
  const metrics = [1, 2, 3, 4, 5].map((n) => row("u" + n, { tokensLaunched: 10 - n }));
  const mid = rankBoard("launches", metrics, { limit: 2, me: "U3" });
  expect(mid.entries).toHaveLength(2);
  expect(mid.personal?.username).toBe("u3");
  expect(mid.neighbors.above?.username).toBe("u2");
  expect(mid.neighbors.below?.username).toBe("u4");

  const first = rankBoard("launches", metrics, { limit: 2, me: "u1" });
  expect(first.neighbors.above).toBeNull();
  const absent = rankBoard("launches", metrics, { limit: 2, me: "nobody" });
  expect(absent.personal).toBeNull();
  expect(absent.neighbors).toEqual({ above: null, below: null });
});

test("editions: current or previous month only; anything else is the current month", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  expect(resolveEdition(null, now)).toEqual({
    month: "2026-11",
    closesAt: "2026-12-01T00:00:00.000Z",
    frozen: false,
    from: "2026-11-01",
    to: "2026-12-01",
  });
  expect(resolveEdition("2026-10", now)).toMatchObject({ month: "2026-10", frozen: true, to: "2026-11-01" });
  expect(resolveEdition("2026-09", now).month).toBe("2026-11");
  expect(resolveEdition("junk", now).month).toBe("2026-11");
  // January's previous month is last year's December.
  expect(resolveEdition("2025-12", new Date("2026-01-03T00:00:00Z"))).toMatchObject({
    month: "2025-12",
    frozen: true,
  });
});

test("a closed month only counts profiles that existed before it closed", async () => {
  rows = [
    row("before", { monthEth: 1, firstIndexedAt: "2026-10-20T00:00:00.000Z" }),
    row("after", { monthEth: 2, firstIndexedAt: "2026-11-02T00:00:00.000Z" }),
  ];
  const res = await getLeaderboards({ month: "2026-10", handle: null, now: new Date("2026-11-15T00:00:00Z") });
  expect(queried).toEqual([["2026-10-01", "2026-11-01"]]);
  expect(res.edition.frozen).toBe(true);
  expect(res.boards.find((b) => b.id === "month")!.entries.map((e) => e.username)).toEqual(["before"]);
  // All-time boards still see everyone.
  expect(res.boards.find((b) => b.id === "earnings")!.total).toBe(0);
});

test("metrics are queried once per month while cached", async () => {
  const now = new Date("2026-11-15T00:00:00Z");
  await getLeaderboards({ month: null, handle: null, now });
  await getLeaderboards({ month: null, handle: "@u1", now });
  expect(queried).toHaveLength(1);
});
