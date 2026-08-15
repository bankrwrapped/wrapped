// apps/web/src/components/wrapped/terminal/sceneContract.ts
//
// The shared contract between the TerminalSession orchestrator and every
// individual scene. Defined once so the orchestrator and the scenes can't
// drift — the orchestrator drives scenes through this shape, and each scene
// implements it.
//
// Design intent: scenes are DUMB about timing and input. The orchestrator
// owns when a scene's command types, when the response reveals, and all
// input handling. A scene just: declares its command + swarm targets, and
// renders its response given a "revealed" flag. This keeps the session's
// forward-only/skip/auto-advance semantics in ONE place.

import type { SwarmState } from "../three/ParticleSwarm";
import type { WrappedProfile } from "@/lib/wrapped-data";

// The per-scene swarm targets — what the shared swarm should animate toward
// while this scene is active. The orchestrator hands these to the swarm; the
// scene never touches the swarm directly (locked integration boundary: the
// visual layer only reacts to existing state, never runs its own loop).
export type SceneSwarmTargets = {
  color: SwarmState["color"];
  energy: number;
  // The reveal fraction the swarm should reach BY THE END of this scene.
  // Accumulation across scenes = these rising toward 1 at the finale. The
  // orchestrator computes the actual hybrid floor+magnitude value and may
  // scale this per-user; this is the scene's nominal target.
  revealTarget: number;
};

// A scene definition. Data-driven where possible so the orchestrator can
// sequence and preload generically.
export type SceneDef = {
  id: string;
  // The command line issued for this scene (prompt included).
  command: string;
  // Swarm targets while active.
  swarm: SceneSwarmTargets;
  // Milliseconds the "processing" beat holds AFTER the command finishes
  // typing and BEFORE the response reveals. For the volume finale this is
  // where the real indexer fetch hides; for fast scenes it's short.
  processingMs: number;
  // How long the fully-revealed response holds before auto-advance (if the
  // user gives no input). The command-typing and processing durations are
  // added to this by the orchestrator to get the scene's total.
  holdMs: number;
  // The short result token shown in the scrollback log once complete
  // (e.g. "14 tokens"). Derived from the profile.
  resultToken: (p: WrappedProfile) => string;
  // Optional prep hook registered with the preload orchestrator — run
  // during the PREVIOUS scene's idle time (e.g. warm a heavy computation).
  prep?: (p: WrappedProfile) => void;
};

// Props every scene component receives from the orchestrator.
export type SceneComponentProps = {
  profile: WrappedProfile;
  // False during command-typing + processing; true once the orchestrator
  // decides the response should appear. Scenes animate their reveal off
  // this rather than owning their own timer.
  revealed: boolean;
  // True when the user has requested skip-to-complete for this scene —
  // scenes should jump any internal count-ups/animations to final state.
  skip: boolean;
  // Called by a scene if it finishes an internal reveal animation and wants
  // to signal readiness (optional; most scenes don't need it — the
  // orchestrator's timing is authoritative).
  onResponseShown?: () => void;
};