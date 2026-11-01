/**
 * Robinhood Chain indexer: Bankr's Doppler launches.
 *
 * Same Doppler logic as apps/indexer/src/EventHandlers.ts (Base) - keep the
 * two in step; Robinhood has no Clanker.
 *
 *  - Airlock.Create        -> KnownAsset (Bankr launches, their initializer and create tx)
 *  - PoolManager.Initialize -> WatchedPool for every pool; which side (if any)
 *                              is a Bankr token is resolved lazily, because
 *                              Airlock.Create logs AFTER Initialize in the
 *                              same tx - an Initialize-time KnownAsset lookup
 *                              misses every launch
 *  - PoolManager.Swap      -> IndexedSwap (trading volume)
 *  - DopplerFees.* (wildcard) -> IndexedFeeEvent (creator fees) from the
 *                              launch's own fee holder only; see isGenuineFeeEmitter
 */

import { indexer } from "envio";

const CHAIN_NAMES: Record<number, string> = {
  8453: "base",
  4663: "robinhood",
};

function chainName(chainId: number): string {
  const name = CHAIN_NAMES[chainId];
  if (!name) {
    throw new Error(`Unrecognized chainId ${chainId} — add it to CHAIN_NAMES before indexing this network.`);
  }
  return name;
}

const DOPPLER_SOURCE = "doppler";

// Addresses are EIP-55 checksummed by convention, and the same real address
// can render in different case depending on decode path/library. Every
// address AND bytes32 poolId used as an entity-store key or compared for
// equality is normalized through this.
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

type WatchedPoolEntity = {
  id: string;
  chain: string;
  poolId: string;
  currency0: string;
  currency1: string;
  tokenAddress?: string | null;
  tokenIsToken0?: boolean | null;
  initBlock?: bigint | null;
  notBankr?: boolean | null;
};

// Lazily resolves and caches which side of a WatchedPool (if any) is a
// Bankr-launched Doppler token. Deferred from Initialize time specifically
// to avoid the Preload Optimization race — see file header. Returns null
// if this pool isn't a known Bankr/Doppler launch.
//
// A negative answer is cached too (notBankr), since most PoolManager pools
// aren't Bankr's and their swaps would otherwise repeat the lookup forever.
// It's only cached once the event is in a later block than the pool's
// Initialize: Airlock.Create lands in the same tx as Initialize, so after
// that block the answer can't change. (Same-block events just re-check.)
async function resolveWatchedPoolToken(
  chain: string,
  pool: WatchedPoolEntity,
  context: any,
  blockNumber: bigint
): Promise<{ tokenAddress: string; tokenIsToken0: boolean } | null> {
  if (pool.tokenAddress !== undefined && pool.tokenAddress !== null) {
    return { tokenAddress: pool.tokenAddress, tokenIsToken0: pool.tokenIsToken0 === true };
  }
  if (pool.notBankr === true) return null;

  const [asset0, asset1] = await Promise.all([
    context.KnownAsset.get(`${chain}:${pool.currency0}`),
    context.KnownAsset.get(`${chain}:${pool.currency1}`),
  ]);
  const known = asset0 ?? asset1;
  if (!known) {
    if (pool.initBlock !== undefined && pool.initBlock !== null && blockNumber > pool.initBlock) {
      context.WatchedPool.set({ ...pool, notBankr: true });
    }
    return null;
  }

  const tokenIsToken0 = asset0 !== undefined && asset0 !== null;

  // Cache the resolved answer so future events for this pool skip the lookup.
  context.WatchedPool.set({
    ...pool,
    tokenAddress: known.tokenAddress,
    tokenIsToken0,
  });

  return { tokenAddress: known.tokenAddress, tokenIsToken0 };
}

// ---- Doppler pool discovery ------------------------------------------------------

indexer.onEvent({ contract: "Airlock", event: "Create" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const tokenAddress = normalizeAddress(event.params.asset);
  const hookAddress = normalizeAddress(event.params.poolOrHook);

  context.KnownAsset.set({
    id: `${chain}:${tokenAddress}`,
    chain,
    tokenAddress,
    hookAddress, // audit-only — see file header; not used for matching
    source: DOPPLER_SOURCE,
    // The launch's pool initializer: also its fee holder for initializer-
    // managed pools (DopplerHookInitializer, multicurve). Its create tx is
    // where a Rehype hook proves it belongs to this launch.
    initializer: normalizeAddress(event.params.initializer),
    createTxHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp: new Date(event.block.timestamp * 1000),
  });
});

indexer.onEvent({ contract: "PoolManager", event: "Initialize" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.id);
  const currency0 = normalizeAddress(event.params.currency0);
  const currency1 = normalizeAddress(event.params.currency1);

  // FIXED 2026-08-09 — see file header. Write unconditionally, no
  // KnownAsset lookup here. Token matching is resolved lazily at
  // Swap/Collect/Release time via resolveWatchedPoolToken().
  context.WatchedPool.set({
    id: `${chain}:${poolId}`,
    chain,
    poolId,
    currency0,
    currency1,
    tokenAddress: undefined,
    tokenIsToken0: undefined,
    initBlock: BigInt(event.block.number),
    notBankr: undefined,
  });
});

// ---- Swap events -----------------------------------------------------

