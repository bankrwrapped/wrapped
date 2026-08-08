/**
 * Module 2+3 — Base + Robinhood Chain Indexer (Doppler)
 *
 * CORRECTED 2026-08-07: rewritten against Envio V3's actual handler API
 * (envio@3.6.0). V2's `import { X } from "generated"` +
 * `Contract.Event.handler(...)` pattern no longer exists — V3 uses a
 * single `indexer` export from the "envio" package with string
 * contract/event names, and chain id comes from `context.chain.id` rather
 * than a per-network hardcoded constant.
 */

import { indexer } from "envio";

const CHAIN_NAMES: Record<number, string> = {
  8453: "base",
  4663: "robinhood",
};

function chainName(chainId: number): string {
  const name = CHAIN_NAMES[chainId];
  if (!name) {
    throw new Error(
      `Unrecognized chainId ${chainId} — add it to CHAIN_NAMES before indexing this network.`
    );
  }
  return name;
}

const SOURCE = "doppler"; // Clanker is Module 4's scope

// ---- Pool discovery ------------------------------------------------------

indexer.onEvent(
  { contract: "Airlock", event: "Create" },
  async ({ event, context }) => {
    const chain = chainName(context.chain.id);

    context.KnownHook.set({
      id: `${chain}:${event.params.poolOrHook}`,
      chain,
      hookAddress: event.params.poolOrHook,
      tokenAddress: event.params.asset,
      source: SOURCE,
    });
  }
);

indexer.onEvent(
  { contract: "PoolManager", event: "Initialize" },
  async ({ event, context }) => {
    const chain = chainName(context.chain.id);
    const { id: poolId, currency0, currency1, hooks } = event.params;

    const knownHook = await context.KnownHook.get(`${chain}:${hooks}`);
    if (!knownHook) return; // not one of Bankr's launches

    context.WatchedPool.set({
      id: `${chain}:${poolId}`,
      chain,
      poolId,
      tokenAddress: knownHook.tokenAddress,
      tokenIsToken0: currency0.toLowerCase() === knownHook.tokenAddress.toLowerCase(),
    });
  }
);

// ---- Swap events -----------------------------------------------------

indexer.onEvent(
  { contract: "PoolManager", event: "Swap" },
  async ({ event, context }) => {
    const chain = chainName(context.chain.id);
    const poolId = event.params.id;

    const pool = await context.WatchedPool.get(`${chain}:${poolId}`);
    if (!pool) return; // not one of Bankr's known pools

    const rawAmount = pool.tokenIsToken0 ? event.params.amount0 : event.params.amount1;
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
  }
);

// ---- Fee events --------------------------------------------------------

indexer.onEvent(
  { contract: "StreamableFeesLockerV2", event: "Collect" },
  async ({ event, context }) => {
    const chain = chainName(context.chain.id);
    const poolId = event.params.poolId;
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
  }
);

indexer.onEvent(
  { contract: "StreamableFeesLockerV2", event: "Release" },
  async ({ event, context }) => {
    const chain = chainName(context.chain.id);
    const poolId = event.params.poolId;
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
  }
);
