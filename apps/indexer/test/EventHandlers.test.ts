// Base indexer handlers, run against an in-memory entity store (Envio's
// `indexer` is replaced): Clanker StoreTokens attributed to their launch via
// the LP locker's ClaimedRewards, non-locker deposits ignored, Doppler fee
// rows tagged and their beneficiary lowercased.
import { test, expect, mock, beforeEach } from "bun:test";

type Handler = (args: { event: any; context: any }) => Promise<void>;
const handlers = new Map<string, Handler>();
// The LP locker list comes from config.yaml via indexer.chains, as at runtime.
const CONFIG_LP_LOCKERS = ["0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0", "0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496"];
mock.module("envio", () => ({
  indexer: {
    onEvent: (sel: { contract: string; event: string }, fn: Handler) => handlers.set(`${sel.contract}.${sel.event}`, fn),
    chains: { 8453: { ClankerLpLocker: { addresses: CONFIG_LP_LOCKERS } } },
  },
}));

let store: Record<string, Map<string, any>>;
const entity = (name: string) => ({
  get: async (id: string) => store[name].get(id),
  set: (row: any) => { store[name].set(row.id, row); },
  deleteUnsafe: (id: string) => { store[name].delete(id); },
});
const reads: string[] = [];
const counted = (name: string) => {
  const e = entity(name);
  return { ...e, get: async (id: string) => (reads.push(`${name}:${id}`), e.get(id)) };
};
const context = () => ({
  chain: { id: 8453 },
  KnownAsset: counted("KnownAsset"), KnownToken: entity("KnownToken"), WatchedPool: entity("WatchedPool"),
  IndexedSwap: entity("IndexedSwap"), IndexedFeeEvent: entity("IndexedFeeEvent"),
  PendingFeeAttribution: entity("PendingFeeAttribution"), ClankerV31Launch: entity("ClankerV31Launch"),
  DopplerHookOf: entity("DopplerHookOf"), RejectedFeeEmitter: entity("RejectedFeeEmitter"),
});

await import("../src/EventHandlers");

const LOCKER = "0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496"; // FeeConversion locker (checksummed on purpose)
const WETH = "0x4200000000000000000000000000000000000006";
let logIndex = 0;
// Default emitter for DopplerFees events: the Base fee locker (trusted by address).
const FEE_LOCKER = "0xCE3212E6536F33cd6FBFEE265224131353CA3D47";
async function emit(key: string, params: Record<string, unknown>, txHash = "0xtx1", block = 100, srcAddress = FEE_LOCKER) {
  const fn = handlers.get(key);
  if (!fn) throw new Error("no handler " + key);
  logIndex += 1;
  await fn({
    event: { params, srcAddress, logIndex, block: { number: block, timestamp: 1_760_000_000 }, transaction: { hash: txHash } },
    context: ctx,
  });
}
let ctx: ReturnType<typeof context>;

beforeEach(() => {
  store = Object.fromEntries(
    ["KnownAsset", "KnownToken", "WatchedPool", "IndexedSwap", "IndexedFeeEvent", "PendingFeeAttribution", "ClankerV31Launch", "DopplerHookOf", "RejectedFeeEmitter"].map((n) => [n, new Map()]),
  );
  ctx = context();
  logIndex = 0;
  reads.length = 0;
});

const store_ = (feeOwner: string, token: string, amount: bigint, sender = LOCKER) =>
  ({ sender, feeOwner, token, balance: amount, amount });

