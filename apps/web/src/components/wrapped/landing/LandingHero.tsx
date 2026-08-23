// apps/web/src/components/wrapped/landing/LandingHero.tsx
//
// Hero — gradient headline + four platform stats that SCRAMBLE in (replaying
// each scroll-in). Mobile: stats stack 2x2 with tighter gaps, smaller type.

import { Reveal } from "./Reveal";
import { ScrambleNumber } from "./ScrambleNumber";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow } from "./tokens";

const STATS = [
  { prefix: "$", value: 5.01, dec: 2, suffix: "B+", label: "ecosystem volume", accent: "violet" },
  { prefix: "$", value: 20.19, dec: 2, suffix: "M+", label: "paid to builders", accent: "orange" },
  { prefix: "", value: 1.2, dec: 1, suffix: "M+", label: "accounts / wallets", accent: "violet" },
  { prefix: "", value: 4.4, dec: 1, suffix: "M+", label: "agent requests", accent: "orange" },
] as const;

export function LandingHero() {
  const mobile = useIsMobile();

  return (
    <section style={hero(mobile)}>
      <Reveal from="none">
        <div style={{ ...eyebrow, color: T.orangeBright, justifyContent: "center" }}>
          <span style={dot} aria-hidden />
          ecosystem scale
        </div>
      </Reveal>

      <Reveal from="up" delay={0.08}>
        <h1 style={h1(mobile)}>
          Look how big <em style={em}>Bankr</em> has become.
        </h1>
      </Reveal>

      <div style={floatStats(mobile)}>
        {STATS.map((s, i) => (
          <Reveal key={s.label} from="up" delay={0.15 + i * 0.08}>
            <div style={{ textAlign: "center" }}>
              <ScrambleNumber
                prefix={s.prefix}
                value={s.value}
                dec={s.dec}
                suffix={s.suffix}
                color={s.accent === "orange" ? T.orangeBright : T.violetBright}
                style={num(mobile)}
              />
              <div style={fkey}>{s.label}</div>
            </div>
          </Reveal>
        ))}
      </div>

      <div style={scrollCue}>↓ scroll</div>
    </section>
  );
}

const hero = (m: boolean): React.CSSProperties => ({
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: m ? "100px 20px 48px" : "120px 40px 60px",
  position: "relative",
  zIndex: 2,
});

const dot: React.CSSProperties = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: T.orange,
  boxShadow: `0 0 10px ${T.orange}`,
};

const h1 = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: m ? "clamp(34px, 11vw, 52px)" : "clamp(44px, 7vw, 86px)",
  lineHeight: 0.98,
  letterSpacing: "-0.035em",
  margin: "24px auto 0",
  maxWidth: "15ch",
  color: T.text,
});

const em: React.CSSProperties = {
  fontStyle: "normal",
  background: `linear-gradient(120deg, ${T.violetBright}, ${T.orangeBright})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const floatStats = (m: boolean): React.CSSProperties => ({
  display: m ? "grid" : "flex",
  gridTemplateColumns: m ? "1fr 1fr" : undefined,
  flexWrap: m ? undefined : "wrap",
  justifyContent: "center",
  gap: m ? "32px 20px" : "56px",
  marginTop: m ? "48px" : "64px",
  width: m ? "100%" : undefined,
  maxWidth: m ? "420px" : undefined,
});

const num = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 700,
  fontSize: m ? "clamp(28px, 9vw, 40px)" : "clamp(38px, 5vw, 60px)",
  letterSpacing: "-0.03em",
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
  display: "inline-block",
  textShadow: "0 0 30px rgba(159,123,255,0.25)",
});

const fkey: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: T.textDim,
  marginTop: "12px",
};

const scrollCue: React.CSSProperties = {
  marginTop: "70px",
  fontFamily: T.fontMono,
  fontSize: "10px",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: T.textFaint,
};