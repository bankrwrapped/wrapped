// apps/web/src/components/wrapped/landing/LandingThesis.tsx
//
// Thesis: three beats side by side on desktop, stacked on mobile. Step
// numbers are quiet mono; the words carry it.

import { Reveal } from "./Reveal";
import { useIsMobile } from "./useMediaQuery";
import { T, eyebrow, h2Style, leadStyle, sectionStyle } from "./tokens";

const BEATS = [
  {
    n: "01",
    title: "Build",
    body: "Ship the thing. No pitch deck, no permission, no waiting room.",
  },
  {
    n: "02",
    title: "Tokenize",
    body: "Turn it into something your people can actually hold a stake in.",
  },
  {
    n: "03",
    title: "Let your community decide",
    body: "The market that matters is the one already paying attention.",
  },
];

export function LandingThesis() {
  const mobile = useIsMobile();
  return (
    <section style={sectionStyle(mobile)}>
      <Reveal from="up">
        <div style={eyebrow}>The thesis</div>
        <h2 style={h2Style(mobile)}>What actually happens on Bankr</h2>
        <p style={leadStyle}>
          Build something. Turn it into a token. Let the people already paying attention decide what
          it's worth.
        </p>
      </Reveal>

      <ol style={grid(mobile)}>
        {BEATS.map((b) => (
          <li key={b.n} style={beat}>
            <span style={num}>{b.n}</span>
            <h3 style={title}>{b.title}</h3>
            <p style={body}>{b.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const grid = (m: boolean): React.CSSProperties => ({
  listStyle: "none",
  padding: 0,
  margin: m ? "40px 0 0" : "48px 0 0",
  display: "grid",
  gridTemplateColumns: m ? "1fr" : "repeat(3, 1fr)",
  gap: m ? "32px" : "24px",
});

const beat: React.CSSProperties = { borderTop: `1px solid ${T.borderStrong}`, paddingTop: "20px" };
const num: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
};
const title: React.CSSProperties = {
  fontFamily: T.fontDisplay,
  fontWeight: 400,
  fontSize: "24px",
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  margin: "16px 0 8px",
  color: T.text,
};
const body: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "15px",
  lineHeight: "24px",
  color: T.textDim,
  maxWidth: "32ch",
  margin: 0,
};
