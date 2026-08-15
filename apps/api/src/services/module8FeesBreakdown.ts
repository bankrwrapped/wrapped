import { fetchIndexedFeeEventsPage, fetchWatchedPool, IndexedFeeEventRow, PAGE_SIZE } from "./indexerSync/envioClient";
import { getHistoricalPriceUsd } from "./pricingService";
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
// =============================================================================

const CHAINS: Chain[] = ["base", "robinhood"];

const WETH_ADDRESS: Record<Chain, string> = {
  base: "0x4200000000000000000000000000000000000006", // Base's public WETH predeploy
  // Robinhood Chain (mainnet, chainId 4663) canonical WETH — confirmed via
  // 1inch's own help center listing, corroborated by a second independent
  // source. NOT the testnet address (0x7943e237c7F95DA44E0301572D358911207852Fa).
  robinhood: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
};

// ---- FLAGGED — assumption, not read from anywhere ----
// getTokenDecimals doesn't exist in the repo (confirmed via grep). Assuming
// 18 for every token. If any numeraire or claimed token uses non-18
// decimals, amounts computed here will be wrong by a power-of-10 factor.
const ASSUMED_DECIMALS = 18;

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

interface PricedEvent {
  ethAmount: number;
  usdAmount: number;
  failed: boolean;
}

async function priceOneEvent(
  chain: Chain,
  event: IndexedFeeEventRow,
  tokenIsToken0: boolean | null
): Promise<PricedEvent> {
  const rawAmount = resolveEventAmountRaw(event, tokenIsToken0);
  const tokenAmount = rawToDecimal(rawAmount, ASSUMED_DECIMALS);

  const wethAddr = WETH_ADDRESS[chain];
  const isAlreadyEth = event.tokenAddress.toLowerCase() === wethAddr.toLowerCase();

  if (isAlreadyEth) {
    return { ethAmount: tokenAmount, usdAmount: 0, failed: false };
  }

  try {
    const poolIdForPricing = event.poolId ?? "";
    const [tokenPriceUsd, wethPriceUsd] = await Promise.all([
      getHistoricalPriceUsd(chain, event.tokenAddress, Number(event.timestamp), poolIdForPricing),
      getHistoricalPriceUsd(chain, wethAddr, Number(event.timestamp), poolIdForPricing),
    ]);
    const usdAmount = tokenAmount * tokenPriceUsd;
    const ethAmount = wethPriceUsd > 0 ? usdAmount / wethPriceUsd : 0;
    return { ethAmount, usdAmount, failed: false };
  } catch {
    return { ethAmount: 0, usdAmount: 0, failed: true };
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
    const pool = await fetchWatchedPool(chain, poolId);
    const resolved = pool?.tokenIsToken0 ?? null;
    watchedPoolCache.set(key, resolved);
    return resolved;
  }

  for (const chain of CHAINS) {
    let fromBlock = "0";
    for (;;) {
      const page = await fetchIndexedFeeEventsPage(chain, address, fromBlock);
      if (page.length === 0) break;

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

        const priced = await priceOneEvent(chain, event, tokenIsToken0);

        if (priced.failed) {
          bySource[source].incomplete = true;
          incompleteReasons.push(`pricing-failed: ${chain}:${event.txHash}:${event.logIndex}`);
          continue;
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
