import { Check, Copy, Download, ExternalLink, RefreshCw, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { useRef, useState } from "react";

import { Counter } from "@/components/wrapped/Counter";
import { ScrambleReveal } from "@/components/wrapped/ScrambleReveal";
import { TopTokensList } from "@/components/wrapped/TopTokensList";
import { Button } from "@/components/ui/button";
import { getArchetype } from "@/lib/archetype";
import { formatEth, type WrappedProfile } from "@/lib/wrapped-data";

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="animate-rise text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
      {children}
    </p>
  );
}

export function SceneIdentity({ p }: { p: WrappedProfile }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Same pulsing glow-ring treatment as the loading screen's avatar -
          ties the "this is you" moment together across the whole flow. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 130, damping: 14 }}
        className="relative size-28"
      >
        <div className="absolute inset-0 animate-glow-pulse rounded-full bg-primary/40 blur-2xl" />
        <img
          src={p.avatar}
          alt={p.displayName + " avatar"}
          className="glass relative size-28 rounded-full border border-glass-border object-cover"
        />
      </motion.div>
      <div className="space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.12 }}
          className="font-display text-4xl font-extrabold sm:text-5xl"
        >
          {p.displayName}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.22 }}
          className="text-base text-muted-foreground"
        >
          @{p.handle} · {p.platform === "x" ? "X" : "Farcaster"}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.3 }}
          className="glass inline-block rounded-full px-3 py-1 font-mono text-sm text-muted-foreground"
        >
          {p.wallet.slice(0, 6)}&hellip;{p.wallet.slice(-4)}
        </motion.p>
      </div>
    </div>
  );
}

export function SceneContribution({ p }: { p: WrappedProfile }) {
  const chains = new Set([...p.launched, ...p.pleaseBro].map((t) => t.chain));
  const chainCount = chains.size;
  const chainPhrase =
    chainCount >= 2 ? "across Base and Robinhood Chain" : "on the Bankr launchpad";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 120, damping: 17 }}
      className="glass relative w-full space-y-6 overflow-hidden rounded-3xl p-8 text-center"
    >
      <div className="animate-sweep pointer-events-none absolute inset-0" />
      <Kicker>Bankr Wrapped</Kicker>
      <h2 className="font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
        Here's how you built {chainPhrase}{" "}
        <span className="text-gradient">this year.</span>
      </h2>
    </motion.div>
  );
}

function DataUnavailable() {
  return (
    <p className="animate-rise glass rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
      Couldn't load this right now — Bankr's data was unavailable. Try searching again in a
      moment.
    </p>
  );
}

export function SceneLaunched({ p }: { p: WrappedProfile }) {
  const withFees = p.launched.filter((t) => t.feesEarnedEth > 0);
  const unavailable = p.creatorFeesStatus === "unavailable";
  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <Kicker>Tokens launched</Kicker>
        {unavailable ? (
          <p className="font-display text-2xl font-semibold text-muted-foreground">—</p>
        ) : (
          <motion.p
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 110, damping: 13, delay: 0.15 }}
            className="font-display text-7xl font-extrabold sm:text-8xl"
          >
            <Counter value={p.tokensLaunched} prefix="" delay={200} />
          </motion.p>
        )}
      </div>
      {unavailable ? (
        <DataUnavailable />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.35 }}
          className="glass relative overflow-hidden rounded-3xl p-4"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          <TopTokensList tokens={withFees} />
        </motion.div>
      )}
    </div>
  );
}

export function ScenePleaseBro({ p }: { p: WrappedProfile }) {
  const withFees = p.pleaseBro.filter((t) => t.feesEarnedEth > 0);
  const unavailable = p.beneficiaryFeesStatus === "unavailable";
  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <Kicker>Redirected fees</Kicker>
        {unavailable ? (
          <p className="font-display text-2xl font-semibold text-muted-foreground">—</p>
        ) : (
          <motion.p
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 110, damping: 13, delay: 0.15 }}
            className="font-display text-7xl font-extrabold sm:text-8xl"
          >
            <Counter value={p.pleaseBro.length} prefix="" delay={200} />
          </motion.p>
        )}
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.3 }}
          className="font-display text-2xl font-extrabold text-accent sm:text-3xl"
        >
          Please Bro Tokens
        </motion.h2>
      </div>
      {unavailable ? (
        <DataUnavailable />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.4 }}
          className="glass relative overflow-hidden rounded-3xl p-4"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          <TopTokensList tokens={withFees} />
        </motion.div>
      )}
    </div>
  );
}

