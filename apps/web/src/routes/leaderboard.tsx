import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowLeft, Crown } from "lucide-react";
import { fetchLeaderboard, formatEth, type LeaderboardEntry } from "@/lib/wrapped-data";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Bankr Wrapped \u00B7 Top Earners" },
      {
        name: "description",
        content: "The top 20 Bankr creators by total earnings.",
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

function PodiumCard({ entry, rank }: { entry: LeaderboardEntry; rank: 1 | 2 | 3 }) {
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
        <img
          src={entry.avatarUrl}
          alt=""
          className={`${style.avatarSize} rounded-full border-2 border-white/20 bg-surface object-cover`}
        />
        <span
          className={`absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full text-xs font-extrabold ${style.medal}`}
        >
          {rank}
        </span>
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 truncate font-display font-extrabold">
          {rank === 1 && <Crown className="size-4 shrink-0 text-[#F5C542]" />}
          {entry.displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.tokensLaunched} launched &middot; {entry.pleaseBroCount} Please Bro
        </p>
      </div>
      <span className="shrink-0 font-display text-lg font-extrabold text-accent">
        {formatEth(entry.totalEarningsEth)}
      </span>
    </motion.li>
  );
}

function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard().then((data) => {
      if (!cancelled) setEntries(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const podium = entries?.slice(0, 3) ?? [];
  const rest = entries?.slice(3) ?? [];

  return (
    <div className="relative min-h-screen">
      <img
        src="/liquid-glass-bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none fixed inset-0 size-full object-cover"
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-background/85 via-background/70 to-background/90" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/15" />

      <div className="relative z-10 mx-auto min-h-screen w-full max-w-xl px-5 py-8">
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

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.05 }}
          className="mb-8"
        >
          <h1 className="mb-2 font-display text-3xl font-extrabold sm:text-4xl">
            Top Earners on Bankr Wrapped
          </h1>
          <p className="text-sm text-muted-foreground">
            Ranked by wallets that have checked their Wrapped so far.{" "}
            <Link to="/" className="text-accent underline-offset-4 hover:underline">
              Check yours to climb the board
            </Link>
            .
          </p>
        </motion.div>

        {entries === null ? (
          <p className="text-sm text-muted-foreground">Loading&hellip;</p>
        ) : entries.length === 0 ? (
          <div className="glass rounded-3xl p-6 text-center text-sm text-muted-foreground">
            No one's checked their Wrapped yet &mdash; be the first.
          </div>
        ) : (
          <div className="space-y-6">
            <ol className="space-y-3">
              {podium[0] && <PodiumCard entry={podium[0]} rank={1} />}
              {podium[1] && <PodiumCard entry={podium[1]} rank={2} />}
              {podium[2] && <PodiumCard entry={podium[2]} rank={3} />}
            </ol>

            {rest.length > 0 && (
              <ol className="space-y-2">
                {rest.map((e, i) => (
                  <motion.li
                    key={e.walletAddress}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 160, damping: 20, delay: 1.4 + i * 0.05 }}
                    className="glass flex items-center gap-4 rounded-2xl p-4"
                  >
                    <span className="w-6 text-center font-display text-lg font-extrabold text-muted-foreground">
                      {i + 4}
                    </span>
                    <img
                      src={e.avatarUrl}
                      alt=""
                      className="size-10 rounded-full border border-glass-border bg-surface object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{e.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.tokensLaunched} launched &middot; {e.pleaseBroCount} Please Bro
                      </p>
                    </div>
                    <span className="font-display text-lg font-extrabold text-accent">
                      {formatEth(e.totalEarningsEth)}
                    </span>
                  </motion.li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
