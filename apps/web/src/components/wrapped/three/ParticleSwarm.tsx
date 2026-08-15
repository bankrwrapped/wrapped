// apps/web/src/components/wrapped/three/ParticleSwarm.tsx
//
// The shared base motif for the whole reveal (main playbook, Module 10):
// ONE persistent particle system, mounted once, never unmounted or rebuilt
// between scenes. It reacts to scene state via props — color, reveal
// fraction, motion energy — animating smoothly between them, rather than
// each scene tearing down and building its own 3D world.
//
// Growth model (locked 2026-08-15): fixed-size buffer, option 1. We
// allocate the MAX particle count up front (sized per device tier) and
// reveal more of them per scene by raising `revealFraction`. We never
// reallocate the GPU buffer mid-experience — reallocation risks frame
// hitches exactly at scene transitions. Hidden particles are simply not
// drawn (alpha 0 in the shader), so the cost of the unrevealed ones is a
// stable, pre-paid buffer, not a per-frame reshuffle.
//
// Everything here is procedural — no textures, no GLTF, no font files —
// to preserve the 200KB budget and scale cleanly across tiers. Real text
// (numbers, labels) lives in the DOM overlay, never in this layer.
//
// NOTE: not renderable/verifiable in the authoring environment — written
// against R3F 9 / three 0.185 types and typechecked, but you confirm the
// actual 30fps paint on device.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { DeviceTier } from "./deviceTier";

// Max particle counts per tier. The reduced tier is the real default for
// most traffic, so it's tuned to look full at that count, not treated as a
// degraded version of the full tier. Fallback never mounts this component
// at all (no WebGL) — included for completeness/typing only.
const TIER_COUNT: Record<DeviceTier, number> = {
  full: 6000,
  reduced: 2200,
  fallback: 0,
};

export type SwarmState = {
  // 0..1 — how much of the buffer is "active" this scene. Rises across the
  // reveal (sparse at scene 1 → dense at the finale). The hybrid growth
  // model's floor+magnitude output is computed upstream and handed in here
  // already normalized; this component just renders whatever fraction it's
  // given.
  revealFraction: number;
  // Target color for the currently active particles (per-scene accent).
  // A THREE.ColorRepresentation — hex number, css string, or Color.
  color: THREE.ColorRepresentation;
  // 0..1 — motion energy. Low = calm drift (early scenes), high = the
  // finale's energetic churn. Drives noise amplitude/speed in the shader.
  energy: number;
};

type Props = {
  tier: DeviceTier;
  state: SwarmState;
  // Seconds to ease toward new state targets when `state` changes. Keeps
  // scene transitions smooth instead of snapping.
  transitionSeconds?: number;
};

// Generate a stable spherical-shell distribution of particle positions and
// a per-particle random seed (used in the shader to desync motion). Done
// once for the full buffer; revealFraction gates how many actually draw.
function useParticleGeometry(count: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    // Per-particle reveal ORDER, 0..1 — the fraction of the buffer that
    // must be revealed before this particle appears. Baked from position so
    // reveal is directional (fills bottom→top here), not a random scatter.
    // Because it's fixed per particle, the same particles cross the
    // threshold as reveal rises: stable, directional accumulation.
    const order = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Fibonacci-sphere scatter with slight radial jitter for volume.
      const t = i / Math.max(1, count - 1);
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 1.6 + Math.random() * 0.5;
      const y = Math.sin(phi) * Math.sin(theta) * r;
      positions[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.cos(phi) * r;
      seeds[i] = Math.random();
    }

    // Derive reveal order from height (y): lowest particles reveal first,
    // topmost last — the swarm fills upward as revealFraction rises.
    // Normalize y into 0..1 across the actual min/max of this buffer, with
    // a small per-particle jitter so the fill front is organic, not a hard
    // flat line sweeping up.
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const y = positions[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(1e-6, maxY - minY);
    for (let i = 0; i < count; i++) {
      const y = positions[i * 3 + 1];
      const norm = (y - minY) / span; // 0 at bottom, 1 at top
      const jitter = (Math.random() - 0.5) * 0.08; // soften the fill front
      order[i] = Math.min(1, Math.max(0, norm + jitter));
    }

    return { positions, seeds, order };
  }, [count]);
}