test("StoreTokens are attributed to the launch named by the ClaimedRewards that closes them", async () => {
  // One tx collecting for two launches: S S C(A)  S C(B)
  await emit("ClankerFeeLocker.StoreTokens", store_("0xCreatorOne", WETH, 5n));
  await emit("ClankerFeeLocker.StoreTokens", store_("0xCreatorTwo", WETH, 3n));
  await emit("ClankerLpLocker.ClaimedRewards", { token: "0xLaunchA", amount0: 0n, amount1: 0n, rewards0: [], rewards1: [] });
  await emit("ClankerFeeLocker.StoreTokens", store_("0xCreatorOne", "0xLaunchB", 7n));
  await emit("ClankerLpLocker.ClaimedRewards", { token: "0xLaunchB", amount0: 0n, amount1: 0n, rewards0: [], rewards1: [] });

  const rows = [...store.IndexedFeeEvent.values()].sort((a, b) => a.logIndex - b.logIndex);
  expect(rows.map((r) => [r.recipient, r.tokenAddress, r.launchedToken, r.amountToken0])).toEqual([
    ["0xcreatorone", WETH, "0xlauncha", 5n],
    ["0xcreatortwo", WETH, "0xlauncha", 3n],
    ["0xcreatorone", "0xlaunchb", "0xlaunchb", 7n],
  ]);
  // WETH deposits are kept now - the old KnownToken(fee token) filter dropped them.
  expect(rows.filter((r) => r.tokenAddress === WETH).length).toBe(2);
});

test("deposits from a non-locker depositor are ignored", async () => {
  await emit("ClankerFeeLocker.StoreTokens", store_("0xcreator", WETH, 5n, "0xSomeOtherDepositor"));
  expect(store.IndexedFeeEvent.size).toBe(0);
});

test("attribution is per transaction", async () => {
  await emit("ClankerFeeLocker.StoreTokens", store_("0xc", WETH, 1n), "0xtxA");
  await emit("ClankerLpLocker.ClaimedRewards", { token: "0xOther", amount0: 0n, amount1: 0n, rewards0: [], rewards1: [] }, "0xtxB");
  const [row] = [...store.IndexedFeeEvent.values()];
  expect(row.launchedToken).toBeUndefined(); // tx B's ClaimedRewards must not claim tx A's deposit
  await emit("ClankerLpLocker.ClaimedRewards", { token: "0xMine", amount0: 0n, amount1: 0n, rewards0: [], rewards1: [] }, "0xtxA");
  expect([...store.IndexedFeeEvent.values()][0].launchedToken).toBe("0xmine");
});

test("Clanker claims are kept whatever the fee token (WETH included), keyed by the fee owner", async () => {
  await emit("ClankerFeeLocker.ClaimTokens", { feeOwner: "0xEarner", token: WETH, amountClaimed: 4n });
  await emit("ClankerFeeLocker.ClaimTokensPermissioned", { feeOwner: "0xEarner", token: WETH, recipient: "0xPayee", amountClaimed: 2n });
  const rows = [...store.IndexedFeeEvent.values()].sort((a, b) => a.logIndex - b.logIndex);
  expect(rows.map((r) => [r.eventType, r.recipient, r.tokenAddress, r.amountToken0, r.launchedToken])).toEqual([
    ["ClaimTokens", "0xearner", WETH, 4n, undefined],
    ["ClaimTokensPermissioned", "0xearner", WETH, 2n, undefined],
  ]);
});

test("Doppler Release: beneficiary lowercased, launchedToken set, both fee amounts kept", async () => {
  await emit("Airlock.Create", { asset: "0xDopplerToken", numeraire: WETH, initializer: "0xi", poolOrHook: "0xh" });
  await emit("PoolManager.Initialize", {
    id: "0xPOOL", currency0: "0x0000000000000000000000000000000000000000", currency1: "0xDopplerToken",
    fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0,
  });
  await emit("DopplerFees.Release", { poolId: "0xPOOL", beneficiary: "0xBeNeFiCiArY", fees0: 11n, fees1: 22n });
  const [row] = [...store.IndexedFeeEvent.values()];
  expect(row.eventType).toBe("Release");
  expect(row.recipient).toBe("0xbeneficiary");
  expect(row.launchedToken).toBe("0xdopplertoken");
  expect([row.amountToken0, row.amountToken1]).toEqual([11n, 22n]);
});

