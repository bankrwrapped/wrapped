// Robinhood handlers against an in-memory entity store: launches resolve
// even though Airlock.Create logs after Initialize, and creator fees count
// only from the launch's own fee holder (locker, initializer or its hook).
import { test, expect, mock, beforeEach } from "bun:test";

type Handler = (args: { event: any; context: any }) => Promise<void>;
const handlers = new Map<string, Handler>();
mock.module("envio", () => ({
  indexer: { onEvent: (sel: { contract: string; event: string }, fn: Handler) => handlers.set(`${sel.contract}.${sel.event}`, fn) },
}));

const NAMES = ["KnownAsset", "WatchedPool", "IndexedSwap", "IndexedFeeEvent", "DopplerHookOf", "RejectedFeeEmitter"];
let store: Record<string, Map<string, any>>;
const entity = (name: string) => ({
  get: async (id: string) => store[name].get(id),
  set: (row: any) => { store[name].set(row.id, row); },
});
let ctx: any;
beforeEach(() => {
  store = Object.fromEntries(NAMES.map((n) => [n, new Map()]));
  ctx = { chain: { id: 4663 }, ...Object.fromEntries(NAMES.map((n) => [n, entity(n)])) };
});

await import("../src/EventHandlers");

const LOCKER = "0x7B6147AC3F615BDB764E7EBD5F517DAC1AD163B8";
let logIndex = 0;
async function emit(key: string, params: Record<string, unknown>, txHash: string, block: number, srcAddress = LOCKER) {
  const fn = handlers.get(key);
  if (!fn) throw new Error("no handler " + key);
  await fn({
    event: { params, srcAddress, logIndex: ++logIndex, block: { number: block, timestamp: 1_760_000_000 }, transaction: { hash: txHash } },
    context: ctx,
  });
}

// Real order inside Airlock.create: PoolManager.Initialize, then the hook's
// FeeScheduleSet, then Airlock.Create.
async function launch() {
  await emit("PoolManager.Initialize", {
    id: "0xPOOL", currency0: "0x0000000000000000000000000000000000000000", currency1: "0xToken",
    fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0,
  }, "0xcreate", 100);
  await emit("DopplerFees.FeeScheduleSet", { poolId: "0xPOOL", startingTime: 0, startFee: 0, endFee: 0, durationSeconds: 0 }, "0xcreate", 100, "0xRehype");
  await emit("Airlock.Create", { asset: "0xToken", numeraire: "0x0000000000000000000000000000000000000000", initializer: "0xInit", poolOrHook: "0xh" }, "0xcreate", 100);
}
const release = (src: string, tx = "0xr", beneficiary = "0xAbCdEf") =>
  emit("DopplerFees.Release", { poolId: "0xPOOL", beneficiary, fees0: 1n, fees1: 2n }, tx, 200, src);

test("a launch whose Create logs after Initialize still resolves; swaps are indexed", async () => {
  await launch();
  await emit("PoolManager.Swap", { id: "0xPOOL", sender: "0xs", amount0: -5n, amount1: 7n, sqrtPriceX96: 0n, liquidity: 0n, tick: 0, fee: 0 }, "0xs", 150);
  const [row] = [...store.IndexedSwap.values()];
  expect(row).toMatchObject({ chain: "robinhood", tokenAddress: "0xtoken", amountToken: 7n });
});

test("Release from the locker, initializer or create-tx hook counts; beneficiary lowercased", async () => {
  await launch();
  await release(LOCKER, "0xr1");
  await release("0xINIT", "0xr2");
  await release("0xREHYPE", "0xr3");
  const rows = [...store.IndexedFeeEvent.values()];
  expect(rows.map((r) => r.emitter)).toEqual([LOCKER.toLowerCase(), "0xinit", "0xrehype"]);
  expect(rows.every((r) => r.recipient === "0xabcdef" && r.launchedToken === "0xtoken")).toBe(true);
});

test("a Release for a Bankr pool from any other contract is rejected and counted", async () => {
  await launch();
  await release("0xSpoof");
  expect(store.IndexedFeeEvent.size).toBe(0);
  expect(store.RejectedFeeEmitter.get("robinhood:0xspoof")).toMatchObject({ count: 1 });
});

test("non-Bankr pools are cached as such after their Initialize block", async () => {
  await emit("PoolManager.Initialize", {
    id: "0xOTHER", currency0: "0x01", currency1: "0x02", fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0,
  }, "0xi", 100);
  await emit("PoolManager.Swap", { id: "0xOTHER", sender: "0xs", amount0: 1n, amount1: 1n, sqrtPriceX96: 0n, liquidity: 0n, tick: 0, fee: 0 }, "0xs", 101);
  expect(store.WatchedPool.get("robinhood:0xother").notBankr).toBe(true);
  expect(store.IndexedSwap.size).toBe(0);
});
