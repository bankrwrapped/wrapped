import { fetchIndexedFeeEventsPage, IndexedFeeEventRow, PAGE_SIZE } from "./indexerSync/envioClient";
import { getHistoricalPriceUsd } from "./pricingService";
import type { Chain } from "@bankr-wrapped/shared";

// =============================================================================
// Module 8 — beneficiary fee-event breakdown (Doppler Release + Clanker
// ClaimTokens/ClaimTokensPermissioned), priced and grouped by SOURCE, with an
// incomplete-data flag. This is a NEW module, not a replacement for the
// existing creator-fees/beneficiary-fees earnings already on WrappedPayload.
//
// OQ8 — RESOLVED: category is `source` ('doppler'/'clanker'), not chain.
// Stocks (RFQ on Robinhood, Coinbase b20 on Base) exist on both chains and
// are parked (Module 13, not built) — chain never determines category.
//
// Confirmed against real files 2026-08-12: field names/types in
// IndexedFeeEventRow (envioClient.ts / schema.graphql), getHistoricalPriceUsd's
// signature (pricingService.ts), and Chain (packages/shared) all match what
// this file assumes. No mismatches found.
//
// OPEN — needs your confirmation, not resolved here: schema.graphql's header
// says item 37 was "FIXED 2026-08-09", citing 254,813/1,378,735 (~18.5%)
// tokens missing a WatchedPool match — the SAME 254,813 figure originally
// flagged as "backfill-pending". That strongly suggests ITEM_37_SHIPPED and
// isTokenBackfillPending below are two flags for one underlying gap, not
// two separate ones. A changelog comment saying "FIXED" is not the same as
// confirming production deploy + backfill of existing rows, so ITEM_37_SHIPPED
// stays `false` here per your last explicit answer — not silently flipped.
// Confirm current deploy status before shipping.
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

// ---- FLAGGED — see OPEN note above re: possible overlap with ITEM_37_SHIPPED ----
async function isTokenBackfillPending(_chain: Chain, _tokenAddress: string): Promise<boolean> {
  return false; // TODO: wire to real backfill-pending check, or retire this if item 37 supersedes it
}

// See OPEN note above — left `false` per your last explicit confirmation,
// NOT flipped based on schema.graphql's "FIXED" changelog comment alone.
const ITEM_37_SHIPPED = false;

export type FeeSource = "doppler" | "clanker";

export interface SourceEarnings {
  totalEth: number;
  totalUsd: number; // internal-only by existing convention
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

// Clanker path — CONFIRMED (Module 2). Doppler path — still FLAGGED, needs
// WatchedPool.tokenIsToken0 (confirmed to exist in schema.graphql, just not
// wired into this function yet).
function resolveEventAmountRaw(event: IndexedFeeEventRow): bigint {
  if (event.poolId === null) {
    return BigInt(event.amountToken0 ?? "0");
  }
  const t0 = BigInt(event.amountToken0 ?? "0");
  const t1 = BigInt(event.amountToken1 ?? "0");
  return t0 !== 0n ? t0 : t1;
}

function rawToDecimal(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

interface PricedEvent {
  event: IndexedFeeEventRow;
  source: FeeSource;
  ethAmount: number;
  usdAmount: number;
  failed: boolean;
}

async function priceOneEvent(chain: Chain, event: IndexedFeeEventRow, source: FeeSource): Promise<PricedEvent> {
  const rawAmount = resolveEventAmountRaw(event);
  const tokenAmount = rawToDecimal(rawAmount, ASSUMED_DECIMALS);

  const wethAddr = WETH_ADDRESS[chain];
  const isAlreadyEth = wethAddr !== "" && event.tokenAddress.toLowerCase() === wethAddr.toLowerCase();

  if (isAlreadyEth) {
    return { event, source, ethAmount: tokenAmount, usdAmount: 0, failed: false };
  }

  try {
    const poolIdForPricing = event.poolId ?? "";
    const [tokenPriceUsd, wethPriceUsd] = await Promise.all([
      getHistoricalPriceUsd(chain, event.tokenAddress, Number(event.timestamp), poolIdForPricing),
      getHistoricalPriceUsd(chain, wethAddr, Number(event.timestamp), poolIdForPricing),
    ]);
    const usdAmount = tokenAmount * tokenPriceUsd;
    const ethAmount = wethPriceUsd > 0 ? usdAmount / wethPriceUsd : 0;
    return { event, source, ethAmount, usdAmount, failed: false };
  } catch {
    // Covers GoldRush failing outright AND toGoldRushChainSlug throwing for
    // "robinhood" (confirmed in pricingService.ts — only "base" is mapped),
    // in which case GeckoTerminal fallback is tried before this catch fires.
    return { event, source, ethAmount: 0, usdAmount: 0, failed: true };
  }
}

export async function getBeneficiaryFeesBreakdown(address: string): Promise<BeneficiaryFeesBreakdown> {
  const bySource: Record<FeeSource, SourceEarnings> = {
    doppler: { totalEth: 0, totalUsd: 0, eventCount: 0, incomplete: false },
    clanker: { totalEth: 0, totalUsd: 0, eventCount: 0, incomplete: false },
  };
  const incompleteReasons: string[] = [];

  if (!ITEM_37_SHIPPED) {
    incompleteReasons.push(
      "item-37-not-shipped: WatchedPool Initialize/Create race fix not confirmed deployed — up to ~18.5% of tokens may have unresolved WatchedPool matches"
    );
  }

  for (const chain of CHAINS) {
    let fromBlock = "0";
    for (;;) {
      const page = await fetchIndexedFeeEventsPage(chain, address, fromBlock);
      if (page.length === 0) break;

      for (const event of page) {
        const source = eventTypeToSource(event.eventType);
        if (!source) continue;

        const pending = await isTokenBackfillPending(chain, event.tokenAddress);
        const priced = await priceOneEvent(chain, event, source);

        if (priced.failed || pending) {
          bySource[source].incomplete = true;
          if (priced.failed) {
            incompleteReasons.push(`pricing-failed: ${chain}:${event.txHash}:${event.logIndex}`);
          }
          if (pending) {
            incompleteReasons.push(`backfill-pending: ${chain}:${event.tokenAddress}`);
          }
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
  const incomplete = !ITEM_37_SHIPPED || bySource.doppler.incomplete || bySource.clanker.incomplete;

  return {
    address,
    bySource,
    totalEth,
    totalUsd,
    incomplete,
    incompleteReasons,
  };
}
