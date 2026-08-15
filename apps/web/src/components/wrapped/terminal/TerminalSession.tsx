// apps/web/src/components/wrapped/terminal/TerminalSession.tsx
//
// The reveal orchestrator — replaces the scrapped WrappedStory.tsx. This is
// the single source of truth for WHEN each stage is ready; the swarm and
// the scenes are presentation that react to the state it holds (locked
// integration boundary: the visual layer never runs its own timer/loop).
//
// Owns, in one place:
//   - the scene sequence and current position (forward-only)
//   - each scene's two-phase timing: command types → processing beat →
//     response reveals, then holds; auto-advances if no input
//   - the unified input contract: first input completes the current phase
//     (skip typing / skip processing to reveal); second input (once
//     revealed) advances; no input auto-advances after the hold
//   - the shared SwarmState fed to the persistent swarm (color/energy/
//     revealFraction), eased by the swarm itself
//   - scrollback + replay: completed scenes collapse into the log; tapping
//     one replays its response WITHOUT moving the live position
//   - preload: registers each scene's prep to run during the prior scene's
//     idle time
//
// NOTE: React logic typechecked; not render-verified here (WebGL + live
// tree need your machine).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Backdrop } from "./Backdrop";
import { CommandLine } from "./CommandLine";
import { ScrollbackLog, type LogEntry } from "./ScrollbackLog";
import { SwarmBoundary } from "../three/SwarmBoundary";
import { PreloadOrchestrator } from "../three/preloadOrchestrator";
import type { SwarmState } from "../three/ParticleSwarm";
import type {
  SceneComponentProps,
  SceneDef,
} from "./sceneContract";
import type { WrappedProfile } from "@/lib/wrapped-data";

// Phase within a single scene.
type Phase = "typing" | "processing" | "revealed";

type Props = {
  profile: WrappedProfile;
  scenes: SceneDef[];
  // Maps a scene id → its React component. Kept separate from SceneDef so
  // the defs stay serializable/data-only and the components are wired here.
  render: Record<string, React.ComponentType<SceneComponentProps>>;
  // Fired when the user advances past the last scene (→ share card handled
  // by parent, since the share card breaks out of terminal framing).
  onComplete?: () => void;
};

