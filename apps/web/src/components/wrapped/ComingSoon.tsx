// apps/web/src/components/wrapped/ComingSoon.tsx
//
// Coming-soon destination for all CTAs (Connect X / Generate). No auth, no
// OAuth — just: a message, the $BNW contract (copy + explorer link, "to
// trade"), and a blurred/partial floating share-card teaser for FOMO. The
// real six-scene reveal ships later this week; until then every CTA lands
// here.
//
// The teaser card is the real bento shape/gloss but with numbers blurred —
// it reads as "your card is coming" without publishing fabricated stats as
// if real.

import { useState } from "react";

import { Backdrop } from "@/components/wrapped/terminal/Backdrop";
import { T } from "@/components/wrapped/landing/tokens";

const BNW_CA = "0x00de0f4f3ff55523bec004496bab10cacbfc0ba3";
// Robinhood Chain explorer (Blockscout). Token page for $BNW.
const EXPLORER_URL = `https://robinhoodchain.blockscout.com/token/${BNW_CA}`;

export function ComingSoon() {
  return (
    <Backdrop>
      <div style={page}>
        <TeaserCard />

        <div style={{ ...eyebrowRow }}>
          <span style={dot} aria-hidden />
          <span style={eyebrowText}>your wrapped is being built</span>
        </div>

        <h1 style={h1}>
          Almost <em style={em}>ready.</em>
        </h1>
        <p style={sub}>
          The full reveal drops this week. Grab $BNW now — then come back and watch your year
          unfold.
        </p>

        <div style={caCard}>
          <div style={caHead}>
            <img src="/logo.png" alt="Bankr Wrapped" style={caLogo} />
            <span style={caLbl}>$BNW · Robinhood Chain</span>
            <a href={EXPLORER_URL} target="_blank" rel="noreferrer" style={explorerLink}>
              View on explorer ↗
            </a>
          </div>
          <CopyRow value={BNW_CA} />
        </div>

        <a href="/" style={backLink}>
          ← back
        </a>
      </div>
    </Backdrop>
  );
}

function TeaserCard() {
  return (
    <div style={teaserWrap} aria-hidden>
      <div style={teaserCard}>
        <div style={teaserGloss} />
        {/* Left: PFP tile (blurred) */}
        <div style={teaserPfp}>
          <div style={teaserBlur} />
          <div style={teaserScrim}>
            <div style={{ ...blurText, width: "70%", height: "12px" }} />
          </div>
        </div>
        {/* Right: heroes + stats, all blurred */}
        <div style={teaserRight}>
          <div style={{ ...blurText, width: "45%", height: "9px", opacity: 0.5 }} />
          <div style={{ ...blurText, width: "80%", height: "34px", marginTop: "10px" }} />
          <div style={{ ...blurText, width: "60%", height: "9px", opacity: 0.5, marginTop: "18px" }} />
          <div style={{ ...blurText, width: "90%", height: "44px", marginTop: "10px" }} />
          <div style={teaserStatRow}>
            <div style={{ ...blurText, height: "40px", flex: 1 }} />
            <div style={{ ...blurText, height: "40px", flex: 1 }} />
            <div style={{ ...blurText, height: "40px", flex: 1 }} />
          </div>
        </div>
        <div style={teaserLock}>your card, coming soon</div>
      </div>
    </div>
  );
}

function CopyRow({ value }: { value: string }) {
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
      <span style={caText}>{value}</span>
      <span style={caCopy}>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "80px 24px",
  gap: "0",
  position: "relative",
  zIndex: 2,
};

// --- teaser card ---
const teaserWrap: React.CSSProperties = {
  perspective: "1000px",
  marginBottom: "48px",
};

