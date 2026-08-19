// apps/web/src/components/wrapped/landing/LandingSkill.tsx
//
// Skill-install section — second to last, before the footer (locked order).
// Copyable skill link, the four install steps, and the two "ask for it"
// paths (on X / in Bankr chat). Matches the approved mockup. Static content
// — no per-user data here.

import { useState } from "react";

import { T, glass, eyebrow } from "./tokens";

const SKILL_LINK = "https://bankrwrapped.com/skill/bankr-wrapped.json";

const STEPS = [
  "Go to bankr.bot",
  "Paste the skill link in the agent chat",
  "Ask Bankr to install it",
  "Ask for your Wrapped",
];

const PATHS = [
  { where: "On X", cmd: "@bankrbot show me my Bankr Wrapped" },
  { where: "In Bankr chat", cmd: "show me my Bankr Wrapped" },
];

export function LandingSkill() {
  const [copied, setCopied] = useState(false);

  return (
    <section style={block}>
      <div style={{ ...eyebrow, color: T.violetBright }}>builder · install once</div>
      <h2 style={h2}>Set up the Bankr Wrapped skill.</h2>

      <div style={grid}>
        <div>
          <div style={{ ...glass, padding: "22px 24px" }}>
            <div style={{ ...caLbl, marginBottom: "10px" }}>Skill link</div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={linkField}>{SKILL_LINK}</div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(SKILL_LINK);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                style={copyBtn}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div style={steps}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ ...glass, padding: "16px" }}>
                <div style={stepN}>{String(i + 1).padStart(2, "0")}</div>
                <p style={stepP}>{s}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ ...caLbl, marginBottom: "12px" }}>Then ask, either way</div>
          {PATHS.map((p) => (
            <div key={p.where} style={{ ...glass, padding: "16px", marginBottom: "12px" }}>
              <div style={pathWhere}>{p.where}</div>
              <code style={pathCode}>{p.cmd}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const block: React.CSSProperties = {
  padding: "120px 0",
  position: "relative",
  zIndex: 2,
  maxWidth: "1180px",
  margin: "0 auto",
};

const h2: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(30px, 4.5vw, 52px)",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  margin: "16px 0 22px",
  color: T.text,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: "24px",
  marginTop: "40px",
};

const caLbl: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textFaint,
};

const linkField: React.CSSProperties = {
  flex: 1,
  minWidth: "220px",
  padding: "12px 15px",
  borderRadius: "10px",
  border: `1px solid ${T.border}`,
  background: "rgba(0,0,0,0.3)",
  fontFamily: T.fontMono,
  fontSize: "12.5px",
  color: T.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const copyBtn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "10px",
  border: `1px solid ${T.borderStrong}`,
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: T.violetBright,
  background: "transparent",
  cursor: "pointer",
};

const steps: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  marginTop: "16px",
};

const stepN: React.CSSProperties = { fontFamily: T.fontMono, fontSize: "10px", color: T.violet };
const stepP: React.CSSProperties = {
  fontFamily: T.fontBody,
  marginTop: "8px",
  fontSize: "14px",
  color: T.text,
  lineHeight: 1.4,
};

const pathWhere: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "9.5px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.orangeBright,
};

const pathCode: React.CSSProperties = {
  display: "block",
  marginTop: "9px",
  padding: "11px",
  borderRadius: "8px",
  background: "rgba(0,0,0,0.3)",
  border: `1px solid ${T.border}`,
  fontFamily: T.fontMono,
  fontSize: "11.5px",
  color: T.text,
};