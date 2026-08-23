// apps/web/src/components/wrapped/braid/useScrollProgress.ts
//
// Phase 2 of 4 — scroll → normalized progress. Maps the page's scroll
// position to a 0..1 value the camera reads. Smoothed with a lerp so the
// camera eases toward the target rather than snapping frame-to-frame, which
// keeps motion fluid even with a fast scroll wheel.
//
// Reads scroll via a ref (not React state) so it never triggers re-renders —
// the r3f useFrame loop consumes the ref directly. Reduced-motion still
// tracks scroll (that's user-driven, not autoplay) but skips the smoothing.

import { useEffect, useRef } from "react";

export type ScrollProgress = {
  // Smoothed 0..1 progress the camera should ease toward each frame.
  readonly current: { value: number };
  // Raw 0..1 target from actual scroll position.
  readonly target: { value: number };
};

export function useScrollProgress(): ScrollProgress {
  const target = useRef({ value: 0 });
  const current = useRef({ value: 0 });

  useEffect(() => {
    const compute = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      target.current.value = Math.min(1, Math.max(0, p));
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return { current: current.current, target: target.current };
}