import { CLANKER_FEE_TOKEN_WETH, getAvailableFees } from "./clankerFeeLocker";
import { getCurrentPricesUsd } from "./currentPrices";
import {
  cursorAfterBlock,
  cursorAfterEvent,
  fetchClankerLedgerPage,
  fetchLatestProcessedBlock,
  PAGE_SIZE,
} from "./indexerSync/envioClient";
import { mapWithConcurrency } from "../utils/mapWithConcurrency";

// A wallet's Clanker v4 fees, checked against the chain.
//
// ClankerFeeLocker keeps one balance per (fee owner, fee token): StoreTokens
// adds to it, claims take from it. So for every fee token,
//   credited (StoreTokens) - claimed (ClaimTokens*) = availableFees on-chain
// at the block the indexer has processed up to. When that holds for every
// token, the indexer saw every Clanker fee the wallet ever earned, and its
// accrual totals can be shown as the wallet's Clanker earnings. When it
// doesn't, something is missing (events, a dropped fee token, an indexing
// gap) and the caller falls back.
//
// Covers Clanker v4 only - the fee locker doesn't exist in v3.1 and earlier.

const CHAIN = "base";
const DECIMALS = 18; // ClankerToken and WETH
const RPC_CONCURRENCY = 5;

export interface ClankerTokenCheck {
  token: string;
  credited: bigint;
  claimed: bigint;
  available: bigint;
  reconciled: boolean;
}

export interface ClankerLedger {
  // Unclaimed now, in WETH and the given launched tokens, priced in ETH.
  claimableEth: number;
  claimableUnpriced: number;
  // null when the indexer couldn't be read; atBlock null when the on-chain
  // read couldn't be pinned to the indexer's block (then a lagging indexer
  // shows as unreconciled - the safe direction).
  check: { reconciled: boolean; atBlock: bigint | null; tokens: ClankerTokenCheck[] } | null;
}

async function readIndexerLedger(wallet: string) {
  const credited = new Map<string, bigint>();
  const claimed = new Map<string, bigint>();
  let cursor = cursorAfterBlock("0");
  for (;;) {
    const page = await fetchClankerLedgerPage(CHAIN, wallet, cursor);
    for (const row of page) {
      const token = row.tokenAddress.toLowerCase();
      const amount = BigInt(row.amountToken0 ?? "0");
      const into = row.eventType === "StoreTokens" ? credited : claimed;
      into.set(token, (into.get(token) ?? 0n) + amount);
    }
    if (page.length < PAGE_SIZE) break;
    cursor = cursorAfterEvent(page[page.length - 1]);
  }
  const block = await fetchLatestProcessedBlock(CHAIN);
  return { credited, claimed, block };
}

async function readAvailable(wallet: string, tokens: string[], block: bigint | null) {
  let pinned = block !== null;
  const values = await mapWithConcurrency(tokens, RPC_CONCURRENCY, async (token) => {
    if (pinned && block !== null) {
      try {
        return await getAvailableFees(wallet, token, block);
      } catch {
        pinned = false; // node without that block's state - read latest instead
      }
    }
    return getAvailableFees(wallet, token);
  });
  return { available: new Map(tokens.map((t, i) => [t, values[i]])), pinned };
}

export async function getClankerLedger(
  wallet: string,
  launchedTokens: string[],
  ethUsd: number,
): Promise<ClankerLedger> {
  let indexed: Awaited<ReturnType<typeof readIndexerLedger>> | null = null;
  try {
    indexed = await readIndexerLedger(wallet);
  } catch (err) {
    console.warn("[clankerLedger] indexer ledger unavailable, err=" + String(err));
  }

  const claimableTokens = [CLANKER_FEE_TOKEN_WETH, ...launchedTokens].map((t) => t.toLowerCase());
  const tokens = [...new Set([...claimableTokens, ...(indexed ? [...indexed.credited.keys(), ...indexed.claimed.keys()] : [])])];
  const { available, pinned } = await readAvailable(wallet, tokens, indexed?.block ?? null);

  // Unclaimed now: WETH at face value, launched tokens at current prices.
  // WETH is one pooled balance across all the wallet's Clanker launches.
  const others = claimableTokens.filter((t) => t !== CLANKER_FEE_TOKEN_WETH && (available.get(t) ?? 0n) > 0n);
  const prices = others.length > 0 && ethUsd > 0 ? await getCurrentPricesUsd(CHAIN, others) : new Map<string, number>();
  let claimableEth = 0;
  let claimableUnpriced = 0;
  for (const token of new Set(claimableTokens)) {
    const amount = Number(available.get(token) ?? 0n) / 10 ** DECIMALS;
    if (amount === 0) continue;
    if (token === CLANKER_FEE_TOKEN_WETH) {
      claimableEth += amount;
      continue;
    }
    const usd = prices.get(token);
    if (usd === undefined) claimableUnpriced += 1;
    else claimableEth += (amount * usd) / ethUsd;
  }

  let check: ClankerLedger["check"] = null;
  if (indexed) {
    const rows = tokens.map((token) => {
      const credited = indexed!.credited.get(token) ?? 0n;
      const claimed = indexed!.claimed.get(token) ?? 0n;
      const avail = available.get(token) ?? 0n;
      return { token, credited, claimed, available: avail, reconciled: credited - claimed === avail };
    });
    check = { reconciled: rows.every((r) => r.reconciled), atBlock: pinned ? indexed.block : null, tokens: rows };
  }
  return { claimableEth, claimableUnpriced, check };
}
