// apps/web/src/components/wrapped/terminal/CommandLine.tsx
//
// Renders one terminal command (e.g. "$ bankr scan --deployments") typing
// out character-by-character in Departure Mono, followed by a blinking
// cursor. This is the "command phase" of each scene's two-phase execution
// (command → processing → response), per the locked REPL model.
//
// Interaction contract (locked 2026-08-15):
//   - `skip` prop flips to true when the user gives input mid-type → the
//     command completes to full text instantly (no partial state left).
//   - onComplete() fires once the command is fully shown, so the
//     orchestrator can advance to the processing beat.
// The component never listens for input itself — the orchestrator owns
// input and passes `skip` down, so one place governs the whole session's
// input semantics.
//
// prefers-reduced-motion: typing is skipped entirely, command shown at
// once, onComplete fires next tick — no per-character animation.

import { useEffect, useRef, useState } from "react";

type Props = {
  // The full command text, including the leading prompt (e.g. "$ bankr …").
  // Caller owns the prompt string so different scenes can vary it.
  text: string;
  // Ms per character. ~28ms reads as brisk-but-legible typing.
  speedMs?: number;
  // Flip to true to force-complete immediately (user skipped).
  skip?: boolean;
  // Fires once, when the full text is shown.
  onComplete?: () => void;
  // Show the blinking cursor after completion (the orchestrator may hide it
  // during the processing beat and re-show it as the prompt for "next").
  showCursorWhenDone?: boolean;
  className?: string;
};

export function CommandLine({
  text,
  speedMs = 28,
  skip = false,
  onComplete,
  showCursorWhenDone = true,
  className,
}: Props) {
  const [shownCount, setShownCount] = useState(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fire completion exactly once.
  const fireDone = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current?.();
  };

  // Reduced motion OR skip → jump straight to full text.
  useEffect(() => {
    if (reduceMotion) {
      setShownCount(text.length);
      // next tick so parent state settles before onComplete
      const id = setTimeout(fireDone, 0);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduceMotion]);

  useEffect(() => {
    if (skip && !doneRef.current) {
      setShownCount(text.length);
      fireDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, text]);

  // The typing timer.
  useEffect(() => {
    if (reduceMotion || doneRef.current) return;
    if (shownCount >= text.length) {
      fireDone();
      return;
    }
    const id = setTimeout(() => setShownCount((c) => c + 1), speedMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownCount, text, speedMs, reduceMotion]);

  const shown = text.slice(0, shownCount);
  const isDone = shownCount >= text.length;
  const cursorVisible = isDone ? showCursorWhenDone : true;

  return (
    <div style={rowStyle} className={className}>
      <span style={textStyle}>{shown}</span>
      {cursorVisible ? <span style={cursorStyle} aria-hidden>▋</span> : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, 'Departure Mono', ui-monospace, monospace)",
  fontSize: "0.95rem",
  letterSpacing: "0.02em",
  color: "var(--muted-foreground)",
  display: "flex",
  alignItems: "center",
  gap: "0.1em",
  whiteSpace: "pre",
};

const textStyle: React.CSSProperties = {
  // Command text sits a touch brighter than a comment but below hero white.
  color: "var(--foreground)",
  opacity: 0.85,
};

// Blinking cursor via inline animation name; the keyframes live in
// styles.css (added with the terminal utilities). Falls back to a steady
// block if the keyframes aren't present — still readable.
const cursorStyle: React.CSSProperties = {
  animation: "terminal-cursor-blink 1s steps(1) infinite",
  color: "var(--accent)",
  marginLeft: "0.05em",
};