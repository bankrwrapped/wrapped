import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";

import bannerAsset from "@/assets/bankr-banner.jpg.asset.json";
import { Counter } from "@/components/wrapped/Counter";
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
      <img
        src={p.avatar}
        alt={p.displayName + " avatar"}
        className="glow-purple size-28 animate-scene-in rounded-full border border-glass-border bg-surface object-cover"
      />
      <div className="space-y-3">
        <h1 className="animate-rise font-display text-4xl font-extrabold sm:text-5xl">
          {p.displayName}
        </h1>
        <p className="animate-rise text-base text-muted-foreground" style={{ animationDelay: "120ms" }}>
          @{p.handle} · {p.platform === "x" ? "X" : "Farcaster"}
        </p>
        <p
          className="animate-rise font-mono text-sm text-muted-foreground"
          style={{ animationDelay: "200ms" }}
        >
          {p.wallet.slice(0, 6)}&hellip;{p.wallet.slice(-4)}
        </p>
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
    <div className="space-y-6 text-center">
      <Kicker>Bankr Wrapped</Kicker>
      <h2
        className="animate-scene-in font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl"
        style={{ animationDelay: "150ms" }}
      >
        Here's how you built {chainPhrase}{" "}
        <span className="text-gradient">this year.</span>
      </h2>
    </div>
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
          <p className="animate-scene-in font-display text-2xl font-semibold text-muted-foreground">
            —
          </p>
        ) : (
          <p className="animate-scene-in font-display text-7xl font-extrabold sm:text-8xl">
            <Counter value={p.tokensLaunched} prefix="" delay={200} />
          </p>
        )}
      </div>
      {unavailable ? <DataUnavailable /> : <TopTokensList tokens={withFees} />}
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
          <p className="animate-scene-in font-display text-2xl font-semibold text-muted-foreground">
            —
          </p>
        ) : (
          <p className="animate-scene-in font-display text-7xl font-extrabold sm:text-8xl">
            <Counter value={p.pleaseBro.length} prefix="" delay={200} />
          </p>
        )}
        <h2 className="animate-rise font-display text-2xl font-extrabold text-accent sm:text-3xl" style={{ animationDelay: "250ms" }}>
          Please Bro Tokens
        </h2>
      </div>
      {unavailable ? <DataUnavailable /> : <TopTokensList tokens={withFees} />}
    </div>
  );
}