export function SceneEarnings({ p }: { p: WrappedProfile }) {
  const totalEth = p.creatorEarningsEth + p.pleaseBroEarningsEth;
  return (
    <div className="w-full space-y-8 text-center">
      <div className="grid gap-4 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.1 }}
          className="glass relative overflow-hidden rounded-3xl p-5"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Creator earnings
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            <Counter value={p.creatorEarningsEth} delay={300} prefix="" format={formatEth} />
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.22 }}
          className="glass relative overflow-hidden rounded-3xl p-5"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Please Bro earnings
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            <Counter value={p.pleaseBroEarningsEth} delay={500} prefix="" format={formatEth} />
          </p>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 100, damping: 14, delay: 0.4 }}
      >
        <Kicker>Total lifetime earnings</Kicker>
        <p className="glow-orange mt-3 rounded-3xl py-2 font-display text-6xl font-extrabold text-gradient sm:text-8xl">
          <Counter value={totalEth} delay={900} prefix="" format={formatEth} />
        </p>
      </motion.div>
      {p.bestDay ? (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.65 }}
          className="glass relative mx-auto max-w-xs overflow-hidden rounded-2xl p-4"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Best day
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-accent">
            <Counter value={p.bestDay.eth} delay={1200} prefix="" format={formatEth} />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(p.bestDay.date).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </motion.div>
      ) : null}
    </div>
  );
}

export function SceneTimeline({ p }: { p: WrappedProfile }) {
  const rawActiveDays = p.dailyEarnings.filter((d) => d.eth > 0);
  const allDays = rawActiveDays.length > 0 && rawActiveDays.length <= 3
    ? p.dailyEarnings.slice(-14)
    : p.dailyEarnings;
  const activeDays = allDays.filter((d) => d.eth > 0);
  const max = Math.max(1e-9, ...allDays.map((d) => d.eth));
  const peakEth = Math.max(0, ...allDays.map((d) => d.eth));
  return (
    <div className="w-full space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 130, damping: 16 }}
        className="text-center"
      >
        <Kicker>Your creator earning journey</Kicker>
        <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Built up over time</h2>
      </motion.div>
      {activeDays.length === 0 && p.pleaseBro.length > 0 ? (
        <p className="glass rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
          Your Please Bro earnings don't have day-by-day history available yet
          &mdash; check the earnings screen for your full total.
        </p>
      ) : activeDays.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 110, damping: 16, delay: 0.15 }}
          className="glass relative flex h-40 items-end gap-[2px] overflow-hidden rounded-2xl p-3"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          {allDays.map((d, i) => (
            <motion.div
              key={d.date}
              title={d.date + ": " + formatEth(d.eth)}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.3 + i * 0.006 }}
              style={{
                height: Math.max(4, (d.eth / max) * 100) + "%",
                transformOrigin: "bottom",
              }}
              className={
                d.eth > 0
                  ? d.eth === peakEth && peakEth > 0
                    ? "flex-1 animate-glow-pulse rounded-t bg-gradient-to-t from-accent to-accent-glow"
                    : "flex-1 rounded-t bg-gradient-to-t from-primary to-accent"
                  : "flex-1 rounded-t bg-foreground/10"
              }
            />
          ))}
        </motion.div>
      ) : (
        <p className="glass rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
          Not enough history yet to chart a trend.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.5 }}
          className="glass rounded-2xl p-4 text-center"
        >
          <p className="font-display text-2xl font-extrabold text-accent">{p.claimCount}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Times claimed</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.6 }}
          className="glass rounded-2xl p-4 text-center"
        >
          <p className="font-display text-2xl font-extrabold text-accent">{p.longestStreakDays}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Day streak</p>
        </motion.div>
      </div>
    </div>
  );
}

export function SceneUnclaimed({ p }: { p: WrappedProfile }) {
  const [copied, setCopied] = useState(false);
  const command = "claim all my rewards";

  return (
    <div className="w-full space-y-7 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 110, damping: 14 }}
      >
        <Kicker>Unclaimed value</Kicker>
        <p className="mt-2 font-display text-6xl font-extrabold text-accent sm:text-7xl">
          <Counter value={p.unclaimedEth} delay={250} prefix="" format={formatEth} />
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.3 }}
        className="space-y-4"
      >
        <Button variant="hero" size="xl" asChild>
          <a href="https://bankr.bot" target="_blank" rel="noreferrer">
            Go to Bankr.bot <ExternalLink className="size-4" />
          </a>
        </Button>
        <p className="text-sm text-muted-foreground">Tell the Bankr bot:</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="glass relative mx-auto flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 font-mono text-sm transition-colors hover:border-accent/40"
        >
          <div className="animate-sweep pointer-events-none absolute inset-0" />
          {command}
          {copied ? (
            <Check className="size-4 text-accent" />
          ) : (
            <Copy className="size-4 text-muted-foreground" />
          )}
        </button>
      </motion.div>
    </div>
  );
}

// Set once the domain is live - the "Check yours" CTA line only appears
// in the share text when this is non-empty, so adding it later is a
// one-line change with no other code to touch.
const SHARE_URL = "https://bankrwrapped.com";

