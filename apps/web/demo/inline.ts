// Folds the demo build into one HTML file for hosting as a single page:
// the CSS and JS are inlined (fonts and images are already data: URIs).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.env.DEMO_OUT ?? join(import.meta.dir, "dist");
const html = readFileSync(join(dist, "demo/index.html"), "utf8");
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => readFileSync(join(dist, "demo", m[1]), "utf8"));
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => readFileSync(join(dist, "demo", m[1]), "utf8"));
if (css.length === 0 || js.length === 0) throw new Error("build output not found");

const page = `<title>Bankr Wrapped Demo</title>
<style>
:root { color-scheme: dark; }
body { background: #0c0a09; }
.demo-bar { position: fixed; z-index: 60; right: calc(12px + env(safe-area-inset-right, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 14px; border-radius: 999px; font: 500 12px/1 Inter, system-ui, sans-serif;
  color: #d6d0e6; background: rgba(20, 16, 28, 0.92); border: 1px solid rgba(159, 123, 255, 0.35); box-shadow: 0 8px 30px rgba(0,0,0,0.45); }
.demo-bar button { font: inherit; font-weight: 600; color: #0c0a09; background: #ff7a2f; border: 0; border-radius: 999px; padding: 7px 12px; cursor: pointer; }
body:has([aria-roledescription="story"]) .demo-bar { display: none; }
.demo-bar button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
<style>${css.join("\n")}</style>
<div id="root"></div>
<script type="module">${js.join("\n").replace(/<\/script/gi, "<\\/script")}</script>
`;
writeFileSync(join(dist, "bankr-wrapped-demo.html"), page);
console.log(`bankr-wrapped-demo.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
