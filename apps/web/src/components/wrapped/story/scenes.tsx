// The story's scenes. Each is a full-screen motion composition built from the
// profile; buildScenes leaves out any scene whose data isn't there, using the
// same tests as the share cards. Timings are in seconds from scene start and
// every scene finishes its choreography well inside its duration.
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { getArchetype } from "@/lib/archetype";
import { getBuilderType } from "@/lib/builder-type";
import { calendarBlocks, claimRhythm, weekdayPlural } from "@/lib/claim-rhythm";
import { barHolds, chartBars, daysSince, formatDate, formatUsd } from "@/lib/story-data";
import { summarizeThemes } from "@/lib/token-themes";
import { topPlacings } from "@/hooks/use-ranks";
import { BOARDS, CHAIN_LABEL, formatEth, proxiedImageUrl, type BoardResult, type WrappedProfile } from "@/lib/wrapped-data";
import { CARDS, type CardContext } from "../cards/WrappedCards";
import { COLORS, CountUp, EASE, Eyebrow, FadeUp, Slam, TokenBadge, Words, type Palette } from "./motion";
import { BAR_MS, type Energy } from "./soundtrack";

// How the story cuts into a scene; the player maps each to a transition and
// the soundtrack to the hit that goes with it.
export type Cut = "fade" | "zoom" | "wipe" | "whip" | "flash" | "iris";

export type Scene = {
  id: string;
  duration: number;
  palette: Palette;
  cut: Cut;
  // Soundtrack layers while the scene plays (see soundtrack.ts).
  energy: Energy;
  render: (c: CardContext) => ReactNode;
};

const hero = "font-display font-extrabold leading-[0.9] tracking-tight";
const big = `${hero} text-[clamp(4.5rem,22vw,11rem)]`;
const headline = `${hero} text-[clamp(2.4rem,9vw,5rem)]`;
const lead = "font-display text-[clamp(1.4rem,5vw,2.4rem)] font-bold leading-tight text-white/85";

function Stage({ children }: { children: ReactNode }) {
  return <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col justify-center gap-5 px-7 sm:px-12">{children}</div>;
}

const eth3 = (v: number) => v.toFixed(3);

