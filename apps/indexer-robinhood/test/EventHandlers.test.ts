// Robinhood Release rows store the beneficiary lowercased, so the API's
// recipient filter matches.
import { test, expect, mock } from "bun:test";

type Handler = (args: { event: any; context: any }) => Promise<void>;
const handlers = new Map<string, Handler>();
mock.module("envio", () => ({
  indexer: { onEvent: (sel: { contract: string; event: string }, fn: Handler) => handlers.set(`${sel.contract}.${sel.event}`, fn) },
}));
const rows = new Map<string, any>();
const pools = new Map<string, any>([["robinhood:0xpool", { id: "robinhood:0xpool", tokenAddress: "0xtoken", tokenIsToken0: true }]]);
const context = {
  chain: { id: 4663 },
  WatchedPool: { get: async (id: string) => pools.get(id), set: () => {} },
  IndexedFeeEvent: { get: async (id: string) => rows.get(id), set: (r: any) => rows.set(r.id, r) },
};

await import("../src/EventHandlers");

test("Release beneficiary is lowercased", async () => {
  await handlers.get("StreamableFeesLockerV2.Release")!({
    event: {
      params: { poolId: "0xPOOL", beneficiary: "0xAbCdEf", fees0: 1n, fees1: 2n },
      logIndex: 1, block: { number: 1, timestamp: 1 }, transaction: { hash: "0xtx" },
    },
    context,
  });
  const [row] = [...rows.values()];
  expect(row.recipient).toBe("0xabcdef");
});
