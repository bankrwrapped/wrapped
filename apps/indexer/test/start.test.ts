// The start wrapper: resume normally, start over exactly once when Envio
// says the stored data can't be resumed, and never wipe on an ordinary
// crash - so Railway's automatic restarts keep filling the same data.
import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "envio-start-"));
const calls = join(dir, "calls.log");
const fake = join(dir, "fake-envio.ts");
// Fake envio: records its args; FAKE_MODE decides what `start` (without -r) does.
writeFileSync(fake, `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, args.join(" ") + "\\n");
const mode = process.env.FAKE_MODE;
if (args.includes("-r")) { console.log("indexing from scratch"); process.exit(0); }
if (mode === "incompatible") {
  // split the message across two writes, like a real stream might
  process.stderr.write("ERROR: The following config changes are incompat");
  process.stderr.write("ible with the existing indexer data:\\n  - storage was initialized by an older envio version\\n");
  process.exit(1);
}
if (mode === "crash") { console.error("ERROR: RPC unreachable"); process.exit(3); }
console.log("resuming"); process.exit(0);
`);

const script = join(import.meta.dir, "../scripts/start.ts");
const start = (env: Record<string, string>) =>
  Bun.spawnSync(["bun", script], { env: { ...process.env, ENVIO_BIN: `bun ${fake}`, ...env }, stdout: "pipe", stderr: "pipe" });
const recorded = () => (existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : []);

beforeEach(() => writeFileSync(calls, ""));

test("compatible storage: plain start, which resumes", () => {
  const r = start({ FAKE_MODE: "ok" });
  expect(r.exitCode).toBe(0);
  expect(recorded()).toEqual(["start"]);
});

test("incompatible storage: starts over exactly once", () => {
  const r = start({ FAKE_MODE: "incompatible" });
  expect(r.exitCode).toBe(0);
  expect(recorded()).toEqual(["start", "start -r"]);
  expect(r.stderr.toString()).toContain("older envio version"); // envio's own output is passed through
});

test("an ordinary crash never wipes the data; Railway's restart resumes it", () => {
  const r = start({ FAKE_MODE: "crash" });
  expect(r.exitCode).toBe(3);
  expect(recorded()).toEqual(["start"]);
});

test("ENVIO_AUTO_RESET=false: stays down instead of starting over", () => {
  const r = start({ FAKE_MODE: "incompatible", ENVIO_AUTO_RESET: "false" });
  expect(r.exitCode).toBe(1);
  expect(recorded()).toEqual(["start"]);
});
