// apps/web/src/components/wrapped/braid/BraidCanvas.tsx
//
// Phase 1 of 4 — the fixed WebGL canvas that mounts the braid behind the
// landing content. Sits full-viewport, fixed, zIndex 0; DOM content renders
// on top at higher zIndex. Lighting + camera are static placeholders here —
// scroll-driven camera is Phase 2.
//
// Renders nothing but the braid + lights for now. Pointer-events off so the
// canvas never eats clicks meant for the DOM above it.

import { Canvas } from "@react-three/fiber";

import { BraidHelix } from "./BraidHelix";
import { T } from "../landing/tokens";

export function BraidCanvas() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: T.ink,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 9], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        {/* Ambient fill so strands aren't pure black on their dark sides. */}
        <ambientLight intensity={0.4} />
        {/* Key light from front-upper, tinted violet. */}
        <directionalLight position={[4, 8, 6]} intensity={1.1} color={T.violetBright} />
        {/* Rim light from behind, tinted orange, for the two-color balance. */}
        <directionalLight position={[-5, -3, -6]} intensity={0.7} color={T.orangeBright} />

        <BraidHelix />
      </Canvas>
    </div>
  );
}