function IntroScene({ p }: { p: WrappedProfile }) {
  const reduce = useReducedMotion();
  return (
    <Stage>
      <motion.div
        className="relative mb-4 size-24 sm:size-28"
        initial={{ scale: reduce ? 1 : 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 12, delay: 0.2 }}
      >
        <motion.div
          className="absolute -inset-2 rounded-full"
          style={{ background: `conic-gradient(from 0deg, ${COLORS.violet}, ${COLORS.ember}, ${COLORS.magenta}, ${COLORS.violet})` }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-0 overflow-hidden rounded-full border-4 border-[#0b0910] bg-[#0b0910]">
          {p.avatar ? (
            <img src={proxiedImageUrl(p.avatar)} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-display text-3xl font-extrabold">{p.handle[0]?.toUpperCase()}</span>
          )}
        </div>
      </motion.div>
      <Eyebrow delay={0.5}>Bankr Wrapped · {new Date().getUTCFullYear()}</Eyebrow>
      <h1 className={headline}>
        <Words text={`Hey @${p.handle}.`} delay={0.7} />
      </h1>
      <p className={lead}>
        <Words text="Let's look back at your year on Bankr." delay={1.5} stagger={0.05} />
      </p>
    </Stage>
  );
}

// Launched-token symbols scattered behind the count, at fixed spots.
// Top and bottom bands only, so they never sit behind the text.
const SPOTS = [
  [6, 11], [62, 9], [34, 15], [74, 17], [8, 86], [58, 90], [30, 82], [70, 80], [44, 7], [16, 93],
];

function LaunchesScene({ p }: { p: WrappedProfile }) {
  const type = getBuilderType(p.tokensLaunched)!;
  const reduce = useReducedMotion();
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {p.launched.slice(0, SPOTS.length).map((t, i) => (
          <motion.span
            key={t.tokenAddress}
            className="absolute rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-xs text-white/50"
            style={{ left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%` }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={reduce ? { opacity: 0.6, scale: 1 } : { opacity: [0, 0.8, 0.45], scale: 1, y: [0, -10, 0] }}
            transition={{ duration: 3, delay: 0.6 + i * 0.12, ease: EASE, y: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}
          >
            ${t.symbol}
          </motion.span>
        ))}
      </div>
      <Stage>
        <Eyebrow>Launches</Eyebrow>
        <p className={lead}>
          <Words text="You launched" />
        </p>
        <p className={`${big} text-gradient`}>
          <CountUp value={p.tokensLaunched} format={(v) => String(Math.round(v))} delay={0.5} duration={1800} />
        </p>
        <p className={lead}>
          <Words text={p.tokensLaunched === 1 ? "token on Bankr." : "tokens on Bankr."} delay={1.2} />
        </p>
        <FadeUp delay={2.8} className="mt-6">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/60">That makes you</p>
        </FadeUp>
        <Slam delay={3.2}>
          <p className={`${headline} uppercase`}>{type.title}</p>
        </Slam>
        <FadeUp delay={4}>
          <p className="max-w-xl text-lg text-white/70">{type.description}</p>
        </FadeUp>
      </Stage>
    </>
  );
}

function FirstLaunchScene({ p }: { p: WrappedProfile }) {
  const f = p.firstLaunch!;
  const reduce = useReducedMotion();
  return (
    <Stage>
      <Eyebrow>Where it started</Eyebrow>
      <p className={lead}>
        <Words text="It all started on" />
      </p>
      <Slam delay={0.8}>
        <p className={`${headline} text-gradient`}>{formatDate(f.launchedAt)}</p>
      </Slam>
      <div className="mt-8 flex items-center gap-3" aria-hidden>
        <FadeUp delay={1.6} y={0}>
          <TokenBadge token={f} size={48} />
        </FadeUp>
        <motion.div
          className="h-0.5 flex-1 origin-left bg-gradient-to-r from-white to-accent"
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.6, delay: 1.9, ease: EASE }}
        />
        <motion.span
          className="size-4 rounded-full bg-accent shadow-[0_0_20px_var(--accent)]"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 3.4 }}
        />
      </div>
      <FadeUp delay={2} className="flex justify-between font-mono text-sm text-white/70">
        <span>
          {f.name} · ${f.symbol}
        </span>
        <span>today</span>
      </FadeUp>
      <FadeUp delay={2.6} className="mt-4">
        <p className={lead}>
          <CountUp value={daysSince(f.launchedAt)} format={(v) => Math.round(v).toLocaleString("en-US")} delay={2.6} duration={1400} className="text-accent" /> days
          of building on {CHAIN_LABEL[f.chain]}.
        </p>
      </FadeUp>
    </Stage>
  );
}

function EarningsScene({ p }: { p: WrappedProfile }) {
  const reduce = useReducedMotion();
  const total = p.creatorEarningsEth + p.pleaseBroEarningsEth || 1;
  return (
    <Stage>
      <Eyebrow>What you earned</Eyebrow>
      <p className={lead}>
        <Words text={p.earningsPartial ? "You earned at least" : "You earned"} />
      </p>
      <p className={`${big} text-gradient`}>
        <CountUp value={p.totalEth} format={eth3} delay={0.5} duration={2200} />
      </p>
      <p className={lead}>
        <Words text="ETH in launch fees." delay={1} />
      </p>
      <div className="mt-6 space-y-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: reduce ? `${(p.creatorEarningsEth / total) * 100}%` : 0 }}
            animate={{ width: `${(p.creatorEarningsEth / total) * 100}%` }}
            transition={{ duration: 1.2, delay: 2.4, ease: EASE }}
          />
          <motion.div
            className="h-full bg-accent"
            initial={{ width: reduce ? `${(p.pleaseBroEarningsEth / total) * 100}%` : 0 }}
            animate={{ width: `${(p.pleaseBroEarningsEth / total) * 100}%` }}
            transition={{ duration: 0.9, delay: 3.4, ease: EASE }}
          />
        </div>
        <FadeUp delay={2.6} className="flex flex-col gap-1 font-mono text-xs text-white/70 sm:flex-row sm:justify-between sm:text-sm">
          <span>
            <span className="mr-1.5 inline-block size-2 rounded-full bg-primary" />
            Your launches {formatEth(p.creatorEarningsEth)}
          </span>
          <span>
            <span className="mr-1.5 inline-block size-2 rounded-full bg-accent" />
            Please Bro {formatEth(p.pleaseBroEarningsEth)}
          </span>
        </FadeUp>
      </div>
      {p.unclaimedEth > 0 && (
        <FadeUp delay={4.2} className="mt-4">
          <p className="inline-block rounded-full border border-accent/50 bg-accent/15 px-4 py-2 text-sm">
            <span className="font-semibold text-accent">{formatEth(p.unclaimedEth)}</span> is still waiting to be claimed.
          </p>
        </FadeUp>
      )}
    </Stage>
  );
}

function BestDayScene({ p }: { p: WrappedProfile }) {
  const reduce = useReducedMotion();
  const best = p.claims.bestDay!;
  // Daily bars, or weekly ones over a full year, so a year still fits.
  const series = chartBars(p.claims.days);
  const max = Math.max(...series.map((d) => d.eth), 0.0001);
  // Square-root heights: one huge day would otherwise flatten the rest.
  const height = (eth: number) => Math.max(eth > 0 ? 4 : 0.6, Math.sqrt(eth / max) * 100);
  return (
    <Stage>
      <Eyebrow>Your highlight</Eyebrow>
      <p className={lead}>
        <Words text="Your biggest day" />
      </p>
      {series.length > 1 && (
        <div className={`relative mt-8 flex h-40 items-end sm:h-56 ${series.length > 60 ? "gap-px" : "gap-[2px]"}`} aria-hidden>
          {series.map((d, i) => {
            const peak = barHolds(d, best.date);
            return (
              <motion.div
                key={d.date}
                className={`relative origin-bottom rounded-t-[2px] ${peak ? "w-2 shrink-0" : "flex-1"}`}
                style={{ height: `${height(d.eth)}%`, background: peak ? "var(--accent)" : "rgba(255,255,255,0.35)", boxShadow: peak ? "0 0 24px var(--accent)" : undefined }}
                initial={{ scaleY: reduce ? 1 : 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.6, delay: 0.6 + i * (1.4 / series.length), ease: EASE }}
              >
                {peak && (
                  <motion.span
                    className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-foreground"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 2.2 }}
                  >
                    {formatDate(best.date, { short: true }).replace(/, \d{4}$/, "")}
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      <Slam delay={2.6}>
        <p className={`${big} text-[clamp(3.5rem,16vw,8rem)]`}>
          {formatEth(best.eth).replace(" ETH", "")}
          <span className="ml-3 text-[0.35em] text-white/70">ETH</span>
        </p>
      </Slam>
      <FadeUp delay={3.2}>
        <p className={lead}>claimed on {formatDate(best.date)}.</p>
      </FadeUp>
    </Stage>
  );
}

function TopTokenScene({ p }: { p: WrappedProfile }) {
  const reduce = useReducedMotion();
  const [top, ...rest] = [...p.launched].sort((a, b) => b.feesEarnedEth - a.feesEarnedEth);
  return (
    <Stage>
      <Eyebrow>What resonated</Eyebrow>
      <p className={lead}>
        <Words text="Your top earner" />
      </p>
      <div className="flex items-center gap-6">
        <motion.div
          className="relative"
          initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 0 : -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 110, damping: 11, delay: 0.7 }}
        >
          <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,190,110,0.45),transparent_70%)]" />
          <TokenBadge token={top} size={128} />
        </motion.div>
        <div className="min-w-0">
          <Slam delay={1.3}>
            <p className={`${headline} break-words`}>{top.name}</p>
          </Slam>
          <FadeUp delay={1.8}>
            <p className="mt-2 font-mono text-sm text-white/70">${top.symbol}</p>
          </FadeUp>
        </div>
      </div>
      <FadeUp delay={2.2}>
        <p className={`${hero} text-[clamp(2.5rem,10vw,5rem)] text-accent`}>
          <CountUp value={top.feesEarnedEth} format={(v) => `${v.toFixed(3)} ETH`} delay={2.2} duration={1400} />
        </p>
      </FadeUp>
      {rest.length >= 3 && (
        <div className="mt-4">
          <FadeUp delay={3.4}>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/60">and the rest of your starter pack</p>
          </FadeUp>
          <div className="mt-3 flex flex-wrap gap-3">
            {rest.slice(0, 3).map((t, i) => (
              <motion.div
                key={t.tokenAddress}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1.5 pl-1.5 pr-4"
                initial={{ opacity: 0, x: reduce ? 0 : 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: EASE, delay: 3.7 + i * 0.18 }}
              >
                <TokenBadge token={t} size={30} />
                <span className="text-sm font-semibold">${t.symbol}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </Stage>
  );
}

function ThemesScene({ p }: { p: WrappedProfile }) {
  const reduce = useReducedMotion();
  const themes = summarizeThemes(p.launched).slice(0, 4);
  const most = Math.max(...themes.map((t) => t.count));
  return (
    <Stage>
      <Eyebrow>Your themes</Eyebrow>
      <p className={lead}>
        <Words text="A bit of everything, but mostly" />
      </p>
      <Slam delay={1.1}>
        <p className={`${headline} text-gradient`}>{themes[0].label}</p>
      </Slam>
      <ul className="mt-6 space-y-4">
        {themes.map((t, i) => (
          <li key={t.id}>
            <FadeUp delay={1.8 + i * 0.25} y={10} className="flex justify-between text-sm sm:text-base">
              <span className="font-semibold">{t.label}</span>
              <span className="font-mono text-white/60">
                {t.count} {t.count === 1 ? "launch" : "launches"} · {formatEth(t.feesEth)}
              </span>
            </FadeUp>
            <div className="mt-1.5 h-2 rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: i === 0 ? "var(--accent)" : "rgba(255,255,255,0.55)" }}
                initial={{ width: reduce ? `${(t.count / most) * 100}%` : 0 }}
                animate={{ width: `${(t.count / most) * 100}%` }}
                transition={{ duration: 1, ease: EASE, delay: 2 + i * 0.25 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

function RhythmScene({ p }: { p: WrappedProfile }) {
  const reduce = useReducedMotion();
  const r = claimRhythm(p.claims.days);
  const max = Math.max(...r.weeks.flat().map((c) => c?.eth ?? 0), 0.0001);
  const streak = p.claims.longestStreakDays;
  // Over half a year the calendar stacks as two halves, and cells size to
  // the widest block; the reveal takes ~1.6s however many cells there are.
  const blocks = calendarBlocks(r.weeks);
  const cols = Math.max(...blocks.map((b) => b.length), 1);
  const cellSize = cols > 14 ? `min(calc((100vw - 4rem) / ${cols} - 3px), 18px)` : "clamp(14px,4.4vw,26px)";
  const step = 1.6 / Math.max(r.weeks.length * 7, 1);
  let n = 0;
  return (
    <Stage>
      <Eyebrow>When you claim</Eyebrow>
      <p className={lead}>
        <Words text={`${r.claimDays} claim days in ${p.claims.windowDays === 365 ? "the last year" : "the last 90"}.`} />
      </p>
      <div className="my-4 flex flex-col items-center gap-3" aria-hidden>
        {blocks.map((weeks, b) => (
        <div key={b} className="flex justify-center gap-[3px]">
        {weeks.map((week, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {week.map((c, d) => {
              const i = n++;
              return (
                <motion.span
                  key={d}
                  className="rounded-[3px]"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: !c ? "transparent" : c.eth > 0 ? "var(--accent)" : "rgba(255,255,255,0.08)",
                  }}
                  initial={{ opacity: 0, scale: reduce ? 1 : 0.2 }}
                  animate={{ opacity: c && c.eth > 0 ? 0.4 + 0.6 * (c.eth / max) : 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.8 + i * step, ease: EASE }}
                />
              );
            })}
          </div>
        ))}
        </div>
        ))}
      </div>
      <Slam delay={2.8}>
        <p className={headline}>
          {weekdayPlural(r.busiestWeekday!)} are <span className="text-gradient">payday.</span>
        </p>
      </Slam>
      {streak > 1 && (
        <FadeUp delay={3.6}>
          <p className={lead}>
            Best run:{" "}
            <CountUp value={streak} format={(v) => String(Math.round(v))} delay={3.6} duration={900} className="text-accent" /> days in a row.
          </p>
        </FadeUp>
      )}
    </Stage>
  );
}

const VOLUME_QUIPS = ["Counting every swap…", "Pricing your BNKR pairs…", "Asking Clanker nicely…", "Replaying the charts…", "Adding up the degens…"];

function VolumeScene({ p }: { p: WrappedProfile }) {
  const v = p.tradingVolume;
  const [q, setQ] = useState(0);
  useEffect(() => {
    if (v.status !== "pending") return;
    const t = setInterval(() => setQ((n) => (n + 1) % VOLUME_QUIPS.length), 1400);
    return () => clearInterval(t);
  }, [v.status]);
  // Anything but a real number (pending, or it resolved to nothing while the
  // story was already playing) shows the counting slide, never a $0.
  if (v.status !== "ok" || v.totalVolumeUsd <= 0) {
    return (
      <Stage>
        <Eyebrow>Your impact</Eyebrow>
        <p className={headline}>
          <Words text="Still counting your volume." />
        </p>
        <p className="font-mono text-lg text-accent" aria-live="polite">
          {VOLUME_QUIPS[q]}
        </p>
        <FadeUp delay={1.2}>
          <p className="text-white/70">It'll be on your card at the end when it's ready.</p>
        </FadeUp>
      </Stage>
    );
  }
  return (
    <Stage>
      <Eyebrow>Your impact</Eyebrow>
      <p className={lead}>
        <Words text={`Your ${p.tokensLaunched} launches moved${v.isComplete ? "" : " at least"}`} />
      </p>
      <p className={`${big} text-gradient`}>
        <CountUp value={v.totalVolumeUsd} format={formatUsd} delay={0.7} duration={2200} />
      </p>
      <p className={lead}>
        <Words text="in trading volume." delay={1.4} />
      </p>
    </Stage>
  );
}

function VerdictScene({ p, boards }: { p: WrappedProfile; boards: BoardResult[] | null }) {
  const reduce = useReducedMotion();
  const a = getArchetype(p, boards);
  return (
    <Stage>
      <Eyebrow>Bankr's verdict</Eyebrow>
      <p className={lead}>
        <Words text="After watching your wallet all year, you are" />
      </p>
      <h2 className={`${headline} text-gradient`} aria-label={a.title}>
        {a.title.split("").map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 1.6 + i * 0.05 }}
          >
            {ch}
          </motion.span>
        ))}
      </h2>
      <FadeUp delay={2.4 + a.title.length * 0.05}>
        <p className="max-w-xl border-l-2 border-accent/70 pl-4 text-xl italic text-white/80">“{a.description}”</p>
      </FadeUp>
      <FadeUp delay={3.2 + a.title.length * 0.05}>
        <p className="font-mono text-sm text-white/55">Signed, Bankr</p>
      </FadeUp>
    </Stage>
  );
}

function RanksScene({ boards }: { boards: BoardResult[] }) {
  const reduce = useReducedMotion();
  return (
    <Stage>
      <Eyebrow>Where you stand</Eyebrow>
      <p className={lead}>
        <Words text="Out of everyone who's checked their Wrapped" />
      </p>
      <ul className="mt-4 space-y-3">
        {topPlacings(boards).map((b, i) => (
          <motion.li
            key={b.id}
            className="flex items-center justify-between gap-4 rounded-2xl border border-white/12 bg-white/[0.06] px-5 py-4"
            initial={{ opacity: 0, x: reduce ? 0 : 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 1.2 + i * 0.35 }}
          >
            <span className="font-display text-lg font-bold sm:text-2xl">{BOARDS.find((d) => d.id === b.id)!.title}</span>
            <span className="font-display text-3xl font-extrabold sm:text-5xl">
              #
              <CountUp
                value={b.total - b.personal!.rank}
                format={(v) => String(b.total - Math.round(v))}
                delay={1.4 + i * 0.35}
                duration={1100}
              />
              <span className="text-base text-white/50">/{b.total}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </Stage>
  );
}

function OutroScene({ cards }: { cards: number }) {
  const reduce = useReducedMotion();
  return (
    <Stage>
      <div className="relative mx-auto mb-14 h-44 w-36" aria-hidden>
        {Array.from({ length: Math.min(cards, 7) }, (_, i) => {
          const spread = i - (Math.min(cards, 7) - 1) / 2;
          return (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-2xl border border-white/20"
              style={{ background: `linear-gradient(160deg, ${[COLORS.violet, COLORS.ember, COLORS.magenta, COLORS.gold, COLORS.indigo][i % 5]}, #0d0b12 75%)` }}
              initial={{ rotate: 0, x: 0, opacity: 0, y: 40 }}
              animate={reduce ? { opacity: 1, y: 0 } : { rotate: spread * 9, x: spread * 26, opacity: 1, y: Math.abs(spread) * 6 }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.08 }}
            />
          );
        })}
      </div>
      <h2 className={`${headline} text-center`}>
        <Words text="That's a wrap." delay={0.8} />
      </h2>
      <FadeUp delay={1.6}>
        <p className={`${lead} text-center`}>
          Your <span className="text-accent">{cards} cards</span> are ready to share.
        </p>
      </FadeUp>
    </Stage>
  );
}

const P = {
  intro: [COLORS.violet, COLORS.ember, COLORS.indigo],
  launches: [COLORS.indigo, COLORS.violet, COLORS.magenta],
  first: [COLORS.indigo, COLORS.gold, COLORS.violet],
  earnings: [COLORS.ember, COLORS.gold, COLORS.violet],
  bestDay: [COLORS.magenta, COLORS.indigo, COLORS.ember],
  top: [COLORS.gold, COLORS.ember, COLORS.magenta],
  themes: [COLORS.violet, COLORS.magenta, COLORS.indigo],
  rhythm: [COLORS.ember, COLORS.violet, COLORS.gold],
  volume: [COLORS.gold, COLORS.violet, COLORS.ember],
  verdict: [COLORS.magenta, COLORS.violet, COLORS.ember],
  ranks: [COLORS.indigo, COLORS.ember, COLORS.violet],
  outro: [COLORS.violet, COLORS.ember, COLORS.magenta],
} satisfies Record<string, Palette>;

const has = (id: string, ctx: CardContext) => CARDS.find((c) => c.id === id)!.available(ctx);

export function buildScenes(ctx: CardContext): Scene[] {
  const p = ctx.profile;
  // Lengths are whole bars of the soundtrack so the cuts land on the beat.
  const bars = (n: number) => n * BAR_MS;
  const scenes: Array<Scene | false> = [
    { id: "intro", duration: bars(3), palette: P.intro, cut: "flash", energy: 1, render: (c) => <IntroScene p={c.profile} /> },
    has("builder-type", ctx) && { id: "launches", duration: bars(4), palette: P.launches, cut: "zoom", energy: 2, render: (c) => <LaunchesScene p={c.profile} /> },
    has("first-launch", ctx) && { id: "first", duration: bars(3), palette: P.first, cut: "wipe", energy: 2, render: (c) => <FirstLaunchScene p={c.profile} /> },
    has("earnings", ctx) && { id: "earnings", duration: bars(4), palette: P.earnings, cut: "flash", energy: 3, render: (c) => <EarningsScene p={c.profile} /> },
    has("best-day", ctx) && { id: "best-day", duration: bars(3), palette: P.bestDay, cut: "whip", energy: 3, render: (c) => <BestDayScene p={c.profile} /> },
    has("top-token", ctx) && { id: "top-token", duration: bars(4), palette: P.top, cut: "iris", energy: 3, render: (c) => <TopTokenScene p={c.profile} /> },
    has("themes", ctx) && { id: "themes", duration: bars(3), palette: P.themes, cut: "wipe", energy: 2, render: (c) => <ThemesScene p={c.profile} /> },
    has("rhythm", ctx) && { id: "rhythm", duration: bars(4), palette: P.rhythm, cut: "zoom", energy: 3, render: (c) => <RhythmScene p={c.profile} /> },
    // Pending volume gets the "still counting" scene; it may land mid-story.
    (has("volume", ctx) || (p.tokensLaunched > 0 && p.tradingVolume.status === "pending")) && { id: "volume", duration: bars(3), palette: P.volume, cut: "whip", energy: 2, render: (c) => <VolumeScene p={c.profile} /> },
    has("verdict", ctx) && { id: "verdict", duration: bars(4), palette: P.verdict, cut: "flash", energy: 4, render: (c) => <VerdictScene p={c.profile} boards={c.boards} /> },
    has("rankings", ctx) && { id: "ranks", duration: bars(3), palette: P.ranks, cut: "iris", energy: 3, render: (c) => <RanksScene boards={c.boards ?? []} /> },
    { id: "outro", duration: bars(3), palette: P.outro, cut: "fade", energy: 1, render: (c) => <OutroScene cards={CARDS.filter((d) => d.available(c)).length} /> },
  ];
  return scenes.filter((s): s is Scene => s !== false);
}
