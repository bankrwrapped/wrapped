// Repository SQL against a REAL Postgres. Opt-in: set TEST_DATABASE_URL to a
// server you can create throwaway databases on (never production) - each run
// creates fresh databases and drops them afterwards. Skipped otherwise.
import "../test/setupEnv";
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { SQL } from "bun";
import { join } from "node:path";

const ADMIN_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = join(import.meta.dir, "../../db/schema.sql");
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const MAIN_DB = `wrapped_test_${suffix}`;
const OLD_DB = `wrapped_test_old_${suffix}`;

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL!);
  u.pathname = "/" + db;
  return u.toString();
}

function applySchema(db: string): { ok: boolean; stderr: string } {
  // Same way the README applies it in production.
  // Re-runs legitimately emit "already exists, skipping" NOTICEs - only
  // warnings and errors count.
  const r = Bun.spawnSync(["psql", urlFor(db), "-v", "ON_ERROR_STOP=1", "-q", "-f", SCHEMA], {
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
  return { ok: r.exitCode === 0, stderr: r.stderr.toString() };
}

describe.skipIf(!ADMIN_URL)("repositories (real Postgres)", () => {
  let admin: SQL;
  let raw: SQL;
  let repos: {
    wrapped: typeof import("./wrappedCacheRepository").wrappedCacheRepository;
    tokens: typeof import("./indexedTokensRepository").indexedTokensRepository;
    summary: typeof import("./tokenVolumeSummaryRepository").tokenVolumeSummaryRepository;
    requests: typeof import("./walletBackfillRequestsRepository").walletBackfillRequestsRepository;
    volumeCache: typeof import("./tokenVolumeCacheRepository").tokenVolumeCacheRepository;
  };

  beforeAll(async () => {
    admin = new SQL(ADMIN_URL!);
    await admin.unsafe(`create database ${MAIN_DB}`);
    await admin.unsafe(`create database ${OLD_DB}`);
    // db/client.ts reads DATABASE_URL at import time.
    process.env.DATABASE_URL = urlFor(MAIN_DB);
    raw = new SQL(urlFor(MAIN_DB));
  });

  afterAll(async () => {
    const { db } = await import("../db/client");
    await db.close();
    await raw?.close();
    await admin.unsafe(`drop database if exists ${MAIN_DB} with (force)`);
    await admin.unsafe(`drop database if exists ${OLD_DB} with (force)`);
    await admin.close();
  });

  test("schema.sql applies to an empty DB, and again (idempotent)", async () => {
    const first = applySchema(MAIN_DB);
    expect(first.stderr).toBe("");
    expect(first.ok).toBe(true);
    const second = applySchema(MAIN_DB);
    expect(second.stderr).toBe("");
    expect(second.ok).toBe(true);

    repos = {
      wrapped: (await import("./wrappedCacheRepository")).wrappedCacheRepository,
      tokens: (await import("./indexedTokensRepository")).indexedTokensRepository,
      summary: (await import("./tokenVolumeSummaryRepository")).tokenVolumeSummaryRepository,
      requests: (await import("./walletBackfillRequestsRepository")).walletBackfillRequestsRepository,
      volumeCache: (await import("./tokenVolumeCacheRepository")).tokenVolumeCacheRepository,
    };
  }, 30_000); // spawns psql (twice for the idempotency check)

  test("schema.sql catches up a database created from the OLD schema", async () => {
    const old = new SQL(urlFor(OLD_DB));
    // The pre-fix shapes: no decimals/backfill_started_at/pricing_attempts,
    // source check without 'unknown', no ready_notified_at, no
    // unpriced_swap_count, no token_volume_cache.
    await old.unsafe(`
      create table wrapped_profiles (
        wallet_address text primary key, username text not null,
        platform text not null check (platform in ('x', 'farcaster')),
        display_name text not null, avatar_url text not null,
        tokens_launched integer not null default 0, please_bro_count integer not null default 0,
        creator_earnings_usd numeric not null default 0, please_bro_earnings_usd numeric not null default 0,
        total_earnings_usd numeric not null default 0, unclaimed_usd numeric not null default 0,
        creator_earnings_eth numeric not null default 0, please_bro_earnings_eth numeric not null default 0,
        total_earnings_eth numeric not null default 0, unclaimed_eth numeric not null default 0,
        payload jsonb not null, first_indexed_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table indexed_tokens (
        token_address text not null,
        chain text not null check (chain in ('base', 'robinhood')),
        pool_id text,
        source text not null check (source in ('doppler', 'clanker')),
        deployer_wallet text, first_seen_block bigint,
        backfill_status text not null default 'pending'
          check (backfill_status in ('pending', 'in_progress', 'complete', 'failed')),
        backfill_checkpoint_block bigint, last_refreshed_at timestamptz,
        primary key (chain, token_address)
      );
      create table token_volume_summary (
        chain text not null check (chain in ('base', 'robinhood')), token_address text not null,
        total_volume_usd numeric not null default 0, swap_count integer not null default 0,
        last_updated_at timestamptz not null default now(), primary key (chain, token_address)
      );
      insert into indexed_tokens (chain, token_address, source) values ('base', '0xold', 'doppler');
      -- What the old updateTradingVolume left behind: tradingVolume as a JSON string.
      insert into wrapped_profiles (wallet_address, username, platform, display_name, avatar_url, payload)
      values ('0xstr', 'str', 'x', 'str', 'a',
        jsonb_build_object('tradingVolume', '{"totalVolumeUsd":7,"isComplete":true}'::text));
    `);
    await old.close();

    const r = applySchema(OLD_DB);
    expect(r.stderr).toBe("");
    expect(r.ok).toBe(true);

    const check = new SQL(urlFor(OLD_DB));
    const cols = (await check`
      select table_name, column_name from information_schema.columns
      where (table_name, column_name) in (
        ('indexed_tokens', 'decimals'), ('indexed_tokens', 'backfill_started_at'),
        ('indexed_tokens', 'pricing_attempts'), ('wrapped_profiles', 'ready_notified_at'),
        ('token_volume_summary', 'unpriced_swap_count'), ('token_volume_cache', 'source')
      )
    `) as { table_name: string; column_name: string }[];
    expect(cols.length).toBe(6);
    // 'unknown' source is accepted now; existing rows survived.
    await check`insert into indexed_tokens (chain, token_address, source) values ('base', '0xnew', 'unknown')`;
    const [{ n }] = (await check`select count(*)::int as n from indexed_tokens`) as { n: number }[];
    expect(n).toBe(2);
    // Stringified tradingVolume rows are repaired into objects.
    const [tvRow] = (await check`
      select jsonb_typeof(payload->'tradingVolume') as ty, (payload->'tradingVolume'->>'totalVolumeUsd')::int as total
      from wrapped_profiles where wallet_address = '0xstr'
    `) as { ty: string; total: number }[];
    expect(tvRow).toEqual({ ty: "object", total: 7 });
    await check.close();
  }, 30_000); // spawns psql (twice for the idempotency check)

  const payload = (handle: string, eth: number, usd: number, tvTotal: number) => ({
    user: { handle, displayName: handle, platform: "x", avatar: "a", wallet: handle },
    tokens: [{ tokenAddress: "0xt", name: "T", symbol: "T", chain: "base", feesEarnedEth: eth, source: "doppler" }],
    pleaseBroTokens: [],
    earnings: { creatorEarnings: usd, pleaseBroEarnings: 0, total: usd, creatorEarningsEth: eth, pleaseBroEarningsEth: 0, totalEth: eth },
    claimable: { unclaimed: 0, unclaimedEth: 0 },
    bestDay: null, dailyEarnings: [], claimCount: 0, longestStreakDays: 0,
    summary: { tokensLaunched: 1, hasActivity: true },
    meta: { creatorFeesStatus: "ok", beneficiaryFeesStatus: "ok", earningsFromIndexerStatus: "ok" },
    tradingVolume: {
      totalVolumeUsd: tvTotal, status: "ok", isComplete: false, tokensTotal: 1, tokensComplete: 0,
      tokensInProgress: 1, tokensPending: 0, tokensFailed: 0, updatedAt: new Date().toISOString(),
    },
    earningsFromIndexer: 0,
  }) as any;

  test("updateTradingVolume stores an OBJECT (it used to store a JSON string)", async () => {
    await repos.wrapped.upsert("0xtvobj", "tvobj", payload("0xtvobj", 1, 1, 10));
    await repos.wrapped.updateTradingVolume("0xtvobj", { ...payload("0xtvobj", 1, 1, 55).tradingVolume, isComplete: true });
    const [r] = (await raw`
      select jsonb_typeof(payload->'tradingVolume') as ty from wrapped_profiles where wallet_address = '0xtvobj'
    `) as { ty: string }[];
    expect(r.ty).toBe("object");
    const found = await repos.wrapped.findByWallet("0xtvobj");
    expect(found!.payload.tradingVolume.totalVolumeUsd).toBe(55);
    expect(found!.payload.tradingVolume.isComplete).toBe(true);
  });

  test("a not-yet-repaired stringified tradingVolume still reads as an object", async () => {
    await repos.wrapped.upsert("0xtvstr", "tvstr", payload("0xtvstr", 1, 1, 10));
    await raw`
      update wrapped_profiles
      set payload = jsonb_set(payload, '{tradingVolume}', to_jsonb('{"totalVolumeUsd":8,"isComplete":true}'::text))
      where wallet_address = '0xtvstr'
    `;
    const found = await repos.wrapped.findByWallet("0xtvstr");
    // Partial object on purpose (the stored fixture only has these two keys).
    expect(found!.payload.tradingVolume as unknown).toEqual({ totalVolumeUsd: 8, isComplete: true });
  });

  test("upsert doesn't clobber a tradingVolume written by the background job", async () => {
    await repos.wrapped.upsert("0xlost", "lost", payload("0xlost", 1, 1, 10));
    // Background job finishes while a request is mid-fetch...
    await repos.wrapped.updateTradingVolume("0xlost", { ...payload("0xlost", 1, 1, 999).tradingVolume, isComplete: true });
    // ...then the request upserts its payload carrying the stale copy (10).
    const row = await repos.wrapped.upsert("0xlost", "lost", payload("0xlost", 1, 1, 10));
    expect(row.payload.tradingVolume.totalVolumeUsd).toBe(999);
    expect(row.payload.tradingVolume.isComplete).toBe(true);
    const found = await repos.wrapped.findByWallet("0xlost");
    expect(found!.payload.tradingVolume.totalVolumeUsd).toBe(999);
  });

  test("rank is by ETH (not USD) with stable tie-breaks", async () => {
    await raw`delete from wrapped_profiles`;
    // ETH-rich but USD-poor (fetched when ETH was cheap) must outrank ETH-poor/USD-rich.
    await repos.wrapped.upsert("0xethrich", "ethrich", payload("0xethrich", 2, 100, 0));
    await repos.wrapped.upsert("0xusdrich", "usdrich", payload("0xusdrich", 1, 9999, 0));
    await raw`update wrapped_profiles set first_indexed_at = now() - interval '2 days' where wallet_address = '0xethrich'`;
    // Two tied on ETH: the earlier-indexed one ranks higher...
    await repos.wrapped.upsert("0xtieold", "tieold", payload("0xtieold", 1, 1, 0));
    await raw`update wrapped_profiles set first_indexed_at = now() - interval '1 day' where wallet_address = '0xtieold'`;
    await repos.wrapped.upsert("0xtienew", "tienew", payload("0xtienew", 1, 1, 0));

    const rank = async (w: string) => (await repos.wrapped.getRank(w)).rank;
    expect(await rank("0xethrich")).toBe(1);
    const tieOld = await rank("0xtieold");
    const tieNew = await rank("0xtienew");
    expect(tieOld).toBeLessThan(tieNew);
    // ...and refreshing the later one (bumps updated_at) doesn't reshuffle.
    await repos.wrapped.upsert("0xtienew", "tienew", payload("0xtienew", 1, 1, 0));
    expect(await rank("0xtieold")).toBe(tieOld);
    expect(await rank("0xtienew")).toBe(tieNew);
    // Ranks are a permutation 1..n.
    const all = await Promise.all(["0xethrich", "0xusdrich", "0xtieold", "0xtienew"].map(rank));
    expect([...all].sort()).toEqual([1, 2, 3, 4]);
    expect((await repos.wrapped.getRank("0xethrich")).totalUsers).toBe(4);

    const top = await repos.wrapped.getTopTraders(10);
    expect(top[0].walletAddress).toBe("0xethrich");
    const order = top.map((t) => t.walletAddress);
    expect(order.indexOf("0xtieold")).toBeLessThan(order.indexOf("0xtienew"));
  });

  test("ready notification can be claimed exactly once, and released for retry", async () => {
    await repos.wrapped.upsert("0xnotify", "notifyme", payload("0xnotify", 1, 1, 0));
    const [a, b] = await Promise.all([
      repos.wrapped.claimReadyNotification("0xnotify"),
      repos.wrapped.claimReadyNotification("0xnotify"),
    ]);
    expect([a, b].filter(Boolean)).toEqual(["notifyme"]);
    expect(await repos.wrapped.claimReadyNotification("0xnotify")).toBeNull();
    await repos.wrapped.releaseReadyNotification("0xnotify");
    expect(await repos.wrapped.claimReadyNotification("0xnotify")).toBe("notifyme");
    expect(await repos.wrapped.claimReadyNotification("0xmissing")).toBeNull();
  });

  test("refresh commit is atomic and only applies if the checkpoint hasn't moved", async () => {
    await raw`insert into indexed_tokens (chain, token_address, source, backfill_status, backfill_checkpoint_block)
              values ('base', '0xcp', 'doppler', 'complete', 100)`;
    await repos.summary.setTotal("base", "0xcp", 50, 5, 0);

    expect(await repos.summary.addToTotalAndAdvanceCheckpoint("base", "0xcp", 10, 2, 1, "100", 120n)).toBe(true);
    // A second run that started from the same checkpoint (crash-replay or a
    // second replica) must not add again.
    expect(await repos.summary.addToTotalAndAdvanceCheckpoint("base", "0xcp", 10, 2, 1, "100", 120n)).toBe(false);

    const s = await repos.summary.get("base", "0xcp");
    expect(Number(s!.total_volume_usd)).toBe(60);
    expect(s!.swap_count).toBe(7);
    expect(s!.unpriced_swap_count).toBe(1);
    const t = await repos.tokens.find("base", "0xcp");
    expect(String(t!.backfill_checkpoint_block)).toBe("120");

    // null checkpoint is matched too.
    await raw`insert into indexed_tokens (chain, token_address, source, backfill_status) values ('base', '0xnull', 'doppler', 'complete')`;
    await repos.summary.setTotal("base", "0xnull", 0, 0, 0);
    expect(await repos.summary.addToTotalAndAdvanceCheckpoint("base", "0xnull", 1, 1, 0, null, 5n)).toBe(true);
  });

  test("pricing attempts, 'unknown' source, and the backfill claim (backfill_started_at)", async () => {
    await repos.tokens.createPending("base", "0xunk", "unknown");
    expect((await repos.tokens.find("base", "0xunk"))!.source).toBe("unknown");

    expect(await repos.tokens.incrementPricingAttempts("base", "0xunk")).toBe(1);
    expect(await repos.tokens.incrementPricingAttempts("base", "0xunk")).toBe(2);
    await repos.tokens.resetPricingAttempts("base", "0xunk");
    expect((await repos.tokens.find("base", "0xunk"))!.pricing_attempts).toBe(0);

    // Fresh pending row (never started) is claimable once; a concurrent
    // second claim loses.
    const [c1, c2] = await Promise.all([
      repos.tokens.claimForBackfill("base", "0xunk", 15 * 60_000),
      repos.tokens.claimForBackfill("base", "0xunk", 15 * 60_000),
    ]);
    expect([c1, c2].filter(Boolean).length).toBe(1);
    const claimed = await repos.tokens.find("base", "0xunk");
    expect(claimed!.backfill_status).toBe("in_progress");
    expect(claimed!.backfill_started_at).not.toBeNull();
    // Just claimed -> not stale -> not claimable again.
    expect(await repos.tokens.claimForBackfill("base", "0xunk", 15 * 60_000)).toBe(false);
  });

  test("token_volume_cache and wallet backfill completion summary", async () => {
    await repos.volumeCache.set("base", "0xvc", 123.5, "geckoterminal");
    const got = await repos.volumeCache.get("base", "0xvc");
    expect(got!.volumeUsd).toBe(123.5);
    expect(got!.source).toBe("geckoterminal");

    await raw`insert into indexed_tokens (chain, token_address, source, backfill_status) values ('base', '0xdone', 'doppler', 'complete')`;
    await repos.requests.recordRequest("0xwal", "base", "0xdone");
    await repos.requests.recordRequest("0xwal", "base", "0xdone"); // idempotent
    await repos.requests.recordRequest("0xwal", "base", "0xnorow");
    const sum = await repos.requests.getCompletionSummary("0xwal");
    expect(sum.total).toBe(2);
    expect(sum.complete).toBe(1);
    expect(sum.pending).toBe(1);
    expect(await repos.requests.getWalletsForToken("base", "0xdone")).toEqual(["0xwal"]);
  });
});
