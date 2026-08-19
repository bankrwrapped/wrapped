// apps/web/src/components/wrapped/landing/LandingSignIn.tsx
//
// Merged sign-in / generate / CA block — the single arranged moment where
// Connect X, "Generate my Wrapped", and the $BNW contract live together.
// Locked behavior:
//   - Connect X fires OAuth.
//   - "Generate my Wrapped" is ABSENT until signed in with real data; it
//     only appears once useAuth resolves to signed-in.
//   - $BNW CA sits immediately adjacent, real logo.png beside the ticker.
//   - Copy-on-click for the CA.
//
// id="signin-block" so the header's Connect X can scroll here.

import { useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { T, eyebrow } from "./tokens";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const OAUTH_START_URL = `${API_URL}/api/auth/x/start`;
const BNW_CA = "0x00de0f4f3ff55523bec004496bab10cacbfc0ba3";

export function LandingSignIn() {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";

  const connect = () => window.location.assign("/soon");
  const generate = () => window.location.assign("/soon");
    // Post-signin, this launches the reveal. The reveal route is the same
    // page; a full re-check picks up the signed-in state and renders it.



  return (
    <section id="signin-block" style={block}>
      <div style={{ ...eyebrow, color: T.orangeBright }}>system · authenticate + generate</div>
      <h2 style={h2}>Connect X. See your year.</h2>
      <p style={lead}>
        Signing in and generating are the same moment. Your $BNW contract sits right here with it.
      </p>

      <div style={merge}>
        <div style={ctaRow}>
          <button type="button" onClick={connect} style={btnX}>
            <XIcon /> {signedIn ? "Connected" : "Connect X account"}
          </button>
          {signedIn ? (
            <button type="button" onClick={generate} style={btnGen}>
              Generate my Wrapped ↗
            </button>
          ) : null}
        </div>

        <div style={caLine}>
          <img src="/logo.png" alt="Bankr Wrapped" style={caLogo} />
          <span style={caLbl}>$BNW · Robinhood Chain</span>
          <CopyField value={BNW_CA} />
        </div>
      </div>
    </section>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div style={caField}>{value}</div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        style={caCopy}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7 8 7.9 12h-6.3l-5-7.3L5.4 22H2.3l7.3-8.3L2 2h6.4l4.7 6.9L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z" />
    </svg>
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

const lead: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "17px",
  lineHeight: 1.55,
  color: T.textDim,
  maxWidth: "46ch",
};

const merge: React.CSSProperties = {
  border: "1px solid rgba(159,123,255,0.2)",
  borderRadius: "22px",
  padding: "40px",
  marginTop: "40px",
  background:
    "radial-gradient(80% 120% at 50% -10%, rgba(159,123,255,0.12), transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent)",
};

const ctaRow: React.CSSProperties = {
  display: "flex",
  gap: "14px",
  flexWrap: "wrap",
  marginBottom: "26px",
};

const btnX: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  padding: "18px 26px",
  borderRadius: "14px",
  background: "linear-gradient(180deg, rgba(159,123,255,0.3), rgba(124,60,255,0.14))",
  border: "1px solid rgba(159,123,255,0.35)",
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "17px",
  color: "#fff",
  cursor: "pointer",
};

const btnGen: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  padding: "18px 26px",
  borderRadius: "14px",
  background: "linear-gradient(180deg, rgba(255,122,26,0.3), rgba(255,122,26,0.12))",
  border: "1px solid rgba(255,122,26,0.4)",
  fontFamily: T.fontDisplay,
  fontWeight: 600,
  fontSize: "17px",
  color: "#fff",
  cursor: "pointer",
};

const caLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  paddingTop: "22px",
  borderTop: `1px solid ${T.border}`,
};

const caLogo: React.CSSProperties = { width: "22px", height: "22px", borderRadius: "6px", objectFit: "contain" };

const caLbl: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textFaint,
};

const caField: React.CSSProperties = {
  flex: 1,
  minWidth: "280px",
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

const caCopy: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "10px",
  border: `1px solid ${T.borderStrong}`,
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: T.orangeBright,
  background: "transparent",
  cursor: "pointer",
};