// Demo build of the real app: the same route components and cards, with the
// API answered in-page from fixtures.json (see make-fixtures.ts), so the
// whole lookup flow runs with no backend.
// Routing is in memory: the demo is hosted as a single page.
import "../src/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { Route as IndexRoute } from "@/routes/index";
import { Route as LeaderboardRoute } from "@/routes/leaderboard";
import { Route as AboutRoute } from "@/routes/about";
import logo from "../public/logo.png?inline";
import fixtures from "./fixtures.json";
import { Soundtrack, type Cue } from "@/components/wrapped/story/soundtrack";

(globalThis as any).__DEMO_LOGO = logo;

// ---- fake API ----
// Only @demobuilder has a Wrapped in the demo; any other handle gets the
// API's real "not found" answer, so the lookup's error path plays too.
const DEMO_HANDLE = fixtures.handle;
let wrappedCalls = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function wrappedResponse() {
  wrappedCalls++;
  const row = structuredClone(fixtures.wrapped) as any;
  const tv = row.payload.tradingVolume;
  // First load: volume still computing. Then a partial figure, then the final
  // one, so the volume card's polling is visible.
  if (wrappedCalls === 1) Object.assign(tv, { status: "pending", isComplete: false });
  else if (wrappedCalls === 2) Object.assign(tv, { isComplete: false, totalVolumeUsd: Math.round(tv.totalVolumeUsd * 0.62) });
  return row;
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!raw.startsWith("/api/") && !raw.startsWith(location.origin + "/api/")) return realFetch(input, init);
  const url = new URL(raw, location.origin);
  const path = url.pathname;
  if (path === "/api/search") {
    await wait(180);
    const q = (url.searchParams.get("query") ?? "").toLowerCase().replace(/^@/, "");
    const avatar = (fixtures.wrapped.payload as any).user?.avatar ?? "";
    return json({
      results: DEMO_HANDLE.includes(q) ? [{ username: DEMO_HANDLE, platform: "twitter", profileImageUrl: avatar }] : [],
    });
  }
  const wrapped = path.match(/^\/api\/wrapped\/([^/]+)$/);
  if (wrapped) {
    const handle = decodeURIComponent(wrapped[1]).toLowerCase();
    if (handle !== DEMO_HANDLE) {
      await wait(900);
      return json({ error: "handle not found on Bankr" }, 404);
    }
    await wait(wrappedCalls === 0 ? 3600 : 400);
    return json(wrappedResponse());
  }
  if (path === "/api/leaderboards") {
    await wait(350);
    const month = url.searchParams.get("month") || fixtures.currentMonth;
    const handle = url.searchParams.get("handle") ?? "";
    const key = `${month}|${handle}`;
    const boards = (fixtures.leaderboards as Record<string, unknown>)[key] ?? (fixtures.leaderboards as Record<string, unknown>)[`${fixtures.currentMonth}|${handle}`] ?? (fixtures.leaderboards as Record<string, unknown>)[`${fixtures.currentMonth}|`];
    return json(boards);
  }
  if (path === "/api/leaderboard") return json({ entries: fixtures.topEarners });
  return json({ error: "Not in the demo" }, 404);
};

// ---- router ----
function DemoRoot() {
  return (
    <>
      <Outlet />
      <DemoBar />
    </>
  );
}

function DemoBar() {
  const u = useRouterState({ select: (st) => (st.location.search as { u?: string }).u });
  return (
    <div role="note" style={bar}>
      <span style={{ color: "#a1a1a6", minWidth: 0 }}>Sample data. Only @{DEMO_HANDLE} has a Wrapped</span>
      {u ? (
        <button type="button" style={barBtn} onClick={() => router.navigate({ to: "/" })}>
          Back to start
        </button>
      ) : (
        <button type="button" style={barBtn} onClick={() => router.navigate({ to: "/", search: { u: DEMO_HANDLE } })}>
          Open @{DEMO_HANDLE}
        </button>
      )}
    </div>
  );
}

const bar: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "16px",
  transform: "translateX(-50%)",
  zIndex: 60,
  display: "flex",
  alignItems: "center",
  gap: "12px",
  width: "max-content",
  maxWidth: "calc(100vw - 32px)",
  padding: "6px 6px 6px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(237,237,237,0.12)",
  background: "rgba(25,25,27,0.94)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "13px",
  lineHeight: "18px",
};

const barBtn: React.CSSProperties = {
  height: "32px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "none",
  background: "#ededed",
  color: "#141415",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  flex: "none",
  whiteSpace: "nowrap",
};

const rootRoute = createRootRoute({ component: DemoRoot });
const routeTree = rootRoute.addChildren([
  (IndexRoute as any).update({ id: "/", path: "/", getParentRoute: () => rootRoute }),
  (LeaderboardRoute as any).update({ id: "/leaderboard", path: "/leaderboard", getParentRoute: () => rootRoute }),
  (AboutRoute as any).update({ id: "/about", path: "/about", getParentRoute: () => rootRoute }),
]);
const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultNotFoundComponent: () => null,
});
// A fresh visit to the demo Wrapped replays the volume-card fill-in.
let lastU: string | undefined;
router.subscribe("onResolved", ({ toLocation }) => {
  window.scrollTo(0, 0);
  const u = (toLocation.search as { u?: string }).u;
  if (u !== lastU && u === DEMO_HANDLE) wrappedCalls = 0;
  lastU = u;
});

// For the film export (scratch tooling, not shipped): the story announces its
// cues when it starts, and this renders that score to 16-bit WAV, base64.
let storyCues: Cue[] | null = null;
window.addEventListener("wrapped:story-start", (e) => {
  storyCues = (e as CustomEvent<{ cues: Cue[] }>).detail.cues;
});
(window as any).__renderScoreWav = async (opts?: { tail?: number; fade?: number }) => {
  if (!storyCues) throw new Error("story hasn't started");
  const buf = await Soundtrack.render(storyCues, opts);
  const frames = buf.length;
  const out = new DataView(new ArrayBuffer(44 + frames * 4));
  const str = (o: number, t: string) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + frames * 4, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, frames * 4, true);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < frames; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
