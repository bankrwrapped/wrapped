import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Backdrop } from "@/components/wrapped/terminal/Backdrop";
import { LandingFooter } from "@/components/wrapped/landing/LandingFooter";
import {
  BOARDS,
  fetchLeaderboards,
  formatBoardScore,
  normalizeHandle,
  type BoardDefinition,
  type BoardEntry,
  type BoardId,
  type LeaderboardsResponse,
} from "@/lib/wrapped-data";

// ?u=<handle> highlights that handle's place (set when arriving from a Wrapped).
export const Route = createFileRoute("/leaderboard")({
  validateSearch: (search: Record<string, unknown>): { u?: string } => {
    const u = typeof search.u === "string" ? normalizeHandle(search.u) : "";
    return u ? { u } : {};
  },
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

// Podium rows rise in quickly, top to bottom. The medal dot is the only
// colour that marks the podium; the leader's score takes the accent.
type PodiumStyle = { medal: string; avatarSize: string };
const PODIUM_STYLE: Record<number, PodiumStyle> = {
  1: { medal: "bg-[#E9C46A] text-black", avatarSize: "size-14" },
  2: { medal: "bg-[#C7CDD6] text-black", avatarSize: "size-12" },
  3: { medal: "bg-[#C98B62] text-black", avatarSize: "size-12" },
};

function PodiumCard({
  entry,
  rank,
  def,
}: {
  entry: BoardEntry;
  rank: 1 | 2 | 3;
  def: BoardDefinition;
}) {
  const style = PODIUM_STYLE[rank];
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: (rank - 1) * 0.05 }}
      className="relative flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#19191b] p-5"
    >
      <div className="relative shrink-0">
        {entry.avatarUrl ? (
          <img
            src={entry.avatarUrl}
            alt=""
            className={`${style.avatarSize} rounded-full bg-[#232325] object-cover`}
          />
        ) : (
          <span className={`${style.avatarSize} block rounded-full bg-[#232325]`} />
        )}
        <span
          className={`absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full font-mono text-xs tabular-nums ring-2 ring-[#19191b] ${style.medal}`}
        >
          {entry.rank}
        </span>
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate font-display text-lg">{entry.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{entry.username}
          {entry.tied && " · tied"}
        </p>
      </div>
      <span
        className={`shrink-0 font-mono text-base tabular-nums ${rank === 1 ? "text-accent" : "text-foreground"}`}
      >
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
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

function closesIn(closesAt: string): string {
  const ms = Date.parse(closesAt) - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function Row({
  entry,
  def,
  highlight,
}: {
  entry: BoardEntry;
  def: BoardDefinition;
  highlight?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-4 rounded-xl border bg-[#19191b] px-4 py-3 ${highlight ? "border-accent/60" : "border-white/[0.08]"}`}
    >
      <span className="w-8 text-center font-mono text-sm tabular-nums text-muted-foreground">
        {entry.rank}
      </span>
      {entry.avatarUrl ? (
        <img
          src={entry.avatarUrl}
          alt=""
          className="size-10 shrink-0 rounded-full bg-[#232325] object-cover"
        />
      ) : (
        <span className="size-10 shrink-0 rounded-full bg-[#232325]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{entry.username}
          {entry.tied && " · tied"}
        </p>
      </div>
      <span
        className={`shrink-0 font-mono text-sm tabular-nums ${highlight ? "text-accent" : "text-foreground"}`}
      >
        {formatBoardScore(entry.score, def.unit)}
      </span>
    </li>
  );
}

function LeaderboardPage() {
  const { u: handle } = Route.useSearch();
  const [boardId, setBoardId] = useState<BoardId>("earnings");
  // undefined = the current edition; set to view last month's closed edition.
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<LeaderboardsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // The current edition, remembered so "last month" stays computable after switching.
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);

  useEffect(() => {
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
  }, [month, handle]);

  const def = BOARDS.find((b) => b.id === boardId)!;
  const board = useMemo(() => data?.boards.find((b) => b.id === boardId) ?? null, [data, boardId]);
  const podium = board?.entries.slice(0, 3) ?? [];
  const rest = board?.entries.slice(3) ?? [];
  const mine = board?.personal ?? null;
  const mineShown = mine
    ? board!.entries.some((e) => e.walletAddress === mine.walletAddress)
    : false;
  const edition = data?.edition;

  return (
    // Content goes inside Backdrop: as a sibling, Backdrop's full-height box
    // pushed the whole page a screen down.
    <Backdrop>
      <div className="page-pad w-full py-8">
        <div className="mb-8 flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-7 shrink-0 rounded-md object-contain" />
          <span className="text-base font-medium">Bankr Wrapped</span>
        </div>

        <Link
          to="/"
          className="mb-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>

        {/* Desktop: board controls and your place on the left (sticky), the
            ranking fills the right. Mobile: one column in the same order. */}
        <div className="lg:grid lg:grid-cols-[minmax(320px,5fr)_7fr] lg:gap-12 xl:gap-16">
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="mb-6">
              <h1 className="mb-2 font-display text-3xl font-normal sm:text-4xl lg:text-5xl">
                Leaderboards
              </h1>
              <p className="text-sm text-muted-foreground">
                Ranked among wallets that have checked their Wrapped so far.{" "}
                <Link to="/" className="text-accent underline-offset-4 hover:underline">
                  Look up a handle to see its Wrapped
                </Link>
                .
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Leaderboards"
              className="-mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
            >
              {BOARDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={b.id === boardId}
                  onClick={() => setBoardId(b.id)}
                  className={`h-8 shrink-0 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                    b.id === boardId
                      ? "bg-[#ededed] text-[#141415]"
                      : "border border-white/[0.08] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b.title}
                </button>
              ))}
            </div>

            <div className="mb-6 rounded-2xl border border-white/[0.08] bg-[#19191b] p-5">
              <p className="font-display text-lg">{def.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
              <p className="mt-3 font-mono text-xs text-muted-foreground">{def.formula}</p>
              {def.qualify && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  To qualify: {def.qualify}
                </p>
              )}
              {boardId === "month" && edition && currentMonth && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMonth(undefined)}
                    className={`h-7 rounded-md px-2.5 text-xs font-medium ${!edition.frozen ? "bg-[#ededed] text-[#141415]" : "border border-white/[0.08] text-muted-foreground"}`}
                  >
                    {monthLabel(currentMonth)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonth(previousMonth(currentMonth))}
                    className={`h-7 rounded-md px-2.5 text-xs font-medium ${edition.frozen ? "bg-[#ededed] text-[#141415]" : "border border-white/[0.08] text-muted-foreground"}`}
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
                <p className="font-mono text-xs text-muted-foreground">Your place</p>
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
                You&rsquo;re not on this board yet
                {def.qualify ? ` (${def.qualify.toLowerCase()})` : ""}.
              </p>
            )}
          </div>

          <div>
            {failed ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#19191b] p-6 text-center text-sm text-muted-foreground">
                Couldn&rsquo;t load the leaderboards right now. Try again in a moment.
              </div>
            ) : !board ? (
              <p className="text-sm text-muted-foreground">Loading&hellip;</p>
            ) : board.entries.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#19191b] p-6 text-center text-sm text-muted-foreground">
                No rankings yet
              </div>
            ) : (
              <div key={`${boardId}:${edition?.month}`} className="space-y-6">
                <ol className="space-y-2">
                  {podium[0] && <PodiumCard entry={podium[0]} rank={1} def={def} />}
                  {podium[1] && <PodiumCard entry={podium[1]} rank={2} def={def} />}
                  {podium[2] && <PodiumCard entry={podium[2]} rank={3} def={def} />}
                </ol>

                {rest.length > 0 && (
                  <ol className="space-y-2">
                    {rest.map((e) => (
                      <Row
                        key={e.walletAddress}
                        entry={e}
                        def={def}
                        highlight={mineShown && e.walletAddress === mine?.walletAddress}
                      />
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <LandingFooter />
    </Backdrop>
  );
}
