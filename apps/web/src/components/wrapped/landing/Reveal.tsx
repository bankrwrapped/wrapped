// apps/web/src/components/wrapped/landing/Reveal.tsx
//
// Shared scroll-reveal wrapper — the animation baseline for the whole page:
// content fades + slides in as it enters the viewport, so nothing appears
// statically ("everything moves as they interact"). Respects reduced-motion
// (renders final state, no movement).
//
// Wrap any section/element: <Reveal><Thing/></Reveal>. `from` picks the slide
// direction; `delay` staggers siblings.

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type Dir = "up" | "left" | "right" | "none";

const OFFSET: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: 40 },
  left: { x: -60, y: 0 },
  right: { x: 60, y: 0 },
  none: { x: 0, y: 0 },
};

export function Reveal({
  children,
  from = "up",
  delay = 0,
  amount = 0.3,
  style,
}: {
  children: ReactNode;
  from?: Dir;
  delay?: number;
  amount?: number; // how much must be visible before firing (0..1)
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const off = OFFSET[from];

  if (reduce) return <div style={style}>{children}</div>;

  return (
    <motion.div
      style={style}
      initial={{ opacity: 0, x: off.x, y: off.y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: false, amount }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}