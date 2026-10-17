// /api/status: percent and ETA from the indexer's progress and sampled
// speed, caught-up and unavailable states, and the 30s cache.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

let progress: any = null;
let progressFails = false;
let progressCalls = 0;
mock.module("./indexerSync/envioClient", () => ({
  fetchChainProgress: async () => { progressCalls += 1; if (progressFails) throw new Error("envio down"); return progress; },
}));
mock.module("../repositories/indexedTokensRepository", () => ({
  indexedTokensRepository: { countByStatus: async () => ({ pending: 3, in_progress: 1, complete: 50, failed: 2 }) },
}));

const { getStatus, resetStatusState, describeProgress } = await import("./statusService");

const MIN = 60_000;
beforeEach(() => { resetStatusState(); progressFails = false; progressCalls = 0; });

test("percent from start to head; ETA once two samples a few minutes apart exist", async () => {
  progress = { startBlock: 1000, processedBlock: 2000, headBlock: 11000, caughtUpAt: null };
  const first = await getStatus(0);
  expect(first.indexer).toMatchObject({ status: "syncing", percent: 10, etaMinutes: null }); // one sample: no speed yet
  progress = { ...progress, processedBlock: 3000 };
  const later = await getStatus(10 * MIN);
  expect(later.indexer).toMatchObject({ processedBlock: 3000, percent: 20, blocksPerMinute: 100, etaMinutes: 80 });
  expect(later.backfills).toEqual({ pending: 3, in_progress: 1, complete: 50, failed: 2 });
});

test("caught up: 100% and no ETA wait", () => {
  expect(describeProgress({ startBlock: 0, processedBlock: 500, headBlock: 500, caughtUpAt: "2026-10-18T00:00:00Z" }, null))
    .toMatchObject({ status: "caught_up", percent: 100, etaMinutes: 0 });
});

test("indexer unreachable: says so, backfill counts still shown", async () => {
  progressFails = true;
  const s = await getStatus(0);
  expect(s.indexer).toEqual({ status: "unavailable" });
  expect(s.backfills).toMatchObject({ complete: 50 });
});

test("responses are cached for 30s", async () => {
  progress = { startBlock: 0, processedBlock: 10, headBlock: 100, caughtUpAt: null };
  await getStatus(0);
  await getStatus(20_000);
  expect(progressCalls).toBe(1);
  await getStatus(31_000);
  expect(progressCalls).toBe(2);
});
