import type { ReactNode } from "react";

// Page background: one graphite surface. Color belongs to the content (the
// Wrapped cards), not the page.
export function Backdrop({ children }: { children?: ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#141415" }}>
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
