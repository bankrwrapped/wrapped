// The Wrapped card set. Each card is built from the profile alone (the ranks
// card also reads /api/leaderboards) and returns null when it has nothing
// true to say, so a missing number drops a card instead of showing a zero.
import { useEffect, useState } from "react";
import { getArchetype } from "@/lib/archetype";
import { getBuilderType } from "@/lib/builder-type";
import { claimRhythm, WEEKDAYS } from "@/lib/claim-rhythm";
import { summarizeThemes } from "@/lib/token-themes";
import { tokenHue, tokenInitials } from "@/lib/token-badge";
import {
  BOARDS,
  CHAIN_LABEL,
  fetchLeaderboards,
  formatBoardScore,
  formatEth,
  proxiedImageUrl,
  type BoardResult,
  type TokenEntry,
  type WrappedProfile,
} from "@/lib/wrapped-data";
import { ShareableCard } from "./ShareableCard";

type CardProps = { profile: WrappedProfile };

const big = "font-display text-5xl font-extrabold leading-none sm:text-6xl";
const sub = "mt-3 text-sm text-muted-foreground";

const atLeast = (p: WrappedProfile) => (p.earningsPartial ? "at least " : "");

export function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function formatDate(iso: string): string {
  return new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function TokenBadge({ token, size = "size-10" }: { token: TokenEntry; size?: string }) {
  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-1 ring-border`}
      style={{ backgroundColor: `hsl(${tokenHue(token.tokenAddress)}, 60%, 38%)` }}
      aria-hidden
    >
      {tokenInitials(token.symbol)}
    </span>
  );
}

export function BuilderTypeCard({ profile: p }: CardProps) {
  const type = getBuilderType(p.tokensLaunched);
  if (!type) return null;
  return (
    <ShareableCard
      id="builder-type"
      eyebrow="Your builder type"
      handle={p.handle}
      shareText={`I'm ${type.title} on Bankr: ${p.tokensLaunched} tokens launched. What's yours?`}
    >
      {p.avatar && (
        <img
          src={proxiedImageUrl(p.avatar)}
          alt=""
          crossOrigin="anonymous"
          className="mb-5 size-16 rounded-full border-2 border-white/20 object-cover"
        />
      )}
      <h2 className="font-display text-4xl font-extrabold uppercase leading-tight sm:text-5xl">{type.title}</h2>
      <p className={sub}>{type.description}</p>
      <p className="mt-6 font-mono text-sm">
        <span className="text-accent">{p.tokensLaunched}</span> {p.tokensLaunched === 1 ? "token" : "tokens"} launched
      </p>
    </ShareableCard>
  );
}

// Launcher "job title" - the archetype, read off earnings and claim habits.
export function JobTitleCard({ profile: p }: CardProps) {
  if (p.creatorFeesStatus === "unavailable") return null;
  const a = getArchetype(p);
  return (
    <ShareableCard
      id="job-title"
      eyebrow="Your launcher job title"
      handle={p.handle}
      shareText={`Bankr gave me a job title: ${a.title}.`}
    >
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Title</p>
      <h2 className="mt-2 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
        <span className="text-gradient">{a.title}</span>
      </h2>
      <p className="mt-5 border-l-2 border-accent/60 pl-4 text-base italic text-muted-foreground">“{a.description}”</p>
      <p className="mt-4 font-mono text-[11px] text-muted-foreground">Signed, Bankr</p>
    </ShareableCard>
  );
}

export function FirstLaunchCard({ profile: p }: CardProps) {
  const f = p.firstLaunch;
  if (!f) return null;
  return (
    <ShareableCard
      id="first-launch"
      eyebrow="Where it started"
      handle={p.handle}
      shareText={`My Bankr story started with $${f.symbol} on ${formatDate(f.launchedAt)}.`}
    >
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your first launch</p>
      <h2 className="mt-3 font-display text-4xl font-extrabold leading-tight">{f.name}</h2>
      <p className={sub}>
        ${f.symbol} on {CHAIN_LABEL[f.chain]} · {formatDate(f.launchedAt)}
      </p>
      <p className="mt-6 text-sm">That's where your Bankr story began.</p>
    </ShareableCard>
  );
}

export function EarningsCard({ profile: p }: CardProps) {
  if (p.creatorFeesStatus === "unavailable" || p.totalEth <= 0) return null;
  return (
    <ShareableCard
      id="earnings"
      eyebrow="What you earned"
      handle={p.handle}
      shareText={`I've earned ${atLeast(p)}${formatEth(p.totalEth)} in launch fees on Bankr.`}
    >
      {p.earningsPartial && <p className="mb-2 font-mono text-xs text-muted-foreground">at least</p>}
      <p className={big}>
        <span className="text-gradient">{formatEth(p.totalEth)}</span>
      </p>
      <p className={sub}>claimed + unclaimed, from launch fees</p>
      <dl className="mt-8 grid grid-cols-2 gap-4 font-mono text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">Your launches</dt>
          <dd className="mt-1">{formatEth(p.creatorEarningsEth)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">Please Bro</dt>
          <dd className="mt-1">{formatEth(p.pleaseBroEarningsEth)}</dd>
        </div>
        {p.unclaimedEth > 0 && (
          <div className="col-span-2">
            <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">Still unclaimed</dt>
            <dd className="mt-1 text-accent">{formatEth(p.unclaimedEth)}</dd>
          </div>
        )}
      </dl>
    </ShareableCard>
  );
}

export function BestDayCard({ profile: p }: CardProps) {
  if (!p.bestDay || p.bestDay.eth <= 0) return null;
  return (
    <ShareableCard
      id="best-day"
      eyebrow="Your highlight"
      handle={p.handle}
      shareText={`Best day on Bankr: ${formatEth(p.bestDay.eth)} claimed on ${formatDate(p.bestDay.date)}.`}
    >
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Best claim day</p>
      <p className={`${big} mt-3`}>{formatEth(p.bestDay.eth)}</p>
      <p className={sub}>{formatDate(p.bestDay.date)}</p>
      <p className="mt-6 text-sm">One day. One claim. Remember it.</p>
    </ShareableCard>
  );
}

export function StreakCard({ profile: p }: CardProps) {
  if (p.longestStreakDays <= 1) return null;
  return (
    <ShareableCard
      id="streak"
      eyebrow="Your rhythm"
      handle={p.handle}
      shareText={`${p.longestStreakDays} days in a row claiming fees on Bankr.`}
    >
      <p className={big}>
        {p.longestStreakDays} <span className="text-2xl">days</span>
      </p>
      <p className={sub}>longest claim streak, last 90 days</p>
      <div className="mt-8 flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: Math.min(p.longestStreakDays, 30) }, (_, i) => (
          <span key={i} className="size-3 rounded-sm bg-accent" style={{ opacity: 0.4 + (0.6 * (i + 1)) / Math.min(p.longestStreakDays, 30) }} />
        ))}
      </div>
    </ShareableCard>
  );
}

