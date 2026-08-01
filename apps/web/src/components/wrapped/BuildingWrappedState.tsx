import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

// Reframed from technical-log copy ("Resolving profile") toward anticipation
// beats - what's actually happening, told like part of the story rather
// than a system status list.
const STEPS = [
  "Scanning Base and Robinhood Chain",
  "Counting every token you've touched",
  "Tallying up your earnings",
  "Wrapping your story",
];
const STEP_INTERVAL_MS = 700;

type Props = {
  apiDone: boolean;
  onDone: () => void;
  handle: string;
  avatarUrl: string | null;
};

/**
 * Steps 0-2 advance on a fixed timer purely for pacing/anticipation.
 * Step 3 (last) never auto-completes - it only checks off once `apiDone`
 * is true, so this screen never lies about being finished before the
 * real lookupWrapped() call has actually resolved.
 */
export function BuildingWrappedState({ apiDone, onDone, handle, avatarUrl }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  // Ref-guarded, same pattern as SceneMilestones' doneRef - a state-only
  // guard (`!finishing`) is vulnerable to the effect being cancelled and
  // re-run (e.g. if `onDone`'s identity changes) after finishing was set
  // but before the timeout fired, permanently losing the scheduled call.
  // A ref survives that re-run and guarantees onDone fires exactly once.
  const doneRef = useRef(false);
  const lastStep = STEPS.length - 1;
  const cleanHandle = handle.trim().replace(/^@/, "");

  useEffect(() => {
    if (activeStep >= lastStep) return;
    const t = setTimeout(() => setActiveStep((s) => s + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [activeStep, lastStep]);

  useEffect(() => {
    if (apiDone && activeStep >= lastStep && !doneRef.current) {
      doneRef.current = true;
      // Closing flourish: a brief bright flash before handing off, rather
      // than cutting straight to the next screen - echoes the anticipation
      // beat used in SceneMilestones so this feels like it's building
      // toward something, not just finishing a task.
      setFinishing(true);
      const t = setTimeout(onDone, 550);
      return () => clearTimeout(t);
    }
  }, [apiDone, activeStep, lastStep, onDone]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 text-center">
      <video
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-25"
        src="/bankr-ambient.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/85 via-background/70 to-background/90" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/15" />

      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Avatar anchor - the visual "this is about you" moment. Falls
            back to an initial-letter badge if we don't have an avatar
            (user typed and submitted without picking a suggestion). */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 14 }}
          className="relative mx-auto size-20"
        >
          <div className="absolute inset-0 animate-glow-pulse rounded-full bg-primary/40 blur-xl" />
          <div className="glass relative flex size-20 items-center justify-center overflow-hidden rounded-full">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="font-display text-2xl font-extrabold text-muted-foreground">
                {cleanHandle.charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.1 }}
          className="font-display text-2xl font-extrabold sm:text-3xl"
        >
          Pulling up{" "}
          <span className="text-gradient">@{cleanHandle || "your"}</span>&rsquo;s year on
          Bankr&hellip;
        </motion.h1>

        <motion.ul
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.2 }}
          className="glass divide-y divide-white/10 rounded-2xl p-1.5 text-left"
        >
          {STEPS.map((label, i) => {
            const isLast = i === lastStep;
            const checked = i < activeStep || (isLast && apiDone && activeStep >= lastStep);
            const active = i === activeStep && !checked;
            return (
              <motion.li
                key={label}
                layout
                animate={{
                  scale: active ? 1.03 : 1,
                  opacity: checked ? 0.55 : 1,
                }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              >
                {checked ? (
                  <Check className="size-4 shrink-0 text-accent" />
                ) : active ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-white/15" />
                )}
                <span
                  className={
                    active
                      ? "font-semibold text-foreground"
                      : checked
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                  }
                >
                  {label}
                </span>
              </motion.li>
            );
          })}
        </motion.ul>
      </div>

      {/* Closing flourish - one bright pulse right before handoff */}
      <AnimatePresence>
        {finishing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.55, times: [0, 0.35, 1] }}
            className="pointer-events-none absolute inset-0 z-30 bg-accent/50"
          />
        )}
      </AnimatePresence>
    </main>
  );
}
