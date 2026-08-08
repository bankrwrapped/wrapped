// Baseline: single isolated request, no concurrency, no other traffic.
// Establishes whether ~5s is inherent per-request latency or an artifact
// of the 30x concurrent burst.
const DEFILLAMA_BASE = "https://coins.llama.fi";
const PROBE_COIN = "ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

async function main() {
  for (let i = 0; i < 5; i++) {
    const timestamp = Math.floor(Date.now() / 1000) - i * 7200; // 2h apart, avoid any caching
    const url = DEFILLAMA_BASE + "/prices/historical/" + timestamp + "/" + PROBE_COIN;
    const start = Date.now();
    const res = await fetch(url);
    const ms = Date.now() - start;
    console.log("isolated req " + i + ": status=" + res.status + " time=" + ms + "ms");
    await new Promise((r) => setTimeout(r, 2000)); // 2s gap, fully isolated
  }
}
main();
