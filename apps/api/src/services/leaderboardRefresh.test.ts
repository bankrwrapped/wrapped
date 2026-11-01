// Leaderboard refresh: re-fetches stale top rows and the stalest rows
// overall, once each, skips fresh ones, survives a failing profile, and
// never runs twice at once.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

const hour = 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
type Row = { username: string; walletAddress: string; updatedAt: string };
let top: Row[] = [];
let stale: Row[] = [];
let skipArg: string[] = [];
const resolvesTo: Record<string, string | null> = {};
const fetched: string[] = [];
let failFor = "";
let gate: Promise<void> | null = null;

mock.module("../repositories/wrappedCacheRepository", () => ({
  wrappedCacheRepository: {
    getTopTraders: async () => top,
    listStale: async (_: Date, __: number, skip: string[] = []) => {
      skipArg = skip;
      return stale.filter((r) => !skip.includes(r.walletAddress));
    },
  },
}));
mock.module("./wrappedService", () => ({
  wrappedService: {
    getWrapped: async (h: string) => {
      if (gate) await gate;
      fetched.push(h);
      if (h === failFor) throw new Error("bankr down");
      const wallet = h in resolvesTo ? resolvesTo[h] : "0x" + h.toLowerCase();
      return wallet ? { walletAddress: wallet } : null;
    },
  },
}));
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout; // skip the pause

const { refreshLeaderboardRows } = await import("./leaderboardRefresh");

beforeEach(() => { fetched.length = 0; failFor = ""; gate = null; for (const k in resolvesTo) delete resolvesTo[k]; });
const r = (username: string, updatedAt: string): Row => ({ username, walletAddress: "0x" + username.toLowerCase(), updatedAt });

test("stale top rows and the stalest rows are refreshed once each; fresh rows are skipped", async () => {
  top = [r("fresh", ago(5 * 60_000)), r("staleTop", ago(2 * hour))];
  stale = [r("ancient", ago(60 * 24 * hour)), r("staleTop", ago(2 * hour))];
  failFor = "staleTop";
  expect(await refreshLeaderboardRows()).toBe(1);
  expect(fetched).toEqual(["staleTop", "ancient"]);
});

test("a run in progress makes the next one skip", async () => {
  top = [];
  stale = [r("a", ago(2 * hour))];
  let open!: () => void;
  gate = new Promise((r) => { open = r; });
  const first = refreshLeaderboardRows();
  expect(await refreshLeaderboardRows()).toBe(0);
  open();
  expect(await first).toBe(1);
});

test("a handle that no longer resolves to its row's wallet isn't counted, and its row is skipped next run", async () => {
  top = [];
  stale = [r("gone", ago(90 * 24 * hour)), r("moved", ago(80 * 24 * hour)), r("ok", ago(2 * hour))];
  resolvesTo.gone = null;
  resolvesTo.moved = "0xsomeoneelse";
  expect(await refreshLeaderboardRows()).toBe(1);
  expect(fetched).toEqual(["gone", "moved", "ok"]);
  fetched.length = 0;
  await refreshLeaderboardRows();
  expect(skipArg.sort()).toEqual(["0xgone", "0xmoved"]);
  expect(fetched).toEqual(["ok"]);
});
