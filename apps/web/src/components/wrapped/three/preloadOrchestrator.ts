// apps/web/src/components/wrapped/three/preloadOrchestrator.ts
//
// Owns the "preload stage N+1 during stage N's own animation window"
// decision (main playbook, Module 10). ONE orchestrator holds this —
// individual scene components never manage their own prefetching, so the
// scheduling logic lives in exactly one place and can't drift per-scene.
//
// Uses requestIdleCallback so prep work only runs in the gaps while the
// current scene is already animating for several real seconds — it never
// competes with the active frame. Falls back to a timer where rIC is
// unavailable (Safari historically). The "prep" for a stage is whatever
// that stage registers (e.g. warming a shader, generating a particle
// buffer) — this file schedules and dedupes; it doesn't know what the work
// is, which keeps it decoupled from the scenes themselves.

export type StageId = string;

// The unit of work a stage wants done ahead of time. Returns void or a
// promise; the orchestrator awaits neither hard — it fires and forgets,
// but tracks completion so a stage isn't prepped twice.
export type PrepFn = () => void | Promise<void>;

type Scheduled = { cancel: () => void };

// Minimal shim types so this compiles without lib.dom's experimental rIC
// typings and stays runnable in a plain test harness.
type IdleDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };
type IdleCallback = (deadline: IdleDeadlineLike) => void;

function scheduleIdle(cb: IdleCallback, timeout = 2000): Scheduled {
  const g = globalThis as unknown as {
    requestIdleCallback?: (cb: IdleCallback, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };

  if (typeof g.requestIdleCallback === "function") {
    const handle = g.requestIdleCallback(cb, { timeout });
    return { cancel: () => g.cancelIdleCallback?.(handle) };
  }

  // Fallback: run on a short timer with a synthetic deadline that reports
  // no time remaining, so prep fns that check timeRemaining() still behave.
  const handle = g.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 1);
  return { cancel: () => g.clearTimeout(handle) };
}

export class PreloadOrchestrator {
  // Prep fns registered per stage, in reveal order.
  private readonly stages: StageId[];
  private readonly prep = new Map<StageId, PrepFn>();

  // Stages already prepped (or in flight) — never run twice.
  private readonly done = new Set<StageId>();
  private pending: Scheduled | null = null;

  constructor(stagesInOrder: StageId[]) {
    this.stages = [...stagesInOrder];
  }

  // A stage registers the work it wants done before it's reached.
  register(stage: StageId, fn: PrepFn): void {
    this.prep.set(stage, fn);
  }

  // Called by the orchestrating component when a stage becomes active.
  // Schedules the NEXT stage's prep during this stage's idle time. Safe to
  // call repeatedly for the same active stage — the next stage is deduped.
  onStageActive(activeStage: StageId): void {
    const idx = this.stages.indexOf(activeStage);
    if (idx === -1) return;

    const next = this.stages[idx + 1];
    if (!next) return; // last stage, nothing ahead to prep
    if (this.done.has(next)) return; // already handled

    // Cancel any still-pending schedule from a prior active stage before
    // queuing the new one, so we never stack idle callbacks.
    this.pending?.cancel();

    this.pending = scheduleIdle(() => {
      this.runPrep(next);
    });
  }

  // Force a specific stage's prep immediately (e.g. user skipped ahead
  // fast and we didn't get idle time). Idempotent.
  prepNow(stage: StageId): void {
    this.runPrep(stage);
  }

  private runPrep(stage: StageId): void {
    if (this.done.has(stage)) return;
    this.done.add(stage); // mark before running so a throw doesn't cause a re-run loop
    const fn = this.prep.get(stage);
    if (!fn) return;
    try {
      // Fire and forget. A rejected promise here is non-fatal — the stage
      // will still render, just without the head start; swallow so one
      // stage's prep failure can't break the reveal.
      void Promise.resolve(fn()).catch(() => {});
    } catch {
      // sync throw — same reasoning, non-fatal
    }
  }

  isPrepped(stage: StageId): boolean {
    return this.done.has(stage);
  }

  dispose(): void {
    this.pending?.cancel();
    this.pending = null;
  }
}