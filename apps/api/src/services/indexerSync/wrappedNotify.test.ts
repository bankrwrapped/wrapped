// "Wrapped ready" notification: completion is recomputed (not read from the
// stale cache), each wallet is notified at most once, a failed send releases
// the claim, and a missing secret skips without claiming.
import "../../test/setupEnv";
import { test, expect, mock, beforeEach, afterAll } from "bun:test";
import { createHmac } from "node:crypto";

let completion = { total: 2, complete: 2, inProgress: 0, pending: 0, failed: 0, tokens: [] as unknown[] };
let refreshed: { isComplete: boolean } | null = { isComplete: true };
let claimable = new Set<string>();
const claims: string[] = [];
const releases: string[] = [];
let webhookStatus = 200;
let sent: { body: string; signature: string | null }[] = [];

mock.module("../../repositories/walletBackfillRequestsRepository", () => ({
  walletBackfillRequestsRepository: {
    getWalletsForToken: async () => ["0xwallet"],
    getCompletionSummary: async () => completion,
  },
}));
mock.module("../../repositories/wrappedCacheRepository", () => ({
  wrappedCacheRepository: {
    claimReadyNotification: async (w: string) => {
      claims.push(w);
      if (!claimable.has(w)) return null;
      claimable.delete(w); // atomic: only the first claim wins
      return "alice";
    },
    releaseReadyNotification: async (w: string) => { releases.push(w); claimable.add(w); },
  },
}));
mock.module("../wrappedService", () => ({
  wrappedService: { refreshTradingVolumeNow: async () => refreshed },
}));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  sent.push({ body: String(init?.body), signature: new Headers(init?.headers).get("x-wrapped-signature") });
  return new Response(null, { status: webhookStatus });
}) as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const { checkAndNotifyWalletsForToken } = await import("./wrappedNotify");

beforeEach(() => {
  completion = { total: 2, complete: 2, inProgress: 0, pending: 0, failed: 0, tokens: [] };
  refreshed = { isComplete: true };
  claimable = new Set(["0xwallet"]);
  claims.length = 0; releases.length = 0; sent = []; webhookStatus = 200;
  process.env.WRAPPED_WEBHOOK_SECRET = "s3cret";
});

test("notifies once when the wallet is complete, with a valid signature", async () => {
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(sent.length).toBe(1);
  expect(JSON.parse(sent[0].body)).toEqual({ handle: "alice" });
  expect(sent[0].signature).toBe(createHmac("sha256", "s3cret").update(sent[0].body).digest("hex"));
  // A second token completing for the same wallet must not tweet again.
  await checkAndNotifyWalletsForToken("base", "0xt2");
  expect(sent.length).toBe(1);
});

test("doesn't notify while other tokens are still backfilling", async () => {
  completion = { ...completion, complete: 1, inProgress: 1 };
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(claims.length).toBe(0);
  expect(sent.length).toBe(0);
});

test("uses the freshly recomputed volume, not the cached flag", async () => {
  refreshed = { isComplete: false };
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(sent.length).toBe(0);
  refreshed = { isComplete: true };
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(sent.length).toBe(1);
});

test("a failed send releases the claim so a later completion can retry", async () => {
  webhookStatus = 500;
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(releases).toEqual(["0xwallet"]);
  webhookStatus = 200;
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(sent.length).toBe(2); // failed attempt + successful retry
});

test("missing webhook secret skips without claiming", async () => {
  delete process.env.WRAPPED_WEBHOOK_SECRET;
  await checkAndNotifyWalletsForToken("base", "0xt");
  expect(claims.length).toBe(0);
  expect(sent.length).toBe(0);
});
