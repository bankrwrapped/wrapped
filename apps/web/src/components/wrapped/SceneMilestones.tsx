import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScrambleReveal } from "@/components/wrapped/ScrambleReveal";

// Each phase is now its OWN full screen that displaces the last, rather
// than accumulating into a stack - closer to a chapter-by-chapter reveal.
const PHASE_TIMINGS_MS = {
  ready: 0,
  volume: 2200,
  paidOut: 5600,
  cta: 9000,
};
const TOTAL_DURATION_MS = 13000;

const CHAINS: Array<{ key: "base" | "robinhood"; label: string; logo: string }> = [
  { key: "base", label: "Base", logo: "/base-logo.png" },
  { key: "robinhood", label: "Robinhood", logo: "/robinhood-logo.png" },
];

const VOLUME_TEXT = "$5.01B+";
const PAID_OUT_TEXT = "$20.19M+";

// Full-chapter transition: each beat racks into focus from a soft blur
// (like a camera pulling focus) and exits the same way in reverse -
// replaces the old accumulating-stack layout with distinct full screens.
const chapterMotion = {
  initial: { opacity: 0, scale: 0.94, filter: "blur(14px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 1.05, filter: "blur(10px)" },
  transition: { type: "spring" as const, stiffness: 120, damping: 18 },
};

function GlassStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-3xl px-8 py-7 backdrop-blur-xl">
      <div className="animate-sweep pointer-events-none absolute inset-0" />
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
      <div className="mt-2 font-display leading-none">{children}</div>
    </div>
  );
}

export function SceneMilestones({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<keyof typeof PHASE_TIMINGS_MS>("ready");
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
      if (elapsed >= PHASE_TIMINGS_MS.cta) setPhase("cta");
      else if (elapsed >= PHASE_TIMINGS_MS.paidOut) setPhase("paidOut");
      else if (elapsed >= PHASE_TIMINGS_MS.volume) setPhase("volume");
      else setPhase("ready");

      if (elapsed >= TOTAL_DURATION_MS) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <img
        src="/liquid-glass-bg.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/55 to-background/85" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-accent/20" />

      <motion.div
        {...chapterMotion}
        className="absolute left-5 top-5 z-20 flex items-center gap-2.5"
      >
        <div className="glass flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
        </div>
        <span className="font-display text-sm font-bold tracking-tight">
          Bankr <span className="text-gradient">Wrapped</span>
        </span>
      </motion.div>

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 pb-8 pt-24 text-center">
        <AnimatePresence mode="wait">
          {phase === "ready" && (
            <motion.div key="ready" {...chapterMotion} className="space-y-4">
              <div className="mx-auto size-2 animate-glow-pulse rounded-full bg-accent" />
              <p className="font-display text-2xl font-semibold text-muted-foreground sm:text-3xl">
                Let's rewind your year on{" "}
                <span className="text-gradient font-extrabold">Bankr</span>
                &hellip;
              </p>
            </motion.div>
          )}

          {phase === "volume" && (
            <motion.div key="volume" {...chapterMotion} className="space-y-8">
              <GlassStat label="Trading Volume Across All Chains">
                <p className="text-5xl font-extrabold sm:text-6xl">
                  <span className="text-gradient">
                    <ScrambleReveal text={VOLUME_TEXT} delay={200} />
                  </span>
                </p>
              </GlassStat>
              <ul className="flex items-center justify-center gap-4">
                {CHAINS.map((c, i) => (
                  <motion.li
                    key={c.key}
                    initial={{ opacity: 0, x: -20, scale: 0.85 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 160, damping: 15, delay: 0.6 + i * 0.18 }}
                    className="glass flex items-center gap-2 rounded-full px-4 py-2"
                  >
                    <img src={c.logo} alt="" className="size-5 shrink-0 rounded-full" aria-hidden />
                    <span className="text-sm font-medium">{c.label}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}

          {phase === "paidOut" && (
            <motion.div key="paidOut" {...chapterMotion}>
              <GlassStat label="Paid Out to Builders & Creators">
                <p className="text-5xl font-extrabold text-accent sm:text-6xl">
                  <ScrambleReveal text={PAID_OUT_TEXT} delay={200} />
                </p>
              </GlassStat>
            </motion.div>
          )}

          {phase === "cta" && (
            <motion.div key="cta" {...chapterMotion} className="space-y-6">
              <p className="font-display text-xl font-semibold sm:text-2xl">
                Now let's see <span className="text-gradient">your</span> story.
              </p>
              <button
                type="button"
                onClick={finish}
                className="glass rounded-full px-6 py-3 text-sm font-semibold transition-colors hover:text-accent"
              >
                Check How You Contributed
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
