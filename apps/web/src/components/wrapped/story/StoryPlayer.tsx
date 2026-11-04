// Full-screen story player. It opens on a title card (browsers only start
// audio after a click), then scenes auto-advance behind segmented progress
// bars to a live soundtrack; tap the right of the screen (or →, space) to go
// on, the left third (or ←) to go back, press and hold to pause, Esc or
// "Skip" for the cards. Each scene cuts in its own way (flash, zoom, wipe,
// whip, iris, fade) over its own backdrop, with a slow camera push and a
// glow on the kick. Timing runs in a rAF loop on refs and writes the bars,
// camera and pulse as styles directly, so the scenes themselves don't
// re-render every frame. It pauses, music included, while the tab is hidden.
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardContext } from "../cards/WrappedCards";
import { createFrameSampler, useFx } from "./fx";
import { Backdrop, COLORS, EASE } from "./motion";
import type { Cut, Scene } from "./scenes";
import { BAR_MS, Soundtrack, type Cue, type CutSound } from "./soundtrack";

const HOLD_MS = 220;
const MUTED_KEY = "wrapped-muted";

export const CUT_SOUND: Record<Cut, CutSound> = {
  fade: "soft",
  zoom: "impact",
  wipe: "whoosh",
  whip: "whoosh",
  flash: "impact",
  iris: "whoosh",
};

const CUT_TIMING: Record<Cut, Transition> = {
  fade: { duration: 0.6, ease: EASE },
  zoom: { duration: 0.7, ease: EASE },
  wipe: { duration: 0.8, ease: [0.7, 0, 0.2, 1] },
  whip: { duration: 0.55, ease: [0.7, 0, 0.2, 1] },
  flash: { duration: 0.3, ease: "easeOut" },
  iris: { duration: 0.9, ease: [0.7, 0, 0.2, 1] },
};

// `custom` is the cut of the scene coming in: the entering scene uses it to
// arrive, and the leaving one (via AnimatePresence's custom) to get out of
// its way.
const CUTS: Variants = {
  enter: (c: Cut) =>
    ({
      fade: { opacity: 0 },
      zoom: { opacity: 0, scale: 0.8 },
      wipe: { clipPath: "inset(0% 0% 0% 100%)" },
      whip: { y: "100%" },
      flash: { opacity: 0, scale: 1.08 },
      iris: { clipPath: "circle(0% at 50% 50%)" },
    })[c],
  center: (c: Cut) => ({
    opacity: 1,
    scale: 1,
    y: "0%",
    zIndex: 2,
    ...(c === "wipe" && { clipPath: "inset(0% 0% 0% 0%)" }),
    ...(c === "iris" && { clipPath: "circle(80% at 50% 50%)" }),
    transition: CUT_TIMING[c],
  }),
  exit: (c: Cut) => ({
    zIndex: 1,
    ...{
      fade: { opacity: 0 },
      zoom: { opacity: 0, scale: 1.3 },
      wipe: { x: "-30%", opacity: 0.3 },
      whip: { y: "-100%" },
      flash: { opacity: 0 },
      iris: { scale: 0.92, opacity: 0.4 },
    }[c],
    transition: CUT_TIMING[c],
  }),
};

// What flies over a cut: a white flash, or a band of light leading a wipe.
function CutFx({ cut }: { cut: Cut }) {
  if (cut === "flash") {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 bg-white"
        initial={{ opacity: 0.85 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    );
  }
  if (cut === "wipe") {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 z-20 w-[18vw] min-w-24"
        style={{ background: `linear-gradient(90deg, transparent, ${COLORS.ember}, ${COLORS.violet}, transparent)` }}
        initial={{ left: "100%" }}
        animate={{ left: "-20%" }}
        transition={CUT_TIMING.wipe}
      />
    );
  }
  return null;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function TitleCard({ handle, seconds, onStart }: { handle: string; seconds: number; onStart: (sound: boolean) => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
      <motion.p
        className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.8 }}
      >
        Bankr Wrapped · {new Date().getUTCFullYear()}
      </motion.p>
      <motion.h1
        className="mt-5 font-display text-[clamp(3rem,13vw,7.5rem)] font-extrabold leading-[0.88] tracking-tight"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.15 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 1.1, ease: EASE }}
      >
        Your year,
        <br />
        <span className="text-gradient">on Bankr.</span>
      </motion.h1>
      <motion.p
        className="mt-5 font-display text-lg font-bold text-white/75"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.7, ease: EASE }}
      >
        Starring @{handle}
      </motion.p>
      <motion.button
        type="button"
        autoFocus
        onClick={() => onStart(true)}
        aria-label="Play with sound"
        className="relative mt-12 flex size-24 items-center justify-center rounded-full bg-white text-[#0b0910] shadow-[0_0_60px_-10px_rgba(255,255,255,0.6)] outline-none focus-visible:ring-4 focus-visible:ring-white/40"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.3, type: "spring", stiffness: 160, damping: 14 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
      >
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-white"
            animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <Play className="ml-1 size-9 fill-current" />
      </motion.button>
      <motion.div
        className="mt-6 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.7, duration: 0.8 }}
      >
        <p className="font-mono text-xs text-white/60">Sound on · about {Math.round(seconds / 10) * 10} seconds</p>
        <button type="button" onClick={() => onStart(false)} className="text-xs text-white/55 underline underline-offset-4 hover:text-white">
          Watch without sound
        </button>
      </motion.div>
    </div>
  );
}

