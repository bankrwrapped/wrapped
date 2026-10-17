import { cursorAfterBlock, cursorAfterEvent, fetchIndexedFeeEventsPage, fetchWatchedPool, IndexedFeeEventRow, PAGE_SIZE, type WatchedPoolRow } from "./indexerSync/envioClient";
import { getHistoricalPriceUsd } from "./pricingService";
import { mapWithConcurrency } from "../utils/mapWithConcurrency";
import { getDecimals } from "./indexerSync/decimalsService";
import type { Chain } from "@bankr-wrapped/shared";

// =============================================================================
// Module 8 — beneficiary fee-event breakdown (Doppler Release + Clanker
// StoreTokens, scoped to Bankr launches), priced and grouped by SOURCE, with a
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

// Earned-fee events only (see envioClient's EARNED_FEE_EVENT_TYPES): Clanker
// is counted at accrual (StoreTokens), not at claim, because a claim pays out
// a pooled balance that can't be tied back to the launch that earned it.
function eventTypeToSource(eventType: IndexedFeeEventRow["eventType"]): FeeSource | null {
  switch (eventType) {
    case "Release":
      return "doppler";
    case "StoreTokens":
      return "clanker";
    default:
      return null;
  }
}

// Key for a set of Bankr-launched tokens - see getBeneficiaryFeesBreakdown's
// `bankrTokens` param.
export function bankrTokenKey(chain: string, tokenAddress: string): string {
  return `${chain}:${tokenAddress.toLowerCase()}`;
}

// The launch an earned-fee event belongs to. Doppler rows' tokenAddress is
// already the pool's launched token; Clanker StoreTokens rows' tokenAddress
// is the FEE token, so they use the indexer's launchedToken attribution.
function launchedTokenOf(event: IndexedFeeEventRow): string | null {
  if (event.eventType === "StoreTokens") return event.launchedToken ?? null;
  return event.tokenAddress;
}

// Uniswap V4 represents native ETH as currency address(0) - Doppler pools
// with an ETH numeraire pay that side of their fees in it.
const NATIVE_ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

function isEthLike(chain: Chain, tokenAddress: string): boolean {
  const addr = tokenAddress.toLowerCase();
  return addr === NATIVE_ETH_ADDRESS || addr === WETH_ADDRESS[chain].toLowerCase();
}

interface FeeLeg {
  tokenAddress: string;
  raw: bigint;
}

// Clanker path — CONFIRMED (Module 2): one amount, amountToken0, in the
// event's own tokenAddress (the fee token deposited - usually WETH).
// Doppler path: Release pays fees0 in the pool's currency0 AND fees1 in its
// currency1. Both sides are real earnings - previously only the launched
// token's side was counted, which dropped the numeraire (usually ETH/WETH)
// side, i.e. most of the money. Caller guarantees `pool` is resolved
// (tokenIsToken0 non-null) for pool-keyed events.
function resolveEventLegs(event: IndexedFeeEventRow, pool: WatchedPoolRow | null): FeeLeg[] {
  if (event.poolId === null) {
    return [{ tokenAddress: event.tokenAddress, raw: BigInt(event.amountToken0 ?? "0") }];
  }
  if (!pool || pool.tokenIsToken0 === null) {
    throw new Error(`resolveEventLegs: called with unresolved pool for poolId=${event.poolId}`);
  }
  return [
    { tokenAddress: pool.currency0, raw: BigInt(event.amountToken0 ?? "0") },
    { tokenAddress: pool.currency1, raw: BigInt(event.amountToken1 ?? "0") },
  ].filter((leg) => leg.raw > 0n);
}

