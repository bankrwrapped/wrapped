import { fetchIndexedFeeEventsPage, fetchWatchedPool, IndexedFeeEventRow, PAGE_SIZE } from "./indexerSync/envioClient";
import { getHistoricalPriceUsd } from "./pricingService";
import { getDecimals } from "./indexerSync/decimalsService";
import type { Chain } from "@bankr-wrapped/shared";

// =============================================================================
// Module 8 — beneficiary fee-event breakdown (Doppler Release + Clanker
// ClaimTokens/ClaimTokensPermissioned), priced and grouped by SOURCE, with a
// real per-pool incomplete flag. NEW module, additive alongside the existing
// creator-fees/beneficiary-fees earnings on WrappedPayload — does not
// replace Bankr's public API calls.
//
// OQ8 category split: `source` ('doppler'/'clanker'), not chain — stocks
// exist on both chains and are out of scope here (Module 13).
//
// item 37 — REAL STATUS as of 2026-08-15: shipped and backfilled.
// 1,167,318 of 1,380,122 known tokens now matched; ~42,000 recovered by the
// fix. The remaining 212,804 is a SEPARATE, already-parked issue (the
// second-initializer-contract class) — not something this module can or
// should try to resolve. What this module CAN do, and does below: check,
// per pool, whether THAT pool's WatchedPool row is still unresolved
// (tokenIsToken0 === null) and flag only those specific events as
// incomplete — not a blanket "everything is incomplete" flag anymore.
//
// item 38 (2026-08-18) — decimals fix: previously ASSUMED_DECIMALS = 18 for
// every token, flagged in the code as an unverified guess because
// getTokenDecimals() didn't exist anywhere in the repo at the time. It now
// does: decimalsService.ts's getDecimals() reads indexed_tokens.decimals
// (populated by the volume-indexer backfill) and falls back to a real
// on-chain eth_call when uncached, writing the result back for next time.
// That's now the real per-token source used below. ONE REAL GAP, not
// hidden: getDecimals() only supports chain='base' (throws otherwise) —
// there's no RPC wired for 'robinhood' yet. Rather than let that throw
// crash the whole breakdown for a wallet with any robinhood-chain fee
// events, robinhood falls back to a clearly-flagged best-effort constant
// (still 18, same as before) with the event marked incomplete so it's
// visible in the response, not silently wrong. Get real robinhood decimals
// support wired (its own RPC + decimalsService branch) as a follow-up —
// this is a known, named gap, not a solved one.
// =============================================================================

const CHAINS: Chain[] = ["base", "robinhood"];

const WETH_ADDRESS: Record<Chain, string> = {
  base: "0x4200000000000000000000000000000000000006", // Base's public WETH predeploy
  // Robinhood Chain (mainnet, chainId 4663) canonical WETH — confirmed via
  // 1inch's own help center listing, corroborated by a second independent
  // source. NOT the testnet address (0x7943e237c7F95DA44E0301572D358911207852Fa).
  robinhood: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
};

export type FeeSource = "doppler" | "clanker";

export interface SourceEarnings {
  totalEth: number;
  totalUsd: number; // internal computational bridge only, per playbook's resolved USD/ETH conflict — never surfaced in frontend types
  eventCount: number;
  incomplete: boolean;
}

export interface BeneficiaryFeesBreakdown {
  address: string;
  bySource: Record<FeeSource, SourceEarnings>;
  totalEth: number;
  totalUsd: number;
  incomplete: boolean;
  incompleteReasons: string[];
}

function eventTypeToSource(eventType: IndexedFeeEventRow["eventType"]): FeeSource | null {
  switch (eventType) {
    case "Release":
      return "doppler";
    case "ClaimTokens":
    case "ClaimTokensPermissioned":
      return "clanker";
    default:
      return null;
  }
}

// Clanker path — CONFIRMED (Module 2): amountToken0 always, no exceptions.
// Doppler path — NOW REAL, not a placeholder: resolved via the pool's
// actual WatchedPool.tokenIsToken0. Caller guarantees this is only invoked
// once tokenIsToken0 is known non-null — the null/pending case is filtered
// out before this is called, never guessed here.
function resolveEventAmountRaw(event: IndexedFeeEventRow, tokenIsToken0: boolean | null): bigint {
  if (event.poolId === null) {
    return BigInt(event.amountToken0 ?? "0");
  }
  if (tokenIsToken0 === true) return BigInt(event.amountToken0 ?? "0");
  if (tokenIsToken0 === false) return BigInt(event.amountToken1 ?? "0");
  throw new Error(`resolveEventAmountRaw: called with unresolved tokenIsToken0 for poolId=${event.poolId}`);
}

