/**
 * cleanup-watched-pool.ts
 *
 * Root cause: apps/indexer/src/EventHandlers.ts writes a WatchedPool row for
 * EVERY pool PoolManager.Initialize ever fires on Base (see that file's header
 * comment, fix dated 2026-08-09) - not just Bankr's. ~95.7% of rows are
 * unresolved (tokenAddress IS NULL) noise from unrelated projects, and this
 * table alone grew to 2.1GB / 5.7M rows, causing repeated disk-full crashes.
 *
 * This script deletes unresolved (non-Bankr) WatchedPool rows on a schedule
 * so the table doesn't silently refill toward another crash. Run via Railway
 * Cron Schedule.
 *
 * Uses Bun's built-in Postgres client (Bun.SQL / `import { SQL } from "bun"`)
 * - same client apps/api's wrappedService already uses under the hood
 * (confirmed via "internal:sql/postgres" stack traces from the earlier
 * disk-full crashes). No npm "postgres" package is installed in this repo -
 * an earlier version of this script wrongly assumed it was.
 *
 * Tradeoff (accepted, same as the one-off manual cleanup done 2026-08-21):
 * a pool that was just initialized and hasn't had its first swap yet is
 * indistinguishable from permanently-dead noise (no timestamp column exists
 * on WatchedPool). Deleting it means that pool's row is gone if a swap ever
 * does land on it later - the handler's WatchedPool.get() will find nothing
 * and silently discard that swap. Accepted as low-probability vs. the
 * alternative of repeated production crashes.
 */

import { SQL } from "bun";

const CHAINS = [
  { name: "base", url: process.env.BASE_DB_URL },
  { name: "robinhood", url: process.env.ROBINHOOD_DB_URL },
] as const;

async function cleanupChain(name: string, url: string | undefined) {
  if (!url) {
    console.log(`[cleanup] skip ${name}: no connection URL set`);
    return;
  }

  const sql = new SQL(url, { ssl: "require" });

  try {
    const before = await sql`
      SELECT COUNT(*)::int AS count FROM "WatchedPool" WHERE "tokenAddress" IS NULL
    `;
    const staleCount = before[0].count;

    if (staleCount === 0) {
      console.log(`[cleanup] ${name}: 0 stale rows, nothing to do`);
      return;
    }

    console.log(`[cleanup] ${name}: deleting ${staleCount} stale rows...`);
    await sql`DELETE FROM "WatchedPool" WHERE "tokenAddress" IS NULL`;

    console.log(`[cleanup] ${name}: reclaiming disk space...`);
    await sql`VACUUM FULL "WatchedPool"`;

    const after = await sql`
      SELECT pg_size_pretty(pg_total_relation_size('"WatchedPool"')) AS size
    `;
    console.log(`[cleanup] ${name}: done. WatchedPool now ${after[0].size}`);
  } catch (err) {
    console.error(`[cleanup] ${name}: FAILED`, err);
    process.exitCode = 1;
  } finally {
    await sql.close();
  }
}

async function main() {
  console.log(`[cleanup] starting sweep at ${new Date().toISOString()}`);
  for (const chain of CHAINS) {
    await cleanupChain(chain.name, chain.url);
  }
  console.log(`[cleanup] sweep complete`);
}

main();
