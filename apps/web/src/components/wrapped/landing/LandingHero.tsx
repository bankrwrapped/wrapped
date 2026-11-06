// apps/web/src/components/wrapped/landing/LandingHero.tsx
//
// Hero: what Wrapped is on the left, one real card face on the right (the
// product itself, rendered with the same CardFrame the deck uses), and the
// Bankr-wide figures as a quiet strip underneath.

import { CardFrame, ScaledCard } from "@/components/wrapped/cards/ShareableCard";
import { BotPrompt } from "./BotPrompt";
import { Lookup } from "./Lookup";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow } from "./tokens";

// Bankr-wide, all time. Volume and creator fees as shown on bankr.bot
// (checked Nov 2026). Only add a figure here once it has a public source.
const STATS = [
  { value: "$5.58B", label: "traded through Bankr" },
  { value: "$24.28M", label: "paid to creators" },
] as const;

export function LandingHero() {
  const mobile = useIsMobile();

  return (
    <section style={hero(mobile)}>
      <div style={split(mobile)}>
        <div>
          <div style={eyebrow}>Bankr Wrapped {new Date().getUTCFullYear()}</div>
          <h1 style={h1(mobile)}>Your Bankr year, on cards you can post</h1>
          <p style={sub}>
            Look up any X handle to see every token launched, the ETH it earned and where it ranks,
            read straight from the chain.
          </p>
          <div style={actions}>
            <Lookup id="lookup-input" />
            <p style={orLabel}>Or ask the bot on X</p>
            <BotPrompt command="@bankrbot show me my Bankr Wrapped" />
          </div>
        </div>

        <div style={visual(mobile)}>
          <ScaledCard>
            <SampleCard />
          </ScaledCard>
          <p style={caption}>A sample card. Each one is built from real launches</p>
        </div>
      </div>

      <dl style={strip(mobile)}>
        {STATS.map((s) => (
          <div key={s.label} style={stat}>
            <dt style={statLabel}>{s.label}</dt>
            <dd style={statValue}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <p style={source}>Bankr, all time. Volume and creator fees from bankr.bot</p>
    </section>
  );
}

// Cumulative claimed ETH over 90 days, sample data for the hero card.
const DAILY = [
  0, 0.02, 0, 0.05, 0.01, 0, 0.08, 0.03, 0, 0.02, 0.11, 0.04, 0, 0.06, 0.02, 0.01, 0.09, 0, 0.05,
  0.03, 0.14, 0.02, 0, 0.07, 0.04, 0.02, 0.1, 0.05, 0, 0.03, 0.06, 0.02, 0.19, 0.04, 0.03, 0.08, 0,
  0.05, 0.12, 0.06, 0.02, 0.09, 0.04, 0.03, 0.87, 0.11, 0.06, 0.04, 0.13, 0.05, 0.08, 0.02, 0.1,
  0.07, 0.04, 0.16, 0.06, 0.09, 0.03, 0.12, 0.05, 0.08, 0.14, 0.04, 0.1, 0.07, 0.05, 0.18, 0.09,
  0.06, 0.11, 0.08, 0.04, 0.15, 0.1, 0.07, 0.12, 0.06, 0.09, 0.2, 0.08, 0.11, 0.07, 0.13, 0.1, 0.16,
  0.09, 0.12, 0.14, 0.11,
];

function SampleCard() {
  let run = 0;
  const cum = DAILY.map((d) => (run += d));
  const pts = cum
    .map(
      (v, i) => `${((i / (cum.length - 1)) * 304).toFixed(1)},${(70 - (v / run) * 64).toFixed(1)}`,
    )
    .join(" ");
  return (
    <CardFrame eyebrow="What you earned" handle="you" tone="ember">
      <div className="mb-auto mt-4">
        <p className="mb-1 text-right font-mono text-[10px] text-white/60">claimed, last 90 days</p>
        <svg viewBox="0 0 304 72" className="h-[72px] w-full" aria-hidden>
          <polygon points={`0,72 ${pts} 304,72`} fill="rgba(255,255,255,0.12)" />
          <polyline
            points={pts}
            fill="none"
            stroke="white"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="font-display text-[64px] leading-none tracking-tight tabular-nums">7.112</p>
      <p className="mt-2 font-display text-xl">ETH earned</p>
      <div className="mt-5 grid grid-cols-3 gap-3 font-mono text-[11px] tabular-nums">
        <div>
          <p className="text-white/60">Launches</p>
          <p className="mt-1">6.482 ETH</p>
        </div>
        <div>
          <p className="text-white/60">Please Bro</p>
          <p className="mt-1">0.630 ETH</p>
        </div>
        <div>
          <p className="text-white/60">Unclaimed</p>
          <p className="mt-1">0.415 ETH</p>
        </div>
      </div>
    </CardFrame>
  );
}

const hero = (m: boolean): React.CSSProperties => ({
  minHeight: m ? undefined : "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: m ? "112px 0 48px" : "112px 0 64px",
  position: "relative",
  zIndex: 2,
});

const split = (m: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: m ? "minmax(0, 1fr)" : "minmax(0, 1.15fr) minmax(0, 0.85fr)",
  gap: m ? "48px" : "64px",
  alignItems: "center",
});

const h1 = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 400,
  fontSize: m ? "40px" : "clamp(56px, 5.4vw, 104px)",
  lineHeight: 1.04,
  letterSpacing: m ? "-0.02em" : "-0.03em",
  margin: "16px 0 0",
  maxWidth: "12ch",
  color: T.text,
});

const sub: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "18px",
  lineHeight: "28px",
  color: T.textDim,
  maxWidth: "36rem",
  margin: "24px 0 0",
};

const actions: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  marginTop: "40px",
  maxWidth: "40rem",
};

const orLabel: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "13px",
  lineHeight: "20px",
  color: T.textFaint,
  margin: "16px 0 0",
};

const visual = (m: boolean): React.CSSProperties => ({
  width: "100%",
  // Grows with the window but always fits its height, so the first screen
  // shows the whole card (the card is 4:5).
  maxWidth: m ? "320px" : "min(34vw, 600px, calc((100vh - 300px) * 0.8))",
  justifySelf: m ? "start" : "end",
});

const caption: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "13px",
  lineHeight: "20px",
  color: T.textFaint,
  margin: "12px 0 0",
};

const strip = (m: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(${STATS.length}, 1fr)`,
  gap: "1px",
  margin: m ? "48px 0 0" : "64px 0 0",
  borderRadius: "12px",
  overflow: "hidden",
  border: `1px solid ${T.border}`,
  background: T.border,
});

const stat: React.CSSProperties = { background: T.ink, padding: "16px 20px", margin: 0 };
const statLabel: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "13px",
  lineHeight: "20px",
  color: T.textDim,
};
const statValue: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontSize: "28px",
  lineHeight: 1,
  marginTop: "8px",
  marginLeft: 0,
  color: T.text,
  fontVariantNumeric: "tabular-nums",
};
const source: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
  margin: "12px 0 0",
};
