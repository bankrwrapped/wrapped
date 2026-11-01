import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Crown } from "lucide-react";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";
import { useAuth } from "@/hooks/use-auth";
import {
  BOARDS,
  fetchLeaderboards,
  formatBoardScore,
  type BoardDefinition,
  type BoardEntry,
  type BoardId,
  type LeaderboardsResponse,
} from "@/lib/wrapped-data";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Bankr Wrapped \u00B7 Leaderboards" },
      {
        name: "description",
        content: "Bankr launchers ranked by earnings, launches, streaks, hit rate and more.",
      },
    ],
  }),
  component: LeaderboardPage,
});

// Rank 1 arrives last, with the most drama - classic countdown reveal
// order (viewer watches #3, then #2, then holds for #1) even though the
// final layout places #1 visually on top.
const PODIUM_DELAY: Record<number, number> = { 1: 1.05, 2: 0.55, 3: 0.15 };
type PodiumStyle = { ring: string; medal: string; size: string; avatarSize: string };
const PODIUM_STYLE: Record<number, PodiumStyle> = {
  1: {
    ring: "border-[#F5C542]/50 shadow-[0_0_50px_-10px_rgba(245,197,66,0.5)]",
    medal: "bg-[#F5C542] text-black",
    size: "p-6",
    avatarSize: "size-16",
  },
  2: {
    ring: "border-[#C7CDD6]/40 shadow-[0_0_35px_-12px_rgba(199,205,214,0.4)]",
    medal: "bg-[#C7CDD6] text-black",
    size: "p-5",
    avatarSize: "size-13",
  },
  3: {
    ring: "border-[#D08A5B]/40 shadow-[0_0_30px_-12px_rgba(208,138,91,0.4)]",
    medal: "bg-[#D08A5B] text-black",
    size: "p-4",
    avatarSize: "size-11",
  },
};

