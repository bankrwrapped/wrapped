// Leaderboard refresh: re-fetches stale top rows and the stalest rows
// overall, once each, skips fresh ones, survives a failing profile, and
// never runs twice at once.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

const hour = 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
let top: Array<{ username: string; updatedAt: string }> = [];
let stale: Array<{ username: string; updatedAt: string }> = [];
const fetched: string[] = [];
let failFor = "";
let gate: Promise<void> | null = null;

mock.module("../repositories/wrappedCacheRepository", () => ({
  wrappedCacheRepository: {
    getTopTraders: async () => top,
    listStale: async () => stale,
  },
}));
mock.module("./wrappedService", () => ({
  wrappedService: {
    getWrapped: async (h: string) => {
      if (gate) await gate;
      fetched.push(h);
      if (h === failFor) throw new Error("bankr down");
      return {};
    },
  },
}));
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout; // skip the pause

const { refreshLeaderboardRows } = await import("./leaderboardRefresh");

beforeEach(() => { fetched.length = 0; failFor = ""; gate = null; });

test("stale top rows and the stalest rows are refreshed once each; fresh rows are skipped", async () => {
  top = [{ username: "fresh", updatedAt: ago(5 * 60_000) }, { username: "staleTop", updatedAt: ago(2 * hour) }];
  stale = [{ username: "ancient", updatedAt: ago(60 * 24 * hour) }, { username: "staleTop", updatedAt: ago(2 * hour) }];
  failFor = "staleTop";
  expect(await refreshLeaderboardRows()).toBe(1);
  expect(fetched).toEqual(["staleTop", "ancient"]);
});

test("a run in progress makes the next one skip", async () => {
  top = [];
  stale = [{ username: "a", updatedAt: ago(2 * hour) }];
  let open!: () => void;
  gate = new Promise((r) => { open = r; });
  const first = refreshLeaderboardRows();
  expect(await refreshLeaderboardRows()).toBe(0);
  open();
  expect(await first).toBe(1);
});
