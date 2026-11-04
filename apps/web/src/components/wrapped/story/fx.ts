// Effects tier for the story. "full" is the designed look; "lite" keeps the
// same scenes but drops what weak GPUs struggle with: the drifting backdrop
// (the light sources stay, just still), clip-path and slide cuts (they become
// fades), the camera push and the beat pulse.
//
// Lite turns on when the device looks weak up front (2 or fewer cores, or
// 2 GB or less memory), or when the first seconds of playback drop frames.
// Once on it stays on for the browser session, so a replay doesn't stutter
// first. `?fx=lite` or `?fx=full` in the URL forces a tier, for testing.
import { useSyncExternalStore } from "react";

export type Fx = "full" | "lite";

const KEY = "wrapped:fx";
const subs = new Set<() => void>();
let current: Fx | null = null;

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function initial(): Fx {
  if (typeof window === "undefined") return "full";
  const forced = new URLSearchParams(window.location.search).get("fx");
  if (forced === "lite" || forced === "full") {
    try {
      sessionStorage.setItem(KEY, forced);
    } catch {
      // not remembered, still applied for this load
    }
    return forced;
  }
  const saved = read(KEY);
  if (saved === "lite" || saved === "full") return saved;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  return cores <= 2 || memory <= 2 ? "lite" : "full";
}

export function getFx(): Fx {
  if (current === null) current = initial();
  return current;
}

function setLite() {
  if (getFx() === "lite") return;
  current = "lite";
  try {
    sessionStorage.setItem(KEY, "lite");
  } catch {
    // ignore
  }
  subs.forEach((f) => f());
}

export function useFx(): Fx {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getFx,
    () => "full",
  );
}

// Feed it every frame's duration while the story plays. After a short
// warm-up it watches about two seconds of frames and switches to lite if too
// many are slow (under ~35fps). A slow device can't take long to decide, so
// the window is measured in time, not frames. A forced ?fx=full is never
// overridden.
export function createFrameSampler() {
  const WARMUP_MS = 800;
  const WINDOW_MS = 2000;
  const MIN_FRAMES = 12;
  const SLOW_MS = 28;
  const SLOW_SHARE = 0.3;
  let played = 0;
  let frames = 0;
  let slow = 0;
  let done = getFx() === "lite" || read(KEY) === "full";
  return (dt: number) => {
    if (done) return;
    played += dt;
    if (played < WARMUP_MS) return;
    frames += 1;
    if (dt > SLOW_MS) slow += 1;
    if (played >= WARMUP_MS + WINDOW_MS && frames >= MIN_FRAMES) {
      done = true;
      if (slow / frames >= SLOW_SHARE) setLite();
    }
  };
}