// ---- Clanker v3.1 ----
const BANKR_DEPLOYER = "0x2112b8456AC07c15fA31ddf3Bf713E77716fF3F9";
const v31Created = (positionId: bigint, msgSender: string, token = "0xV31Token") => ({
  tokenAddress: token, creatorAdmin: "0xCreator", interfaceAdmin: "0xEea96d959963EaB488A3d4B7d5d347785cf1Eab8",
  creatorRewardRecipient: "0xCreator", interfaceRewardRecipient: "0xBankr", positionId, name: "Tok", symbol: "TOK",
  startingTickIfToken0IsNewToken: 0, metadata: "", amountTokensBought: 0n, vaultDuration: 0n, vaultPercentage: 0, msgSender,
});
const v31Claimed = (lpTokenId: bigint, creatorReward0: bigint, creatorReward1: bigint) => ({
  lpTokenId, creatorRecipient: "0xCreatorPayee", interfaceRecipient: "0xBankr", teamRecipient: "0xClanker",
  token0: "0xV31Token", token1: WETH, creatorReward0, creatorReward1,
  interfaceReward0: 9n, interfaceReward1: 9n, teamReward0: 9n, teamReward1: 9n,
});

test("v3.1: only launches sent by Bankr's deployer are recorded", async () => {
  await emit("ClankerV31.TokenCreated", v31Created(7n, BANKR_DEPLOYER));
  await emit("ClankerV31.TokenCreated", v31Created(8n, "0xE625F744f130D84542DD5e131C5Ea66a29887Af9", "0xNotBankr"));
  expect([...store.ClankerV31Launch.keys()]).toEqual(["base:7"]);
  expect(store.ClankerV31Launch.get("base:7")).toMatchObject({ tokenAddress: "0xv31token", creatorAdmin: "0xcreator", symbol: "TOK" });
});

test("v3.1 collect: the creator's share of both tokens, attributed to the launch; non-Bankr positions ignored", async () => {
  await emit("ClankerV31.TokenCreated", v31Created(7n, BANKR_DEPLOYER));
  await emit("ClankerV31LpLocker.ClaimedRewards", v31Claimed(7n, 40n, 4n));
  await emit("ClankerV31LpLocker.ClaimedRewards", v31Claimed(99n, 40n, 4n)); // no Bankr launch for position 99
  await emit("ClankerV31LpLocker.ClaimedRewards", v31Claimed(7n, 0n, 0n)); // nothing for the creator
  const rows = [...store.IndexedFeeEvent.values()];
  expect(rows.length).toBe(1);
  expect(rows[0]).toMatchObject({
    eventType: "ClankerV31ClaimedRewards", recipient: "0xcreatorpayee", launchedToken: "0xv31token",
    tokenAddress: "0xv31token", tokenAddress1: WETH, amountToken0: 40n, amountToken1: 4n,
  });
});

test("an attributed tx leaves no PendingFeeAttribution row behind", async () => {
  await emit("ClankerFeeLocker.StoreTokens", store_("0xc", WETH, 1n));
  expect(store.PendingFeeAttribution.size).toBe(1);
  await emit("ClankerLpLocker.ClaimedRewards", { token: "0xLaunch", amount0: 0n, amount1: 0n, rewards0: [], rewards1: [] });
  expect(store.PendingFeeAttribution.size).toBe(0);
  // A second collect in the same tx starts a fresh queue and is still attributed.
  await emit("ClankerFeeLocker.StoreTokens", store_("0xc", WETH, 2n));
  await emit("ClankerLpLocker.ClaimedRewards", { token: "0xLaunch2", amount0: 0n, amount1: 0n, rewards0: [], rewards1: [] });
  expect([...store.IndexedFeeEvent.values()].map((r) => r.launchedToken)).toEqual(["0xlaunch", "0xlaunch2"]);
  expect(store.PendingFeeAttribution.size).toBe(0);
});

