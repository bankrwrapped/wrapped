// Clanker ledger check: per fee token, credited - claimed (indexer) must
// equal availableFees (chain) at the indexer's block, plus the unclaimed
// balance in ETH.
import "../test/setupEnv";
import { test, expect, mock, beforeEach } from "bun:test";

const WETH = "0x4200000000000000000000000000000000000006";
const E = 10n ** 18n;
let ledgerRows: Array<{ tokenAddress: string; eventType: string; amountToken0: string }> = [];
let indexerDown = false;
let onChain: Record<string, bigint> = {};
let pinnedReadsFail = false;
const blocksRead: Array<bigint | undefined> = [];

mock.module("./indexerSync/envioClient", () => ({
  PAGE_SIZE: 1000,
  cursorAfterBlock: (b: string) => ({ blockNumber: b, logIndex: 2147483647 }),
  cursorAfterEvent: (e: any) => ({ blockNumber: e.blockNumber, logIndex: e.logIndex }),
  fetchClankerLedgerPage: async () => {
    if (indexerDown) throw new Error("envio down");
    return ledgerRows.map((r, i) => ({ ...r, blockNumber: String(i + 1), logIndex: 0 }));
  },
  fetchLatestProcessedBlock: async () => 1234n,
}));
mock.module("./clankerFeeLocker", () => ({
  CLANKER_FEE_TOKEN_WETH: WETH,
  getAvailableFees: async (_w: string, token: string, block?: bigint) => {
    if (block !== undefined && pinnedReadsFail) throw new Error("missing trie node");
    blocksRead.push(block);
    return onChain[token] ?? 0n;
  },
}));
mock.module("./currentPrices", () => ({
  getCurrentPricesUsd: async (_c: string, addrs: string[]) => new Map(addrs.filter((a) => a === "0xk").map((a) => [a, 0.02])),
}));

const { getClankerLedger } = await import("./clankerLedger");

beforeEach(() => {
  indexerDown = false; pinnedReadsFail = false; blocksRead.length = 0;
  // Credited 5 WETH + 1000 K, claimed 3 WETH: 2 WETH and 1000 K left in the locker.
  ledgerRows = [
    { tokenAddress: WETH, eventType: "StoreTokens", amountToken0: String(5n * E) },
    { tokenAddress: "0xk", eventType: "StoreTokens", amountToken0: String(1000n * E) },
    { tokenAddress: WETH, eventType: "ClaimTokens", amountToken0: String(2n * E) },
    { tokenAddress: WETH, eventType: "ClaimTokensPermissioned", amountToken0: String(1n * E) },
  ];
  onChain = { [WETH]: 2n * E, "0xk": 1000n * E };
});

test("reconciles when credited - claimed = on-chain balance for every fee token, read at the indexer's block", async () => {
  const l = await getClankerLedger("0xW", ["0xK"], 2000);
  expect(l.check?.reconciled).toBe(true);
  expect(l.check?.atBlock).toBe(1234n);
  expect(blocksRead.every((b) => b === 1234n)).toBe(true);
  expect(l.claimableEth).toBeCloseTo(2 + (1000 * 0.02) / 2000, 10); // 2 WETH + 1000 K at $0.02
});

test("a claim the indexer missed shows up as a mismatch", async () => {
  onChain[WETH] = 1n * E; // a 1 WETH claim happened that the indexer doesn't have
  const l = await getClankerLedger("0xW", ["0xK"], 2000);
  expect(l.check?.reconciled).toBe(false);
  expect(l.check?.tokens.find((t) => t.token === WETH)).toMatchObject({ credited: 5n * E, claimed: 3n * E, available: 1n * E, reconciled: false });
});

test("a balance the indexer has no credits for is a mismatch", async () => {
  onChain["0xother"] = 7n;
  const l = await getClankerLedger("0xW", ["0xK", "0xOther"], 2000);
  expect(l.check?.reconciled).toBe(false);
});

test("node without the indexer block's state: reads latest and says it isn't pinned", async () => {
  pinnedReadsFail = true;
  const l = await getClankerLedger("0xW", ["0xK"], 2000);
  expect(l.check?.atBlock).toBeNull();
  expect(l.check?.reconciled).toBe(true);
});

test("indexer down: no check, but the unclaimed balance is still read from the chain", async () => {
  indexerDown = true;
  const l = await getClankerLedger("0xW", ["0xK"], 2000);
  expect(l.check).toBeNull();
  expect(l.claimableEth).toBeCloseTo(2.01, 10);
  expect(blocksRead.every((b) => b === undefined)).toBe(true);
});

test("an unpriced launched-token balance is counted as unpriced, not as 0 silently", async () => {
  onChain["0xnoprice"] = 5n * E;
  const l = await getClankerLedger("0xW", ["0xNoPrice"], 2000);
  expect(l.claimableUnpriced).toBe(1);
});
