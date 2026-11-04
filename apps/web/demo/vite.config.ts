// Builds the self-contained demo (demo/main.tsx). Run from apps/web:
//   bunx vite build --config demo/vite.config.ts && bun demo/inline.ts
// The demo is published as one HTML page, so every asset is inlined and the
// few hard-coded site paths are rewritten for it.
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const out = process.env.DEMO_OUT ?? fileURLToPath(new URL("./dist", import.meta.url));

function demoRewrites(): Plugin {
  return {
    name: "demo-rewrites",
    enforce: "pre",
    transform(code, id) {
      if (!id.startsWith(web + "src/")) return;
      let next = code
        .replace(/src="\/logo\.png"/g, "src={globalThis.__DEMO_LOGO}")
        .replace(/"\/logo\.png"/g, "globalThis.__DEMO_LOGO")
        // Demo avatars are data: URIs; there's no image proxy to route them through.
        .replace('if (url.includes("/api/image-proxy?")) return url;', 'if (url.includes("/api/image-proxy?") || url.startsWith("data:")) return url;')
        // Show the volume card filling in without a long wait.
        .replace("const VOLUME_POLL_MS = 30_000;", "const VOLUME_POLL_MS = 6_000;");
      if (id.endsWith("/src/styles.css")) next = next.replace(/url\("\/fonts\//g, 'url("../public/fonts/');
      return next === code ? undefined : next;
    },
  };
}

export default defineConfig({
  root: web,
  publicDir: false,
  base: "./",
  plugins: [demoRewrites(), react(), tailwindcss()],
  resolve: { alias: { "@": web + "src", "@bankr-wrapped/shared": web + "../../packages/shared/src/index.ts" } },
  define: { "import.meta.env.VITE_API_URL": '""' },
  build: {
    outDir: out,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: web + "demo/index.html",
      output: { inlineDynamicImports: true },
    },
  },
});