export function StoryPlayer({ scenes, ctx, onFinish }: { scenes: Scene[]; ctx: CardContext; onFinish: () => void }) {
  const reduce = useReducedMotion();
  const lite = useFx() === "lite";
  // Camera push and beat pulse are off when motion is reduced or effects are lite.
  const still = reduce || lite;
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(readMuted);
  const [showHint, setShowHint] = useState(true);
  const idx = useRef(0);
  const elapsed = useRef(0);
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const finished = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const bars = useRef<Array<HTMLDivElement | null>>([]);
  const music = useRef<Soundtrack | null>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Sound and the hit for the scene now on screen, plus the riser into the
  // next cut.
  const cueScene = useCallback(
    (n: number) => {
      const m = music.current;
      const s = scenes[n];
      if (!m || !s) return;
      m.setEnergy(s.energy);
      m.cut(CUT_SOUND[s.cut]);
      m.riseTo(s.duration);
    },
    [scenes]
  );

  const go = useCallback(
    (n: number) => {
      if (finished.current || !startedRef.current) return;
      if (n >= scenes.length) {
        finished.current = true;
        music.current?.end();
        onFinishRef.current();
        return;
      }
      const next = Math.max(0, n);
      idx.current = next;
      elapsed.current = 0;
      setIndex(next);
      cueScene(next);
      if (next > 0) setShowHint(false);
    },
    [scenes.length, cueScene]
  );

  const begin = (sound: boolean) => {
    if (startedRef.current) return;
    const quiet = !sound;
    setMuted(quiet);
    try {
      localStorage.setItem(MUTED_KEY, quiet ? "1" : "0");
    } catch {
      // private mode: the choice just isn't remembered
    }
    try {
      music.current = new Soundtrack(quiet);
      music.current.start();
    } catch {
      music.current = null; // no Web Audio: the story plays silent
    }
    startedRef.current = true;
    setStarted(true);
    cueScene(0);
    // The score as cues, for anything recording the story (the demo's film
    // export listens for this).
    const cues: Cue[] = scenes.map((s) => ({ duration: s.duration, energy: s.energy, sound: CUT_SOUND[s.cut] }));
    window.dispatchEvent(new CustomEvent("wrapped:story-start", { detail: { cues } }));
  };

  const setPause = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    music.current?.setMuted(m);
    try {
      localStorage.setItem(MUTED_KEY, m ? "1" : "0");
    } catch {
      // ignore
    }
  };

  // The music follows pause and tab visibility; the final fade outlives us.
  useEffect(() => {
    const sync = () => (paused || document.hidden ? music.current?.pause() : music.current?.resume());
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [paused]);
  useEffect(() => () => music.current?.end(), []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const sample = createFrameSampler();
    const tick = (t: number) => {
      const dt = Math.min(t - last, 100);
      last = t;
      if (startedRef.current) {
        if (!pausedRef.current && !document.hidden) {
          elapsed.current += dt;
          sample(dt);
        }
        const duration = scenes[idx.current]?.duration ?? 1;
        const progress = Math.min(1, elapsed.current / duration);
        const bar = bars.current[idx.current];
        if (bar) bar.style.transform = `scaleX(${progress})`;
        const el = root.current;
        if (el) {
          // Written straight onto the few elements that use them (not as CSS
          // variables on the root, which restyles the whole story every frame).
          const cam = `scale(${still ? 1 : 1 + progress * 0.05})`;
          // Without Web Audio, scenes start on a downbeat, so count from there.
          const phase = music.current?.beatPhase() ?? (elapsed.current / (BAR_MS / 4)) % 1;
          const pulse = still ? "0" : String(Math.round((1 - phase) ** 4 * 0.35 * 100) / 100);
          el.querySelectorAll<HTMLElement>("[data-cam]").forEach((n) => {
            n.style.transform = cam;
          });
          el.querySelectorAll<HTMLElement>("[data-pulse]").forEach((n) => {
            if (n.style.opacity !== pulse) n.style.opacity = pulse;
          });
        }
        if (elapsed.current >= duration) go(idx.current + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scenes, go, still]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!startedRef.current) {
        if (e.key === "Escape") onFinishRef.current();
        return; // Enter / space press the focused play button
      }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(idx.current + 1);
      } else if (e.key === "ArrowLeft") go(idx.current - 1);
      else if (e.key === "Escape") go(scenes.length);
      else if (e.key.toLowerCase() === "p") setPause(!pausedRef.current);
      else if (e.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Tap to navigate, press and hold to pause.
  const hold = useRef<{ timer: number; held: boolean } | null>(null);
  const onPointerDown = () => {
    if (!startedRef.current) return;
    const h = { timer: 0, held: false };
    h.timer = window.setTimeout(() => {
      h.held = true;
      setPause(true);
    }, HOLD_MS);
    hold.current = h;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    clearTimeout(h.timer);
    if (h.held) return setPause(false);
    if (e.clientX < window.innerWidth / 3) go(idx.current - 1);
    else go(idx.current + 1);
  };
  const onPointerCancel = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    if (hold.current?.held) setPause(false);
    hold.current = null;
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const scene = scenes[index];
  // Lite keeps the cheap cuts (opacity and scale) and turns clip-path and
  // full-screen slides into fades.
  const cut: Cut = reduce || (lite && (scene.cut === "wipe" || scene.cut === "iris" || scene.cut === "whip")) ? "fade" : scene.cut;
  const totalSeconds = scenes.reduce((a, s) => a + s.duration, 0) / 1000;
  return (
    <div
      ref={root}
      className="fixed inset-0 z-50 select-none overflow-hidden bg-[#0b0910] text-white"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      role="region"
      aria-roledescription="story"
      aria-label={started ? `Bankr Wrapped, part ${index + 1} of ${scenes.length}` : "Bankr Wrapped"}
      data-total={totalSeconds * 1000}
    >
      {!started ? (
        <>
          <Backdrop palette={[COLORS.violet, COLORS.ember, COLORS.indigo]} intensity={0.45} />
          <TitleCard handle={ctx.profile.handle} seconds={totalSeconds} onStart={begin} />
        </>
      ) : (
        <>
          <AnimatePresence custom={cut}>
            <motion.div key={scene.id} custom={cut} variants={CUTS} initial="enter" animate="center" exit="exit" className="absolute inset-0">
              <Backdrop palette={scene.palette} />
              <div
                aria-hidden
                data-pulse
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse at 50% 115%, ${scene.palette[1]}, transparent 60%)`,
                  opacity: 0,
                  willChange: "opacity",
                }}
              />
              <div data-cam className="absolute inset-0 pb-16 pt-24" style={{ willChange: "transform" }}>
                {scene.render(ctx)}
              </div>
            </motion.div>
          </AnimatePresence>
          {!reduce && <CutFx key={`fx-${index}`} cut={cut} />}
        </>
      )}

      <div
        className="absolute inset-x-0 top-0 z-30 px-3 sm:px-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <div className={`mx-auto flex max-w-3xl gap-1 transition-opacity duration-700 ${started ? "opacity-100" : "opacity-0"}`}>
          {scenes.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                ref={(el) => {
                  bars.current[i] = el;
                }}
                className="h-full origin-left rounded-full bg-white"
                style={i === index && started ? undefined : { transform: `scaleX(${i < index ? 1 : 0})` }}
              />
            </div>
          ))}
        </div>
        <div className="mx-auto mt-3 flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[11px] text-white/70">
            <img src="/logo.png" alt="" className="size-6 rounded-full" />
            Bankr Wrapped
          </div>
          <div className="flex items-center gap-1" onPointerDown={stop} onPointerUp={stop}>
            {started && (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? "Turn sound on" : "Mute"}
                  className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setPause(!paused)}
                  aria-label={paused ? "Play" : "Pause"}
                  className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => (started ? go(scenes.length) : onFinishRef.current())}
              className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            >
              Skip to cards <X className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {started && (showHint || paused) && (
          <motion.p
            className="pointer-events-none absolute inset-x-0 z-30 text-center font-mono text-[11px] text-white/60"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: paused ? 0 : 1.5 }}
          >
            {paused ? "Paused" : "Tap for next · hold to pause"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
