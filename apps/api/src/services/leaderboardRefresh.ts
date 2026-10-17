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

export async function refreshLeaderboardRows(): Promise<number> {
  if (running) {
    console.warn("[leaderboardRefresh] previous run still going; skipping");
    return 0;
  }
  running = true;
  try {
    const cutoff = Date.now() - MIN_AGE_MS;
    const top = await wrappedCacheRepository.getTopTraders(TOP_N);
    const stalest = await wrappedCacheRepository.listStale(new Date(cutoff), STALEST_N);
    const handles = [
      ...new Set([
        ...top.filter((t) => Date.parse(t.updatedAt) < cutoff).map((t) => t.username),
        ...stalest.map((s) => s.username),
      ]),
    ];

    let refreshed = 0;
    for (const handle of handles) {
      try {
        await wrappedService.getWrapped(handle);
        refreshed += 1;
      } catch (err) {
        console.error(`[leaderboardRefresh] refresh failed for ${handle}:`, err);
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    console.log(`[leaderboardRefresh] refreshed ${refreshed}/${handles.length} profile(s)`);
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
