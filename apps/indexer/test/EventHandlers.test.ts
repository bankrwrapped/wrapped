// Base indexer handlers, run against an in-memory entity store (Envio's
// `indexer` is replaced): Clanker StoreTokens attributed to their launch via
// the LP locker's ClaimedRewards, non-locker deposits ignored, Doppler fee
// rows tagged and their beneficiary lowercased.
import { test, expect, mock, beforeEach } from "bun:test";

type Handler = (args: { event: any; context: any }) => Promise<void>;
const handlers = new Map<string, Handler>();
mock.module("envio", () => ({
  indexer: { onEvent: (sel: { contract: string; event: string }, fn: Handler) => handlers.set(`${sel.contract}.${sel.event}`, fn) },
}));

let store: Record<string, Map<string, any>>;
const entity = (name: string) => ({
  get: async (id: string) => store[name].get(id),
  set: (row: any) => { store[name].set(row.id, row); },
});
const context = () => ({
  chain: { id: 8453 },
  KnownAsset: entity("KnownAsset"), KnownToken: entity("KnownToken"), WatchedPool: entity("WatchedPool"),
  IndexedSwap: entity("IndexedSwap"), IndexedFeeEvent: entity("IndexedFeeEvent"),
  PendingFeeAttribution: entity("PendingFeeAttribution"), ClankerV31Launch: entity("ClankerV31Launch"),
});

await import("../src/EventHandlers");

const LOCKER = "0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496"; // FeeConversion locker (checksummed on purpose)
const WETH = "0x4200000000000000000000000000000000000006";
let logIndex = 0;
async function emit(key: string, params: Record<string, unknown>, txHash = "0xtx1") {
  const fn = handlers.get(key);
  if (!fn) throw new Error("no handler " + key);
  logIndex += 1;
  await fn({
    event: { params, logIndex, block: { number: 100, timestamp: 1_760_000_000 }, transaction: { hash: txHash } },
    context: ctx,
  });
}
let ctx: ReturnType<typeof context>;

beforeEach(() => {
  store = Object.fromEntries(
    ["KnownAsset", "KnownToken", "WatchedPool", "IndexedSwap", "IndexedFeeEvent", "PendingFeeAttribution", "ClankerV31Launch"].map((n) => [n, new Map()]),
  );
  ctx = context();
  logIndex = 0;
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
  await emit("StreamableFeesLockerV2.Release", { poolId: "0xPOOL", beneficiary: "0xBeNeFiCiArY", fees0: 11n, fees1: 22n });
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
