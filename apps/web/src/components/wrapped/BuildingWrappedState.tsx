import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

// Reframed from technical-log copy ("Resolving profile") toward anticipation
// beats - what's actually happening, told like part of the story rather
// than a system status list.
const STEPS = [
  "Scanning Base and Robinhood Chain",
  "Counting every token launched",
  "Tallying up the earnings",
  "Wrapping the story",
];
const STEP_INTERVAL_MS = 700;

// Rotates under the steps while the real lookup is still running, so a slow
// Bankr response reads as part of the bit instead of a hang.
const QUIPS = [
  "Counting launches…",
  "Reading the fee locker…",
  "Asking Clanker nicely…",
  "Weighing the Please Bros…",
  "Tallying the claims…",
  "Finding the best day…",
  "Checking the streaks…",
  "Sniffing out the theme…",
  "Picking a builder type…",
  "Polishing the cards…",
];
const QUIP_INTERVAL_MS = 1800;

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
  const [quip, setQuip] = useState(0);
  const lastStep = STEPS.length - 1;
  const cleanHandle = handle.trim().replace(/^@/, "");

  useEffect(() => {
    if (activeStep >= lastStep) return;
    const t = setTimeout(() => setActiveStep((s) => s + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [activeStep, lastStep]);

  useEffect(() => {
    if (apiDone) return;
    const t = setInterval(() => setQuip((q) => (q + 1) % QUIPS.length), QUIP_INTERVAL_MS);
    return () => clearInterval(t);
  }, [apiDone]);

  useEffect(() => {
    if (apiDone && activeStep >= lastStep && !doneRef.current) {
      doneRef.current = true;
      // A short fade out, then hand off to the story's own title card.
      setFinishing(true);
      const t = setTimeout(onDone, 320);
      return () => clearTimeout(t);
    }
  }, [apiDone, activeStep, lastStep, onDone]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#141415] px-5 text-[#ededed]">
      <div className="absolute left-6 top-5 z-20 flex items-center gap-2">
        <img src="/logo.png" alt="" className="size-7 rounded-md object-contain" />
        <span className="text-base font-medium">Bankr Wrapped</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: finishing ? 0 : 1, y: 0 }}
        transition={{ duration: finishing ? 0.3 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#232325]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="font-display text-2xl text-[#a1a1a6]">
                {cleanHandle.charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs text-[#85858b]">
              Bankr Wrapped {new Date().getUTCFullYear()}
            </p>
            <h1 className="mt-1 truncate font-display text-[28px] font-normal leading-tight tracking-tight">
              @{cleanHandle}
            </h1>
          </div>
        </div>

        <ul className="mt-8 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-[#19191b] px-1 text-left">
          {STEPS.map((label, i) => {
            const isLast = i === lastStep;
            const checked = i < activeStep || (isLast && apiDone && activeStep >= lastStep);
            const active = i === activeStep && !checked;
            return (
              <li key={label} className="flex h-12 items-center gap-3 px-4 text-[15px]">
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {checked ? (
                    <Check className="size-4 text-[#a1a1a6]" strokeWidth={1.5} />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin text-accent" strokeWidth={1.5} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-white/20" />
                  )}
                </span>
                <span
                  className={
                    active ? "text-[#ededed]" : checked ? "text-[#a1a1a6]" : "text-[#85858b]"
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        <p aria-live="polite" className="mt-4 h-5 font-mono text-xs text-[#85858b]">
          {!apiDone && activeStep >= lastStep ? QUIPS[quip] : ""}
        </p>
      </motion.div>
    </main>
  );
}
