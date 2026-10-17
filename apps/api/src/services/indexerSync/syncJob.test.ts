// Backfill pricing: swaps are grouped by UTC day (the granularity prices
// exist at) and lookups run with bounded concurrency, instead of one lookup
// per hour bucket all fired at once.
import "../../test/setupEnv";
import { test, expect, mock } from "bun:test";

let inFlight = 0;
let maxInFlight = 0;
let lookups = 0;
mock.module("../pricingService", () => ({
  getHistoricalPriceUsd: async () => {
    lookups += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return 1;
  },
}));

const { groupSwapsByDay, priceGroupsConcurrently } = await import("./syncJob");

const swapAt = (iso: string, i: number) => ({
  id: String(i), chain: "base", poolId: "p", tokenAddress: "0xt", blockNumber: String(i), logIndex: 0,
  timestamp: iso, amountToken: "1",
});

test("24 hourly swaps on one day form ONE price group", () => {
  const swaps = Array.from({ length: 24 }, (_, h) => swapAt(`2026-09-01T${String(h).padStart(2, "0")}:30:00.000Z`, h));
  const groups = groupSwapsByDay(swaps);
  expect(groups.size).toBe(1);
  expect([...groups.values()][0].swaps.length).toBe(24);
});

test("price lookups are capped at 8 in flight", async () => {
  const swaps = Array.from({ length: 40 }, (_, d) => {
    const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString();
    return swapAt(day, d);
  });
  const groups = groupSwapsByDay(swaps);
  expect(groups.size).toBe(40);
  const prices = await priceGroupsConcurrently("base", "0xt", groups);
  expect(prices.size).toBe(40);
  expect(lookups).toBe(40);
  expect(maxInFlight).toBeLessThanOrEqual(8);
  expect(maxInFlight).toBeGreaterThan(1);
});
