import { useCallback, useEffect, useRef, useState } from "react";
import { ScrambleReveal } from "@/components/wrapped/ScrambleReveal";

// Total runtime ~13s. Each phase starts at its own offset; nothing before
// its offset is mounted, so animations replay correctly if this scene is
// ever revisited rather than relying on animation-delay tricks alone.
const PHASE_TIMINGS_MS = {
  logo: 0,
  volume: 1500,
  chains: 4700,
  paidOut: 6700,
  cta: 9700,
};
const TOTAL_DURATION_MS = 13000;

const CHAINS: Array<{ key: "base" | "robinhood"; label: string; logo: string }> = [
  { key: "base", label: "Base", logo: "/base-logo.png" },
  { key: "robinhood", label: "Robinhood", logo: "/robinhood-logo.png" },
];

const VOLUME_TEXT = "$5.01B+";
const PAID_OUT_TEXT = "$20.19M+";

export function SceneMilestones({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<keyof typeof PHASE_TIMINGS_MS>("logo");
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(elapsed / TOTAL_DURATION_MS, 1);
      setProgress(p);

      if (elapsed >= PHASE_TIMINGS_MS.cta) setPhase("cta");
      else if (elapsed >= PHASE_TIMINGS_MS.paidOut) setPhase("paidOut");
      else if (elapsed >= PHASE_TIMINGS_MS.chains) setPhase("chains");
      else if (elapsed >= PHASE_TIMINGS_MS.volume) setPhase("volume");

      if (p >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  const showVolume = phase !== "logo";
  const showChains = phase === "chains" || phase === "paidOut" || phase === "cta";
  const showPaidOut = phase === "paidOut" || phase === "cta";
  const showCta = phase === "cta";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/35 via-background to-accent/15" />
      <div className="pointer-events-none absolute -left-24 top-1/4 size-[28rem] animate-drift rounded-full bg-primary/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

      {/* Quiet, persistent brand mark, top-left */}
      <div className="glass animate-scene-in absolute left-5 top-5 z-20 flex size-9 items-center justify-center overflow-hidden rounded-full">
        <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 pt-5">
        <div className="h-1 overflow-hidden rounded-full bg-foreground/15">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center space-y-10 py-8 text-center">
          <p className="animate-scene-in font-display text-sm font-bold uppercase tracking-[0.35em] text-muted-foreground">
            Bankr <span className="text-gradient">Wrapped</span> 2026
          </p>

          {showVolume && (
            <div key="volume" className="relative space-y-3">
              <div className="mx-auto h-px w-10 bg-foreground/25" />
              <p className="animate-rise text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Trading Volume Across All Chains
              </p>
              <div className="relative">
                {/* Ghost duplicate - oversized, blurred, drifting behind the real number for depth */}
                <p
                  aria-hidden
                  className="animate-drift pointer-events-none absolute inset-0 select-none font-display text-7xl font-extrabold text-primary/15 blur-2xl sm:text-8xl"
                >
                  {VOLUME_TEXT}
                </p>
                <p className="relative font-display text-4xl font-extrabold sm:text-5xl">
                  <span className="text-gradient">
                    <ScrambleReveal text={VOLUME_TEXT} delay={150} />
                  </span>
                </p>
              </div>
            </div>
          )}

          {showChains && (
            <ul key="chains" className="flex items-center gap-4">
              {CHAINS.map((c, i) => (
                <li
                  key={c.key}
                  className="glass animate-slide-out flex items-center gap-2 rounded-full px-4 py-2"
                  style={{ animationDelay: `${i * 220}ms` }}
                >
                  <img src={c.logo} alt="" className="size-5 shrink-0 rounded-full" aria-hidden />
                  <span className="text-sm font-medium">{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          {showPaidOut && (
            <div key="paidOut" className="relative space-y-3">
              <div className="mx-auto h-px w-10 bg-foreground/25" />
              <p className="animate-rise text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Paid Out to Builders &amp; Creators
              </p>
              <div className="relative">
                <p
                  aria-hidden
                  className="animate-drift pointer-events-none absolute inset-0 select-none font-display text-6xl font-extrabold text-accent/15 blur-2xl sm:text-7xl"
                >
                  {PAID_OUT_TEXT}
                </p>
                <p className="relative font-display text-3xl font-extrabold text-accent sm:text-4xl">
                  <ScrambleReveal text={PAID_OUT_TEXT} delay={150} />
                </p>
              </div>
            </div>
          )}

          {showCta && (
            <button
              key="cta"
              type="button"
              onClick={finish}
              className="glass animate-rise rounded-full px-6 py-3 text-sm font-semibold transition-colors hover:text-accent"
            >
              Check How You Contributed
            </button>
          )}
        </div>
      </div>

      {/* Tap anywhere to skip, Stories-style */}
      <button
        type="button"
        aria-label="Skip intro"
        onClick={finish}
        className="absolute inset-0 z-0"
        tabIndex={-1}
      />
    </div>
  );
}
