// apps/web/src/components/wrapped/terminal/Backdrop.tsx
//
// The terminal void — replaces LiquidGlassBackdrop entirely. Locked
// decision (2026-08-15): flat, Bankr's own real --background token
// (oklch(0.15 0.014 300), a near-black with a faint purple cast), no
// photographic image, no video. liquid-glass-bg.jpg and bankr-ambient.mp4
// are dropped, not adapted.
//
// "Flat void" is not "dead frame": a real terminal/CRT has restrained
// life. Two effects only, both extremely subtle and CSS-only, both
// disabled under prefers-reduced-motion where they move:
//   - a faint horizontal scanline texture (static, no motion) that reads
//     as "screen" without shouting CRT
//   - a soft vignette pulling the corners darker, focusing the eye center
// The particle swarm renders in its own transparent Canvas ON TOP of this;
// this component never draws the swarm, only the surface it lives on.
//
// No three.js import — this is the backdrop even on the fallback (no-WebGL)
// tier, so it must stand alone.

type Props = {
  // Rendered above the backdrop (the swarm canvas, terminal UI, scene
  // content). Backdrop is always the furthest-back layer.
  children?: React.ReactNode;
};

export function Backdrop({ children }: Props) {
  return (
    <div style={rootStyle}>
      {/* Base fill: Bankr's real near-black background token. Referenced via
          the CSS var so it stays in lockstep with the rest of the app's
          theme rather than hardcoding the oklch value here. */}
      <div style={fillStyle} aria-hidden />

      {/* Static scanline texture — a repeating 1px dark line every 3px, at
          very low opacity. No animation: a moving scanline reads as
          gimmicky; a static one just reads as "screen". */}
      <div style={scanlineStyle} aria-hidden />

      {/* Vignette: darkens the extreme corners so content center-stage has
          more contrast against the void. */}
      <div style={vignetteStyle} aria-hidden />

      {/* Foreground content sits above all backdrop layers. */}
      <div style={contentStyle}>{children}</div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  width: "100%",
  overflow: "hidden",
  // Fallback color in case the var is ever missing; matches the token.
  backgroundColor: "var(--background)",
};

const fillStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "var(--background)",
  pointerEvents: "none",
};

const scanlineStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0px, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 3px)",
  // Very restrained — present at a glance-check, invisible unless looked for.
  opacity: 0.35,
  mixBlendMode: "multiply",
};

const vignetteStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)",
};

const contentStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  minHeight: "100vh",
};