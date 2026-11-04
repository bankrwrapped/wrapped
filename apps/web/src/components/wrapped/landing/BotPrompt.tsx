// The signature detail: a bot command typed out on one mono line with a
// caret, the way you'd actually ask Bankr for your Wrapped. Click copies the
// command. Used only where someone takes an action.
import { useState } from "react";
import { T } from "./tokens";

export function BotPrompt({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="bot-prompt"
      onClick={() => {
        void navigator.clipboard?.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      aria-label={`Copy command: ${command}`}
      style={wrap}
    >
      {label ? <span style={where}>{label}</span> : null}
      <span style={line}>
        <span style={{ color: T.accent }}>&gt;</span>
        <span style={cmd}>{command}</span>
        <span className="bot-caret" aria-hidden style={caret} />
      </span>
      <span style={hint}>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

const wrap: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 16px",
  borderRadius: "10px",
  border: `1px solid ${T.border}`,
  background: T.deep,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: T.fontMono,
  fontSize: "13px",
  lineHeight: "20px",
  color: T.text,
};

const where: React.CSSProperties = { color: T.textFaint, flex: "none" };
const line: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flex: 1,
  minWidth: 0,
};
const cmd: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const caret: React.CSSProperties = {
  width: "8px",
  height: "16px",
  background: T.text,
  flex: "none",
};
const hint: React.CSSProperties = { color: T.textFaint, flex: "none" };
