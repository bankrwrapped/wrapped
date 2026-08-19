// apps/web/src/components/wrapped/landing/tokens.ts
//
// Shared design tokens for the redesigned landing. Locked violet+orange
// palette, real fonts (Clash Display display / PP Mori body / IBM Plex Mono
// labels — matching what's loaded in __root.tsx and public/fonts). Single
// source so every landing section stays consistent; the WebGL braid layers
// under this content later without changing these.

export const T = {
  ink: "#0c0a09",
  text: "#f7f4f0",
  textDim: "#a29c94",
  textFaint: "#7c7469",
  violet: "#9f7bff",
  violetBright: "#dccdff",
  violetDeep: "#7c3cff",
  orange: "#ff7a1a",
  orangeBright: "#ffb066",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  fontDisplay: "'Clash Display', system-ui, sans-serif",
  fontBody: "'PP Mori', system-ui, sans-serif",
  fontMono: "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace",
} as const;

export const glass: React.CSSProperties = {
  border: `1px solid ${T.border}`,
  borderRadius: "16px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
};

export const eyebrow: React.CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: "11px",
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};