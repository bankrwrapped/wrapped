// The share cards. Each card is a definition: whether the profile has
// something true to show for it, the X post text, and the face (a CardFrame).
// A missing number drops the card instead of showing a zero. The finale's
// card wall and the lightbox both render from CARDS.
import type { ReactNode } from "react";
import { getArchetype } from "@/lib/archetype";
import { getBuilderType } from "@/lib/builder-type";
import { calendarBlocks, claimRhythm, weekdayPlural, WEEKDAYS } from "@/lib/claim-rhythm";
import {
  barHolds,
  chartBars,
  dailySeries,
  daysSince,
  formatDate,
  formatUsd,
} from "@/lib/story-data";
import { summarizeThemes } from "@/lib/token-themes";
import { topPlacings } from "@/hooks/use-ranks";
import {
  BOARDS,
  CHAIN_LABEL,
  claimWindowLabel,
  formatBoardScore,
  formatEth,
  proxiedImageUrl,
  type BoardResult,
  type WrappedProfile,
} from "@/lib/wrapped-data";
import { TokenBadge } from "@/components/wrapped/story/motion";
import { CardFrame, type Tone } from "./ShareableCard";

export type CardContext = { profile: WrappedProfile; boards: BoardResult[] | null };

export type CardDef = {
  id: string;
  eyebrow: string;
  tone: Tone;
  available: (c: CardContext) => boolean;
  shareText: (c: CardContext) => string;
  Body: (c: CardContext) => ReactNode;
};

const hero = "font-display font-normal leading-[0.95] tracking-tight tabular-nums";
const label = "font-mono text-[11px] text-white/60";

const topTokens = (p: WrappedProfile) =>
  [...p.launched].sort((a, b) => b.feesEarnedEth - a.feesEarnedEth);
const atLeast = (p: WrappedProfile) => (p.earningsPartial ? "at least " : "");

