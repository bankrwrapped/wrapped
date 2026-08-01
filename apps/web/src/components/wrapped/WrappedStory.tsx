import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import {
  SceneContribution,
  SceneEarnings,
  SceneIdentity,
  SceneLaunched,
  ScenePleaseBro,
  SceneSummary,
  SceneTimeline,
  SceneUnclaimed,
} from "@/components/wrapped/scenes";
import { SceneAboutOutro } from "@/components/wrapped/SceneAboutOutro";
import { HeaderActions } from "@/components/wrapped/HeaderActions";
import { LiquidGlassBackdrop } from "@/components/wrapped/LiquidGlassBackdrop";
import type { WrappedProfile } from "@/lib/wrapped-data";

// ScenePleaseBro (index 3) bumped 6800ms -> 7300ms for its added counter
// beat. Scene 8 (Summary) now genuinely auto-advances after 20s into the
// new About-outro scene (index 8, the true final scene) rather than that
// duration being unused dead weight.
const DURATIONS = [5200, 4600, 8200, 7300, 8500, 7000, 7500, 20000, 20000];
const TOTAL_DURATION = DURATIONS.reduce((a, b) => a + b, 0);
const CUMULATIVE = DURATIONS.reduce<number[]>((acc, d, i) => {
  acc.push((acc[i - 1] ?? 0) + (i === 0 ? 0 : DURATIONS[i - 1]));
  return acc;
}, []);

const chapterMotion = {
  initial: { opacity: 0, scale: 0.96, filter: "blur(10px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 1.03, filter: "blur(8px)" },
  transition: { type: "spring" as const, stiffness: 130, damping: 18 },
};

export function WrappedStory({
  profile,
  onRestart,
}: {
  profile: WrappedProfile;
  onRestart: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = DURATIONS.length - 1;

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => Math.min(last, Math.max(0, i + dir)));
      setProgress(0);
    },
    [last],
  );

  useEffect(() => {
    if (paused || index === last) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / DURATIONS[index], 1);
      setProgress(p);
      if (p >= 1) {
        setIndex((i) => Math.min(last, i + 1));
        setProgress(0);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, paused, last]);

  // Snap progress to full on the final scene - the timer effect above
  // bails out early for index === last with no scene to advance INTO,
  // which previously left the rail visually frozen at the prior boundary.
  useEffect(() => {
    if (index === last) setProgress(1);
  }, [index, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === " ") {
        e.preventDefault();
        setPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const scenes = [
    <SceneIdentity key="1" p={profile} />,
    <SceneContribution key="2" p={profile} />,
    <SceneLaunched key="3" p={profile} />,
    <ScenePleaseBro key="4" p={profile} />,
    <SceneEarnings key="5" p={profile} />,
    <SceneTimeline key="6" p={profile} />,
    <SceneUnclaimed key="7" p={profile} />,
    <SceneSummary key="8" p={profile} onRestart={onRestart} />,
    <SceneAboutOutro
      key="9"
      onShareCard={() => {
        setIndex(7);
        setProgress(0);
        setPaused(true);
      }}
    />,
  ];

  const overallPct =
    ((CUMULATIVE[index] + progress * DURATIONS[index]) / TOTAL_DURATION) * 100;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <LiquidGlassBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="glass flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img src="/logo.png" alt="Bankr" className="size-full object-cover" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">
            Bankr <span className="text-gradient">Wrapped</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <HeaderActions />
            <button
              type="button"
              onClick={() => setPaused((v) => !v)}
              className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? "Play" : "Pause"}
            </button>
          </div>
        </div>

        <div className="relative mt-4 h-2.5">
          <div className="glass absolute inset-0 overflow-hidden rounded-full">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${overallPct}%` }}
            >
              <div className="animate-sweep pointer-events-none absolute inset-0" />
            </div>
          </div>

          {CUMULATIVE.slice(1).map((c, i) => (
            <div
              key={i}
              className="pointer-events-none absolute top-0 h-full w-px bg-background/40"
              style={{ left: `${(c / TOTAL_DURATION) * 100}%` }}
            />
          ))}

          <div
            className="pointer-events-none absolute top-1/2 h-4 w-16 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent to-accent-glow/60 blur-md"
            style={{ left: `calc(${overallPct}% - 4rem)` }}
          />
          <motion.div
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_3px_rgba(255,255,255,0.7)]"
            style={{ left: `${overallPct}%` }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            {...chapterMotion}
            className="flex flex-1 items-center justify-center py-8"
          >
            {scenes[index]}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous scene"
            className="glass rounded-full p-3 disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-xs text-muted-foreground">
            {index + 1} / {DURATIONS.length}
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === last}
            aria-label="Next scene"
            className="glass rounded-full p-3 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Previous scene"
        onClick={() => go(-1)}
        className="absolute inset-y-0 left-0 z-0 w-1/3"
      />
      <button
        type="button"
        aria-label="Next scene"
        onClick={() => go(1)}
        className="absolute inset-y-0 right-0 z-0 w-1/3"
      />
    </div>
  );
}
