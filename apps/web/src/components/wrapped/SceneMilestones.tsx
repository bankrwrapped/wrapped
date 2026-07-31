import { useCallback, useEffect, useRef, useState } from "react";
import { Counter } from "@/components/wrapped/Counter";

// Total runtime ~13s. Each phase starts at its own offset; nothing before
// its offset is mounted, so animations replay correctly if this scene is
// ever revisited rather than relying on animation-delay tricks alone.
const PHASE_TIMINGS_MS = {
  logo: 0,
  volume: 1500,
  chains: 4500,
  paidOut: 6500,
  cta: 9500,
};
const TOTAL_DURATION_MS = 13000;

const CHAINS: Array<{ key: "base" | "robinhood"; label: string; logo: string }> = [
  { key: "base", label: "Base", logo: "/base-logo.png" },
  { key: "robinhood", label: "Robinhood", logo: "/robinhood-logo.png" },
];

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
            <div key="volume" className="animate-scene-in space-y-3">
              <div className="mx-auto h-px w-10 bg-foreground/25" />
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Trading Volume Across All Chains
              </p>
              <p className="animate-rise font-display text-4xl font-extrabold sm:text-5xl" style={{ animationDelay: "80ms" }}>
                <span className="text-gradient">
                  <Counter value={5.01} format={(v) => `$${v.toFixed(2)}B+`} duration={2500} />
                </span>
              </p>
            </div>
          )}

          {showChains && (
            <ul key="chains" className="flex items-center gap-4">
              {CHAINS.map((c, i) => (
                <li
                  key={c.key}
                  className="glass flex animate-rise items-center gap-2 rounded-full px-4 py-2"
                  style={{ animationDelay: `${i * 250}ms` }}
                >
                  <img src={c.logo} alt="" className="size-5 shrink-0 rounded-full" aria-hidden />
                  <span className="text-sm font-medium">{c.label}</span>
                </li>
              ))}
            </ul>
          )}

          {showPaidOut && (
            <div key="paidOut" className="animate-scene-in space-y-3">
              <div className="mx-auto h-px w-10 bg-foreground/25" />
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Paid Out to Builders &amp; Creators
              </p>
              <p className="animate-rise font-display text-3xl font-extrabold text-accent sm:text-4xl" style={{ animationDelay: "80ms" }}>
                <Counter value={20.19} format={(v) => `$${v.toFixed(2)}M+`} duration={2200} />
              </p>
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