function PodiumCard({ entry, rank, def }: { entry: BoardEntry; rank: 1 | 2 | 3; def: BoardDefinition }) {
  const style = PODIUM_STYLE[rank];
  return (
    <motion.li
      initial={{ opacity: 0, y: 24, scale: 0.9, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 130, damping: 16, delay: PODIUM_DELAY[rank] }}
      className={`glass relative flex items-center gap-4 overflow-hidden rounded-3xl border ${style.ring} ${style.size}`}
    >
      {rank === 1 && <div className="animate-sweep pointer-events-none absolute inset-0" />}
      <div className="relative shrink-0">
        {entry.avatarUrl ? (
          <img
            src={entry.avatarUrl}
            alt=""
            className={`${style.avatarSize} rounded-full border-2 border-white/20 bg-surface object-cover`}
          />
        ) : (
          <span className={`${style.avatarSize} block rounded-full border-2 border-white/20 bg-surface`} />
        )}
        <span
          className={`absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full text-xs font-extrabold ${style.medal}`}
        >
          {entry.rank}
        </span>
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 truncate font-display font-extrabold">
          {rank === 1 && <Crown className="size-4 shrink-0 text-[#F5C542]" />}
          {entry.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{entry.username}
          {entry.tied && " · tied"}
        </p>
      </div>
      <span className="shrink-0 font-display text-lg font-extrabold text-accent">
        {formatBoardScore(entry.score, def.unit)}
      </span>
    </motion.li>
  );
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

function closesIn(closesAt: string): string {
  const ms = Date.parse(closesAt) - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function Row({ entry, def, highlight }: { entry: BoardEntry; def: BoardDefinition; highlight?: boolean }) {
  return (
    <li
      className={`glass flex items-center gap-4 rounded-2xl p-4 ${highlight ? "border-accent/60 shadow-[0_0_30px_-12px_var(--accent)]" : ""}`}
    >
      <span className="w-8 text-center font-display text-lg font-extrabold text-muted-foreground">{entry.rank}</span>
      {entry.avatarUrl ? (
        <img src={entry.avatarUrl} alt="" className="size-10 shrink-0 rounded-full border border-glass-border bg-surface object-cover" />
      ) : (
        <span className="size-10 shrink-0 rounded-full border border-glass-border bg-surface" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{entry.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{entry.username}
          {entry.tied && " · tied"}
        </p>
      </div>
      <span className="shrink-0 font-display text-lg font-extrabold text-accent">{formatBoardScore(entry.score, def.unit)}</span>
    </li>
  );
}

function LeaderboardPage() {
  const auth = useAuth();
  const handle = auth.status === "signed-in" || auth.status === "no-account" ? auth.xUsername : undefined;
  const [boardId, setBoardId] = useState<BoardId>("earnings");
  // undefined = the current edition; set to view last month's closed edition.
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<LeaderboardsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // The current edition, remembered so "last month" stays computable after switching.
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === "checking") return;
    let cancelled = false;
    setFailed(false);
    fetchLeaderboards({ month, handle })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        if (!month) setCurrentMonth(d.edition.month);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [auth.status, month, handle]);

  const def = BOARDS.find((b) => b.id === boardId)!;
  const board = useMemo(() => data?.boards.find((b) => b.id === boardId) ?? null, [data, boardId]);
  const podium = board?.entries.slice(0, 3) ?? [];
  const rest = board?.entries.slice(3) ?? [];
  const mine = board?.personal ?? null;
  const mineShown = mine ? board!.entries.some((e) => e.walletAddress === mine.walletAddress) : false;
  const edition = data?.edition;

  return (
    // Content goes inside Backdrop: as a sibling, Backdrop's full-height box
    // pushed the whole page a screen down.
    <Backdrop>
      <div className="mx-auto min-h-screen w-full max-w-xl px-5 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 16 }}
          className="mb-6 flex items-center gap-2.5"
        >
          <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">
            Bankr <span className="text-gradient">Wrapped</span>
          </span>
        </motion.div>

        <Link
          to="/"
          className="mb-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>

        <div className="mb-6">
          <h1 className="mb-2 font-display text-3xl font-extrabold sm:text-4xl">Leaderboards</h1>
          <p className="text-sm text-muted-foreground">
            Ranked among wallets that have checked their Wrapped so far.{" "}
            <Link to="/" className="text-accent underline-offset-4 hover:underline">
              Check yours to climb the boards
            </Link>
            .
          </p>
        </div>

        <div role="tablist" aria-label="Leaderboards" className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={b.id === boardId}
              onClick={() => setBoardId(b.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                b.id === boardId ? "bg-accent text-accent-foreground" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {b.title}
            </button>
          ))}
        </div>

        <div className="glass mb-6 rounded-2xl p-4">
          <p className="font-display text-lg font-bold">{def.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">{def.formula}</p>
          {def.qualify && <p className="mt-1 font-mono text-xs text-muted-foreground">To qualify: {def.qualify}</p>}
          {boardId === "month" && edition && currentMonth && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMonth(undefined)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${!edition.frozen ? "bg-accent text-accent-foreground" : "glass"}`}
              >
                {monthLabel(currentMonth)}
              </button>
              <button
                type="button"
                onClick={() => setMonth(previousMonth(currentMonth))}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${edition.frozen ? "bg-accent text-accent-foreground" : "glass"}`}
              >
                {monthLabel(previousMonth(currentMonth))}
              </button>
              <span className="font-mono text-xs text-muted-foreground">
                {edition.frozen
                  ? `The ${monthLabel(edition.month)} leaderboard is closed to new entries. Totals can still fill in as late claims are indexed.`
                  : `Closes in ${closesIn(edition.closesAt)}`}
              </span>
            </div>
          )}
        </div>

        {mine && board && (
          <div className="mb-6 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Your place</p>
            <ol className="space-y-2">
              {board.neighbors.above ? (
                <Row entry={board.neighbors.above} def={def} />
              ) : (
                <li className="px-4 font-mono text-xs text-muted-foreground">Nobody ahead</li>
              )}
              <Row entry={mine} def={def} highlight />
              {board.neighbors.below && <Row entry={board.neighbors.below} def={def} />}
            </ol>
            <p className="px-1 font-mono text-[11px] text-muted-foreground">
              #{mine.rank} of {board.total}
            </p>
          </div>
        )}
        {handle && board && !mine && (
          <p className="mb-6 font-mono text-xs text-muted-foreground">
            You&rsquo;re not on this board yet{def.qualify ? ` (${def.qualify.toLowerCase()})` : ""}.
          </p>
        )}

        {failed ? (
          <div className="glass rounded-3xl p-6 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load the leaderboards right now. Try again in a moment.
          </div>
        ) : !board ? (
          <p className="text-sm text-muted-foreground">Loading&hellip;</p>
        ) : board.entries.length === 0 ? (
          <div className="glass rounded-3xl p-6 text-center text-sm text-muted-foreground">No rankings yet.</div>
        ) : (
          <div key={`${boardId}:${edition?.month}`} className="space-y-6">
            <ol className="space-y-3">
              {podium[0] && <PodiumCard entry={podium[0]} rank={1} def={def} />}
              {podium[1] && <PodiumCard entry={podium[1]} rank={2} def={def} />}
              {podium[2] && <PodiumCard entry={podium[2]} rank={3} def={def} />}
            </ol>

            {rest.length > 0 && (
              <ol className="space-y-2">
                {rest.map((e) => (
                  <Row key={e.walletAddress} entry={e} def={def} highlight={mineShown && e.walletAddress === mine?.walletAddress} />
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </Backdrop>
  );
}
