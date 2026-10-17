// Cached DexScreener (24h) results written before the provider was dropped
// must not be served.
import "../../test/setupEnv";
import { test, expect, mock } from "bun:test";

let entry: { volumeUsd: number; source: string; updatedAt: Date } | null = null;
mock.module("../../repositories/tokenVolumeCacheRepository", () => ({
  tokenVolumeCacheRepository: { get: async () => entry, set: async () => {} },
}));

const { getCached } = await import("./cache");

test("fresh dexscreener entry is treated as a miss", async () => {
  entry = { volumeUsd: 5, source: "dexscreener", updatedAt: new Date() };
  expect(await getCached("base", "0xt")).toBeNull();
});

test("fresh lifetime-source entry is served", async () => {
  entry = { volumeUsd: 5, source: "geckoterminal", updatedAt: new Date() };
  expect(await getCached("base", "0xt")).toMatchObject({ volumeUsd: 5, resolved: true });
});

test("stale entries expire", async () => {
  entry = { volumeUsd: 5, source: "geckoterminal", updatedAt: new Date(Date.now() - 7 * 3600_000) };
  expect(await getCached("base", "0xt")).toBeNull();
});
