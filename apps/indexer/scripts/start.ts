/**
 * start.ts - the indexer's start command on Railway (see railway.json).
 *
 * Runs `envio start`, which resumes indexing where it left off. If Envio
 * refuses to start because the stored data can't be resumed (an older Envio
 * version created it, or a config/schema change made it incompatible), it
 * starts over ONCE with `envio start -r`.
 *
 * Why not put `-r` in the start command: Railway restarts a crashed indexer
 * automatically, and every restart with `-r` would wipe hours of progress.
 * Here a restart runs plain `envio start` again, and once the fresh storage
 * exists it's compatible - so it resumes and keeps filling.
 *
 * Set ENVIO_AUTO_RESET=false to never start over automatically (the indexer
 * then stays down on incompatible storage until someone decides).
 *
 * ENVIO_BIN overrides the envio command - tests only.
 */

const INCOMPATIBLE = "incompatible with the existing indexer data";
const envio = (process.env.ENVIO_BIN ?? "bunx envio").split(" ");

// Runs envio, passing its output straight through, and reports whether it
// printed the "can't resume this storage" error.
async function run(args: string[]): Promise<{ code: number; incompatible: boolean }> {
  const proc = Bun.spawn([...envio, ...args], { stdout: "pipe", stderr: "pipe", stdin: "inherit" });
  let incompatible = false;
  const forward = async (stream: ReadableStream<Uint8Array>, out: typeof process.stdout) => {
    const decoder = new TextDecoder();
    let tail = ""; // so a message split across two chunks is still seen
    for await (const chunk of stream) {
      const text = tail + decoder.decode(chunk, { stream: true });
      if (text.includes(INCOMPATIBLE)) incompatible = true;
      tail = text.slice(-INCOMPATIBLE.length);
      out.write(chunk);
    }
  };
  await Promise.all([forward(proc.stdout, process.stdout), forward(proc.stderr, process.stderr)]);
  return { code: await proc.exited, incompatible };
}

const first = await run(["start"]);
if (!first.incompatible) process.exit(first.code);

if (process.env.ENVIO_AUTO_RESET === "false") {
  console.error("[start] stored indexer data can't be resumed and ENVIO_AUTO_RESET=false - not starting over");
  process.exit(first.code || 1);
}

console.log("[start] stored indexer data can't be resumed - starting over once with `envio start -r`");
const reset = await run(["start", "-r"]);
process.exit(reset.code);
