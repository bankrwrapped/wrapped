// The sweep must not overlap itself: a tick that outlasts the interval (a
// large backlog, e.g. a mass re-backfill) must make the next tick skip, not
// start a second batch loop over the same candidates.
import "../../test/setupEnv";
import { test, expect, mock } from "bun:test";

let release!: () => void;
let backfillCalls = 0;

mock.module("../../repositories/indexedTokensRepository", () => ({
  indexedTokensRepository: {
    listStuckCandidates: async () => [{ token_address: "0xa" }],
    claimForBackfill: async () => true,
  },
}));
mock.module("./syncJob", () => ({
  backfillToken: async () => {
    backfillCalls += 1;
    await new Promise<void>((r) => { release = r; });
  },
}));
mock.module("./backfillTrigger", () => ({ STALE_THRESHOLD_MS: 0 }));

const { runBackfillSweep } = await import("./backfillSweep");

test("a sweep that is still running makes the next one skip", async () => {
  const first = runBackfillSweep("base");
  await Bun.sleep(0);
  await runBackfillSweep("base"); // returns immediately: skipped
  expect(backfillCalls).toBe(1);

  release();
  await first;

  const third = runBackfillSweep("base"); // guard released: runs again
  await Bun.sleep(0);
  expect(backfillCalls).toBe(2);
  release();
  await third;
});
