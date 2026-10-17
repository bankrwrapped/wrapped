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
 *  - ClankerLpLocker.ClaimedRewards            -> attributes that tx's StoreTokens rows to their launched token
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
    launchedToken: resolved.tokenAddress,
    amountToken0: event.params.fees0,
    tokenAddress1: undefined,
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
    recipient: normalizeAddress(event.params.beneficiary), // lowercased like every other address here, so the API's recipient filter matches
    launchedToken: resolved.tokenAddress,
    amountToken0: event.params.fees0,
    tokenAddress1: undefined,
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

// Only the Clanker LP lockers deposit LP fees; storeFees() has other
// allowed depositors whose deposits aren't launch fees.
const CLANKER_LP_LOCKERS = new Set([
  "0x29d17c1a8d851d7d4ca97fae97acadb398d9cce0", // ClankerLpLocker
  "0x63d2dfea64b3433f4071a98665bcd7ca14d93496", // ClankerLpLockerFeeConversion
]);

// StoreTokens names only the FEE token (usually WETH, sometimes the launched
// token itself), never which launch earned it - the old KnownToken(token)
// filter therefore dropped every WETH deposit. The row is written now with
// launchedToken unset and queued on the tx; ClaimedRewards fills it in.
indexer.onEvent({ contract: "ClankerFeeLocker", event: "StoreTokens" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const sender = normalizeAddress(event.params.sender);
  if (!CLANKER_LP_LOCKERS.has(sender)) return;

  const feeOwner = normalizeAddress(event.params.feeOwner);
  const token = normalizeAddress(event.params.token);
  const id = `${chain}:${event.transaction.hash}:${event.logIndex}`;

  context.IndexedFeeEvent.set({
    id,
    chain,
    poolId: undefined,
    tokenAddress: token,
    eventType: "StoreTokens",
    recipient: feeOwner,
    launchedToken: undefined, // set by ClaimedRewards later in this tx
    amountToken0: event.params.amount,
    tokenAddress1: undefined,
    amountToken1: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });

  const pendingId = `${chain}:${event.transaction.hash}`;
  const pending = await context.PendingFeeAttribution.get(pendingId);
  context.PendingFeeAttribution.set({
    id: pendingId,
    eventIds: [...(pending?.eventIds ?? []), id],
  });
});

// Closes one _collectRewards(token) call: every StoreTokens queued on this tx
// since the previous ClaimedRewards was earned on `token`. _collectRewards
// can't nest (its _inCollect guard returns early), so a tx that collects
// for several launches emits StoreTokens..ClaimedRewards(A),
// StoreTokens..ClaimedRewards(B) - each batch is cleared once attributed.
indexer.onEvent({ contract: "ClankerLpLocker", event: "ClaimedRewards" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const launchedToken = normalizeAddress(event.params.token);
  const pendingId = `${chain}:${event.transaction.hash}`;

  const pending = await context.PendingFeeAttribution.get(pendingId);
  if (!pending || pending.eventIds.length === 0) return;

  for (const feeEventId of pending.eventIds) {
    const feeEvent = await context.IndexedFeeEvent.get(feeEventId);
    if (!feeEvent) continue;
    context.IndexedFeeEvent.set({ ...feeEvent, launchedToken });
  }
  context.PendingFeeAttribution.set({ id: pendingId, eventIds: [] });
});

// Clanker claims, kept so the API can check each wallet's Clanker numbers:
// per fee token, stored (StoreTokens) - claimed = the locker's on-chain
// availableFees. A claim can't be tied to a launch (it pays out a pooled
// per-fee-token balance), so launchedToken stays unset.
//
// No KnownToken(fee token) filter any more: like StoreTokens, the fee token
// is usually WETH, which is never a KnownToken, so that filter dropped
// nearly every claim. Every row is keyed by feeOwner - the wallet that
// earned the fees - including permissioned claims paid to someone else.
function setClankerClaim(
  context: any,
  event: any,
  eventType: "ClaimTokens" | "ClaimTokensPermissioned",
): void {
  const chain = chainName(context.chain.id);
  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId: undefined,
    tokenAddress: normalizeAddress(event.params.token),
    eventType,
    recipient: normalizeAddress(event.params.feeOwner),
    launchedToken: undefined,
    amountToken0: event.params.amountClaimed,
    tokenAddress1: undefined,
    amountToken1: undefined,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
}

indexer.onEvent({ contract: "ClankerFeeLocker", event: "ClaimTokens" }, async ({ event, context }) => {
  setClankerClaim(context, event, "ClaimTokens");
});

indexer.onEvent({ contract: "ClankerFeeLocker", event: "ClaimTokensPermissioned" }, async ({ event, context }) => {
  setClankerClaim(context, event, "ClaimTokensPermissioned");
});

// ---- Clanker v3.1 (Bankr launches 2025-03-18 to about July 2025) ----

// Bankr's deployer for every Clanker launch it made (140,541 per Clanker's
// API, v3.1 then v4). Launches with any other msgSender aren't Bankr's, even
// when they name Bankr's interface admin.
const BANKR_CLANKER_DEPLOYERS = new Set(["0x2112b8456ac07c15fa31ddf3bf713e77716ff3f9"]);

indexer.onEvent({ contract: "ClankerV31", event: "TokenCreated" }, async ({ event, context }) => {
  if (!BANKR_CLANKER_DEPLOYERS.has(normalizeAddress(event.params.msgSender))) return;
  const chain = chainName(context.chain.id);
  context.ClankerV31Launch.set({
    id: `${chain}:${event.params.positionId}`,
    chain,
    positionId: event.params.positionId,
    tokenAddress: normalizeAddress(event.params.tokenAddress),
    creatorAdmin: normalizeAddress(event.params.creatorAdmin),
    creatorRewardRecipient: normalizeAddress(event.params.creatorRewardRecipient),
    name: event.params.name,
    symbol: event.params.symbol,
    blockNumber: BigInt(event.block.number),
    timestamp: new Date(event.block.timestamp * 1000),
  });
});

// A collect pays the creator's share of both pool tokens at once - fees
// earned and paid out in the same step, so this is the v3.1 equivalent of
// Doppler's Release. Only Bankr launches (a ClankerV31Launch exists for the
// position) and only the creator's share: interface (Bankr) and team
// (Clanker) shares aren't anyone's Wrapped earnings.
indexer.onEvent({ contract: "ClankerV31LpLocker", event: "ClaimedRewards" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const launch = await context.ClankerV31Launch.get(`${chain}:${event.params.lpTokenId}`);
  if (!launch) return;
  const { creatorReward0, creatorReward1 } = event.params;
  if (creatorReward0 === 0n && creatorReward1 === 0n) return;

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId: undefined,
    tokenAddress: normalizeAddress(event.params.token0),
    tokenAddress1: normalizeAddress(event.params.token1),
    eventType: "ClankerV31ClaimedRewards",
    recipient: normalizeAddress(event.params.creatorRecipient),
    launchedToken: launch.tokenAddress,
    amountToken0: creatorReward0,
    amountToken1: creatorReward1,
    blockNumber: BigInt(event.block.number),
    txHash: event.transaction.hash,
    logIndex: event.logIndex,
    timestamp: new Date(event.block.timestamp * 1000),
  });
});
