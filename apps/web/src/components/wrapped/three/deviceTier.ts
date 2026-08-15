// Decides which of the three locked device tiers a visitor gets, BEFORE
// any Three.js bundle loads. Called once at reveal-start. The point is to
// never load heavy 3D onto a device that can't run it — the reduced tier
// is the real default for most traffic (viral share links = mid-range
// phones), and CSS-fallback must be a complete experience, not a stub.
//
// This file intentionally has NO Three.js import — it runs before the 3D
// bundle is fetched, so it can only use cheap, synchronous browser signals.

export type DeviceTier = "full" | "reduced" | "fallback";

export type TierSignals = {
  // Rough device memory in GB, when the browser exposes it (Chrome/Android
  // mostly; absent on Safari/Firefox — absence is not failure).
  deviceMemory?: number;
  // Logical CPU cores, when exposed.
  cores?: number;
  // Whether the user has asked for reduced motion — if so we never put them
  // on the full tier regardless of hardware; respect the OS setting.
  prefersReducedMotion: boolean;
  // Whether a WebGL context can actually be created at all. If not →
  // fallback, no 3D is possible.
  webglAvailable: boolean;
  // Effective connection type from the Network Information API, when present
  // ("4g", "3g", "slow-2g", etc). Slow links shouldn't pull the full tier.
  effectiveType?: string;
};

// Read the cheap signals. Kept separate from the decision so the decision
// is pure and unit-testable without a DOM.
export function readTierSignals(): TierSignals {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    deviceMemory: (nav as unknown as { deviceMemory?: number })?.deviceMemory,
    cores: nav?.hardwareConcurrency,
    prefersReducedMotion: !!prefersReducedMotion,
    webglAvailable: detectWebGL(),
    effectiveType: (nav as unknown as { connection?: { effectiveType?: string } })?.connection
      ?.effectiveType,
  };
}

function detectWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Pure decision from signals → tier. Conservative by design: a device only
 * reaches "full" if it affirmatively looks capable. Anything unknown or
 * borderline lands on "reduced" (the safe default), and only a real
 * incapability (no WebGL) drops to "fallback".
 */
export function decideTier(s: TierSignals): DeviceTier {
  // Hard floor: no WebGL at all → the 2D/CSS experience, full stop.
  if (!s.webglAvailable) return "fallback";

  // Reduced-motion users get the reduced tier at most — never the heavy,
  // camera-swinging full tier — but still a real WebGL experience unless
  // they also fail hardware checks below.
  const reducedMotionCap = s.prefersReducedMotion;

  // Known-slow connection: don't gamble on the full tier's larger asset/
  // compute cost. (This governs runtime richness, not bundle size — the
  // bundle is already capped elsewhere.)
  const slowLink =
    s.effectiveType === "slow-2g" || s.effectiveType === "2g" || s.effectiveType === "3g";

  // Affirmative capability check. Both memory and cores must clear the bar
  // WHEN they're reported. When they're absent (Safari/Firefox), we don't
  // assume the worst — but we also don't grant "full" on nothing, so an
  // absent-signal device needs the other positive signals to line up.
  const memOK = s.deviceMemory === undefined ? undefined : s.deviceMemory >= 4;
  const coresOK = s.cores === undefined ? undefined : s.cores >= 4;

  // If any reported hardware signal is explicitly below the bar → reduced.
  if (memOK === false || coresOK === false) return "reduced";
  if (reducedMotionCap || slowLink) return "reduced";

  // To reach "full", require at least one affirmatively-good hardware
  // signal (not merely the absence of a bad one). This keeps unknown
  // low-end devices that report nothing from being over-promoted.
  const anyAffirmativelyGood = memOK === true || coresOK === true;
  if (anyAffirmativelyGood) return "full";

  // Everything unknown, nothing bad, nothing affirmatively great → reduced.
  return "reduced";
}

// Convenience: read + decide in one call for the real runtime path.
export function detectDeviceTier(): DeviceTier {
  return decideTier(readTierSignals());
}