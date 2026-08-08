// Fires a burst of real requests at DeFiLlama's historical price endpoint
// and reports real behavior: status codes, response headers, timing,
// whether/when 429s start. This is OQ5's actual research task - run it,
// don't assume a number.
//
// Usage: bun run scripts/test-defillama-rate-limit.ts

const DEFILLAMA_BASE = "https://coins.llama.fi";
// WETH/ethereum - real, liquid, guaranteed to have historical price data,
// used only as connectivity/rate-limit probe, not a product regression token.
const PROBE_COIN = "ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const BURST_SIZE = 30;
const NOW = Math.floor(Date.now() / 1000);

interface Result {
  i: number;
  status: number;
  ms: number;
  rateLimitHeaders: Record<string, string>;
}

async function fireOne(i: number): Promise<Result> {
  const timestamp = NOW - i * 3600; // distinct timestamp per call, avoids any response caching masking real behavior
  const url = DEFILLAMA_BASE + "/prices/historical/" + timestamp + "/" + PROBE_COIN;
  const start = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - start;

  const rateLimitHeaders: Record<string, string> = {};
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase().includes("ratelimit") || k.toLowerCase().includes("retry-after")) {
      rateLimitHeaders[k] = v;
    }
  }

  return { i, status: res.status, ms, rateLimitHeaders };
}

async function main() {
  console.log("Firing " + BURST_SIZE + " concurrent requests at DeFiLlama historical endpoint...\n");

  const results = await Promise.all(
    Array.from({ length: BURST_SIZE }, (_, i) => fireOne(i))
  );

  results.sort((a, b) => a.i - b.i);

  let first429: number | null = null;
  for (const r of results) {
    const flag = r.status === 429 ? "  <-- RATE LIMITED" : "";
    if (r.status === 429 && first429 === null) first429 = r.i;
    console.log(
      "req " + String(r.i).padStart(2) + ": status=" + r.status +
      " time=" + r.ms + "ms" +
      (Object.keys(r.rateLimitHeaders).length ? " headers=" + JSON.stringify(r.rateLimitHeaders) : "") +
      flag
    );
  }

  console.log("\n--- Summary ---");
  console.log("Total requests: " + BURST_SIZE);
  console.log("Succeeded (200): " + results.filter((r) => r.status === 200).length);
  console.log("Rate limited (429): " + results.filter((r) => r.status === 429).length);
  console.log("Other errors: " + results.filter((r) => r.status !== 200 && r.status !== 429).length);
  if (first429 !== null) {
    console.log("First 429 at request index: " + first429 + " (concurrent burst - real sustained-rate limit needs a second, spaced-out test below)");
  } else {
    console.log("No 429s in a " + BURST_SIZE + "-concurrent burst - try increasing BURST_SIZE, or the real limit is on sustained rate, not burst size.");
  }

  console.log("\nRun a second pass with requests spaced 1s apart to find the real sustained rate:");
  console.log("(edit this script: change Promise.all to a sequential loop with a 1000ms delay, rerun)");
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
