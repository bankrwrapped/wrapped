import { useCallback, useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { WrappedProfile } from "@/lib/wrapped-data";

const DURATIONS = [5200, 4600, 8200, 6800, 8500, 7000, 7500, 20000];

/** Ambient light tone per scene: purple -> orange -> balanced. */
const TONES = [
  "from-primary/35 via-background to-background",
  "from-primary/45 via-background to-background",
  "from-primary/35 via-background to-accent/10",
  "from-primary/25 via-background to-accent/20",
  "from-accent/35 via-background to-primary/15",
  "from-accent/32 via-background to-primary/18",
  "from-accent/30 via-background to-primary/20",
  "from-primary/30 via-background to-accent/30",
];

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
    <SceneContribution key="2" />,
    <SceneLaunched key="3" p={profile} />,
    <ScenePleaseBro key="4" p={profile} />,
    <SceneEarnings key="5" p={profile} />,
    <SceneTimeline key="6" p={profile} />,
    <SceneUnclaimed key="7" p={profile} />,
    <SceneSummary key="8" p={profile} onRestart={onRestart} />,
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-b transition-all duration-1000",
          TONES[index],
        )}
      />
      <div className="pointer-events-none absolute -left-24 top-1/4 size-[28rem] animate-drift rounded-full bg-primary/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 pt-5">
        <div className="flex gap-1.5">
          {DURATIONS.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/15">
              <div
                className="h-full rounded-full bg-foreground transition-[width] duration-100"
                style={{ width: (i < index ? 100 : i === index ? progress * 100 : 0) + "%" }}
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-display font-semibold uppercase tracking-[0.3em]">
            Bankr Wrapped
          </span>
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:text-foreground"
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {paused ? "Play" : "Pause"}
          </button>
        </div>

        <div key={index} className="flex flex-1 animate-scene-in items-center justify-center py-8">
          {scenes[index]}
        </div>

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

      {/* Tap zones (Stories style) */}
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