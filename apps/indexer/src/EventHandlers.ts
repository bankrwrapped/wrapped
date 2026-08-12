/**
 * Module 2 + 4 — Base Chain Indexer (Doppler + Clanker)
 *
 * REWRITTEN 2026-08-08 against Envio V3's actual handler API. V2's
 * `import { X } from "generated"` + `Contract.Event.handler(...)` pattern
 * no longer exists — V3 uses a single `indexer` export from the "envio"
 * package, string contract/event names, and `context.chain.id` for the
 * current chain rather than a hardcoded per-file constant.
 *
 * REVERTED 2026-08-08 (real design change, not a bug fix) — pool matching
 * is currency-address matching (KnownAsset), not hook-address matching.
 * `poolOrHook` is NOT reliably a genuine V4 hook address.
 *
 * MODULE 4 RE-MERGED, 2026-08-08. Clanker's own pool discovery is
 * unaffected by the KnownHook -> KnownAsset revert above: `Clanker.TokenCreated`
 * gives `tokenAddress` and `poolId` straight from the factory itself, never
 * relied on a hook-address heuristic in the first place.
 *
 * FIXED 2026-08-09 (Module 2 diagnosis, real bug): PoolManager.Initialize's
 * KnownAsset lookup could race Airlock.Create's write for the same token
 * under Preload Optimization — every handler runs twice, and Initialize's
 * preload pass isn't guaranteed to run after its token's Create real-write
 * pass has landed, even when Create happened first on-chain. Confirmed via
 * BIS: KnownAsset existed, WatchedPool never got created. Measured impact:
 * 254,813 of 1,378,735 known tokens (~18.5%) missing a WatchedPool match.
 *
 * Fix: Initialize now writes WatchedPool unconditionally for every pool,
 * storing raw currency0/currency1 with tokenAddress/tokenIsToken0 left
 * null. Which side (if any) is a Bankr token is resolved lazily via
 * resolveWatchedPoolToken() at Swap/Collect/Release time instead — those
 * events happen much later than Initialize and aren't subject to the same
 * race. The resolved answer is cached back onto the WatchedPool row so
 * it's computed once per pool, not on every event.
 *
 * Tradeoff, accepted (see schema.graphql header for full reasoning):
 * WatchedPool now stores every pool PoolManager ever initializes on this
 * chain, not just Bankr's — there's no way to filter at Initialize time
 * anymore.
 *
 * Five contracts, all watched statically/globally from genesis:
 *  - Airlock.Create                            -> KnownAsset rows
 *  - PoolManager.Initialize                    -> WatchedPool rows, unconditional (see above)
 *  - PoolManager.Swap                          -> IndexedSwap rows, feeds Trading Volume Engine (Module 7)
 *  - StreamableFeesLockerV2.{Collect,Release}  -> IndexedFeeEvent rows, feeds Creator Earnings Breakdown (Module 8)
 *  - Clanker.TokenCreated                      -> KnownToken + WatchedPool rows (Module 4) — no lookup race, tokenAddress known immediately
 *  - ClankerFeeLocker.{StoreTokens,ClaimTokens,ClaimTokensPermissioned} -> IndexedFeeEvent rows (Module 4)
 *
 * MODULE 4 NOTE: ClankerLpLockerFeeConversion is deliberately NOT watched
 * here — it auto-collects LP fees per swap and calls storeFees() on
 * ClankerFeeLocker, which is what emits StoreTokens.
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
const CLANKER_SOURCE = "clanker"; // Module 4 — confirmed Base-only, not deployed on Robinhood (§2 OQ3)

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
};

// Lazily resolves and caches which side of a WatchedPool (if any) is a
// Bankr-launched Doppler token. Deferred from Initialize time specifically
// to avoid the Preload Optimization race — see file header. Returns null
// if this pool isn't a known Bankr/Doppler launch. Clanker pools always
// have tokenAddress already set at write time, so they short-circuit on
// the first check and never hit the KnownAsset lookup here.
async function resolveWatchedPoolToken(
  chain: string,
  pool: WatchedPoolEntity,
  context: any
): Promise<{ tokenAddress: string; tokenIsToken0: boolean } | null> {
  if (pool.tokenAddress !== undefined && pool.tokenAddress !== null) {
    return { tokenAddress: pool.tokenAddress, tokenIsToken0: pool.tokenIsToken0 === true };
  }

  const asset0 = await context.KnownAsset.get(`${chain}:${pool.currency0}`);
  const asset1 = await context.KnownAsset.get(`${chain}:${pool.currency1}`);
  const known = asset0 ?? asset1;
  if (!known) return null; // not a Bankr/Doppler launch — leave uncached, cheap to re-check if this changes

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
  });
});

// ---- Swap events (shared by Doppler and Clanker pools) -----------------------------------------------------

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

  const resolved = await resolveWatchedPoolToken(chain, pool, context);
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

indexer.onEvent({ contract: "StreamableFeesLockerV2", event: "Collect" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.poolId);
  const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
  if (!pool) return;

  const resolved = await resolveWatchedPoolToken(chain, pool, context);
  if (!resolved) return;

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: resolved.tokenAddress,
    eventType: "Collect",
    recipient: undefined,
    amountToken0: event.params.fees0,
    amountToken1: event.params.fees1,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
});

indexer.onEvent({ contract: "StreamableFeesLockerV2", event: "Release" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.poolId);
  const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
  if (!pool) return;

  const resolved = await resolveWatchedPoolToken(chain, pool, context);
  if (!resolved) return;

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: resolved.tokenAddress,
    eventType: "Release",
    recipient: event.params.beneficiary,
    amountToken0: event.params.fees0,
    amountToken1: event.params.fees1,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
});

// ---- Clanker pool discovery + fee events (Module 4) ------------------

indexer.onEvent({ contract: "Clanker", event: "TokenCreated" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const tokenAddress = normalizeAddress(event.params.tokenAddress);
  const poolId = normalizeAddress(event.params.poolId);
  const pairedToken = normalizeAddress(event.params.pairedToken);

  context.KnownToken.set({
    id: `${chain}:${tokenAddress}`,
    chain,
    tokenAddress,
    source: CLANKER_SOURCE,
  });

  // No lookup race here — TokenCreated gives tokenAddress directly from
  // the factory itself, so tokenAddress/tokenIsToken0 are set immediately,
  // not deferred like the Doppler path above.
  const tokenIsToken0 = tokenAddress < pairedToken; // Uniswap V4 orders currencies by address; both sides already normalized
  context.WatchedPool.set({
    id: `${chain}:${poolId}`,
    chain,
    poolId,
    currency0: tokenIsToken0 ? tokenAddress : pairedToken,
    currency1: tokenIsToken0 ? pairedToken : tokenAddress,
    tokenAddress,
    tokenIsToken0,
  });
});

indexer.onEvent({ contract: "ClankerFeeLocker", event: "StoreTokens" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const feeOwner = normalizeAddress(event.params.feeOwner);
  const token = normalizeAddress(event.params.token);

  const known = await context.KnownToken.get(`${chain}:${token}`);
  if (!known) return; // not one of Bankr's Clanker launches

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId: undefined,
    tokenAddress: token,
    eventType: "StoreTokens",
    recipient: feeOwner,
    amountToken0: event.params.amount,
    amountToken1: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
});

indexer.onEvent({ contract: "ClankerFeeLocker", event: "ClaimTokens" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const feeOwner = normalizeAddress(event.params.feeOwner);
  const token = normalizeAddress(event.params.token);

  const known = await context.KnownToken.get(`${chain}:${token}`);
  if (!known) return;

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId: undefined,
    tokenAddress: token,
    eventType: "ClaimTokens",
    recipient: feeOwner,
    amountToken0: event.params.amountClaimed,
    amountToken1: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
});

indexer.onEvent({ contract: "ClankerFeeLocker", event: "ClaimTokensPermissioned" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const feeOwner = normalizeAddress(event.params.feeOwner);
  const token = normalizeAddress(event.params.token);
  const recipient = normalizeAddress(event.params.recipient);

  const known = await context.KnownToken.get(`${chain}:${token}`);
  if (!known) return;

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId: undefined,
    tokenAddress: token,
    eventType: "ClaimTokensPermissioned",
    recipient, // the actual payout recipient, distinct from feeOwner here
    amountToken0: event.params.amountClaimed,
    amountToken1: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
});