export function TerminalSession({ profile, scenes, render, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  // Skip signal for the current scene's CommandLine + scene component.
  const [skip, setSkip] = useState(false);
  // Completed scenes as scrollback entries.
  const [log, setLog] = useState<LogEntry[]>([]);
  // Which scene (if any) is being REPLAYED — an overlay review, not a
  // position change. null = live.
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const last = scenes.length - 1;
  const scene = scenes[index];

  // --- Preload orchestrator ------------------------------------------------
  const preload = useMemo(() => {
    const po = new PreloadOrchestrator(scenes.map((s) => s.id));
    scenes.forEach((s) => {
      if (s.prep) po.register(s.id, () => s.prep!(profile));
    });
    return po;
    // scenes/profile are stable for a given session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => preload.dispose(), [preload]);

  // When a scene becomes active, ask the orchestrator to prep the NEXT one
  // during this scene's idle time.
  useEffect(() => {
    if (scene) preload.onStageActive(scene.id);
  }, [scene, preload]);

  // --- Swarm state ---------------------------------------------------------
  // The swarm reads color/energy from the ACTIVE (or replayed) scene, and a
  // revealFraction that ACCUMULATES: it should never drop as you move
  // forward, so we take the max revealTarget up to and including the current
  // scene. During a replay we temporarily adopt the replayed scene's
  // color/energy for review, but keep the accumulated reveal fraction (the
  // swarm doesn't lose particles because you looked back).
  const activeForVisual = replayingId
    ? scenes.find((s) => s.id === replayingId) ?? scene
    : scene;

  const accumulatedReveal = useMemo(() => {
    let r = 0;
    for (let i = 0; i <= index; i++) r = Math.max(r, scenes[i].swarm.revealTarget);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const swarmState: SwarmState = {
    color: activeForVisual.swarm.color,
    energy: activeForVisual.swarm.energy,
    // Before a scene's response reveals, hold the PRIOR accumulated reveal;
    // the burst to this scene's target lands when the response reveals, so
    // swarm growth reads as caused by the number, not the command.
    revealFraction:
      phase === "revealed" || replayingId
        ? accumulatedReveal
        : priorAccumulatedReveal(scenes, index),
  };

  // --- Phase timing --------------------------------------------------------
  // typing → (CommandLine.onComplete) → processing → (timer) → revealed →
  // (hold timer) → advance. Skip collapses whatever the current phase is.

  const advance = useCallback(() => {
    setReplayingId(null);
    if (index >= last) {
      onComplete?.();
      return;
    }
    // Commit the finished scene to the scrollback log.
    const finished = scenes[index];
    setLog((l) =>
      l.some((e) => e.id === finished.id)
        ? l
        : [...l, { id: finished.id, command: finished.command, result: finished.resultToken(profile) }],
    );
    setIndex((i) => Math.min(last, i + 1));
    setPhase("typing");
    setSkip(false);
  }, [index, last, onComplete, profile, scenes]);

  // Command finished typing → enter processing.
  const onCommandComplete = useCallback(() => {
    setPhase((p) => (p === "typing" ? "processing" : p));
  }, []);

  // Processing beat → reveal.
  useEffect(() => {
    if (phase !== "processing") return;
    // Skip shortens processing to ~0.
    const ms = skip ? 0 : scene.processingMs;
    const id = setTimeout(() => setPhase("revealed"), ms);
    return () => clearTimeout(id);
  }, [phase, skip, scene]);

  // Revealed → auto-advance after hold (unless replaying).
  useEffect(() => {
    if (phase !== "revealed" || replayingId) return;
    const id = setTimeout(advance, scene.holdMs);
    return () => clearTimeout(id);
  }, [phase, replayingId, scene, advance]);

  // --- Input ---------------------------------------------------------------
  // First input while typing/processing → skip to reveal. Input while
  // revealed → advance. Input during replay → exit replay, back to live.
  const handleInput = useCallback(() => {
    if (replayingId) {
      setReplayingId(null);
      return;
    }
    if (phase === "revealed") {
      advance();
    } else {
      // Force-complete the current phase toward reveal.
      setSkip(true);
      if (phase === "typing") setPhase("processing");
      else if (phase === "processing") setPhase("revealed");
    }
  }, [phase, replayingId, advance]);

  // Keyboard: Enter/Space = input. Bind once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleInput]);

  const onReplay = useCallback(
    (id: string) => {
      // Only allow replaying already-completed scenes (in the log).
      setReplayingId(id);
    },
    [],
  );

  // Which scene component + props to render in the main stage. During
  // replay, show the replayed scene fully revealed; otherwise the live one.
  const stageId = replayingId ?? scene.id;
  const StageComponent = render[stageId];
  const stageProfile = profile;
  const stageRevealed = replayingId ? true : phase === "revealed";
  const stageSkip = replayingId ? true : skip;

  return (
    <Backdrop>
      {/* Persistent swarm — one instance for the whole session, never
          remounted between scenes. Sits behind the terminal content. */}
      <SwarmBoundary state={swarmState} className="swarm-layer" />

      {/* Tap surface: the whole stage advances/ skips on tap (mobile). No
          left/right zones — forward-only. Replay taps are on the log
          buttons, which stop propagation implicitly via their own onClick. */}
      <div
        style={stageWrap}
        onClick={handleInput}
        role="presentation"
      >
        <div style={inner}>
          {/* Scrollback log — completed commands, tap to replay. */}
          <ScrollbackLog
            entries={log}
            replayingId={replayingId}
            onReplay={onReplay}
          />

          {/* The live (or replayed) command line. During replay we show the
              replayed scene's command already complete. */}
          <div style={commandWrap}>
            <CommandLine
              key={stageId + (replayingId ? "-replay" : "")}
              text={replayingId ? findCommand(scenes, stageId) : scene.command}
              skip={stageSkip}
              onComplete={replayingId ? undefined : onCommandComplete}
              showCursorWhenDone={stageRevealed}
            />
          </div>

          {/* The scene's response. */}
          <div style={responseWrap}>
            {StageComponent ? (
              <StageComponent
                profile={stageProfile}
                revealed={stageRevealed}
                skip={stageSkip}
              />
            ) : null}
          </div>

          {replayingId ? (
            <p style={replayHint}>reviewing — tap to return</p>
          ) : null}
        </div>
      </div>
    </Backdrop>
  );
}

// The accumulated reveal fraction for all scenes BEFORE `index` — i.e. the
// resting reveal the swarm holds until this scene's response fires its
// burst.
function priorAccumulatedReveal(scenes: SceneDef[], index: number): number {
  let r = 0;
  for (let i = 0; i < index; i++) r = Math.max(r, scenes[i].swarm.revealTarget);
  return r;
}

function findCommand(scenes: SceneDef[], id: string): string {
  return scenes.find((s) => s.id === id)?.command ?? "";
}

const stageWrap: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  cursor: "pointer",
};

const inner: React.CSSProperties = {
  position: "relative",
  margin: "0 auto",
  display: "flex",
  minHeight: "100vh",
  width: "100%",
  maxWidth: "36rem",
  flexDirection: "column",
  justifyContent: "center",
  gap: "1.25rem",
  padding: "2rem 1.25rem",
};

const commandWrap: React.CSSProperties = {
  minHeight: "1.5rem",
};

const responseWrap: React.CSSProperties = {
  minHeight: "8rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const replayHint: React.CSSProperties = {
  textAlign: "center",
  fontFamily: "var(--font-mono, 'Departure Mono', ui-monospace, monospace)",
  fontSize: "0.72rem",
  color: "var(--muted-foreground)",
  opacity: 0.6,
};