test("StoreTokens is accepted from both config.yaml LP lockers, in any address case", async () => {
  await emit("ClankerFeeLocker.StoreTokens", store_("0xa", WETH, 1n, CONFIG_LP_LOCKERS[0].toLowerCase()));
  await emit("ClankerFeeLocker.StoreTokens", store_("0xb", WETH, 1n, CONFIG_LP_LOCKERS[1]));
  expect(store.IndexedFeeEvent.size).toBe(2);
});

const v4Created = (msgSender: string, token: string, poolId: string) => ({
  msgSender, tokenAddress: token, tokenAdmin: "0xadmin", tokenImage: "", tokenName: "T", tokenSymbol: "T",
  tokenMetadata: "", tokenContext: "", startingTick: 0, poolHook: "0xhook", poolId, pairedToken: WETH,
  locker: "0xlocker", mevModule: "0xmev", extensionsSupply: 0n, extensions: [],
});

test("Clanker v4: only Bankr's deployer registers a launch and its pool", async () => {
  await emit("Clanker.TokenCreated", v4Created(BANKR_DEPLOYER, "0xBankrV4", "0xPOOLA"));
  await emit("Clanker.TokenCreated", v4Created("0xSomeoneElse", "0xOtherV4", "0xPOOLB"));
  expect([...store.KnownToken.keys()]).toEqual(["base:0xbankrv4"]);
  expect([...store.WatchedPool.keys()]).toEqual(["base:0xpoola"]);
});

test("Doppler Collect: launchedToken set, no recipient", async () => {
  await emit("Airlock.Create", { asset: "0xDopplerToken", numeraire: WETH, initializer: "0xi", poolOrHook: "0xh" });
  await emit("PoolManager.Initialize", {
    id: "0xPOOL", currency0: "0x0000000000000000000000000000000000000000", currency1: "0xDopplerToken",
    fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0,
  });
  await emit("DopplerFees.Collect", { poolId: "0xPOOL", fees0: 1n, fees1: 2n });
  const [row] = [...store.IndexedFeeEvent.values()];
  expect(row).toMatchObject({ eventType: "Collect", recipient: undefined, launchedToken: "0xdopplertoken", amountToken0: 1n, amountToken1: 2n });
});

const swap = (id: string) => ({ id, sender: "0xs", amount0: -5n, amount1: 7n, sqrtPriceX96: 0n, liquidity: 0n, tick: 0, fee: 0 });

test("non-Bankr pools: the KnownAsset lookup is cached as notBankr after the Initialize block", async () => {
  const init = { id: "0xFOREIGN", currency0: "0x0000000000000000000000000000000000000001", currency1: WETH, fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0 };
  await emit("PoolManager.Initialize", init, "0xinit", 100);
  // Same block as Initialize: a Create could still be in it, so nothing is cached.
  await emit("PoolManager.Swap", swap("0xFOREIGN"), "0xs1", 100);
  expect(store.WatchedPool.get("base:0xforeign").notBankr).toBeUndefined();
  await emit("PoolManager.Swap", swap("0xFOREIGN"), "0xs2", 101);
  expect(store.WatchedPool.get("base:0xforeign").notBankr).toBe(true);
  const before = reads.length;
  await emit("PoolManager.Swap", swap("0xFOREIGN"), "0xs3", 102);
  expect(reads.length).toBe(before); // no more KnownAsset reads
  expect(store.IndexedSwap.size).toBe(0);
});

test("Bankr Doppler pools still resolve and index swaps", async () => {
  await emit("Airlock.Create", { asset: "0xDopplerToken", numeraire: WETH, initializer: "0xi", poolOrHook: "0xh" }, "0xc", 100);
  await emit("PoolManager.Initialize", {
    id: "0xPOOL", currency0: "0x0000000000000000000000000000000000000000", currency1: "0xDopplerToken",
    fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0,
  }, "0xc", 100);
  await emit("PoolManager.Swap", swap("0xPOOL"), "0xs", 105);
  const [row] = [...store.IndexedSwap.values()];
  expect(row).toMatchObject({ tokenAddress: "0xdopplertoken", amountToken: 7n });
  expect(store.WatchedPool.get("base:0xpool")).toMatchObject({ tokenAddress: "0xdopplertoken", tokenIsToken0: false });
});