const teaserCard: React.CSSProperties = {
  position: "relative",
  width: "min(520px, 86vw)",
  height: "270px",
  borderRadius: "22px",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "150px 1fr",
  gap: "14px",
  padding: "18px",
  background:
    "radial-gradient(60% 90% at 85% -8%, rgba(159,123,255,0.34), transparent 55%)," +
    "radial-gradient(55% 95% at 6% 110%, rgba(255,122,26,0.26), transparent 58%)," +
    "linear-gradient(142deg, #1b1226 0%, #0c0a09 56%, #150c17 100%)",
  border: `1px solid ${T.border}`,
  boxShadow: "0 40px 90px -30px rgba(124,60,255,0.55), 0 2px 0 rgba(255,255,255,0.08) inset",
  transform: "rotateX(6deg) rotateY(-9deg)",
  animation: "teaserFloat 6s ease-in-out infinite",
};

const teaserGloss: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "40%",
  background: "linear-gradient(180deg, rgba(255,255,255,0.10), transparent)",
  pointerEvents: "none",
  zIndex: 5,
};

const teaserPfp: React.CSSProperties = {
  position: "relative",
  borderRadius: "16px",
  overflow: "hidden",
  background: "linear-gradient(135deg, #2f2440, #160f22)",
};

const teaserBlur: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "radial-gradient(circle at 42% 38%, rgba(159,123,255,0.45), rgba(22,15,34,0.9) 72%)",
  filter: "blur(2px)",
};

const teaserScrim: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  padding: "14px",
  background: "linear-gradient(180deg, transparent, rgba(12,10,9,0.85) 62%)",
};

const teaserRight: React.CSSProperties = {
  position: "relative",
  padding: "6px 6px 6px 0",
  display: "flex",
  flexDirection: "column",
};

const blurText: React.CSSProperties = {
  borderRadius: "6px",
  background: "linear-gradient(90deg, rgba(220,205,255,0.35), rgba(255,176,102,0.28))",
  filter: "blur(3px)",
};

const teaserStatRow: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginTop: "auto",
};

const teaserLock: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 6,
  display: "grid",
  placeItems: "center",
  fontFamily: T.fontMono,
  fontSize: "11px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "rgba(247,244,240,0.9)",
  textShadow: "0 2px 20px rgba(0,0,0,0.8)",
};

// --- message ---
const eyebrowRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" };
const dot: React.CSSProperties = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: T.orange,
  boxShadow: `0 0 10px ${T.orange}`,
};
const eyebrowText: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "11px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: T.orangeBright,
};

const h1: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: "clamp(44px, 8vw, 76px)",
  lineHeight: 0.98,
  letterSpacing: "-0.035em",
  margin: 0,
  color: T.text,
};

const em: React.CSSProperties = {
  fontStyle: "normal",
  background: `linear-gradient(120deg, ${T.violetBright}, ${T.orangeBright})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const sub: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "17px",
  lineHeight: 1.55,
  color: T.textDim,
  maxWidth: "42ch",
  margin: "20px 0 40px",
};

// --- CA card ---
const caCard: React.CSSProperties = {
  width: "min(520px, 86vw)",
  border: `1px solid ${T.border}`,
  borderRadius: "16px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
  padding: "20px 22px",
};

const caHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "14px",
  flexWrap: "wrap",
};

const caLogo: React.CSSProperties = { width: "22px", height: "22px", borderRadius: "6px", objectFit: "contain" };

const caLbl: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textFaint,
  flex: 1,
  textAlign: "left",
};

const explorerLink: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.1em",
  color: T.orangeBright,
  textDecoration: "none",
};

const caRow: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 14px",
  borderRadius: "10px",
  border: `1px solid ${T.border}`,
  background: "rgba(0,0,0,0.3)",
  cursor: "pointer",
  fontFamily: T.fontMono,
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
};

const backLink: React.CSSProperties = {
  marginTop: "40px",
  fontFamily: T.fontMono,
  fontSize: "12px",
  letterSpacing: "0.1em",
  color: T.textFaint,
  textDecoration: "none",
};