export const CARDS: CardDef[] = [
  {
    id: "builder-type",
    eyebrow: "Builder type",
    tone: "violet",
    available: ({ profile: p }) => getBuilderType(p.tokensLaunched) !== null,
    shareText: ({ profile: p }) =>
      `I'm ${getBuilderType(p.tokensLaunched)!.title} on Bankr: ${p.tokensLaunched} tokens launched. What's yours?`,
    Body: ({ profile: p }) => {
      const type = getBuilderType(p.tokensLaunched)!;
      return (
        <>
          <span
            aria-hidden
            className={`${hero} pointer-events-none absolute -right-3 -top-8 text-[190px] text-white/[0.06]`}
          >
            {p.tokensLaunched}
          </span>
          {p.avatar && (
            <img
              src={proxiedImageUrl(p.avatar)}
              alt=""
              crossOrigin="anonymous"
              className="mb-auto mt-3 size-14 rounded-full object-cover ring-2 ring-white/25"
            />
          )}
          <h2 className={`${hero} text-[40px]`}>{type.title}</h2>
          <p className="mt-3 text-[13px] leading-snug text-white/70">{type.description}</p>
          <p className="mt-4 font-mono text-xs">
            <span>{p.tokensLaunched}</span> {p.tokensLaunched === 1 ? "token" : "tokens"} launched
          </p>
        </>
      );
    },
  },
  {
    id: "earnings",
    eyebrow: "What you earned",
    tone: "ember",
    available: ({ profile: p }) => p.creatorFeesStatus !== "unavailable" && p.totalEth > 0,
    shareText: ({ profile: p }) =>
      `I've earned ${atLeast(p)}${formatEth(p.totalEth)} in launch fees on Bankr.`,
    Body: ({ profile: p }) => {
      const series = dailySeries(p.claims.days);
      let run = 0;
      const cumulative = series.map((d) => (run += d.eth));
      const max = run || 1;
      const pts = cumulative.map(
        (v, i) =>
          `${((i / Math.max(1, cumulative.length - 1)) * 304).toFixed(1)},${(70 - (v / max) * 64).toFixed(1)}`,
      );
      return (
        <>
          {cumulative.length > 1 && (
            <div className="mb-auto mt-4">
              <p className="mb-1 text-right font-mono text-[9px] text-white/50">
                {p.claims.windowDays === 365
                  ? "claimed, last 12 months"
                  : `claimed, last ${series.length} days`}
              </p>
              <svg viewBox="0 0 304 72" className="h-[72px] w-full" aria-hidden>
                <defs>
                  <linearGradient id="earn-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="white" stopOpacity="0.35" />
                    <stop offset="1" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,72 ${pts.join(" ")} 304,72`} fill="url(#earn-fill)" />
                <polyline
                  points={pts.join(" ")}
                  fill="none"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
          {p.earningsPartial && <p className={label}>at least</p>}
          <p className={`${hero} text-[64px]`}>{formatEth(p.totalEth).replace(" ETH", "")}</p>
          <p className="mt-2 font-display text-xl">ETH earned</p>
          <div className="mt-5 grid grid-cols-3 gap-3 font-mono text-[11px]">
            <div>
              <p className={label}>Launches</p>
              <p className="mt-1">{formatEth(p.creatorEarningsEth)}</p>
            </div>
            <div>
              <p className={label}>Please Bro</p>
              <p className="mt-1">{formatEth(p.pleaseBroEarningsEth)}</p>
            </div>
            <div>
              <p className={label}>Unclaimed</p>
              <p className="mt-1 text-accent">{formatEth(p.unclaimedEth)}</p>
            </div>
          </div>
        </>
      );
    },
  },
  {
    id: "best-day",
    eyebrow: "Your highlight",
    tone: "magenta",
    available: ({ profile: p }) => !!p.claims.bestDay && p.claims.bestDay.eth > 0,
    shareText: ({ profile: p }) =>
      `Best day on Bankr: ${formatEth(p.claims.bestDay!.eth)} claimed on ${formatDate(p.claims.bestDay!.date)}.`,
    Body: ({ profile: p }) => {
      const best = p.claims.bestDay!;
      // Daily bars, or weekly ones over a full year.
      const series = chartBars(p.claims.days);
      const max = Math.max(...series.map((d) => d.eth), 0.0001);
      const w = 304 / Math.max(series.length, 1);
      return (
        <>
          {series.length > 1 && (
            <svg viewBox="0 0 304 110" className="mb-auto mt-4 h-[110px] w-full" aria-hidden>
              {series.map((d, i) => {
                const peak = barHolds(d, best.date);
                // Square-root heights so one huge day doesn't flatten the rest.
                const h = Math.max(d.eth > 0 ? 3 : 1, Math.sqrt(d.eth / max) * 104);
                return (
                  <rect
                    key={d.date}
                    x={peak ? i * w - 1.5 : i * w}
                    y={110 - h}
                    width={peak ? Math.max(4, w + 2) : Math.max(1, w - 1)}
                    height={h}
                    rx={1}
                    fill={peak ? "var(--accent)" : "rgba(255,255,255,0.32)"}
                  />
                );
              })}
            </svg>
          )}
          <p className={label}>Best claim day</p>
          <p className={`${hero} mt-2 text-[64px]`}>{formatEth(best.eth).replace(" ETH", "")}</p>
          <p className="mt-2 font-display text-xl">ETH in one day</p>
          <p className="mt-3 font-mono text-xs text-white/70">{formatDate(best.date)}</p>
        </>
      );
    },
  },
  {
    id: "top-token",
    eyebrow: "What resonated",
    tone: "gold",
    available: ({ profile: p }) => (topTokens(p)[0]?.feesEarnedEth ?? 0) > 0,
    shareText: ({ profile: p }) => {
      const t = topTokens(p)[0];
      return `My top earner on Bankr: $${t.symbol}, ${formatEth(t.feesEarnedEth)} in fees.`;
    },
    Body: ({ profile: p }) => {
      const [top, ...rest] = topTokens(p);
      return (
        <>
          <div className="mb-auto mt-4 flex justify-center">
            <TokenBadge token={top} size={112} />
          </div>
          <p className={label}>Top earner · #1 of {p.launched.length}</p>
          <h2 className={`${hero} mt-2 text-[38px]`}>{top.name}</h2>
          <p className="mt-1 font-mono text-xs text-white/70">
            ${top.symbol} · {CHAIN_LABEL[top.chain]}
          </p>
          <div className="mt-4 flex items-end justify-between">
            <p className="font-display text-[28px] tabular-nums">{formatEth(top.feesEarnedEth)}</p>
            {rest.length > 0 && (
              <div className="flex -space-x-2 pb-1">
                {rest.slice(0, 3).map((t) => (
                  <TokenBadge key={t.tokenAddress} token={t} size={26} />
                ))}
              </div>
            )}
          </div>
          <p className="mt-1 font-mono text-[9px] text-white/45">
            recent fees: claimed in 90 days + unclaimed
          </p>
        </>
      );
    },
  },
  {
    id: "starter-pack",
    eyebrow: "Starter pack",
    tone: "indigo",
    available: ({ profile: p }) => p.launched.length >= 4,
    shareText: ({ profile: p }) =>
      `My Bankr starter pack: ${topTokens(p)
        .slice(0, 4)
        .map((t) => "$" + t.symbol)
        .join(", ")}.`,
    Body: ({ profile: p }) => (
      <>
        <h2 className={`${hero} mb-auto mt-3 text-[30px]`}>
          The @{p.handle}
          <br />
          <span className="text-white/60">starter pack</span>
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {topTokens(p)
            .slice(0, 4)
            .map((t, i) => (
              <div
                key={t.tokenAddress}
                className="flex flex-col rounded-2xl border border-white/12 bg-white/[0.06] p-3"
                style={{ transform: `rotate(${[-2, 1.5, 1, -1.5][i]}deg)` }}
              >
                <TokenBadge token={t} size={34} />
                <p className="mt-2 truncate font-display text-sm">{t.name}</p>
                <p className="font-mono text-[10px] text-white/60">${t.symbol}</p>
                <p className="mt-1 font-mono text-[10px] text-accent">
                  {formatEth(t.feesEarnedEth)}
                </p>
              </div>
            ))}
        </div>
      </>
    ),
  },
  {
    id: "themes",
    eyebrow: "Top themes",
    tone: "violet",
    available: ({ profile: p }) =>
      p.launched.length >= 3 && summarizeThemes(p.launched).length >= 2,
    shareText: ({ profile: p }) =>
      `A bit of everything on Bankr, but mostly ${summarizeThemes(p.launched)[0].label}.`,
    Body: ({ profile: p }) => {
      const themes = summarizeThemes(p.launched);
      const most = Math.max(...themes.map((t) => t.count));
      return (
        <>
          <p className="mb-auto mt-3 text-[15px] text-white/70">A bit of everything, but mostly</p>
          <h2 className={`${hero} text-[44px]`}>{themes[0].label}</h2>
          <ul className="mt-5 space-y-2.5">
            {themes.slice(0, 4).map((t) => (
              <li key={t.id}>
                <div className="flex justify-between text-xs">
                  <span>{t.label}</span>
                  <span className="font-mono text-white/60">
                    {t.count} · {formatEth(t.feesEth)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(t.count / most) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      );
    },
  },
  {
    id: "rhythm",
    eyebrow: "When you claim",
    tone: "ember",
    available: ({ profile: p }) => claimRhythm(p.claims.days).claimDays >= 3,
    shareText: ({ profile: p }) => {
      const r = claimRhythm(p.claims.days);
      const streak = p.claims.longestStreakDays;
      return `${r.claimDays} claim days in ${claimWindowLabel(p.claims)} on Bankr${streak > 1 ? `, ${streak} in a row at best` : ""}. ${weekdayPlural(r.busiestWeekday!)} are payday.`;
    },
    Body: ({ profile: p }) => {
      const r = claimRhythm(p.claims.days);
      const max = Math.max(...r.weeks.flat().map((c) => c?.eth ?? 0), 0.0001);
      // Over half a year the calendar stacks as two halves; cells shrink to
      // fit the widest block.
      const blocks = calendarBlocks(r.weeks);
      const cols = Math.max(...blocks.map((b) => b.length), 1);
      const cell = Math.min(17, Math.floor((304 - (cols - 1) * 3) / cols));
      return (
        <>
          <h2 className={`${hero} mt-3 text-[38px]`}>
            {weekdayPlural(r.busiestWeekday!)} are payday
          </h2>
          <div className="my-auto flex flex-col items-center gap-3 py-4" aria-hidden>
            {blocks.map((weeks, b) => (
              <div key={b} className="flex justify-center gap-[3px]">
                {weeks.map((week, w) => (
                  <div key={w} className="flex flex-col gap-[3px]">
                    {week.map((c, d) => (
                      <span
                        key={d}
                        className="rounded-[3px]"
                        style={{
                          width: cell,
                          height: cell,
                          backgroundColor: !c
                            ? "transparent"
                            : c.eth > 0
                              ? "var(--accent)"
                              : "rgba(255,255,255,0.08)",
                          opacity: c && c.eth > 0 ? 0.4 + 0.6 * (c.eth / max) : 1,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className={label}>Claim days</p>
              <p className="mt-1 font-display text-2xl tabular-nums">{r.claimDays}</p>
            </div>
            <div>
              <p className={label}>Best streak</p>
              <p className="mt-1 font-display text-2xl tabular-nums">
                {p.claims.longestStreakDays}
                <span className="text-sm text-white/60"> days</span>
              </p>
            </div>
            <div>
              <p className={label}>Top day</p>
              <p className="mt-1 font-display text-2xl">{r.busiestWeekday ?? "–"}</p>
            </div>
          </div>
          <p className="sr-only">
            {WEEKDAYS.map((d, i) => `${d}: ${r.byWeekday[i]} claim days`).join(", ")}
          </p>
        </>
      );
    },
  },
  {
    id: "volume",
    eyebrow: "Your impact",
    tone: "gold",
    available: ({ profile: p }) =>
      p.tokensLaunched > 0 && p.tradingVolume.status === "ok" && p.tradingVolume.totalVolumeUsd > 0,
    shareText: ({ profile: p }) =>
      `My Bankr launches have done ${p.tradingVolume.isComplete ? "" : "at least "}${formatUsd(p.tradingVolume.totalVolumeUsd)} in trading volume.`,
    Body: ({ profile: p }) => (
      <>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-[260px]">
          {[260, 200, 140, 80].map((s) => (
            <div
              key={s}
              className="absolute rounded-full border border-white/15"
              style={{ width: s, height: s, left: (260 - s) / 2, top: (260 - s) / 2 }}
            />
          ))}
        </div>
        <p className="mb-auto mt-3 max-w-[11rem] text-[15px] text-white/70">
          Trading volume across your {p.tokensLaunched} launches
        </p>
        {!p.tradingVolume.isComplete && <p className={label}>at least · still counting</p>}
        <p className={`${hero} text-[76px]`}>{formatUsd(p.tradingVolume.totalVolumeUsd)}</p>
        <p className="mt-2 font-display text-xl">traded</p>
      </>
    ),
  },
  {
    id: "first-launch",
    eyebrow: "Where it started",
    tone: "indigo",
    available: ({ profile: p }) => !!p.firstLaunch,
    shareText: ({ profile: p }) =>
      `My Bankr story started with $${p.firstLaunch!.symbol} on ${formatDate(p.firstLaunch!.launchedAt)}.`,
    Body: ({ profile: p }) => {
      const f = p.firstLaunch!;
      const days = daysSince(f.launchedAt);
      return (
        <>
          <p className="mb-auto mt-3 text-[15px] text-white/70">It all started on</p>
          <h2 className={`${hero} text-[40px]`}>{formatDate(f.launchedAt)}</h2>
          <div className="mt-6 flex items-center gap-2" aria-hidden>
            <TokenBadge token={f} size={30} />
            <div className="h-px flex-1 bg-white/40" />
            <span className="size-2.5 rounded-full bg-accent" />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-white/60">
            <span>
              {f.name} · ${f.symbol}
            </span>
            <span>today</span>
          </div>
          <p className="mt-5 font-display text-xl">
            <span className="text-accent">{days.toLocaleString("en-US")}</span> days building on{" "}
            {CHAIN_LABEL[f.chain]}
          </p>
        </>
      );
    },
  },
  {
    id: "verdict",
    eyebrow: "Bankr's verdict",
    tone: "magenta",
    available: ({ profile: p }) => p.creatorFeesStatus !== "unavailable",
    shareText: ({ profile: p }) => `Bankr's verdict on me: ${getArchetype(p).title}.`,
    Body: ({ profile: p }) => {
      const a = getArchetype(p);
      return (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-6 font-display text-[200px] leading-none text-white/[0.08]"
          >
            “
          </span>
          <h2 className={`${hero} mt-auto text-[46px]`}>{a.title}</h2>
          <p className="mt-4 text-[15px] leading-snug text-white/80">“{a.description}”</p>
          <p className="mt-4 font-mono text-[11px] text-white/55">Signed, Bankr</p>
        </>
      );
    },
  },
  {
    id: "rankings",
    eyebrow: "Where you stand",
    tone: "violet",
    available: ({ boards }) => topPlacings(boards).length > 0,
    shareText: ({ boards }) => {
      const best = topPlacings(boards)[0];
      return `#${best.personal!.rank} of ${best.total} on the Bankr Wrapped "${BOARDS.find((d) => d.id === best.id)!.title}" board.`;
    },
    Body: ({ boards }) => (
      <>
        <ul className="mt-4 space-y-3">
          {topPlacings(boards).map((b) => {
            const def = BOARDS.find((d) => d.id === b.id)!;
            const ahead = b.neighbors.above;
            return (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-display text-base">{def.title}</p>
                  <p className="truncate font-mono text-[10px] text-white/55">
                    {ahead
                      ? `next: @${ahead.username} · ${formatBoardScore(ahead.score, def.unit)}`
                      : "nobody ahead"}
                  </p>
                </div>
                <p className="shrink-0 font-display text-[30px] leading-none tabular-nums">
                  #{b.personal!.rank}
                  <span className="text-xs text-white/50">/{b.total}</span>
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-auto pt-3 font-mono text-[9px] text-white/45">
          among everyone who has checked their Wrapped
        </p>
      </>
    ),
  },
];

// A card's face, ready for the wall or the lightbox.
export function CardFace({
  def,
  ctx,
  faceRef,
}: {
  def: CardDef;
  ctx: CardContext;
  faceRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const Body = def.Body;
  return (
    <CardFrame ref={faceRef} eyebrow={def.eyebrow} handle={ctx.profile.handle} tone={def.tone}>
      <Body {...ctx} />
    </CardFrame>
  );
}
