// Volume waterfall: DexScreener (24h volume) is no longer consulted, so a
// token no lifetime source has is excluded rather than given a 24h number.
import "../../test/setupEnv";
import { test, expect, mock } from "bun:test";

const called: string[] = [];
let notFoundCached = 0;
mock.module("./providers/indexer", () => ({ fetchIndexerVolume: async () => { called.push("indexer"); return null; } }));
mock.module("./providers/geckoTerminal", () => ({ fetchGeckoTerminalVolume: async () => { called.push("gecko"); return null; } }));
mock.module("./providers/dexPaprika", () => ({ fetchDexPaprikaVolume: async () => { called.push("paprika"); return null; } }));
mock.module("./providers/dexScreener", () => ({
  fetchDexScreenerVolume: async () => { called.push("dexscreener"); return { source: "dexscreener", volumeUsd: 123 }; },
}));
mock.module("./cache", () => ({
  getCached: async () => null,
  setCached: async () => {},
  setNotFoundCached: async () => { notFoundCached += 1; },
}));

const { resolveTokenVolume } = await import("./waterfall");

test("DexScreener is never consulted; unresolved tokens are excluded, not 24h-valued", async () => {
  const r = await resolveTokenVolume({ address: "0xt", chain: "base" });
  expect(called).toEqual(["indexer", "gecko", "paprika"]);
  expect(r.resolved).toBe(false);
  expect(r.volumeUsd).toBeNull();
  expect(notFoundCached).toBe(1);
});

test("Clanker v3.1 tokens (Uniswap V3) skip the indexer, which only sees V4 swaps", async () => {
  called.length = 0;
  await resolveTokenVolume({ address: "0xv31", chain: "base", source: "clanker_v3_1" });
  expect(called).toEqual(["gecko", "paprika"]);
});
