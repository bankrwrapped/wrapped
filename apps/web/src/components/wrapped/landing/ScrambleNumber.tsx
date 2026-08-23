// apps/web/src/components/wrapped/landing/ScrambleNumber.tsx
//
// Hero number animation — SCRAMBLE. Digits flicker through random values
// then lock to the real value. Now RE-FIRES every time it scrolls into view
// (not once): resets to scrambled when it leaves, replays on re-entry.
// Reduced-motion shows the final value immediately.

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

const GLYPHS = "0123456789";

export function ScrambleNumber({
  prefix = "",
  value,
  dec,
  suffix = "",
  color,
  durationMs = 1100,
  style,
}: {
  prefix?: string;
  value: number;
  dec: number;
  suffix?: string;
  color: string;
  durationMs?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // once:false → inView flips true/false each entry/exit, driving replay.
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const final = value.toFixed(dec);
  const [shown, setShown] = useState(reduce ? final : scrambleStr(final));

  useEffect(() => {
    if (reduce) {
      setShown(final);
      return;
    }
    if (!inView) {
      // Reset to scrambled so re-entry replays from scratch.
      setShown(scrambleStr(final));
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const lockCount = Math.floor(p * final.length);
      let out = "";
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        if (i < lockCount || ch === ".") out += ch;
        else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setShown(out);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(final);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, final, durationMs]);

  return (
    <span ref={ref} style={{ ...style, color }}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

function scrambleStr(s: string): string {
  let out = "";
  for (const ch of s) out += ch === "." ? "." : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  return out;
}