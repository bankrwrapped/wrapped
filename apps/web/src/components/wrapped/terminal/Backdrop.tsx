import type { ReactNode } from "react";

// Minimal background layer. Placeholder for the WebGL braid — every page
// sits on this until the braid world is built. Solid near-black with the
// brand violet wash, matching the locked palette.
export function Backdrop({ children }: { children?: ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0c0a09" }}>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(70% 55% at 50% 20%, rgba(159,123,255,0.10), transparent 70%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
