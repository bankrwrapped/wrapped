// apps/web/src/components/wrapped/landing/LandingSignIn.tsx
//
// Merged sign-in + token block, now SPLIT into two columns:
//   LEFT  — Connect X / "see your year" (lighter weight)
//   RIGHT — the $BNW token, emphasized: an orange-accented glowing panel with
//           its elements stacked step-wise — official badge → big ticker +
//           logo → CA copy field → explorer link. More visual weight than the
//           sign-in side so the eye lands on the token first.
//
// Locked: no OAuth for now — Connect X routes to /soon. Generate only shows
// if signed-in (currently never, since auth is deferred). Stacks on mobile.
// id="signin-block" preserved.

import { useState } from "react";

import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow } from "./tokens";

const BNW_CA = "0x00de0f4f3ff55523bec004496bab10cacbfc0ba3";
const EXPLORER_URL = `https://robinhoodchain.blockscout.com/token/${BNW_CA}`;

export function LandingSignIn() {
  const mobile = useIsMobile();

  const connect = () => window.location.assign("/soon");

  return (
    <section id="signin-block" style={block(mobile)}>
      <div style={{ ...eyebrow, color: T.orangeBright }}>system · authenticate + token</div>
      <h2 style={h2(mobile)}>Connect X. See your year.</h2>
      <p style={lead}>Sign in on the left. Grab the official $BNW token on the right.</p>

      <div style={split(mobile)}>
        {/* LEFT — sign in (lighter) */}
        <div style={signinCol}>
          <div style={colLabel}>Get your Wrapped</div>
          <button type="button" onClick={connect} style={btnX}>
            <XIcon /> Connect X account
          </button>
          <p style={signinNote}>
            We read your on-chain year and hand it back to you. Nothing personal is shown until
            you're signed in.
          </p>
        </div>

        {/* RIGHT — token (emphasized, stacked step-wise) */}
        <div style={tokenCol}>
          {/* Step 1: official badge, big so it can't be missed */}
          <div style={badge}>
            <CheckIcon />
            The official $BNW · original token on Robinhood Chain
          </div>

          {/* Step 2: big ticker + logo */}
          <div style={tickerRow}>
            <img src="/logo.png" alt="$BNW" style={tokenLogo} />
            <span style={ticker}>$BNW</span>
          </div>

          {/* Step 3: CA copy field */}
          <CopyField value={BNW_CA} />

          {/* Step 4: explorer link */}
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer" style={explorerLink}>
            View on Robinhood Chain explorer ↗
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

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7 8 7.9 12h-6.3l-5-7.3L5.4 22H2.3l7.3-8.3L2 2h6.4l4.7 6.9L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={T.orange} />
      <path d="M7 12.5l3.2 3.2L17 9" stroke="#0c0a09" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const block = (m: boolean): React.CSSProperties => ({
  padding: m ? "80px 0" : "120px 0",
  position: "relative",
  zIndex: 2,
  maxWidth: "1180px",
  margin: "0 auto",
});

const h2 = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: m ? "clamp(26px, 8vw, 38px)" : "clamp(30px, 4.5vw, 52px)",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  margin: "16px 0 22px",
  color: T.text,
});

const lead: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "17px",
  lineHeight: 1.55,
  color: T.textDim,
  maxWidth: "46ch",
};

const split = (m: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: m ? "1fr" : "0.85fr 1.15fr", // token side wider = more emphasis
  gap: m ? "18px" : "24px",
  marginTop: "40px",
  alignItems: "stretch",
});

// LEFT — lighter
const signinCol: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: "20px",
  padding: "32px 28px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent)",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const colLabel: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: T.textFaint,
};

const btnX: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  padding: "18px 26px",
  borderRadius: "14px",
  background: "linear-gradient(180deg, rgba(159,123,255,0.28), rgba(124,60,255,0.12))",
  border: "1px solid rgba(159,123,255,0.35)",
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "17px",
  color: "#fff",
  cursor: "pointer",
};

const signinNote: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "13.5px",
  lineHeight: 1.55,
  color: T.textFaint,
  margin: 0,
};

// RIGHT — emphasized token panel (orange accent + glow)
const tokenCol: React.CSSProperties = {
  border: "1px solid rgba(255,122,26,0.35)",
  borderRadius: "20px",
  padding: "30px 28px",
  background:
    "radial-gradient(90% 120% at 50% -10%, rgba(255,122,26,0.16), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
  boxShadow: "0 30px 80px -40px rgba(255,122,26,0.5)",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "9px",
  alignSelf: "flex-start",
  padding: "10px 16px",
  borderRadius: "999px",
  border: "1px solid rgba(255,122,26,0.45)",
  background: "rgba(255,122,26,0.1)",
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "15px", // bigger so it's not missed
  letterSpacing: "-0.01em",
  color: T.orangeBright,
  lineHeight: 1.3,
};

const tickerRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "14px" };
const tokenLogo: React.CSSProperties = { width: "48px", height: "48px", borderRadius: "12px", objectFit: "contain" };
const ticker: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(36px, 6vw, 54px)",
  letterSpacing: "-0.03em",
  color: T.text,
  lineHeight: 1,
};

const caRow: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "14px 16px",
  borderRadius: "12px",
  border: `1px solid ${T.border}`,
  background: "rgba(0,0,0,0.34)",
  cursor: "pointer",
  fontFamily: T.fontMono,
};
const caLbl: React.CSSProperties = {
  fontSize: "9px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textFaint,
  flex: "none",
};
const caText: React.CSSProperties = {
  flex: 1,
  fontSize: "12.5px",
  color: T.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "left",
};
const caCopy: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: T.orangeBright,
  flex: "none",
};

const explorerLink: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "11px",
  letterSpacing: "0.08em",
  color: T.orangeBright,
  textDecoration: "none",
  alignSelf: "flex-start",
};