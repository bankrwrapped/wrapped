// apps/web/src/components/wrapped/landing/LandingSkill.tsx
//
// Skill-install section: copyable skill link, the four install steps, and the
// two "ask for it" paths (on X / in Bankr chat) as bot prompts. Static
// content, no per-user data here.

import { useState } from "react";

import { BotPrompt } from "./BotPrompt";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow, h2Style, panel, sectionStyle } from "./tokens";

const SKILL_LINK = "https://github.com/bankrwrapped/wrapped/tree/main/skills/bankr-wrapped";

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

function renderStep(step: string) {
  if (!step.includes("bankr.bot")) return step;
  const [before, after] = step.split("bankr.bot");
  return (
    <>
      {before}
      <a
        href="https://bankr.bot"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "3px" }}
      >
        bankr.bot
      </a>
      {after}
    </>
  );
}

export function LandingSkill() {
  const mobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  return (
    <section style={sectionStyle(mobile)}>
      <div style={eyebrow}>For builders, install once</div>
      <h2 style={h2Style(mobile)}>Set up the Bankr Wrapped skill</h2>

      <div
        style={{
          ...grid,
          gridTemplateColumns: mobile ? "minmax(0, 1fr)" : "minmax(0, 1.2fr) minmax(0, 0.8fr)",
        }}
      >
        <div>
          <div style={{ ...panel, padding: "20px 24px" }}>
            <div style={label}>Skill link</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <div style={linkField}>{SKILL_LINK}</div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(SKILL_LINK);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="btn-secondary"
                style={copyBtn}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <ol style={{ ...steps, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
            {STEPS.map((s, i) => (
              <li key={s} style={{ ...panel, padding: "16px 20px" }}>
                <div style={stepN}>{i + 1}</div>
                <p style={stepP}>{renderStep(s)}</p>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div style={label}>Then ask, either way</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            {PATHS.map((p) => (
              <div key={p.where}>
                <div style={pathWhere}>{p.where}</div>
                <BotPrompt command={p.cmd} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const grid: React.CSSProperties = { display: "grid", gap: "24px", marginTop: "40px" };

const label: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
};

const linkField: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: "40px",
  padding: "0 12px",
  display: "flex",
  alignItems: "center",
  borderRadius: "10px",
  border: `1px solid ${T.border}`,
  background: T.deep,
  fontFamily: T.fontMono,
  fontSize: "13px",
  color: T.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const copyBtn: React.CSSProperties = {
  height: "40px",
  padding: "0 16px",
  borderRadius: "10px",
  border: `1px solid ${T.borderStrong}`,
  fontFamily: T.fontBody,
  fontWeight: 500,
  fontSize: "14px",
  color: T.text,
  background: T.raised,
  cursor: "pointer",
  flex: "none",
};

const steps: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  display: "grid",
  gap: "12px",
  margin: "12px 0 0",
};

const stepN: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
};
const stepP: React.CSSProperties = {
  fontFamily: T.fontBody,
  margin: "8px 0 0",
  fontSize: "15px",
  color: T.text,
  lineHeight: "22px",
};

const pathWhere: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "13px",
  lineHeight: "20px",
  color: T.textDim,
  marginBottom: "8px",
};