function rawToDecimal(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
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

function toUnixSeconds(timestamp: string | number): number {
  if (typeof timestamp === "number") return timestamp;
  const ms = new Date(timestamp).getTime();
  if (Number.isNaN(ms)) {
     throw new Error(`toUnixSeconds: unparseable timestamp: ${timestamp}`);
  }
  return Math.floor(ms / 1000);
}

// Prices one fee leg into ETH. ETH/WETH legs are taken at face value (18
// decimals, no price lookup, usdAmount 0 as before); anything else is priced
// in USD at the event's time and converted via the WETH price at that time.
async function priceLeg(
  chain: Chain,
  event: IndexedFeeEventRow,
  leg: FeeLeg
): Promise<{ ethAmount: number; usdAmount: number }> {
  if (isEthLike(chain, leg.tokenAddress)) {
    return { ethAmount: rawToDecimal(leg.raw, 18), usdAmount: 0 };
  }

  const { decimals } = await resolveDecimals(chain, leg.tokenAddress);
  const tokenAmount = rawToDecimal(leg.raw, decimals);

  const wethAddr = WETH_ADDRESS[chain];
  const poolIdForPricing = event.poolId ?? "";
  const unixSeconds = toUnixSeconds(event.timestamp);
  const [tokenPriceUsd, wethPriceUsd] = await Promise.all([
    getHistoricalPriceUsd(chain, leg.tokenAddress, unixSeconds, poolIdForPricing),
    getHistoricalPriceUsd(chain, wethAddr, unixSeconds, poolIdForPricing),
  ]);

  const usdAmount = tokenAmount * tokenPriceUsd;
  const ethAmount = wethPriceUsd > 0 ? usdAmount / wethPriceUsd : 0;
  return { ethAmount, usdAmount };
}

// An event only counts if every one of its legs prices - a half-priced
// Release would silently understate earnings, so it's marked failed instead.
async function priceOneEvent(
  chain: Chain,
  event: IndexedFeeEventRow,
  pool: WatchedPoolRow | null
): Promise<PricedEvent> {
  try {
    const legs = resolveEventLegs(event, pool);
    const priced = await Promise.all(legs.map((leg) => priceLeg(chain, event, leg)));
    return {
      ethAmount: priced.reduce((sum, p) => sum + p.ethAmount, 0),
      usdAmount: priced.reduce((sum, p) => sum + p.usdAmount, 0),
      failed: false,
      usedFallbackDecimals: false,
    };
  } catch (err) {
    console.error(
      `[priceOneEvent FAILED] chain=${chain} tokenAddress=${event.tokenAddress} ` +
      `poolId=${event.poolId} txHash=${event.txHash} ` +
      `logIndex=${event.logIndex} timestamp=${event.timestamp} :: ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
    return { ethAmount: 0, usdAmount: 0, failed: true, usedFallbackDecimals: false };
  }
}

// `bankrTokens` scopes the breakdown to fees earned on Bankr launches: the
// indexer tracks EVERY Doppler/Clanker launch on the chain, and a wallet can
// hold fee rights in non-Bankr launches too. It's the set of
// bankrTokenKey(chain, token) for this wallet's tokens per Bankr's own API,
// passed as a promise so the first indexer page can load while that resolves.
// If it rejects (Bankr unavailable), the whole breakdown rejects - an
// unscoped total would overstate earnings.
export async function getBeneficiaryFeesBreakdown(
  address: string,
  bankrTokens: Promise<Set<string>>
): Promise<BeneficiaryFeesBreakdown> {
  // If an indexer call throws before bankrTokens is awaited, its rejection
  // would otherwise go unhandled and crash the process (see the Promise.race
  // note in wrappedService.fetchEarningsFromIndexer). The awaits below still
  // see the rejection.
  bankrTokens.catch(() => {});

  const bySource: Record<FeeSource, SourceEarnings> = {
    doppler: { totalEth: 0, totalUsd: 0, eventCount: 0, incomplete: false },
    clanker: { totalEth: 0, totalUsd: 0, eventCount: 0, incomplete: false },
  };
  const incompleteReasons: string[] = [];

  const watchedPoolCache = new Map<string, WatchedPoolRow | null>();

  async function getWatchedPool(chain: Chain, poolId: string): Promise<WatchedPoolRow | null> {
    const key = `${chain}:${poolId}`;
    if (watchedPoolCache.has(key)) return watchedPoolCache.get(key)!;
    const pool = await fetchWatchedPool(chain, poolId);
    watchedPoolCache.set(key, pool);
    return pool;
  }

  for (const chain of CHAINS) {
    try {
      let cursor = cursorAfterBlock("0");
      for (;;) {
        const page = await fetchIndexedFeeEventsPage(chain, address, cursor);
        if (page.length === 0) break;

        const scope = await bankrTokens;

      
        // Pass 1: resolve each event's WatchedPool serially, since
        // it's cache-backed and needs to be settled before pricing. Events
        // whose pool can't be resolved are marked incomplete here and
        // excluded from the pricing batch below.
        interface PricableEvent {
          event: IndexedFeeEventRow;
          source: FeeSource;
          pool: WatchedPoolRow | null;
        }
        const pricable: PricableEvent[] = [];
        for (const event of page) {
          const source = eventTypeToSource(event.eventType);
          if (!source) continue;

          const launchedToken = launchedTokenOf(event);
          if (launchedToken === null) {
            bySource[source].incomplete = true;
            incompleteReasons.push(`launch-unattributed: ${chain}:${event.txHash}:${event.logIndex}`);
            continue;
          }
          if (!scope.has(bankrTokenKey(chain, launchedToken))) continue; // not a Bankr launch

          let pool: WatchedPoolRow | null = null;
          if (event.poolId !== null) {
            pool = await getWatchedPool(chain, event.poolId);
            if (pool?.tokenIsToken0 == null) {
              bySource[source].incomplete = true;
              incompleteReasons.push(`pool-unresolved: ${chain}:${event.poolId}`);
              continue;
            }
          }

          pricable.push({ event, source, pool });
        }

        // Pass 2: price up to 5 events concurrently instead of one at a
        // time. GeckoTerminal's own MIN_REQUEST_INTERVAL_MS throttle still
        // serializes GeckoTerminal calls underneath this, so raising
        // concurrency here doesn't risk 429s - it just lets GoldRush calls
        // and non-fallback events overlap instead of queueing behind them.
        const pricedResults = await mapWithConcurrency(
          pricable,
          5,
          ({ event, pool }) => priceOneEvent(chain, event, pool)
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
        cursor = cursorAfterEvent(page[page.length - 1]);
        if (page.length < PAGE_SIZE) break;
      }
    } catch (err) {
      // Chains fail independently: Robinhood's indexer (paused) erroring
      // used to make this number unavailable for EVERY wallet, Base-only
      // ones included. A failure only matters if this wallet has Bankr
      // launches on that chain - then the whole breakdown still fails, so
      // the caller keeps its last good cached value rather than storing a
      // partial total as "ok". (Awaiting bankrTokens here also rethrows a
      // Bankr-scope failure, which must never be swallowed.)
      const scope = await bankrTokens;
      const walletHasLaunchesHere = [...scope].some((key) => key.startsWith(`${chain}:`));
      if (walletHasLaunchesHere) throw err;
      console.warn(
        `[getBeneficiaryFeesBreakdown] chain=${chain} unavailable, ignoring - wallet has no Bankr launches there: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // A wallet with no fee events never reaches the in-loop await - still
  // settle it here so a Bankr failure surfaces as a rejection, not as an
  // unhandled one.
  await bankrTokens;

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