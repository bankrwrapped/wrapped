/**
 * Module 2 — Base Chain Indexer (Doppler)
 *
 * REWRITTEN 2026-08-08 against Envio V3's actual handler API. V2's
 * `import { X } from "generated"` + `Contract.Event.handler(...)` pattern
 * no longer exists — V3 uses a single `indexer` export from the "envio"
 * package, string contract/event names, and `context.chain.id` for the
 * current chain rather than a hardcoded per-file constant. This matches
 * what Module 3's reference file for the shared Base+Robinhood handler
 * used — cross-checked, not just copied on trust.
 *
 * Handler logic is chain-agnostic on purpose: config.yaml (Base-only, see
 * that file's header) is what actually scopes this to Base right now.
 * Robinhood's chain id is already in CHAIN_NAMES so Module 3 can add its
 * chain block to config.yaml without touching this file.
 *
 * REVERTED 2026-08-08 (real design change, not a bug fix) — pool matching
 * is back to currency-address matching (KnownAsset), not hook-address
 * matching (the old KnownHook). Confirmed via a real on-chain `Create` tx
 * pulled directly from a block explorer: `poolOrHook` is NOT reliably a
 * genuine V4 hook address — it depends on which Doppler pool-initializer
 * variant ran for a given launch, and at least one real launch returned the
 * asset's own address in that slot instead of a hook. The hooks-based
 * design (OQ11) assumed every launch went through the hook-deploying
 * `UniswapV4Initializer` path; that assumption is false for at least some
 * real launches. Under the old design this wasn't just messy metadata — it
 * meant `PoolManager.Initialize`'s `hooks` field for that pool would never
 * match any `KnownHook` row, so `WatchedPool` never got created, and every
 * subsequent `Swap`/`Collect`/`Release` for that pool was silently dropped.
 * `hookAddress` is kept on `KnownAsset` as an audit field only — useful for
 * counting how many indexed launches used a non-hook initializer — not used
 * for any matching logic anymore.
 *
 * Three contracts, all watched statically/globally from genesis — no
 * contractRegister (PoolManager is a singleton shared by every pool on the
 * chain, so there's no per-pool contract address to register):
 *  - Airlock.Create                            -> KnownAsset rows (which token addresses are Bankr/Doppler's)
 *  - PoolManager.Initialize                    -> WatchedPool rows (poolId + which side is the token), matched against KnownAsset via currency0/currency1
 *  - PoolManager.Swap                          -> IndexedSwap rows, feeds Trading Volume Engine (Module 7)
 *  - StreamableFeesLockerV2.{Collect,Release}  -> IndexedFeeEvent rows, feeds Creator Earnings Breakdown (Module 8)
 *
 * Filtering strategy (Swap/Collect/Release): filtered in-handler against
 * WatchedPool existence, not via Envio's native topic-filter/`where`
 * clause — composability with config.yaml event registration was never
 * confirmed from docs; flagged as a Module 9 follow-up optimization, not
 * worth building against until measured PoolManager volume proves it's
 * actually a problem.
 */

import { indexer } from "envio";

const CHAIN_NAMES: Record<number, string> = {
  8453: "base",
  4663: "robinhood", // not yet active in config.yaml — see that file's header
};

function chainName(chainId: number): string {
  const name = CHAIN_NAMES[chainId];
  if (!name) {
    throw new Error(`Unrecognized chainId ${chainId} — add it to CHAIN_NAMES before indexing this network.`);
  }
  return name;
}

const SOURCE = "doppler"; // Clanker is Module 4's scope (Base only — confirmed not deployed on Robinhood, §2 OQ3)

// Addresses are EIP-55 checksummed by convention, and the same real address
// can render in different case depending on decode path/library. Every
// address AND bytes32 poolId used as an entity-store key or compared for
// equality is normalized through this.
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

// ---- Pool discovery ------------------------------------------------------

indexer.onEvent({ contract: "Airlock", event: "Create" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const tokenAddress = normalizeAddress(event.params.asset);
  const hookAddress = normalizeAddress(event.params.poolOrHook);

  context.KnownAsset.set({
    id: `${chain}:${tokenAddress}`,
    chain,
    tokenAddress,
    hookAddress, // audit-only — see file header; not used for matching
    source: SOURCE,
  });
});

indexer.onEvent({ contract: "PoolManager", event: "Initialize" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.id);
  const currency0 = normalizeAddress(event.params.currency0);
  const currency1 = normalizeAddress(event.params.currency1);

  const asset0 = await context.KnownAsset.get(`${chain}:${currency0}`);
  const asset1 = await context.KnownAsset.get(`${chain}:${currency1}`);
  const known = asset0 ?? asset1;
  if (!known) {
    // Neither side is one of Bankr's known launches — discard.
    return;
  }

  context.WatchedPool.set({
    id: `${chain}:${poolId}`,
    chain,
    poolId,
    tokenAddress: known.tokenAddress,
    tokenIsToken0: asset0 !== undefined && asset0 !== null,
  });
});

// ---- Swap events -----------------------------------------------------

indexer.onEvent({ contract: "PoolManager", event: "Swap" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.id);

  const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
  if (!pool) {
    // Not one of Bankr's known pools — discard.
    return;
  }

  // FIXED 2026-08-08: repeated-identical-amountToken bug. Two defensive
  // fixes, since either could independently cause it and neither was
  // confirmed against live data — both are cheap, correct regardless of
  // which was the real cause:
  //  1. `pool.tokenIsToken0` is coerced with `=== true` instead of used as
  //     a bare truthy check. If Envio's entity store round-trips a boolean
  //     through Postgres/GraphQL as the string "false" rather than a real
  //     `false`, a bare truthy check silently always takes the amount0
  //     branch — for any pool where the token is actually currency1, that
  //     means always returning the *numeraire* (e.g. WETH) delta instead
  //     of the token delta. Bots swapping fixed round numeraire amounts
  //     would look exactly like "repeated identical amountToken values."
  //  2. Both amounts are run through `BigInt(...)` before comparison/
  //     negation. If Envio's runtime hands these back as strings (common
  //     for values that don't safely fit a JS Number) rather than true
  //     bigints, `-rawAmount` on a string coerces through Number, silently
  //     losing BigInt precision — a second, independent route to wrong
  //     output for large amounts.
  const isToken0 = pool.tokenIsToken0 === true;
  const rawAmount = BigInt(isToken0 ? event.params.amount0 : event.params.amount1);
  const amountToken = rawAmount < 0n ? -rawAmount : rawAmount;

  context.IndexedSwap.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: pool.tokenAddress,
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

// ---- Fee events --------------------------------------------------------

indexer.onEvent({ contract: "StreamableFeesLockerV2", event: "Collect" }, async ({ event, context }) => {
  const chain = chainName(context.chain.id);
  const poolId = normalizeAddress(event.params.poolId);
  const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
  if (!pool) return;

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: pool.tokenAddress,
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

  context.IndexedFeeEvent.set({
    id: `${chain}:${event.transaction.hash}:${event.logIndex}`,
    chain,
    poolId,
    tokenAddress: pool.tokenAddress,
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
