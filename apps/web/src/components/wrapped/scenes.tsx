import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";

import bannerAsset from "@/assets/bankr-banner.jpg.asset.json";
import { Counter } from "@/components/wrapped/Counter";
import { TopTokensList } from "@/components/wrapped/TopTokensList";
import { Button } from "@/components/ui/button";
import { formatUsd, formatUsdFull, type WrappedProfile } from "@/lib/wrapped-data";

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
          {p.wallet}
        </p>
      </div>
    </div>
  );
}

export function SceneContribution() {
  return (
    <div className="space-y-6 text-center">
      <Kicker>Bankr Wrapped</Kicker>
      <h2
        className="animate-scene-in font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl"
        style={{ animationDelay: "150ms" }}
      >
        Here's how you contributed to the{" "}
        <span className="text-gradient">world's best launchpad.</span>
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
  const withVolume = p.launched.filter((t) => t.volume > 0);
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
      {unavailable ? <DataUnavailable /> : <TopTokensList tokens={withVolume} />}
    </div>
  );
}

export function ScenePleaseBro({ p }: { p: WrappedProfile }) {
  const withVolume = p.pleaseBro.filter((t) => t.volume > 0);
  const unavailable = p.beneficiaryFeesStatus === "unavailable";
  return (
    <div className="w-full space-y-6">
      <div className="text-center">
        <Kicker>Redirected fees</Kicker>
        <h2 className="animate-scene-in font-display text-4xl font-extrabold text-accent sm:text-5xl">
          Please Bro Tokens
        </h2>
      </div>
      {unavailable ? <DataUnavailable /> : <TopTokensList tokens={withVolume} />}
    </div>
  );
}

export function SceneEarnings({ p }: { p: WrappedProfile }) {
  const total = p.creatorEarnings + p.pleaseBroEarnings;
  return (
    <div className="w-full space-y-8 text-center">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass animate-rise rounded-3xl p-5" style={{ animationDelay: "100ms" }}>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Creator earnings
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            <Counter value={p.creatorEarnings} delay={300} />
          </p>
        </div>
        <div className="glass animate-rise rounded-3xl p-5" style={{ animationDelay: "220ms" }}>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Please Bro earnings
          </p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            <Counter value={p.pleaseBroEarnings} delay={500} />
          </p>
        </div>
      </div>
      <div className="animate-scene-in" style={{ animationDelay: "600ms" }}>
        <Kicker>Total lifetime earnings</Kicker>
        <p className="glow-orange mt-3 rounded-3xl py-2 font-display text-6xl font-extrabold text-gradient sm:text-8xl">
          <Counter value={total} delay={900} />
        </p>
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
          <Counter value={p.unclaimed} delay={250} />
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
  const total = p.creatorEarnings + p.pleaseBroEarnings;
  const shareText =
    "My Bankr Wrapped: " +
    formatUsdFull(total) +
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
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              ["Total earned", formatUsd(total)],
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
          <a
            href={"https://x.com/intent/tweet?text=" + encodeURIComponent(shareText)}
            target="_blank"
            rel="noreferrer"
          >
            <Share2 className="size-4" /> Share on X
          </a>
        </Button>
        <Button variant="glass" size="xl" className="flex-1" asChild>
          <a
            href={"https://warpcast.com/~/compose?text=" + encodeURIComponent(shareText)}
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
    </div>
  );
}