import { wrappedCacheRepository } from "../repositories/wrappedCacheRepository";
import { wrappedService } from "./wrappedService";

// The leaderboard ranks cached profiles, and a profile used to refresh only
// when someone viewed it - checked 2026-10-17, most of the top 20 dated from
// August (one showed 7.10 ETH cached against 4.51 fresh). This re-fetches
// the leaderboard's top rows and the stalest rows overall, one at a time,
// so ranks track real numbers without anyone visiting each profile.
const INTERVAL_MS = 30 * 60_000;
const TOP_N = 50;
const STALEST_N = 25;
const MIN_AGE_MS = 60 * 60_000; // younger than this is fresh enough
const PAUSE_MS = 2_000; // each refresh is ~3 Bankr calls plus pricing

let running = false;

// Rows whose handle no longer resolves to their wallet (handle gone, or now
// resolving to a different wallet) can't be refreshed by handle. They used to
// stay the stalest rows forever and take every one of the STALEST_N slots.
// They're skipped for a day, so the rest of the stale rows get refreshed.
const UNRESOLVABLE_SKIP_MS = 24 * 60 * 60_000;
const unresolvable = new Map<string, number>(); // wallet -> skip until

function skippedWallets(now: number): string[] {
  for (const [wallet, until] of unresolvable) if (until <= now) unresolvable.delete(wallet);
  return [...unresolvable.keys()];
}

export async function refreshLeaderboardRows(): Promise<number> {
  if (running) {
    console.warn("[leaderboardRefresh] previous run still going; skipping");
    return 0;
  }
  running = true;
  try {
    const cutoff = Date.now() - MIN_AGE_MS;
    const top = await wrappedCacheRepository.getTopTraders(TOP_N);
    const stalest = await wrappedCacheRepository.listStale(new Date(cutoff), STALEST_N, skippedWallets(Date.now()));
    const rows = new Map<string, string>(); // handle -> the wallet its row is for
    for (const t of top) if (Date.parse(t.updatedAt) < cutoff) rows.set(t.username, t.walletAddress.toLowerCase());
    for (const s of stalest) if (!rows.has(s.username)) rows.set(s.username, s.walletAddress.toLowerCase());

    let refreshed = 0;
    for (const [handle, wallet] of rows) {
      try {
        const row = await wrappedService.getWrapped(handle);
        if (row?.walletAddress?.toLowerCase() === wallet) {
          refreshed += 1;
        } else {
          console.warn(`[leaderboardRefresh] ${handle} no longer resolves to ${wallet}; skipping that row for a day`);
          unresolvable.set(wallet, Date.now() + UNRESOLVABLE_SKIP_MS);
        }
      } catch (err) {
        console.error(`[leaderboardRefresh] refresh failed for ${handle}:`, err);
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    console.log(`[leaderboardRefresh] refreshed ${refreshed}/${rows.size} profile(s)`);
    return refreshed;
  } finally {
    running = false;
  }
}

export function startLeaderboardRefresh(): void {
  const run = () =>
    refreshLeaderboardRows().catch((err) => console.error("[leaderboardRefresh] run failed:", err));
  run();
  setInterval(run, INTERVAL_MS);
}
