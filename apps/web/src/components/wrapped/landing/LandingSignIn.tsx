// apps/web/src/components/wrapped/landing/LandingSignIn.tsx
//
// Lookup + token block, two columns:
//   LEFT  — look up any handle's Wrapped (no sign-in: it's public on-chain data)
//   RIGHT — the official $BNW token: official line → big ticker + logo → CA
//           copy field → explorer link. The ticker's size carries the
//           emphasis, not glow.
//
// Stacks on mobile. The header's "Look up" button focuses the hero field.

import { useState } from "react";

import { Lookup } from "./Lookup";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow, h2Style, leadStyle, panel, sectionStyle } from "./tokens";

const BNW_CA = "0x00de0f4f3ff55523bec004496bab10cacbfc0ba3";
const EXPLORER_URL = `https://robinhoodchain.blockscout.com/token/${BNW_CA}`;

export function LandingSignIn() {
  const mobile = useIsMobile();

  return (
    <section id="lookup-block" style={sectionStyle(mobile)}>
      <div style={eyebrow}>Look up</div>
      <h2 style={h2Style(mobile)}>See anyone's year on Bankr</h2>
      <p style={leadStyle}>
        No sign-in. Wrapped is built from public on-chain data, so any X handle with a Bankr wallet
        has one. The official $BNW contract sits alongside, ready to copy.
      </p>

      <div style={split(mobile)}>
        {/* LEFT — lookup */}
        <div style={signinCol}>
          <div style={colLabel}>Find a Wrapped</div>
          <Lookup size="md" />
          <p style={signinNote}>
            Start typing a handle to see suggestions, or enter it in full. Every Wrapped has its own
            link to share.
          </p>
        </div>

        {/* RIGHT — token */}
        <div style={tokenCol}>
          <div style={badge}>
            <CheckIcon />
            Official $BNW, the original token on Robinhood Chain
          </div>

          <div style={tickerRow}>
            <img src="/logo.png" alt="$BNW" style={tokenLogo} />
            <span style={ticker}>$BNW</span>
          </div>

          <CopyField value={BNW_CA} />

          <a href={EXPLORER_URL} target="_blank" rel="noreferrer" style={explorerLink}>
            View on Robinhood Chain explorer
          </a>
        </div>
      </div>
    </section>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      style={caRow}
    >
      <span style={caLbl}>Contract</span>
      <span style={caText}>{value}</span>
      <span style={caCopy}>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={T.accent} />
      <path
        d="M7 12.5l3.2 3.2L17 9"
        stroke={T.ink}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const split = (m: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: m ? "minmax(0, 1fr)" : "minmax(0, 0.85fr) minmax(0, 1.15fr)",
  gap: m ? "16px" : "24px",
  marginTop: "40px",
  alignItems: "stretch",
});

const signinCol: React.CSSProperties = {
  ...panel,
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const colLabel: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
};

const signinNote: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "14px",
  lineHeight: "20px",
  color: T.textDim,
  margin: 0,
};

const tokenCol: React.CSSProperties = {
  ...panel,
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontFamily: T.fontBody,
  fontWeight: 500,
  fontSize: "15px",
  lineHeight: "20px",
  color: T.text,
};

const tickerRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "16px" };
const tokenLogo: React.CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "12px",
  objectFit: "contain",
};
const ticker: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 400,
  fontSize: "56px",
  letterSpacing: "-0.03em",
  color: T.text,
  lineHeight: 1,
};

const caRow: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  height: "44px",
  padding: "0 16px",
  borderRadius: "10px",
  border: `1px solid ${T.border}`,
  background: T.deep,
  cursor: "pointer",
  fontFamily: T.fontMono,
  fontSize: "12px",
};
const caLbl: React.CSSProperties = { color: T.textFaint, flex: "none" };
const caText: React.CSSProperties = {
  flex: 1,
  fontSize: "13px",
  color: T.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "left",
};
const caCopy: React.CSSProperties = { color: T.textDim, flex: "none" };

const explorerLink: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "14px",
  lineHeight: "20px",
  color: T.textDim,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  alignSelf: "flex-start",
};