export function ParticleSwarm({ tier, state, transitionSeconds = 0.9 }: Props) {
  const count = TIER_COUNT[tier] ?? TIER_COUNT.reduced;
  const { positions, seeds, order } = useParticleGeometry(count);

  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Live, eased uniform targets. We keep the *current* animated values in
  // refs and lerp them toward the incoming `state` each frame, so prop
  // changes glide instead of jumping.
  const current = useRef({
    reveal: state.revealFraction,
    energy: state.energy,
    color: new THREE.Color(state.color),
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: state.revealFraction },
      uEnergy: { value: state.energy },
      uColor: { value: new THREE.Color(state.color) },
      uCount: { value: count },
      // Pixel size scales down a touch on the reduced tier so denser-looking
      // coverage doesn't cost overdraw.
      uSize: { value: tier === "full" ? 14 : 10 },
    }),
    // Built once; values are mutated in-place each frame, never recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    // Smoothing factor from the configured transition time. Clamp so a
    // huge delta (tab refocus) can't overshoot.
    const k = Math.min(1, delta / Math.max(0.0001, transitionSeconds));

    current.current.reveal += (state.revealFraction - current.current.reveal) * k;
    current.current.energy += (state.energy - current.current.energy) * k;
    current.current.color.lerp(tmpColor.set(state.color), k);

    uniforms.uTime.value += delta;
    uniforms.uReveal.value = current.current.reveal;
    uniforms.uEnergy.value = current.current.energy;
    (uniforms.uColor.value as THREE.Color).copy(current.current.color);

    // Slow ambient rotation of the whole system — gives parallax/life even
    // when a scene is "calm". Rotation speed rides energy a little.
    const pts = pointsRef.current;
    if (pts) {
      pts.rotation.y += delta * (0.05 + current.current.energy * 0.12);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aSeed"
          args={[seeds, 1]}
        />
        <bufferAttribute
          attach="attributes-aOrder"
          args={[order, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Scratch color reused each frame so lerping toward the target allocates
// nothing in the render loop.
const tmpColor = new THREE.Color();

// --- Shaders -------------------------------------------------------------
// Position is displaced by cheap trig-noise driven by uTime/uEnergy so the
// swarm breathes. A particle draws only if its normalized index is under
// uReveal — that's how the fixed buffer "grows" without reallocation.

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uEnergy;
  uniform float uCount;
  uniform float uSize;

  attribute float aSeed;
  attribute float aOrder;

  varying float vAlpha;

  void main() {
    // aOrder is the particle's directional reveal threshold (baked from
    // height: low particles reveal first, filling upward). aSeed is used
    // only for motion desync below. Because aOrder is fixed per particle,
    // the same particles cross the threshold as uReveal rises — stable,
    // directional accumulation, not a scatter.
    float threshold = aOrder;
    float shown = step(threshold, uReveal);

    // Gentle drift: displace along a trig field. Amplitude/speed scale with
    // energy so calm scenes barely move and the finale churns.
    vec3 p = position;
    float amp = 0.05 + uEnergy * 0.25;
    float spd = 0.4 + uEnergy * 1.1;
    p.x += sin(uTime * spd + aSeed * 6.2831) * amp;
    p.y += cos(uTime * spd * 0.9 + aSeed * 6.2831) * amp;
    p.z += sin(uTime * spd * 1.1 + aSeed * 3.14159) * amp;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size attenuates with distance; hidden particles collapse to 0 so they
    // don't cost fill.
    gl_PointSize = uSize * shown * (1.0 / -mvPosition.z);

    // Fade newly-revealed particles in near the threshold edge for a soft
    // "arriving" look instead of a hard pop.
    float edge = smoothstep(threshold, threshold + 0.06, uReveal);
    vAlpha = shown * edge;
  }
`;

const FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.001) discard;
    // Round, soft-edged point sprite drawn procedurally from gl_PointCoord —
    // no texture needed.
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    float mask = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(uColor, vAlpha * mask);
  }
`;