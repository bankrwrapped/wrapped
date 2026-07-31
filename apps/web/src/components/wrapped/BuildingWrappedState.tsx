import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const STEPS = ["Resolving profile", "Finding launches", "Calculating rewards", "Building your story"];
const STEP_INTERVAL_MS = 700;

type Props = {
  /** True once the real API call has actually resolved (success or failure). */
  apiDone: boolean;
  onDone: () => void;
};

/**
 * Steps 0-2 advance on a fixed timer purely for pacing/anticipation.
 * Step 3 (last) never auto-completes - it only checks off once `apiDone`
 * is true, so this screen never lies about being finished before the
 * real lookupWrapped() call has actually resolved.
 */
export function BuildingWrappedState({ apiDone, onDone }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const lastStep = STEPS.length - 1;

  useEffect(() => {
    if (activeStep >= lastStep) return;
    const t = setTimeout(() => setActiveStep((s) => s + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [activeStep, lastStep]);

  useEffect(() => {
    if (apiDone && activeStep >= lastStep) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
  }, [apiDone, activeStep, lastStep, onDone]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 text-center">
      <div className="pointer-events-none absolute -left-32 top-0 size-[30rem] animate-drift rounded-full bg-primary/30 blur-[130px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-[26rem] animate-glow-pulse rounded-full bg-accent/20 blur-[130px]" />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <h1 className="animate-rise font-display text-3xl font-extrabold sm:text-4xl">
          Preparing your Wrapped…
        </h1>

        <ul className="glass animate-rise divide-y divide-white/10 rounded-2xl text-left">
          {STEPS.map((label, i) => {
            const isLast = i === lastStep;
            const checked = i < activeStep || (isLast && apiDone && activeStep >= lastStep);
            const active = i === activeStep && !checked;
            return (
              <li key={label} className="flex items-center gap-3 px-5 py-4">
                {checked ? (
                  <Check className="size-4 shrink-0 text-accent" />
                ) : active ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-white/15" />
                )}
                <span className={checked || active ? "" : "text-muted-foreground"}>{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
