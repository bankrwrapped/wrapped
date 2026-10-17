/**
 * compare-earnings.ts
 *
 * Bankr's earnings number vs the indexer's, side by side, per wallet - the
 * check to run after the re-index and before setting EARNINGS_SOURCE=indexer
 * (see KNOWN_ISSUES.md, "the indexer as the source of truth").
 *
 * Read-only: runs the same fetch the API does (wrappedService.fetchFromBankr)
 * without writing wrapped_profiles. Price lookups still fill the price cache.
 *
 * What to expect: the indexer reading at or above Bankr. Bankr's figure is
 * the WETH side only and limited to ?days=90; the indexer counts both sides
 * of Doppler fees, lifetime. A wallet far BELOW Bankr, or "incomplete", is
 * the one to dig into (--tokens shows which launch is off).
 *
 * Usage (from apps/api, with the API's env - DATABASE_URL, ENVIO_*, ...):
 *   bun run scripts/diagnostics/compare-earnings.ts alice bob        # by handle
 *   bun run scripts/diagnostics/compare-earnings.ts --top 25         # leaderboard's top 25
 *   bun run scripts/diagnostics/compare-earnings.ts alice --tokens   # plus per-token detail
 *   add --verbose to keep the service's own logs
 */

import { wrappedService } from "../../src/services/wrappedService";
import { bankrTokenKey, getBeneficiaryFeesBreakdown } from "../../src/services/module8FeesBreakdown";
import type { WrappedPayload } from "@bankr-wrapped/shared";

interface Row {
  handle: string;
  wallet: string;
  bankrEth: number | null;
  indexerEth: number | null;
  note: string;
  wouldDisplay: "indexer" | "bankr" | "-";
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const topIdx = argv.indexOf("--top");
  const top = topIdx === -1 ? null : Number(argv[topIdx + 1]);
  if (top !== null && (!Number.isInteger(top) || top <= 0)) {
    throw new Error(`--top needs a positive integer, got ${argv[topIdx + 1]}`);
  }
  const handles = argv.filter((a, i) => !a.startsWith("--") && !(topIdx !== -1 && i === topIdx + 1));
  return { handles, top, tokens: flags.has("--tokens"), verbose: flags.has("--verbose") };
}

// wrappedService logs every step; keep the report readable unless asked.
async function quietly<T>(verbose: boolean, fn: () => Promise<T>): Promise<T> {
  if (verbose) return fn();
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

const eth = (n: number | null) => (n === null ? "-" : n.toFixed(4));

function pctDiff(bankr: number | null, indexer: number | null): string {
  if (bankr === null || indexer === null) return "-";
  if (bankr === 0) return indexer === 0 ? "0%" : "new";
  const pct = ((indexer - bankr) / bankr) * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}

async function printTokenDetail(payload: WrappedPayload, verbose: boolean) {
  const entries = [
    ...payload.tokens.map((t) => ({ ...t, side: "creator" })),
    ...payload.pleaseBroTokens.map((t) => ({ ...t, side: "please-bro" })),
  ];
  const scope = new Set(entries.map((t) => bankrTokenKey(t.chain, t.tokenAddress)));
  const breakdown = await quietly(verbose, () =>
    getBeneficiaryFeesBreakdown(payload.user.wallet, Promise.resolve(scope)),
  );
  console.log(`  ${"side".padEnd(10)} ${"token".padEnd(52)} ${"bankr".padStart(10)} ${"indexer".padStart(10)}`);
  for (const t of entries) {
    const key = bankrTokenKey(t.chain, t.tokenAddress);
    const label = `${t.symbol} ${key}`.slice(0, 52);
    console.log(
      `  ${t.side.padEnd(10)} ${label.padEnd(52)} ${eth(t.feesEarnedEth).padStart(10)} ${eth(breakdown.byToken[key] ?? 0).padStart(10)}`,
    );
  }
  if (breakdown.incompleteReasons.length > 0) {
    console.log(`  incomplete (${breakdown.incompleteReasons.length}):`);
    for (const r of breakdown.incompleteReasons.slice(0, 10)) console.log(`    ${r}`);
    if (breakdown.incompleteReasons.length > 10) console.log(`    ...`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Bankr's per-token figures are what --tokens compares against, so keep
  // the payload Bankr-sourced whatever the env says.
  delete process.env.EARNINGS_SOURCE;

  const handles = [...args.handles];
  if (args.top !== null) {
    const top = await wrappedService.getLeaderboard(args.top);
    handles.push(...top.map((t) => t.username));
  }
  if (handles.length === 0) {
    console.error("give handles, or --top N");
    process.exit(1);
  }

  const rows: Row[] = [];
  for (const handle of handles) {
    const match = await quietly(args.verbose, () => wrappedService.resolveWallet(handle));
    if (!match) {
      rows.push({ handle, wallet: "-", bankrEth: null, indexerEth: null, note: "no Bankr match", wouldDisplay: "-" });
      continue;
    }
    const payload = await quietly(args.verbose, () => wrappedService.fetchFromBankr(match));
    const bankrOk = payload.meta.creatorFeesStatus === "ok" && payload.meta.beneficiaryFeesStatus === "ok";
    const indexerOk = payload.meta.earningsFromIndexerStatus === "ok";
    const incomplete = payload.meta.earningsFromIndexerIncomplete === true;
    const notes = [
      bankrOk ? null : "bankr unavailable",
      indexerOk ? null : "indexer unavailable",
      incomplete ? "indexer incomplete" : null,
    ].filter(Boolean);
    rows.push({
      handle,
      wallet: match.evmAddress,
      bankrEth: bankrOk ? (payload.earningsFromBankr ?? payload.earnings.totalEth) : null,
      indexerEth: indexerOk ? payload.earningsFromIndexer : null,
      note: notes.join(", "),
      wouldDisplay: indexerOk && !incomplete ? "indexer" : "bankr",
    });

    if (args.tokens) {
      console.log(`\n${handle} (${match.evmAddress})`);
      await printTokenDetail(payload, args.verbose);
    }
  }

  console.log("");
  console.log(
    `${"handle".padEnd(20)} ${"wallet".padEnd(42)} ${"bankr ETH".padStart(10)} ${"indexer ETH".padStart(12)} ` +
    `${"diff".padStart(8)}  ${"displays".padEnd(8)}  note`,
  );
  for (const r of rows) {
    console.log(
      `${r.handle.slice(0, 20).padEnd(20)} ${r.wallet.padEnd(42)} ${eth(r.bankrEth).padStart(10)} ` +
      `${eth(r.indexerEth).padStart(12)} ${pctDiff(r.bankrEth, r.indexerEth).padStart(8)}  ${r.wouldDisplay.padEnd(8)}  ${r.note}`,
    );
  }

  const compared = rows.filter((r) => r.bankrEth !== null && r.indexerEth !== null);
  const below = compared.filter((r) => r.indexerEth! < r.bankrEth! * 0.95);
  const indexerShown = rows.filter((r) => r.wouldDisplay === "indexer").length;
  console.log(
    `\n${rows.length} wallet(s), ${compared.length} compared. ` +
    `Indexer more than 5% below Bankr: ${below.length}. ` +
    `With EARNINGS_SOURCE=indexer, ${indexerShown} would show the indexer number.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("compare-earnings failed:", err);
    process.exit(1);
  });
