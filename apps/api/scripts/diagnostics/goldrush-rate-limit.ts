const API_KEY = process.env.GOLDRUSH_API_KEY;
if (!API_KEY) {
  console.error("GOLDRUSH_API_KEY not set");
  process.exit(1);
}

const BASE = "https://api.covalenthq.com";
const CHAIN = "base-mainnet";
const QUOTE = "USD";
const CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function dateStr(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  return d.toISOString().split("T")[0];
}

const FROM = dateStr(14);
const TO = dateStr(7);

function urlForNoKey(): string {
  return (
    BASE + "/v1/pricing/historical_by_addresses_v2/" +
    CHAIN + "/" + QUOTE + "/" + CONTRACT + "/" +
    "?from=" + FROM + "&to=" + TO
  );
}

async function probeAuth(): Promise<{ mode: "query" | "bearer" }> {
  const queryRes = await fetch(urlForNoKey() + "&key=" + API_KEY);
  if (queryRes.ok) return { mode: "query" };
  const bearerRes = await fetch(urlForNoKey(), { headers: { Authorization: "Bearer " + API_KEY } });
  if (bearerRes.ok) return { mode: "bearer" };
  console.error("Neither auth style returned 200. Statuses: " + queryRes.status + ", " + bearerRes.status);
  process.exit(1);
}

function buildFetch(mode: "query" | "bearer") {
  return () =>
    mode === "query"
      ? fetch(urlForNoKey() + "&key=" + API_KEY)
      : fetch(urlForNoKey(), { headers: { Authorization: "Bearer " + API_KEY } });
}

interface Result {
  i: number;
  scheduledAtMs: number;
  status: number | "CONN_ERROR";
  latencyMs: number;
  connRetries: number; // how many transient connection failures happened before this result
}

const CONN_RETRY_LIMIT = 2;
const CONN_RETRY_DELAY_MS = 300;

async function fetchWithConnRetry(
  fetchFn: () => Promise<Response>
): Promise<{ status: number | "CONN_ERROR"; retries: number }> {
  let retries = 0;
  while (true) {
    try {
      const res = await fetchFn();
      return { status: res.status, retries };
    } catch {
      if (retries >= CONN_RETRY_LIMIT) {
        return { status: "CONN_ERROR", retries };
      }
      retries++;
      await new Promise((r) => setTimeout(r, CONN_RETRY_DELAY_MS));
    }
  }
}

async function pipelinedBurst(
  fetchFn: () => Promise<Response>,
  ratePerSec: number,
  durationSec: number
): Promise<Result[]> {
  const intervalMs = 1000 / ratePerSec;
  const totalRequests = ratePerSec * durationSec;
  const start = Date.now();
  const promises: Promise<Result>[] = [];

  for (let i = 0; i < totalRequests; i++) {
    const scheduledAtMs = i * intervalMs;
    const p = new Promise<Result>((resolve) => {
      setTimeout(async () => {
        const fireTime = Date.now() - start;
        const reqStart = Date.now();
        const { status, retries } = await fetchWithConnRetry(fetchFn);
        const latencyMs = Date.now() - reqStart;
        resolve({ i, scheduledAtMs: fireTime, status, latencyMs, connRetries: retries });
      }, scheduledAtMs);
    });
    promises.push(p);
  }

  return Promise.all(promises);
}

function summarizeByWindow(results: Result[], windowMs: number, label: string) {
  console.log("\n--- " + label + " ---");
  console.log("Total fired: " + results.length);
  console.log("Succeeded (200): " + results.filter((r) => r.status === 200).length);
  console.log("Rate limited (429): " + results.filter((r) => r.status === 429).length);
  console.log("Hard connection failures (after " + CONN_RETRY_LIMIT + " retries): " + results.filter((r) => r.status === "CONN_ERROR").length);
  console.log("Other HTTP errors: " + results.filter((r) => typeof r.status === "number" && r.status !== 200 && r.status !== 429).length);
  const withTransientRetry = results.filter((r) => r.connRetries > 0);
  console.log("Requests that needed a transient-connection retry: " + withTransientRetry.length + (withTransientRetry.length ? " (succeeded on retry, not counted as failures)" : ""));

  const maxTime = Math.max(...results.map((r) => r.scheduledAtMs));
  const windows = Math.ceil((maxTime + 1) / windowMs);
  console.log("Breakdown by " + (windowMs / 1000) + "s window:");
  for (let w = 0; w < windows; w++) {
    const windowResults = results.filter(
      (r) => r.scheduledAtMs >= w * windowMs && r.scheduledAtMs < (w + 1) * windowMs
    );
    if (windowResults.length === 0) continue;
    const ok = windowResults.filter((r) => r.status === 200).length;
    const limited = windowResults.filter((r) => r.status === 429).length;
    const hardErr = windowResults.filter((r) => r.status === "CONN_ERROR").length;
    const retried = windowResults.filter((r) => r.connRetries > 0).length;
    console.log(
      "  [" + (w * windowMs / 1000) + "-" + ((w + 1) * windowMs / 1000) + "s] " +
      windowResults.length + " fired, " + ok + " ok, " + limited + " 429, " + hardErr + " hard-fail, " + retried + " needed retry"
    );
  }

  const firstBad = results.find((r) => r.status === 429 || r.status === "CONN_ERROR");
  if (firstBad) {
    console.log("First real failure at request #" + firstBad.i + " (" + firstBad.scheduledAtMs + "ms in), status=" + firstBad.status);
  } else {
    console.log("No real failures - any connection hiccups resolved on retry.");
  }
}

async function main() {
  console.log("Probing auth style...");
  const { mode } = await probeAuth();
  console.log("Auth confirmed: " + mode);
  const fetchFn = buildFetch(mode);

  console.log("\n=== Pipelined test: 5/sec for 30s ===");
  const r5 = await pipelinedBurst(fetchFn, 5, 30);
  summarizeByWindow(r5, 5000, "5 req/sec sustained, 30s");

  console.log("\nCooling down 5s...");
  await new Promise((r) => setTimeout(r, 5000));

  console.log("\n=== Pipelined test: 10/sec for 30s ===");
  const r10 = await pipelinedBurst(fetchFn, 10, 30);
  summarizeByWindow(r10, 5000, "10 req/sec sustained, 30s");
}

main().catch((err) => {
  console.error("Test failed:", err instanceof Error ? err.message : "unknown");
  process.exit(1);
});