// ---- Which contracts' fee events count ----

const POOL_INIT = {
  id: "0xPOOL", currency0: "0x0000000000000000000000000000000000000000", currency1: "0xDopplerToken",
  fee: 0, tickSpacing: 0, hooks: "0xh", sqrtPriceX96: 0n, tick: 0,
};
async function launch() {
  await emit("Airlock.Create", { asset: "0xDopplerToken", numeraire: WETH, initializer: "0xInit", poolOrHook: "0xh" }, "0xcreate", 100);
  await emit("PoolManager.Initialize", POOL_INIT, "0xcreate", 100);
}
const release = (src: string, tx = "0xr") =>
  emit("DopplerFees.Release", { poolId: "0xPOOL", beneficiary: "0xb", fees0: 1n, fees1: 0n }, tx, 200, src);

test("fees from the launch's own initializer count, with the emitter recorded", async () => {
  await launch();
  await release("0xINIT");
  const [row] = [...store.IndexedFeeEvent.values()];
  expect(row).toMatchObject({ emitter: "0xinit", launchedToken: "0xdopplertoken" });
  expect(store.KnownAsset.get("base:0xdopplertoken")).toMatchObject({ initializer: "0xinit", createTxHash: "0xcreate" });
});

test("a Release for a Bankr pool from an unrelated contract is rejected and counted", async () => {
  await launch();
  await release("0xSpoofer");
  await release("0xSpoofer", "0xr2");
  expect(store.IndexedFeeEvent.size).toBe(0);
  expect(store.RejectedFeeEmitter.get("base:0xspoofer")).toMatchObject({ count: 2, lastPoolId: "0xpool" });
});

test("fee events for pools that aren't Bankr launches are ignored without a rejection row", async () => {
  await release("0xAnything");
  expect(store.IndexedFeeEvent.size + store.RejectedFeeEmitter.size).toBe(0);
});

test("a Rehype hook counts only when it set the fee schedule in the launch's create tx", async () => {
  await launch();
  const sched = { poolId: "0xPOOL", startingTime: 0, startFee: 0, endFee: 0, durationSeconds: 0 };
  await emit("DopplerFees.FeeScheduleSet", sched, "0xcreate", 100, "0xRehype");
  // A later schedule from someone else doesn't replace the first.
  await emit("DopplerFees.FeeScheduleSet", sched, "0xlater", 150, "0xSpoofer");
  await release("0xREHYPE");
  await release("0xSpoofer", "0xr2");
  const rows = [...store.IndexedFeeEvent.values()];
  expect(rows.map((r) => r.emitter)).toEqual(["0xrehype"]);
});

test("a schedule set outside the create tx doesn't make its emitter trusted", async () => {
  await launch();
  await emit("DopplerFees.FeeScheduleSet", { poolId: "0xPOOL", startingTime: 0, startFee: 0, endFee: 0, durationSeconds: 0 }, "0xother", 150, "0xFake");
  await release("0xFake");
  expect(store.IndexedFeeEvent.size).toBe(0);
});

test("a hook attached later counts only when the launch's initializer attached it", async () => {
  await launch();
  await emit("DopplerFees.SetDopplerHook", { asset: "0xDopplerToken", dopplerHook: "0xFakeHook" }, "0xs1", 150, "0xNotInit");
  await release("0xFAKEHOOK");
  expect(store.IndexedFeeEvent.size).toBe(0);
  await emit("DopplerFees.SetDopplerHook", { asset: "0xDopplerToken", dopplerHook: "0xNewHook" }, "0xs2", 160, "0xInit");
  await release("0xNEWHOOK", "0xr2");
  expect([...store.IndexedFeeEvent.values()].map((r) => r.emitter)).toEqual(["0xnewhook"]);
});
