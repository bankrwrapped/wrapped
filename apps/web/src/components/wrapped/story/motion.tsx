// Motion primitives shared by the story scenes and the share cards: kinetic
// words, count-ups, a fade-up, the animated gradient backdrop, film grain,
// and token badges. Everything degrades to plain fades under reduced motion.
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useCountUp } from "@/hooks/use-count-up";
import { tokenHue, tokenInitials } from "@/lib/token-badge";
import type { TokenEntry } from "@/lib/wrapped-data";

export const EASE = [0.22, 1, 0.36, 1] as const;

// Each word rises out of its own clipped line box, staggered.
export function Words({
  text,
  delay = 0,
  stagger = 0.07,
  className,
}: {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.14em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { y: "115%" }}
            animate={reduce ? { opacity: 1 } : { y: "0%" }}
            transition={{ duration: 0.75, ease: EASE, delay: delay + i * stagger }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function FadeUp({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// A title that lands: scales down out of a blur.
export function Slam({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.5, filter: "blur(14px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({
  value,
  format,
  delay = 0,
  duration = 1600,
  className,
}: {
  value: number;
  format: (v: number) => string;
  // seconds, like the other primitives
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const v = useCountUp(value, reduce ? 1 : duration, reduce ? 0 : delay * 1000);
  return <span className={`tabular-nums ${className ?? ""}`}>{format(v)}</span>;
}

export function Eyebrow({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <FadeUp delay={delay} y={10}>
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/60 sm:text-xs">{children}</p>
    </FadeUp>
  );
}

// ---- backdrop ----

export type Palette = [string, string, string];

// Brand violet and ember, plus magenta, gold and indigo for variety.
export const COLORS = {
  violet: "oklch(0.55 0.25 292)",
  ember: "oklch(0.7 0.19 42)",
  magenta: "oklch(0.6 0.24 340)",
  gold: "oklch(0.8 0.15 80)",
  indigo: "oklch(0.48 0.2 268)",
} as const;

const ORB_PATHS = [
  { x: ["-20%", "10%", "-20%"], y: ["-25%", "5%", "-25%"], left: "-15%", top: "-20%", d: 18 },
  { x: ["15%", "-10%", "15%"], y: ["10%", "-15%", "10%"], left: "45%", top: "35%", d: 22 },
  { x: ["0%", "20%", "0%"], y: ["20%", "-5%", "20%"], left: "-10%", top: "60%", d: 26 },
];

// Three soft light sources drifting on long loops, a fine grid, and grain.
export function Backdrop({ palette, intensity = 0.55 }: { palette: Palette; intensity?: number }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0b0910]">
      {ORB_PATHS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute size-[85vmax] rounded-full"
          style={{
            left: o.left,
            top: o.top,
            opacity: intensity,
            background: `radial-gradient(circle, ${palette[i]} 0%, transparent 62%)`,
          }}
          animate={reduce ? undefined : { x: o.x, y: o.y }}
          transition={{ duration: o.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <Grain />
    </div>
  );
}

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.9'/></svg>\")";

export function Grain({ opacity = 0.14 }: { opacity?: number }) {
  return <div aria-hidden className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: GRAIN, opacity }} />;
}

// ---- tokens ----

export function TokenBadge({ token, size = 40 }: { token: Pick<TokenEntry, "tokenAddress" | "symbol">; size?: number }) {
  const hue = tokenHue(token.tokenAddress);
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center rounded-full font-display font-extrabold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 85% 72%), hsl(${hue} 70% 45%) 45%, hsl(${(hue + 40) % 360} 75% 22%))`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.25), 0 ${size * 0.15}px ${size * 0.5}px -${size * 0.15}px hsl(${hue} 80% 50% / 0.6)`,
      }}
    >
      {tokenInitials(token.symbol)}
    </span>
  );
}