function rawToDecimal(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

// Runs fn over items with at most `limit` in flight at once, preserving
// input order in the returned array. Added to fix fetchEarningsFromIndexer
// timing out at 25s: priceOneEvent was being awaited one at a time per
// event in getBeneficiaryFeesBreakdown's inner loop, and per-call latency
// (GoldRush 400ms-3000ms, GeckoTerminal fallback throttled at 6100ms min)
// stacks linearly against wallets with more than a handful of fee events.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
// Real per-token decimals via decimalsService's getDecimals() (DB cache,
// falling back to a live on-chain eth_call — see decimalsService.ts).
// Supports both 'base' and 'robinhood' (item 38 follow-up: robinhood RPC wired).
async function resolveDecimals(
  chain: Chain,
  tokenAddress: string,
): Promise<{ decimals: number; usedFallback: boolean }> {
  const decimals = await getDecimals(chain, tokenAddress);
  return { decimals, usedFallback: false };
}

interface PricedEvent {
  ethAmount: number;
  usdAmount: number;
  failed: boolean;
  usedFallbackDecimals: boolean;
}

async function priceOneEvent(
  chain: Chain,
  event: IndexedFeeEventRow,
  tokenIsToken0: boolean | null
): Promise<PricedEvent> {
  const rawAmount = resolveEventAmountRaw(event, tokenIsToken0);

  let decimals: number;
  let usedFallbackDecimals: boolean;
  try {
    const resolved = await resolveDecimals(chain, event.tokenAddress);
    decimals = resolved.decimals;
    usedFallbackDecimals = resolved.usedFallback;
  } catch (err) {
    console.error(
      `[priceOneEvent] getDecimals FAILED chain=${chain} tokenAddress=${event.tokenAddress} ` +
      `txHash=${event.txHash} logIndex=${event.logIndex} :: ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
    return { ethAmount: 0, usdAmount: 0, failed: true, usedFallbackDecimals: false };
  }

  const tokenAmount = rawToDecimal(rawAmount, decimals);

  const wethAddr = WETH_ADDRESS[chain];
  const isAlreadyEth = event.tokenAddress.toLowerCase() === wethAddr.toLowerCase();

  if (isAlreadyEth) {
    return { ethAmount: tokenAmount, usdAmount: 0, failed: false, usedFallbackDecimals };
  }

  function toUnixSeconds(timestamp: string | number): number {
    if (typeof timestamp === "number") return timestamp;
    const ms = new Date(timestamp).getTime();
    if (Number.isNaN(ms)) {
       throw new Error(`toUnixSeconds: unparseable timestamp: ${timestamp}`);
    }
    return Math.floor(ms / 1000);
  }

  try {
    const poolIdForPricing = event.poolId ?? "";
    const unixSeconds = toUnixSeconds(event.timestamp);
    const [tokenPriceUsd, wethPriceUsd] = await Promise.all([
      getHistoricalPriceUsd(chain, event.tokenAddress, unixSeconds, poolIdForPricing),
      getHistoricalPriceUsd(chain, wethAddr, unixSeconds, poolIdForPricing),
    ]);
    
    const usdAmount = tokenAmount * tokenPriceUsd;
    const ethAmount = wethPriceUsd > 0 ? usdAmount / wethPriceUsd : 0;
    return { ethAmount, usdAmount, failed: false, usedFallbackDecimals };
  } catch (err) {
    console.error(
      `[priceOneEvent FAILED] chain=${chain} tokenAddress=${event.tokenAddress} ` +
      `wethAddr=${wethAddr} poolId=${event.poolId} txHash=${event.txHash} ` +
      `logIndex=${event.logIndex} timestamp=${event.timestamp} :: ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
    return { ethAmount: 0, usdAmount: 0, failed: true, usedFallbackDecimals };
  }
}

export async function getBeneficiaryFeesBreakdown(address: string): Promise<BeneficiaryFeesBreakdown> {
  const bySource: Record<FeeSource, SourceEarnings> = {
    doppler: { totalEth: 0, totalUsd: 0, eventCount: 0, incomplete: false },
    clanker: { totalEth: 0, totalUsd: 0, eventCount: 0, incomplete: false },
  };
  const incompleteReasons: string[] = [];

  const watchedPoolCache = new Map<string, boolean | null>();

    async function getTokenIsToken0(chain: Chain, poolId: string): Promise<boolean | null> {
    const key = `${chain}:${poolId}`;
    if (watchedPoolCache.has(key)) return watchedPoolCache.get(key)!;
    const t0 = Date.now();
    console.log(`[DEBUG-timing] fetchWatchedPool: start chain=${chain} poolId=${poolId}`);
    const pool = await fetchWatchedPool(chain, poolId);
    console.log(`[DEBUG-timing] fetchWatchedPool: done chain=${chain} poolId=${poolId} elapsedMs=${Date.now() - t0}`);
    const resolved = pool?.tokenIsToken0 ?? null;
    watchedPoolCache.set(key, resolved);
    return resolved;
  }

  for (const chain of CHAINS) {
    let fromBlock = "0";
    for (;;) {
      const tPage = Date.now();
      console.log(`[DEBUG-timing] fetchIndexedFeeEventsPage: start chain=${chain} fromBlock=${fromBlock}`);
      const page = await fetchIndexedFeeEventsPage(chain, address, fromBlock);
      console.log(`[DEBUG-timing] fetchIndexedFeeEventsPage: done chain=${chain} fromBlock=${fromBlock} elapsedMs=${Date.now() - tPage} pageLen=${page.length}`);
      if (page.length === 0) break;

      
      // Pass 1: resolve pool-side (tokenIsToken0) serially per event, since
      // it's cache-backed and needs to be settled before pricing. Events
      // whose pool can't be resolved are marked incomplete here and
      // excluded from the pricing batch below.
      interface PricableEvent {
        event: IndexedFeeEventRow;
        source: FeeSource;
        tokenIsToken0: boolean | null;
      }
      const pricable: PricableEvent[] = [];
      for (const event of page) {
        const source = eventTypeToSource(event.eventType);
        if (!source) continue;

        let tokenIsToken0: boolean | null = null;
        if (event.poolId !== null) {
          tokenIsToken0 = await getTokenIsToken0(chain, event.poolId);
          if (tokenIsToken0 === null) {
            bySource[source].incomplete = true;
            incompleteReasons.push(`pool-unresolved: ${chain}:${event.poolId}`);
            continue;
          }
        }

        pricable.push({ event, source, tokenIsToken0 });
      }

      // Pass 2: price up to 5 events concurrently instead of one at a
      // time. GeckoTerminal's own MIN_REQUEST_INTERVAL_MS throttle still
      // serializes GeckoTerminal calls underneath this, so raising
      // concurrency here doesn't risk 429s - it just lets GoldRush calls
      // and non-fallback events overlap instead of queueing behind them.
      const pricedResults = await mapWithConcurrency(
        pricable,
        5,
        ({ event, tokenIsToken0 }) => priceOneEvent(chain, event, tokenIsToken0)
      );

      for (let i = 0; i < pricable.length; i++) {
        const { event, source } = pricable[i];
        const priced = pricedResults[i];

        if (priced.failed) {
          bySource[source].incomplete = true;
          incompleteReasons.push(`pricing-failed: ${chain}:${event.txHash}:${event.logIndex}`);
          continue;
        }

        if (priced.usedFallbackDecimals) {
          bySource[source].incomplete = true;
          incompleteReasons.push(
            `decimals-fallback-used: ${chain}:${event.txHash}:${event.logIndex} ` +
            `(token=${event.tokenAddress}, no RPC wired for chain=${chain} decimals lookup)`
          );
        }

        bySource[source].totalEth += priced.ethAmount;
        bySource[source].totalUsd += priced.usdAmount;
        bySource[source].eventCount += 1;
      }
      const last = page[page.length - 1];
      fromBlock = last.blockNumber;
      if (page.length < PAGE_SIZE) break;
    }
  }

  const totalEth = bySource.doppler.totalEth + bySource.clanker.totalEth;
  const totalUsd = bySource.doppler.totalUsd + bySource.clanker.totalUsd;
  const incomplete = bySource.doppler.incomplete || bySource.clanker.incomplete;

  return {
    address,
    bySource,
    totalEth,
    totalUsd,
    incomplete,
    incompleteReasons,
  };
}