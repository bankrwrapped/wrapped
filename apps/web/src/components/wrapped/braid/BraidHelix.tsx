// apps/web/src/components/wrapped/braid/BraidHelix.tsx
//
// Phase 1 of 4 — the double-helix geometry. Two strands (violet + orange)
// winding around a shared axis, built as tube geometry along parametric
// curves. Idle rotation only. NO scroll, NO camera choreography, NO data
// attachment yet — those are phases 2-4.
//
// The helix runs vertically (along Y) so it reads as a strand the page
// scrolls past later. For now it just exists, rotates slowly, and sits
// behind the DOM.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { T } from "../landing/tokens";

// How many full twists over the strand's length, and how long it is.
const TURNS = 5;
const LENGTH = 60; // world units along Y
const RADIUS = 1.6; // how far each strand sits from the central axis
const TUBE_RADIUS = 0.09;
const SEGMENTS = 400;

// Build a helical curve. `phase` offsets the second strand half a turn round
// so the two braid around each other instead of overlapping.
function makeHelixCurve(phase: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS; // 0..1
    const angle = t * Math.PI * 2 * TURNS + phase;
    const y = (t - 0.5) * LENGTH; // centered on origin
    pts.push(new THREE.Vector3(Math.cos(angle) * RADIUS, y, Math.sin(angle) * RADIUS));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function Strand({ phase, color, emissive }: { phase: number; color: string; emissive: string }) {
  const geometry = useMemo(() => {
    const curve = makeHelixCurve(phase);
    return new THREE.TubeGeometry(curve, SEGMENTS, TUBE_RADIUS, 12, false);
  }, [phase]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={0.6}
        roughness={0.35}
        metalness={0.1}
        toneMapped={false}
      />
    </mesh>
  );
}

export function BraidHelix() {
  const groupRef = useRef<THREE.Group>(null);

  // Idle rotation — slow, continuous. Phase 2 will hand control of the
  // camera to scroll; for now the braid itself turns so it reads as alive.
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Violet strand — the ambient/base color. */}
      <Strand phase={0} color={T.violet} emissive={T.violetDeep} />
      {/* Orange strand — braids around, half a turn offset. */}
      <Strand phase={Math.PI} color={T.orange} emissive={"#a63d00"} />
    </group>
  );
}