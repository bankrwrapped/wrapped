/**
 * rebackfill-complete-tokens.ts
 *
 * One-off. The volume fix (unpriced swaps retried instead of dropped, no
 * DexScreener) only applies to new backfill runs - tokens already marked
 * 'complete' keep the swaps an earlier run dropped. This resets them to
 * 'pending' with pricing_attempts = 0 so the backfill sweep re-processes
 * them under the new logic.
 *
 * Safe to reset: backfillToken() always rescans from block 0 and overwrites
 * token_volume_summary with setTotal(), so nothing is double-counted. Each
 * wallet's stored volume is recomputed when its last token completes again
 * (wrappedNotify), and "Wrapped ready" is claimed once per wallet, so nobody
 * is re-notified.
 *
 * Order: run AFTER db/schema.sql has been applied to production (this needs
 * the pricing_attempts column) and after the new API is deployed (the old
 * code would re-drop the same swaps).
 *
 * Only 'base' - backfillToken() doesn't support other chains yet.
 *
 * A reset token is picked up once it has been idle STALE_THRESHOLD_MS
 * (15 min), so expect the sweep to start on them 15-20 minutes after this
 * runs. While they're pending, affected wallets show volume as incomplete.
 *
 * Usage (from apps/api, DATABASE_URL = the API database):
 *   bun run scripts/maintenance/rebackfill-complete-tokens.ts             # dry run: counts only
 *   bun run scripts/maintenance/rebackfill-complete-tokens.ts --apply     # reset every complete token
 *   bun run scripts/maintenance/rebackfill-complete-tokens.ts --apply --limit 200   # one wave
 */

import { SQL } from "bun";

const CHAIN = "base";

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const limitIdx = argv.indexOf("--limit");
  let limit: number | null = null;
  if (limitIdx !== -1) {
    limit = Number(argv[limitIdx + 1]);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`--limit needs a positive integer, got ${argv[limitIdx + 1]}`);
    }
  }
  return { apply, limit };
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = new SQL(url);
  try {
    const [col] = await sql`
      select 1 from information_schema.columns
      where table_name = 'indexed_tokens' and column_name = 'pricing_attempts'
    `;
    if (!col) {
      throw new Error("indexed_tokens.pricing_attempts is missing - apply db/schema.sql first");
    }

    const counts = (await sql`
      select backfill_status, count(*)::int as count from indexed_tokens
      where chain = ${CHAIN}
      group by backfill_status order by backfill_status
    `) as { backfill_status: string; count: number }[];
    console.log(`[rebackfill] ${CHAIN} status counts before:`);
    for (const c of counts) console.log(`  ${c.backfill_status}: ${c.count}`);

    const complete = counts.find((c) => c.backfill_status === "complete")?.count ?? 0;
    const target = limit === null ? complete : Math.min(limit, complete);

    if (!apply) {
      console.log(`[rebackfill] dry run: would reset ${target} complete token(s). Re-run with --apply.`);
      return;
    }
    if (target === 0) {
      console.log("[rebackfill] no complete tokens, nothing to do");
      return;
    }

    // Least recently refreshed first, so waves (--limit) work through the
    // table instead of resetting the same tokens again.
    const reset = (await sql`
      update indexed_tokens set backfill_status = 'pending', pricing_attempts = 0
      where chain = ${CHAIN} and token_address in (
        select token_address from indexed_tokens
        where chain = ${CHAIN} and backfill_status = 'complete'
        order by last_refreshed_at asc nulls first, token_address
        limit ${target}
      )
      returning token_address
    `) as { token_address: string }[];

    console.log(`[rebackfill] reset ${reset.length} token(s) to pending`);
  } finally {
    await sql.close();
  }
}

main().catch((err) => {
  console.error("[rebackfill] FAILED", err);
  process.exitCode = 1;
});
