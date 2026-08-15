// apps/web/src/components/wrapped/three/SwarmBoundary.tsx
//
// The mount point and load gate for the entire 3D layer.
//
// Two locked decisions live here:
//  1. Bundle isolation (main playbook, Module 10): the heavy R3F/three
//     bundle is code-split and only fetched when the reveal actually
//     STARTS — not on page load, not on route entry. A visitor who bounces
//     on the landing page downloads zero 3D. This is done by lazy-importing
//     the Canvas-bearing inner module; the fallback shown while it loads is
//     plain CSS with no three.js dependency in its code path.
//  2. Three device tiers: detected once here, before anything heavy loads.
//     full/reduced → real WebGL Canvas; fallback → a complete CSS-only
//     experience (never a degraded stub).
//
// The parent renders <SwarmBoundary> only when the reveal begins, and feeds
// it the current SwarmState. This component owns HOW the swarm is mounted;
// the parent owns WHEN and with what state.
//
// NOTE: WebGL paint not verifiable in the authoring environment —
// typechecked against R3F 9 / three 0.185.

import { lazy, Suspense, useMemo } from "react";

import { detectDeviceTier, type DeviceTier } from "./deviceTier";
import type { SwarmState } from "./ParticleSwarm";

// Lazy boundary: this dynamic import is the code-split point. Everything it
// pulls in (Canvas, three, the swarm, postprocessing) is excluded from the
// main bundle and only fetched when SwarmBoundary first renders — i.e. at
// reveal-start.
const SwarmCanvas = lazy(() => import("./SwarmCanvas"));

type Props = {
  state: SwarmState;
  // Optional override, mainly for testing/forcing a tier. Real runtime
  // leaves this undefined and detects.
  forceTier?: DeviceTier;
  // Rendered behind everything as the flat backdrop-safe fallback while the
  // 3D chunk loads, AND as the permanent visual on the fallback tier. Pure
  // CSS, no three import — keep it that way.
  className?: string;
};

export function SwarmBoundary({ state, forceTier, className }: Props) {
  // Detect once. useMemo keeps it stable across re-renders (state changes
  // every scene; we must not re-run detection or re-decide the tier when
  // only the swarm's color/reveal props change).
  const tier = useMemo<DeviceTier>(() => forceTier ?? detectDeviceTier(), [forceTier]);

  // No WebGL → never load the 3D chunk at all. The CSS fallback is the
  // whole experience for this tier.
  if (tier === "fallback") {
    return <CssFallback state={state} className={className} />;
  }

  return (
    <Suspense fallback={<CssFallback state={state} className={className} />}>
      <SwarmCanvas tier={tier} state={state} className={className} />
    </Suspense>
  );
}

// Pure-CSS ambient fallback. No three.js, no WebGL — safe to render on the
// fallback tier and as the Suspense placeholder while the real chunk loads.
// It reads the same SwarmState (color/energy/reveal) so the fallback still
// shifts per scene rather than being a static dead frame. A soft radial
// glow whose color and intensity track the scene — a real, complete
// backdrop, deliberately calm.
function CssFallback({ state, className }: { state: SwarmState; className?: string }) {
  const color = useMemo(() => cssColor(state.color), [state.color]);
  // Intensity rides reveal + energy so later scenes feel fuller even here.
  const intensity = Math.min(1, 0.25 + state.revealFraction * 0.5 + state.energy * 0.25);

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        // Two stacked radial glows in the scene color, over the terminal
        // void. Opacity tracks intensity; the transition makes per-scene
        // color/reveal changes glide to match the WebGL layer's easing.
        background: `
          radial-gradient(60% 45% at 50% 65%, ${color} 0%, transparent 70%),
          radial-gradient(40% 30% at 50% 40%, ${color} 0%, transparent 75%)
        `,
        opacity: intensity,
        transition: "opacity 900ms ease, background 900ms ease",
        pointerEvents: "none",
      }}
    />
  );
}

// Normalize a THREE.ColorRepresentation-ish value into a CSS color string
// WITHOUT importing three (keeps this file three-free for the fallback
// path). Handles the two forms we actually pass: a hex number (0xrrggbb)
// or a CSS string. Anything else falls back to the brand purple.
function cssColor(c: SwarmState["color"]): string {
  if (typeof c === "string") return c;
  if (typeof c === "number") {
    return "#" + c.toString(16).padStart(6, "0");
  }
  return "#a78bfa";
}