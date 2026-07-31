import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { fetchLeaderboard, formatUsd, type LeaderboardEntry } from "@/lib/wrapped-data";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Bankr Wrapped \u2014 Top Earners" },
      {
        name: "description",
        content: "The top 20 Bankr creators by total earnings.",
      },
    ],
  }),
  component: LeaderboardPage,
});

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

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl px-5 py-8">
      <Link to="/" className="mb-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="mb-6 font-display text-3xl font-extrabold sm:text-4xl">
        Top Bankr Earners
      </h1>
      {entries === null ? (
        <p className="text-sm text-muted-foreground">Loading&hellip;</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data available right now.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li key={e.walletAddress} className="glass flex items-center gap-4 rounded-2xl p-4">
              <span className="w-6 text-center font-display text-lg font-extrabold text-muted-foreground">
                {i + 1}
              </span>
              <img src={e.avatarUrl} alt="" className="size-10 rounded-full border border-glass-border bg-surface object-cover" />
              <div className="flex-1">
                <p className="font-semibold">{e.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {e.tokensLaunched} launched &middot; {e.pleaseBroCount} Please Bro
                </p>
              </div>
              <span className="font-display text-lg font-extrabold text-accent">
                {formatUsd(e.totalEarningsUsd)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
