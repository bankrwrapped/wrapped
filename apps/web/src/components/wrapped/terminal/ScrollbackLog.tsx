// apps/web/src/components/wrapped/terminal/ScrollbackLog.tsx
//
// The forward-only-with-replay mechanic (locked 2026-08-15). A real
// terminal session doesn't rewind execution — but every past command and
// its result stay visible above the live line, and you can look back at
// them without moving your position. That's exactly the model here:
//
//   - Each completed scene collapses into ONE compact log line here
//     (command + a short result token, e.g. "$ bankr scan --deployments
//     → 14 tokens").
//   - Tapping a past line REPLAYS that scene's response (via onReplay) —
//     the parent briefly re-shows that scene, and the swarm can re-adopt
//     its color/behavior — WITHOUT changing the live forward position.
//     Reviewing is not navigating back; when you stop, you're still where
//     you left off.
//
// This component is presentational: it renders the log and reports taps.
// The parent (TerminalSession) owns the entries and what "replay" does.

type LogEntry = {
  // Stable id (scene id).
  id: string;
  // The command text as it was issued (leading prompt included).
  command: string;
  // A short result token summarizing the response, e.g. "14 tokens",
  // "0.84 ETH", "$5.01B+". Kept terse — the full response lives in the
  // scene, this is just the ledger line.
  result?: string;
};

type Props = {
  entries: LogEntry[];
  // The scene currently being replayed (if any), for highlight state.
  replayingId?: string | null;
  onReplay: (id: string) => void;
  className?: string;
};

export type { LogEntry };

export function ScrollbackLog({ entries, replayingId, onReplay, className }: Props) {
  if (entries.length === 0) return null;

  return (
    <ul style={listStyle} className={className} aria-label="Session history">
      {entries.map((e) => {
        const active = e.id === replayingId;
        return (
          <li key={e.id} style={itemStyle}>
            <button
              type="button"
              onClick={() => onReplay(e.id)}
              style={active ? { ...lineButton, ...lineButtonActive } : lineButton}
              // Replaying is a review action, not navigation — make that
              // clear to assistive tech.
              aria-label={`Replay ${e.command}`}
            >
              <span style={cmdStyle}>{e.command}</span>
              {e.result ? (
                <>
                  <span style={arrowStyle} aria-hidden>
                    {" → "}
                  </span>
                  <span style={resultStyle}>{e.result}</span>
                </>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  fontFamily: "var(--font-mono, 'Departure Mono', ui-monospace, monospace)",
  fontSize: "0.78rem",
  // The log sits quiet above the live scene — dimmed, so it reads as
  // history, not competing content.
  opacity: 0.55,
};

const itemStyle: React.CSSProperties = {
  margin: 0,
};

const lineButton: React.CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: "none",
  padding: "0.1rem 0.2rem",
  margin: 0,
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  color: "var(--muted-foreground)",
  whiteSpace: "pre",
  overflow: "hidden",
  textOverflow: "ellipsis",
  borderRadius: "0.25rem",
  transition: "color 150ms ease, background-color 150ms ease",
};

const lineButtonActive: React.CSSProperties = {
  color: "var(--accent)",
  backgroundColor: "color-mix(in oklch, var(--accent) 12%, transparent)",
};

const cmdStyle: React.CSSProperties = {
  color: "inherit",
};

const arrowStyle: React.CSSProperties = {
  color: "var(--muted-foreground)",
  opacity: 0.7,
};

const resultStyle: React.CSSProperties = {
  color: "var(--foreground)",
  opacity: 0.7,
};