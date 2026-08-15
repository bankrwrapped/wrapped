// apps/web/src/components/wrapped/three/SwarmCanvas.tsx
//
// The actual R3F <Canvas> and everything heavy — this module is the
// code-split chunk that SwarmBoundary lazy-imports. Nothing in the main
// bundle imports this directly; it's only pulled in at reveal-start.
//
// Postprocessing (bloom) is gated to the FULL tier only. The reduced tier
// (the real default for most traffic) runs the raw swarm with no
// post-processing, per the locked device-tier spec — bloom is a
// progressive upgrade for capable devices, never the baseline.
//
// Default export, because React.lazy requires one.
//
// NOTE: WebGL/bloom paint not verifiable in the authoring environment —
// typechecked against R3F 9 / three 0.185 / postprocessing.

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

import { ParticleSwarm, type SwarmState } from "./ParticleSwarm";
import type { DeviceTier } from "./deviceTier";

type Props = {
  tier: DeviceTier;
  state: SwarmState;
  className?: string;
};

export default function SwarmCanvas({ tier, state, className }: Props) {
  const full = tier === "full";

  return (
    <div
      aria-hidden
      className={className}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <Canvas
        // Camera pulled back enough to frame the ~2-unit-radius swarm with
        // headroom for the finale's push-in (scene camera moves are driven
        // elsewhere; this is the resting frame).
        camera={{ position: [0, 0, 6], fov: 50 }}
        // Cap DPR so high-density-display phones don't quietly render at 3x
        // and blow the frame budget. Full tier gets a little more clarity.
        dpr={full ? [1, 2] : [1, 1.5]}
        gl={{
          antialias: full,
          alpha: true,
          powerPreference: "high-performance",
        }}
        // Transparent so the DOM backdrop (flat terminal void) shows through
        // — the Canvas only draws the swarm, never a background fill.
        style={{ background: "transparent" }}
      >
        <ParticleSwarm tier={tier} state={state} />

        {full ? (
          <EffectComposer>
            {/* Bloom carries the maximalist/celebratory glow — reserved for
                the full tier, dialed hardest by the finale via the swarm's
                own energy/reveal (the effect is constant here; the swarm's
                brightness under it is what escalates). */}
            <Bloom
              intensity={0.9}
              luminanceThreshold={0.15}
              luminanceSmoothing={0.9}
              mipmapBlur
            />
          </EffectComposer>
        ) : null}
      </Canvas>
    </div>
  );
}