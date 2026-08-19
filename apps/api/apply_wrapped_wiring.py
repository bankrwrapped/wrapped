#!/usr/bin/env python3
"""Applies the two Bankr Wrapped wiring pieces. Idempotent + backs up."""
import os, shutil, sys

WEB = "apps/web"  # run from repo root; adjust if your path differs
if not os.path.isdir(WEB):
    sys.exit(f"Run from repo root — '{WEB}' not found from {os.getcwd()}")

def backup(p):
    if os.path.exists(p) and not os.path.exists(p + ".bak"):
        shutil.copy2(p, p + ".bak"); print(f"  backed up → {p}.bak")

# ---- 1. fetchWrappedByAddress → append to wrapped-data.ts --------------
WD = f"{WEB}/src/lib/wrapped-data.ts"
FETCH = r'''
// --- ADDED: address-keyed wrapped lookup (X-signin flow) ----------------
// Mirrors lookupWrapped exactly; only the request path differs.
// CONFIRM the url line against the real backend route.
export async function fetchWrappedByAddress(evmAddress: string): Promise<WrappedProfile> {
  const address = evmAddress.trim().toLowerCase();
  if (!address) throw new Error("Address is required");
  const url = `${API_URL}/api/wrapped/address/${encodeURIComponent(address)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error ?? `Request failed with status ${res.status}`;
    if (res.status === 404) throw new WrappedNotFoundError(message);
    throw new Error(message);
  }
  const row: ApiWrappedCacheRow = await res.json();
  return mapToProfile(row);
}
'''
if os.path.exists(WD):
    src = open(WD).read()
    if "fetchWrappedByAddress" in src:
        print(f"skip  {WD} (fetchWrappedByAddress already present)")
    else:
        backup(WD)
        open(WD, "a").write(FETCH)
        print(f"OK    appended fetchWrappedByAddress → {WD}")
else:
    print(f"WARN  {WD} not found — skipped")

# ---- 2. styles.css additions ------------------------------------------
CSS = f"{WEB}/src/styles.css"
CSS_ADD = r'''
/* --- ADDED: terminal-direction typography + cursor keyframe ------------ */
@font-face { font-family:"PP Mori"; src:url("/fonts/PPMori-Regular.woff2") format("woff2"); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:"Departure Mono"; src:url("/fonts/DepartureMono-Regular.woff2") format("woff2"); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:"Inter"; src:url("/fonts/Inter-Regular.woff2") format("woff2"); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:"Inter"; src:url("/fonts/Inter-Medium.woff2") format("woff2"); font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:"Inter"; src:url("/fonts/Inter-SemiBold.woff2") format("woff2"); font-weight:600; font-style:normal; font-display:swap; }

/* MANUAL: inside @theme inline { }, replace the two --font-* lines with:
   --font-display: "PP Mori", ui-sans-serif, system-ui, sans-serif;
   --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
   --font-mono: "Departure Mono", ui-monospace, "SF Mono", monospace;
*/

@keyframes terminal-cursor-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
@media (prefers-reduced-motion: reduce) {
  [style*="terminal-cursor-blink"] { animation:none !important; opacity:1 !important; }
}
'''
if os.path.exists(CSS):
    src = open(CSS).read()
    if "terminal-cursor-blink" in src:
        print(f"skip  {CSS} (terminal additions already present)")
    else:
        backup(CSS)
        open(CSS, "a").write(CSS_ADD)
        print(f"OK    appended font-faces + keyframe → {CSS}")
        print("      ⚠ still MANUAL: swap the two --font-* lines in @theme inline (see comment in file)")
else:
    print(f"WARN  {CSS} not found — skipped")

print("\nDone. Review the .bak diffs, then delete them when happy.")
