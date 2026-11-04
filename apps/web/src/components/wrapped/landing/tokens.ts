// apps/web/src/components/wrapped/landing/tokens.ts
//
// Shared design tokens for the landing. Graphite neutrals, one accent (Bankr
// orange). Purple lives only in the logo and inside the Wrapped cards. Fonts
// are the ones styles.css actually loads: PP Mori for display, Inter for the
// interface, Departure Mono for figures, meta and bot commands.

export const T = {
  ink: "#141415",
  deep: "#0f0f10",
  card: "#19191b",
  raised: "#232325",
  text: "#ededed",
  textDim: "#a1a1a6",
  textFaint: "#85858b",
  accent: "#ff7a1a",
  border: "rgba(237,237,237,0.08)",
  borderStrong: "rgba(237,237,237,0.14)",
  fontDisplay: "'PP Mori', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",
  fontMono: "'Departure Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export const panel: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: "16px",
  background: T.card,
};

// Section label: quiet sentence-case mono, never shouted.
export const eyebrow: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "12px",
  lineHeight: "16px",
  color: T.textFaint,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

export const h2Style = (m: boolean): React.CSSProperties => ({
  fontFamily: T.fontDisplay,
  fontWeight: 400,
  fontSize: m ? "32px" : "clamp(44px, 3.6vw, 64px)",
  letterSpacing: "-0.02em",
  lineHeight: 1.08,
  margin: "12px 0 16px",
  color: T.text,
});

export const leadStyle: React.CSSProperties = {
  fontFamily: T.fontBody,
  fontSize: "17px",
  lineHeight: "28px",
  color: T.textDim,
  maxWidth: "36rem",
  margin: 0,
};

export const sectionStyle = (m: boolean): React.CSSProperties => ({
  padding: m ? "64px 0" : "96px 0",
  position: "relative",
  zIndex: 2,
});