async function captureCard(node: HTMLElement): Promise<Blob | null> {
  const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
  const res = await fetch(dataUrl);
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SceneSummary({ p, onRestart }: { p: WrappedProfile; onRestart: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState<"x" | "farcaster" | "download" | null>(null);
  const totalEth = p.creatorEarningsEth + p.pleaseBroEarningsEth;
  const archetype = getArchetype(p);
  const totalEthText = formatEth(totalEth);
  const showPercentile = p.totalUsers > 1;
  const showPleaseBro = p.pleaseBro.length > 0;

  // Dynamic per-archetype hook lines - each weaves @bankrbot into the
  // sentence naturally rather than a generic template stretched across
  // everyone. Bonus stat lines below skip whatever the hook already
  // covers, so the same fact never appears twice.
  const pleaseBroCount = p.pleaseBro.length;
  const pleaseBroWord = pleaseBroCount === 1 ? "token" : "tokens";

  type HookKey = "earned" | "launched" | "pleaseBro";
  let hookLine: string;
  let covered: Set<HookKey>;

  switch (archetype.title) {
    case "The Whale":
      hookLine = `\u{1F40B} Certified Whale on @bankrbot \u2014 ${totalEthText} earned. Not playing small.`;
      covered = new Set(["earned"]);
      break;
    case "Serial Launcher":
      hookLine = `\u{1F680} ${p.tokensLaunched} tokens deployed on @bankrbot. I don't stop building.`;
      covered = new Set(["launched"]);
      break;
    case "The Sleeper":
      hookLine = `\u{1F634} They call me "The Sleeper" on @bankrbot \u2014 ${totalEthText} earned, real money just sitting there unclaimed.`;
      covered = new Set(["earned"]);
      break;
    case "The Please Bro Farmer":
      hookLine = `\u{1F91D} ${pleaseBroCount} Please Bro ${pleaseBroWord} redirecting fees my way on @bankrbot. The community really said "take my fees" \u{1F62D}`;
      covered = new Set(["pleaseBro"]);
      break;
    case "The Claimer":
      hookLine = `\u{1F4B8} Every fee I earn on @bankrbot, I claim. ${totalEthText} total, zero left on the table.`;
      covered = new Set(["earned"]);
      break;
    case "One and Done":
      hookLine = `\u{1F3AF} One launch, ${totalEthText} earned on @bankrbot. Quality > quantity.`;
      covered = new Set(["earned", "launched"]);
      break;
    default:
      hookLine = `\u{1F331} Just getting started on @bankrbot \u2014 ${totalEthText} earned, ${p.tokensLaunched} tokens launched. Story's only beginning.`;
      covered = new Set(["earned", "launched"]);
  }

  const bonusLines: string[] = [];
  if (!covered.has("earned")) bonusLines.push(`\u26A1 ${totalEthText} earned`);
  if (!covered.has("launched")) bonusLines.push(`\u{1F680} ${p.tokensLaunched} tokens launched`);
  if (!covered.has("pleaseBro") && showPleaseBro) {
    bonusLines.push(`\u{1F91D} ${pleaseBroCount} Please Bro ${pleaseBroWord}`);
  }
  if (showPercentile) bonusLines.push(`\u{1F3C6} Top ${p.percentile}% of Bankr earners`);

  const shareLines = [hookLine, "", ...bonusLines];
  // Byline actually tags @bankrwrapped now (was plain text before) - this
  // is what makes the app's own account show up in quote-tweets/replies
  // so it can repost and ride the same thread, not just be named.
  shareLines.push("", `via @bankrwrapped`);
  if (SHARE_URL) {
    shareLines.push(`Check yours \u{1F449} ${SHARE_URL}`);
  }
  const shareText = shareLines.join("\n");

  // Farcaster's own @bankrwrapped account doesn't exist yet (per project
  // notes - handle pending), so the byline stays untagged plain text there
  // until that's provided, rather than tagging a handle that doesn't exist.
  const farcasterShareText = shareText
    .replace("@bankrbot", "@bankr")
    .replace("via @bankrwrapped", "via Bankr Wrapped");

  return (
    <div className="w-full space-y-6">
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 110, damping: 16 }}
        className="glass relative overflow-hidden rounded-3xl"
      >
        {/* Real hero banner, not a thin strip - the top of the card that
            actually establishes it as a designed artifact, not a screenshot
            of raw data. */}
        <div className="relative h-32 w-full overflow-hidden sm:h-40">
          <img src="/banner.jpg" alt="" crossOrigin="anonymous" className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
          <div className="glass absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5">
            <div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <img src="/logo.png" alt="" className="size-full object-cover" />
            </div>
            <span className="font-display text-xs font-bold tracking-tight">
              Bankr <span className="text-gradient">Wrapped</span>
            </span>
          </div>
        </div>

        <div className="space-y-5 p-6 text-center">
          <motion.img
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 130, damping: 14, delay: 0.15 }}
            src={p.avatar}
            alt=""
            crossOrigin="anonymous"
            className="glass mx-auto -mt-16 size-20 rounded-full object-cover"
          />

          <div className="space-y-2">
            <h3 className="font-display text-xl font-bold text-muted-foreground">
              {p.displayName}
            </h3>
            {/* Archetype IS the headline now, not secondary text - the
                personality hook is what makes someone else ask "wait,
                what am I?" and click through. */}
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.25 }}
              className="font-display text-3xl font-extrabold sm:text-4xl"
            >
              <span className="text-gradient">{archetype.title}</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-muted-foreground"
            >
              {archetype.description}
            </motion.p>
          </div>

          {/* Hero number - the same scramble + glow language used across
              the whole app, given the most visual weight on the card
              since it's the number people are actually showing off. */}
          <motion.p
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 14, delay: 0.5 }}
            className="glow-orange font-display text-5xl font-extrabold text-gradient sm:text-6xl"
          >
            <ScrambleReveal text={totalEthText} delay={550} />
          </motion.p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {showPleaseBro && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 15, delay: 0.75 }}
                className="glass rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-accent"
              >
                🤝 Most Vouched-For &middot; {p.pleaseBro.length} Please Bro
              </motion.span>
            )}
            {showPercentile && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 15, delay: 0.85 }}
                className="rounded-full bg-gradient-to-r from-primary to-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-background"
              >
                🏆 Top {p.percentile}%
              </motion.span>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.95 }}
            className="grid grid-cols-2 gap-3 pt-1"
          >
            <div className="glass rounded-2xl p-3">
              <p className="font-display text-xl font-extrabold text-accent">{p.tokensLaunched}</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Launched</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="font-display text-xl font-extrabold text-accent">{p.pleaseBro.length}</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Please Bro</p>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          variant="hero"
          size="xl"
          className="flex-1"
          disabled={capturing !== null}
          onClick={async () => {
            setCapturing("x");
            try {
              const blob = cardRef.current ? await captureCard(cardRef.current) : null;
              if (blob) {
                const file = new File([blob], "bankr-wrapped.png", { type: "image/png" });
                const canNativeShare =
                  typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
                if (canNativeShare) {
                  try {
                    await navigator.share({ files: [file], text: shareText });
                    return;
                  } catch {
                    // user cancelled the native sheet, or it failed - fall through
                  }
                }
                triggerDownload(blob, "bankr-wrapped.png");
              }
            } finally {
              setCapturing(null);
              window.open(
                "https://x.com/intent/tweet?text=" + encodeURIComponent(shareText),
                "_blank",
                "noreferrer",
              );
            }
          }}
        >
          <Share2 className="size-4" /> {capturing === "x" ? "Preparing…" : "Share on X"}
        </Button>
        <Button
          variant="glass"
          size="xl"
          className="flex-1"
          disabled={capturing !== null}
          onClick={async () => {
            setCapturing("farcaster");
            try {
              const blob = cardRef.current ? await captureCard(cardRef.current) : null;
              if (blob) {
                const file = new File([blob], "bankr-wrapped.png", { type: "image/png" });
                const canNativeShare =
                  typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
                if (canNativeShare) {
                  try {
                    await navigator.share({ files: [file], text: farcasterShareText });
                    return;
                  } catch {
                    // fall through
                  }
                }
                triggerDownload(blob, "bankr-wrapped.png");
              }
            } finally {
              setCapturing(null);
              window.open(
                "https://warpcast.com/~/compose?text=" + encodeURIComponent(farcasterShareText),
                "_blank",
                "noreferrer",
              );
            }
          }}
        >
          {capturing === "farcaster" ? "Preparing…" : "Share on Farcaster"}
        </Button>
      </div>
      <button
        type="button"
        disabled={capturing !== null}
        onClick={async () => {
          setCapturing("download");
          try {
            const blob = cardRef.current ? await captureCard(cardRef.current) : null;
            if (blob) triggerDownload(blob, "bankr-wrapped.png");
          } finally {
            setCapturing(null);
          }
        }}
        className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Download className="size-3.5" />
        {capturing === "download" ? "Saving…" : "Download card"}
      </button>
      <motion.button
        type="button"
        onClick={onRestart}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 130, damping: 16, delay: 1.1 }}
        className="glass mx-auto flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
      >
        <RefreshCw className="size-3.5" /> Wrap another builder
      </motion.button>
      <p className="text-center text-[11px] text-muted-foreground/70">
        Data sourced directly from Bankr's public API, shown in raw ETH. Some
        figures may lag or differ slightly from Bankr's own dashboard due to
        how fee data is reported for certain tokens.
      </p>
    </div>
  );
}