indexer.onEvent({ contract: "PoolManager", event: "Swap" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.id);

  const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
  if (!pool) {
    // Pool was never initialized via PoolManager.Initialize — shouldn't
    // happen in practice now that Initialize writes unconditionally, but
    // defensive against any ordering edge case at the very start of a
    // backfill range.
    return;
  }

  const resolved = await resolveWatchedPoolToken(chain, pool, context, BigInt(event.block.number));
  if (!resolved) {
    // Not one of Bankr's known pools — discard.
    return;
  }

  const rawAmount = BigInt(resolved.tokenIsToken0 ? event.params.amount0 : event.params.amount1);
  const amountToken = rawAmount < 0n ? -rawAmount : rawAmount;

  context.IndexedSwap.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: resolved.tokenAddress,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
    amountToken,
    amountUsd: undefined, // Module 5's job
  });

  // No checkpoint write here — apps/api's backfill_checkpoint_block is
  // Module 9's sync job's responsibility, read from Envio's GraphQL API.
});

// ---- Doppler fee events --------------------------------------------------------

// StreamableFeesLockerV2 deployments: fees of pools that migrated into the
// locker. Not tied to one launch, so they're trusted by address. Everything
// else must be the launch's own initializer or its Rehype hook.
const DOPPLER_FEE_LOCKERS: Record<number, Set<string>> = {
  8453: new Set(["0xce3212e6536f33cd6fbfee265224131353ca3d47"]),
  4663: new Set(["0x7b6147ac3f615bdb764e7ebd5f517dac1ad163b8"]),
};

// The wildcard listener sees these events from any contract on the chain,
// and anyone can deploy a contract that emits Release(<a Bankr poolId>, me,
// huge) - so an event only counts when its emitter is that launch's fee
// holder: a known locker, the launch's initializer, or the Rehype hook that
// set the pool's fee schedule inside the launch's own create tx (only the
// initializer and its hook run in that tx), or a hook the initializer
// attached later (SetDopplerHook, emitted by the initializer itself).
async function isGenuineFeeEmitter(
  context: any,
  chain: string,
  emitter: string,
  poolId: string,
  asset: { initializer?: string | null; createTxHash?: string | null; tokenAddress: string } | undefined
): Promise<boolean> {
  if (DOPPLER_FEE_LOCKERS[context.chain.id]?.has(emitter)) return true;
  if (!asset?.initializer) return false;
  if (emitter === asset.initializer) return true;
  const [scheduled, attached] = await Promise.all([
    context.DopplerHookOf.get(`${chain}:pool:${poolId}`),
    context.DopplerHookOf.get(`${chain}:asset:${asset.tokenAddress}`),
  ]);
  if (scheduled && scheduled.hook === emitter && scheduled.txHash === asset.createTxHash) return true;
  if (attached && attached.hook === emitter && attached.setBy === asset.initializer) return true;
  return false;
}

// Collect (fees pulled into the fee holder, no recipient) and Release (fees
// paid to a beneficiary) produce the same row shape.
async function setDopplerFee(
  context: any,
  event: any,
  eventType: "Collect" | "Release",
  recipient: string | undefined
): Promise<void> {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.poolId);
  const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
  if (!pool) return;

  const resolved = await resolveWatchedPoolToken(chain, pool, context, BigInt(event.block.number));
  if (!resolved) return;

  const emitter = normalizeAddress(event.srcAddress);
  const asset = await context.KnownAsset.get(`${chain}:${resolved.tokenAddress}`);
  if (!(await isGenuineFeeEmitter(context, chain, emitter, poolId, asset))) {
    // A Bankr pool's fee event from a contract we don't recognise: either a
    // spoof or a Doppler fee holder this rule doesn't cover yet. Counted per
    // emitter so the second case shows up after a re-index.
    const id = `${chain}:${emitter}`;
    const seen = await context.RejectedFeeEmitter.get(id);
    context.RejectedFeeEmitter.set({
      id,
      chain,
      emitter,
      count: (seen?.count ?? 0) + 1,
      lastPoolId: poolId,
      lastBlock: BigInt(event.block.number),
    });
    return;
  }

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: resolved.tokenAddress,
    eventType,
    recipient,
    launchedToken: resolved.tokenAddress,
    amountToken0: event.params.fees0,
    tokenAddress1: undefined,
    amountToken1: event.params.fees1,
    emitter,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
}

indexer.onEvent({ contract: "DopplerFees", event: "Collect", wildcard: true }, async ({ event, context }) => {
  await setDopplerFee(context, event, "Collect", undefined);
});

indexer.onEvent({ contract: "DopplerFees", event: "Release", wildcard: true }, async ({ event, context }) => {
  // Lowercased like every other address here, so the API's recipient filter matches.
  await setDopplerFee(context, event, "Release", normalizeAddress(event.params.beneficiary));
});

// Recorded for every emitter; isGenuineFeeEmitter only trusts it when the tx
// is the launch's create tx. Only the first schedule per pool is kept.
indexer.onEvent({ contract: "DopplerFees", event: "FeeScheduleSet", wildcard: true }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const id = `${chain}:pool:${normalizeAddress(event.params.poolId)}`;
  if (await context.DopplerHookOf.get(id)) return;
  context.DopplerHookOf.set({
    id,
    chain,
    hook: normalizeAddress(event.srcAddress),
    setBy: undefined,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
  });
});

// Trusted only when setBy is the asset's initializer (checked at fee time).
indexer.onEvent({ contract: "DopplerFees", event: "SetDopplerHook", wildcard: true }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const setBy = normalizeAddress(event.srcAddress);
  const asset = normalizeAddress(event.params.asset);
  const known = await context.KnownAsset.get(`${chain}:${asset}`);
  if (!known || known.initializer !== setBy) return; // not a Bankr launch's own initializer
  context.DopplerHookOf.set({
    id: `${chain}:asset:${asset}`,
    chain,
    hook: normalizeAddress(event.params.dopplerHook),
    setBy,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
  });
});