export function SceneEarnings({ p }: { p: WrappedProfile }) {
  const totalEth = p.creatorEarningsEth + p.pleaseBroEarningsEth;
  return (
    <div className="w-full space-y-8 text-center">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass animate-rise rounded-3xl p-5" style={{ animationDelay: "100ms" }}>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Creator earnings
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            <Counter value={p.creatorEarningsEth} delay={300} prefix="" format={formatEth} />
          </p>
        </div>
        <div className="glass animate-rise rounded-3xl p-5" style={{ animationDelay: "220ms" }}>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Please Bro earnings
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            <Counter value={p.pleaseBroEarningsEth} delay={500} prefix="" format={formatEth} />
          </p>
        </div>
      </div>
      <div className="animate-scene-in" style={{ animationDelay: "600ms" }}>
        <Kicker>Total lifetime earnings</Kicker>
        <p className="glow-orange mt-3 rounded-3xl py-2 font-display text-6xl font-extrabold text-gradient sm:text-8xl">
          <Counter value={totalEth} delay={900} prefix="" format={formatEth} />
        </p>
      </div>
      {p.bestDay ? (
        <div
          className="glass animate-rise mx-auto max-w-xs rounded-2xl p-4"
          style={{ animationDelay: "1100ms" }}
        >
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
        </div>
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
  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <Kicker>Your creator earning journey</Kicker>
        <h2 className="animate-scene-in font-display text-3xl font-extrabold sm:text-4xl">
          Built up over time
        </h2>
      </div>
      {activeDays.length === 0 && p.pleaseBro.length > 0 ? (
        <p className="animate-rise glass rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
          Your Please Bro earnings don't have day-by-day history available yet
          &mdash; check the earnings screen for your full total.
        </p>
      ) : activeDays.length > 0 ? (
        <div className="glass animate-rise flex h-40 items-end gap-[2px] overflow-hidden rounded-2xl p-3" style={{ animationDelay: "150ms" }}>
          {allDays.map((d) => (
            <div key={d.date} title={d.date + ": " + formatEth(d.eth)}
              className={
                d.eth > 0
                  ? "flex-1 rounded-t bg-gradient-to-t from-primary to-accent"
                  : "flex-1 rounded-t bg-foreground/10"
              }
              style={{ height: Math.max(4, (d.eth / max) * 100) + "%" }}
            />
          ))}
        </div>
      ) : (
        <p className="animate-rise glass rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
          Not enough history yet to chart a trend.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass animate-rise rounded-2xl p-4 text-center" style={{ animationDelay: "300ms" }}>
          <p className="font-display text-2xl font-extrabold text-accent">{p.claimCount}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Times claimed</p>
        </div>
        <div className="glass animate-rise rounded-2xl p-4 text-center" style={{ animationDelay: "380ms" }}>
          <p className="font-display text-2xl font-extrabold text-accent">{p.longestStreakDays}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Day streak</p>
        </div>
      </div>
    </div>
  );
}

export function SceneUnclaimed({ p }: { p: WrappedProfile }) {
  const [copied, setCopied] = useState(false);
  const command = "claim all my rewards";

  return (
    <div className="w-full space-y-7 text-center">
      <div>
        <Kicker>Unclaimed value</Kicker>
        <p className="mt-2 font-display text-6xl font-extrabold text-accent sm:text-7xl">
          <Counter value={p.unclaimedEth} delay={250} prefix="" format={formatEth} />
        </p>
      </div>
      <div className="animate-rise space-y-4" style={{ animationDelay: "400ms" }}>
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
          className="glass mx-auto flex items-center gap-3 rounded-2xl px-4 py-3 font-mono text-sm transition-colors hover:border-accent/40"
        >
          {command}
          {copied ? (
            <Check className="size-4 text-accent" />
          ) : (
            <Copy className="size-4 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}

export function SceneSummary({ p, onRestart }: { p: WrappedProfile; onRestart: () => void }) {
  const totalEth = p.creatorEarningsEth + p.pleaseBroEarningsEth;
  const archetype = getArchetype(p);
  const shareText =
    `I'm "${archetype.title}" on Bankr Wrapped: ` +
    formatEth(totalEth) +
    " earned across " +
    p.tokensLaunched +
    " tokens launched. 🟠🟣";

  return (
    <div className="w-full space-y-6">
      <div className="glass overflow-hidden rounded-3xl animate-scene-in">
        <img src={bannerAsset.url} alt="" className="h-24 w-full object-cover opacity-80" />
        <div className="space-y-5 p-6 text-center">
          <img
            src={p.avatar}
            alt=""
            className="mx-auto -mt-14 size-20 rounded-full border border-glass-border bg-surface"
          />
          <div className="space-y-1">
            <h3 className="font-display text-2xl font-extrabold">{p.displayName}</h3>
            <p className="animate-rise font-display text-lg font-bold text-accent" style={{ animationDelay: "140ms" }}>
              {archetype.title}
            </p>
            <p className="animate-rise text-sm text-muted-foreground" style={{ animationDelay: "180ms" }}>
              {archetype.description}
            </p>
            {p.pleaseBro.length > 0 ? (
              <p
                className="animate-rise glass mx-auto mt-1 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent"
                style={{ animationDelay: "220ms" }}
              >
                Most Vouched-For &middot; {p.pleaseBro.length} Please Bro token{p.pleaseBro.length === 1 ? "" : "s"}
              </p>
            ) : null}
            {p.totalUsers > 1 ? (
              <p className="animate-rise text-xs font-semibold uppercase tracking-widest text-muted-foreground" style={{ animationDelay: "260ms" }}>
                Top {p.percentile}% of Bankr earners
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              ["Total earned", formatEth(totalEth)],
              ["Launched", String(p.tokensLaunched)],
              ["Please Bro", String(p.pleaseBro.length)],
            ].map(([label, value], i) => (
              <div key={label} className="animate-rise" style={{ animationDelay: (200 + i * 120) + "ms" }}>
                <p className="font-display text-xl font-extrabold text-accent">{value}</p>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="hero" size="xl" className="flex-1" asChild>
          <a href={"https://x.com/intent/tweet?text=" + encodeURIComponent(shareText)}
            target="_blank"
            rel="noreferrer"
          >
            <Share2 className="size-4" /> Share on X
          </a>
        </Button>
        <Button variant="glass" size="xl" className="flex-1" asChild>
          <a href={"https://warpcast.com/~/compose?text=" + encodeURIComponent(shareText)}
            target="_blank"
            rel="noreferrer"
          >
            Share on Farcaster
          </a>
        </Button>
      </div>
      <button
        type="button"
        onClick={onRestart}
        className="mx-auto block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Wrap another builder
      </button>
      <p className="text-center text-[11px] text-muted-foreground/70">
        Data sourced directly from Bankr's public API, shown in raw ETH. Some
        figures may lag or differ slightly from Bankr's own dashboard due to
        how fee data is reported for certain tokens.
      </p>
    </div>
  );
}