// When you claim: a 90-day calendar of claim days, plus the busiest weekday.
export function ClaimRhythmCard({ profile: p }: CardProps) {
  const r = claimRhythm(p.dailyEarnings);
  if (r.claimDays < 3) return null;
  const max = Math.max(...r.weeks.flat().map((c) => c?.eth ?? 0));
  const maxWeekday = Math.max(...r.byWeekday);
  return (
    <ShareableCard
      id="claim-rhythm"
      eyebrow="When you claim"
      handle={p.handle}
      shareText={`${r.claimDays} claim days in 90 on Bankr. ${r.busiestWeekday}s are my payday.`}
    >
      <p className="font-display text-3xl font-extrabold leading-tight">
        {r.busiestWeekday}s are <span className="text-gradient">payday</span>
      </p>
      <p className={sub}>{r.claimDays} claim days in the last 90</p>
      <div className="mt-6 flex gap-[3px]" aria-hidden>
        {r.weeks.map((week, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {week.map((c, d) => (
              <span
                key={d}
                className="size-[11px] rounded-[2px] sm:size-3"
                style={{
                  backgroundColor: !c ? "transparent" : c.eth > 0 ? "var(--accent)" : "var(--glass-border)",
                  opacity: c && c.eth > 0 ? 0.35 + 0.65 * (c.eth / (max || 1)) : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1 font-mono text-[10px] text-muted-foreground">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className="flex flex-col items-center gap-1">
            <span className="flex h-10 w-full items-end justify-center">
              <span
                className="w-2/5 rounded-[2px] bg-primary"
                style={{ height: `${Math.max(6, (r.byWeekday[i] / (maxWeekday || 1)) * 100)}%`, opacity: r.byWeekday[i] ? 1 : 0.25 }}
              />
            </span>
            {d}
          </div>
        ))}
      </div>
    </ShareableCard>
  );
}

// Starter pack: your four best-earning launches.
export function StarterPackCard({ profile: p }: CardProps) {
  const pack = [...p.launched].sort((a, b) => b.feesEarnedEth - a.feesEarnedEth).slice(0, 4);
  if (pack.length < 2) return null;
  return (
    <ShareableCard
      id="starter-pack"
      eyebrow="Your Bankr starter pack"
      handle={p.handle}
      shareText={`My Bankr starter pack: ${pack.map((t) => "$" + t.symbol).join(", ")}.`}
    >
      <div className="grid grid-cols-2 gap-3">
        {pack.map((t) => (
          <div key={t.tokenAddress} className="flex flex-col items-center rounded-2xl border border-glass-border bg-white/5 p-4 text-center">
            <TokenBadge token={t} size="size-12" />
            <p className="mt-3 w-full truncate font-display text-base font-bold">{t.name}</p>
            <p className="text-xs text-muted-foreground">${t.symbol}</p>
            <p className="mt-2 font-mono text-xs text-accent">{formatEth(t.feesEarnedEth)}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center font-mono text-[10px] text-muted-foreground">recent fees: claimed in 90 days + unclaimed</p>
    </ShareableCard>
  );
}

export function TopTokenCard({ profile: p }: CardProps) {
  const top = [...p.launched, ...p.pleaseBro].sort((a, b) => b.feesEarnedEth - a.feesEarnedEth)[0];
  if (!top || top.feesEarnedEth <= 0) return null;
  const isPleaseBro = p.pleaseBro.includes(top);
  return (
    <ShareableCard
      id="top-token"
      eyebrow="What resonated"
      handle={p.handle}
      shareText={`My top earner on Bankr: $${top.symbol}, ${formatEth(top.feesEarnedEth)} in fees.`}
    >
      <TokenBadge token={top} size="size-16" />
      <h2 className="mt-5 font-display text-4xl font-extrabold leading-tight">{top.name}</h2>
      <p className={sub}>
        ${top.symbol} · {CHAIN_LABEL[top.chain]} {isPleaseBro && "· Please Bro"}
      </p>
      <p className="mt-6 font-display text-3xl font-extrabold text-accent">{formatEth(top.feesEarnedEth)}</p>
      <p className="font-mono text-[11px] text-muted-foreground">recent fees: claimed in 90 days + unclaimed</p>
    </ShareableCard>
  );
}

// Your themes: launches grouped by name keywords, and which theme paid.
export function ThemesCard({ profile: p }: CardProps) {
  const themes = summarizeThemes(p.launched);
  if (p.launched.length < 3 || themes.length < 2) return null;
  const top = themes[0];
  const totalCount = themes.reduce((a, t) => a + t.count, 0);
  return (
    <ShareableCard
      id="themes"
      eyebrow="Your top themes"
      handle={p.handle}
      shareText={`A bit of everything on Bankr, but mostly ${top.label.toLowerCase()}.`}
    >
      <p className="font-display text-3xl font-extrabold leading-tight">
        A bit of everything, but mostly <span className="text-gradient">{top.label.toLowerCase()}</span>
      </p>
      <ul className="mt-6 space-y-3">
        {themes.slice(0, 4).map((t) => (
          <li key={t.id}>
            <div className="flex justify-between text-sm">
              <span>{t.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {t.count} · {formatEth(t.feesEth)}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(t.count / totalCount) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ShareableCard>
  );
}

const VOLUME_QUIPS = [
  "Counting every swap…",
  "Pricing your BNKR pairs…",
  "Asking Clanker nicely…",
  "Replaying the chart…",
  "Finding the buyers…",
  "Adding up the degens…",
  "Checking the pools…",
];

function useQuip(lines: string[], ms = 2200) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), ms);
    return () => clearInterval(t);
  }, [lines, ms]);
  return lines[i];
}

export function VolumeCard({ profile: p }: CardProps) {
  const v = p.tradingVolume;
  const quip = useQuip(VOLUME_QUIPS);
  if (p.tokensLaunched === 0) return null;
  if (v.status === "pending") {
    return (
      <section className="glass mx-auto w-full max-w-md rounded-3xl p-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Launch volume</p>
        <p className="mt-4 font-display text-xl font-bold">Still counting your volume</p>
        <p className="mt-2 font-mono text-sm text-accent" aria-live="polite">
          {quip}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">This card fills in on its own when it's ready.</p>
      </section>
    );
  }
  return (
    <ShareableCard
      id="volume"
      eyebrow="Your impact"
      handle={p.handle}
      shareText={`My Bankr launches have done ${v.isComplete ? "" : "at least "}${formatUsd(v.totalVolumeUsd)} in trading volume.`}
    >
      {!v.isComplete && <p className="mb-2 font-mono text-xs text-muted-foreground">at least</p>}
      <p className={big}>
        <span className="text-gradient">{formatUsd(v.totalVolumeUsd)}</span>
      </p>
      <p className={sub}>traded across your launches</p>
      {!v.isComplete && <p className="mt-4 font-mono text-xs text-accent">{quip.replace("…", "")}, still updating</p>}
    </ShareableCard>
  );
}

// Your place on each board you qualify for, with whoever's directly ahead.
export function RanksCard({ profile: p }: CardProps) {
  const [boards, setBoards] = useState<BoardResult[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLeaderboards({ handle: p.handle })
      .then((r) => !cancelled && setBoards(r.boards))
      .catch(() => !cancelled && setBoards([]));
    return () => {
      cancelled = true;
    };
  }, [p.handle]);

  const mine = (boards ?? [])
    .filter((b) => b.personal)
    .sort((a, b) => a.personal!.rank / a.total - b.personal!.rank / b.total)
    .slice(0, 4);
  if (boards === null || mine.length === 0) return null;
  const best = mine[0];
  const bestDef = BOARDS.find((d) => d.id === best.id)!;
  return (
    <ShareableCard
      id="rankings"
      eyebrow="Your rankings"
      handle={p.handle}
      shareText={`#${best.personal!.rank} of ${best.total} on the Bankr Wrapped "${bestDef.title}" board.`}
    >
      <ul className="space-y-4">
        {mine.map((b) => {
          const def = BOARDS.find((d) => d.id === b.id)!;
          const ahead = b.neighbors.above;
          return (
            <li key={b.id} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-bold">{def.title}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {ahead
                    ? `next up: @${ahead.username}, ${formatBoardScore(ahead.score, def.unit)}`
                    : "nobody ahead"}
                </p>
              </div>
              <p className="shrink-0 font-display text-2xl font-extrabold">
                #{b.personal!.rank}
                <span className="text-sm text-muted-foreground"> / {b.total}</span>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 font-mono text-[10px] text-muted-foreground">out of everyone who's checked their Wrapped</p>
    </ShareableCard>
  );
}
