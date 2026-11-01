// Category leaderboards (GET /api/leaderboards). Every board ranks the same
// per-profile metrics row (wrappedCacheRepository.listBoardMetrics), so one
// query feeds all of them; it's cached briefly per month because every
// visitor to /leaderboard asks for the same thing.
//
// The "month" board is a monthly edition: the current UTC month, or the
// previous one as its final standings. Past months are recomputed from each
// profile's dailyEarnings (90 days, so the previous month is always fully in
// range) rather than snapshotted. "frozen" means closed to new entrants:
// only profiles that existed before the month closed count. Their totals can
// still rise when a refresh indexes claims they made in that month; a
// snapshot would lock in those late-indexed months as too low, so the UI
// says the totals can still fill in rather than calling them final.
import {
  BOARDS,
  type BoardEntry,
  type BoardId,
  type BoardResult,
  type LeaderboardsResponse,
  type MonthEdition,
} from "@bankr-wrapped/shared";
import { wrappedCacheRepository, type BoardMetrics } from "../repositories/wrappedCacheRepository";

const CACHE_MS = 60_000;
const HIT_ETH = 0.1;
// Breakout's baseline floor: launches that earned ~nothing would otherwise
// make any top token an infinite multiple.
const BREAKOUT_FLOOR_ETH = 0.01;

type Scorer = (m: BoardMetrics) => number | null;

const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// null = doesn't qualify. A zero score never qualifies: an empty row on a
// board is noise, not a ranking.
const SCORERS: Record<BoardId, Scorer> = {
  earnings: (m) => m.totalEth,
  month: (m) => m.monthEth,
  best_day: (m) => m.bestDayEth,
  streak: (m) => m.streakDays,
  launches: (m) => m.tokensLaunched,
  please_bro: (m) => m.pleaseBroCount,
  per_launch: (m) => (m.tokensLaunched >= 3 ? m.creatorEth / m.tokensLaunched : null),
  hit_rate: (m) =>
    m.tokenFees.length >= 5 ? m.tokenFees.filter((f) => f >= HIT_ETH).length / m.tokenFees.length : null,
  // Top token against the average of the *other* launches. Dividing by the
  // average of all of them (top included) caps the score at the launch count,
  // so it rewarded launching a lot rather than one token standing out.
  breakout: (m) => {
    if (m.tokenFees.length < 3) return null;
    const fees = [...m.tokenFees].sort((a, b) => b - a);
    const top = fees[0];
    return top >= HIT_ETH ? top / Math.max(average(fees.slice(1)), BREAKOUT_FLOOR_ETH) : null;
  },
};

// Scores within this of each other are a tie: they're sums of floats.
const sameScore = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function toEntry(m: BoardMetrics, score: number, rank: number, tied: boolean): BoardEntry {
  return {
    rank,
    tied,
    score,
    walletAddress: m.walletAddress,
    username: m.username,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  };
}

// Competition ranking (1, 2, 2, 4). Within a tie, the order matches getRank's
// immutable tie-breaks (first indexed, then wallet) so it doesn't shuffle.
export function rankBoard(
  id: BoardId,
  metrics: BoardMetrics[],
  opts: { limit: number; me?: string | null }
): BoardResult {
  const scored = metrics
    .map((m) => ({ m, score: SCORERS[id](m) }))
    .filter((x): x is { m: BoardMetrics; score: number } => x.score !== null && Number.isFinite(x.score) && x.score > 0)
    // Scores that count as a tie (sameScore) must sort as equal too, or
    // float noise in the last bits would decide the order within a tie.
    .sort(
      (a, b) =>
        (sameScore(a.score, b.score) ? 0 : b.score - a.score) ||
        a.m.firstIndexedAt.localeCompare(b.m.firstIndexedAt) ||
        a.m.walletAddress.localeCompare(b.m.walletAddress)
    );

  const ranked: BoardEntry[] = [];
  for (let i = 0; i < scored.length; i++) {
    const { m, score } = scored[i];
    const prev = ranked[i - 1];
    const rank = prev && sameScore(prev.score, score) ? prev.rank : i + 1;
    const tied =
      (i > 0 && sameScore(scored[i - 1].score, score)) ||
      (i + 1 < scored.length && sameScore(scored[i + 1].score, score));
    ranked.push(toEntry(m, score, rank, tied));
  }

  const me = opts.me?.toLowerCase() ?? null;
  const at = me ? ranked.findIndex((e) => e.username.toLowerCase() === me) : -1;
  return {
    id,
    total: ranked.length,
    entries: ranked.slice(0, opts.limit),
    personal: at >= 0 ? ranked[at] : null,
    neighbors: {
      above: at > 0 ? ranked[at - 1] : null,
      below: at >= 0 && at + 1 < ranked.length ? ranked[at + 1] : null,
    },
  };
}

// "YYYY-MM" for the current UTC month, or the given month when it's the
// current or previous one. Anything else (older, future, malformed) falls
// back to the current month: older months have left the 90-day window.
export function resolveEdition(requested: string | null, now = new Date()): MonthEdition & { from: string; to: string } {
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const previous = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const key = (t: number) => new Date(t).toISOString().slice(0, 7);
  const start = requested === key(previous) ? previous : current;
  const startDate = new Date(start);
  const end = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1);
  return {
    month: key(start),
    closesAt: new Date(end).toISOString(),
    frozen: start !== current,
    from: new Date(start).toISOString().slice(0, 10),
    to: new Date(end).toISOString().slice(0, 10),
  };
}

const cache = new Map<string, { at: number; metrics: Promise<BoardMetrics[]> }>();

function metricsFor(from: string, to: string): Promise<BoardMetrics[]> {
  const key = from + ":" + to;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.metrics;
  const metrics = wrappedCacheRepository.listBoardMetrics(from, to);
  cache.set(key, { at: Date.now(), metrics });
  // A failed query shouldn't be served from cache for the next minute.
  metrics.catch(() => cache.delete(key));
  return metrics;
}

export function clearLeaderboardsCache() {
  cache.clear();
}

export async function getLeaderboards(opts: {
  month: string | null;
  handle: string | null;
  limit?: number;
  now?: Date;
}): Promise<LeaderboardsResponse> {
  const { from, to, ...edition } = resolveEdition(opts.month, opts.now);
  const metrics = await metricsFor(from, to);
  const me = opts.handle?.trim().replace(/^@/, "") || null;
  const limit = opts.limit ?? 10;
  const monthMetrics = metrics.filter((m) => m.firstIndexedAt < edition.closesAt);
  return {
    edition,
    boards: BOARDS.map((b) => rankBoard(b.id, b.id === "month" ? monthMetrics : metrics, { limit, me })),
  };
}
