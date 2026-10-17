// Every wallet gets a backfill-tracking row - not only the one that
// cold-starts the token - so a second wallet isn't reported complete while
// the token is still backfilling.
import "../../../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

let existing: { backfill_status: string } | null = null;
let recordFails = false;
const recorded: string[] = [];
let finds = 0;
let triggered = 0;

mock.module("../../../repositories/indexedTokensRepository", () => ({
  indexedTokensRepository: { find: async () => { finds += 1; return existing; } },
}));
mock.module("../../../repositories/walletBackfillRequestsRepository", () => ({
  walletBackfillRequestsRepository: {
    recordRequest: async (w: string, c: string, t: string) => {
      if (recordFails) throw new Error("db down");
      recorded.push(`${w}|${c}|${t}`);
    },
  },
}));
mock.module("../../../repositories/tokenVolumeSummaryRepository", () => ({
  tokenVolumeSummaryRepository: { get: async () => ({ total_volume_usd: "100" }) },
}));
mock.module("../../indexerSync/backfillTrigger", () => ({
  triggerBackfillIfNeeded: async () => { triggered += 1; },
}));

const { fetchIndexerVolume } = await import("./indexer");

beforeEach(() => { existing = null; recordFails = false; recorded.length = 0; finds = 0; triggered = 0; });

test("second wallet on an already-registered, still-backfilling token is tracked", async () => {
  existing = { backfill_status: "in_progress" };
  const r = await fetchIndexerVolume({ address: "0xt", chain: "base", walletAddress: "0xwalletB", source: "doppler" });
  expect(recorded).toEqual(["0xwalletB|base|0xt"]);
  expect(r).toEqual({ stopFallback: true, reason: "backfill_in_progress" });
});

test("cold start records and triggers the backfill", async () => {
  const r = await fetchIndexerVolume({ address: "0xt", chain: "base", walletAddress: "0xwalletA", source: "doppler" });
  expect(recorded).toEqual(["0xwalletA|base|0xt"]);
  expect(triggered).toBe(1);
  expect(r).toBeNull();
});

test("complete token returns indexer volume (and is still tracked)", async () => {
  existing = { backfill_status: "complete" };
  const r = await fetchIndexerVolume({ address: "0xt", chain: "base", walletAddress: "0xw", source: "doppler" });
  expect(r).toEqual({ source: "indexer", volumeUsd: 100 });
  expect(recorded.length).toBe(1);
});

test("if tracking can't be recorded, nothing else runs", async () => {
  recordFails = true;
  const r = await fetchIndexerVolume({ address: "0xt", chain: "base", walletAddress: "0xw", source: "doppler" });
  expect(r).toBeNull();
  expect(finds).toBe(0);
  expect(triggered).toBe(0);
});

test("robinhood skips the indexer entirely", async () => {
  const r = await fetchIndexerVolume({ address: "0xt", chain: "robinhood", walletAddress: "0xw" });
  expect(r).toBeNull();
  expect(recorded.length).toBe(0);
});
