/**
 * hasura-exposure.ts
 *
 * Is each Envio/Hasura GraphQL endpoint public, writable, or admin-open?
 * envioClient sends no auth header, so the endpoints answer anonymous
 * requests - this checks how much they answer. See KNOWN_ISSUES.md,
 * "Hasura exposure".
 *
 * Read-only: schema introspection, a one-row read of chain_metadata, and a
 * metadata export used purely as an admin-access test. No mutation is ever
 * sent. Prints verdicts only - never the URLs or response bodies (an
 * exported metadata document can contain database connection strings).
 *
 * Usage (from apps/api, with the API's env):
 *   bun run scripts/diagnostics/hasura-exposure.ts
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ENDPOINTS = [
  { chain: "base", url: process.env.ENVIO_GRAPHQL_URL_BASE },
  { chain: "robinhood", url: process.env.ENVIO_GRAPHQL_URL_ROBINHOOD },
];

const TIMEOUT_MS = 15_000;

const INTROSPECT = `{ __schema { mutationType { fields { name } } subscriptionType { name } } }`;

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  } catch (err) {
    // The code/name only - a message could echo the URL.
    const e = err as { code?: unknown; name?: string };
    const error = e?.name === "TimeoutError" ? `timeout after ${TIMEOUT_MS / 1000}s` : String(e?.code ?? e?.name ?? "error");
    return { status: 0, json: null, error };
  }
}

function mutationSummary(r: { status: number; json: any; error?: string }): string {
  const json = r.json;
  if (r.status === 0) return `unreachable (${r.error})`;
  if (json?.errors) return "introspection refused";
  if (!json?.data) return `no answer (HTTP ${r.status})`;
  const fields: string[] = json?.data?.__schema?.mutationType?.fields?.map((f: any) => f.name) ?? [];
  if (fields.length === 0) return "no mutations exposed";
  const writes = fields.filter((f) => /^(insert|update|delete)_/.test(f));
  return `${fields.length} mutation(s) exposed, ${writes.length} insert/update/delete`;
}

const PRIVATE_V4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/;

// Where the host lives, without printing it: a Railway private-network
// host (or private address) is only reachable from inside that network, so
// a timeout from outside means "not public", not "down".
async function describeHost(host: string): Promise<{ label: string; resolves: boolean }> {
  if (host.endsWith(".railway.internal")) return { label: "Railway private network (*.railway.internal)", resolves: false };
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    const priv = addrs.every((a) => PRIVATE_V4.test(a.address) || a.address.startsWith("fd") || a.address === "::1");
    return { label: priv ? "private address" : "public internet", resolves: true };
  } catch {
    return { label: "does not resolve in public DNS", resolves: false };
  }
}

async function probe(chain: string, graphqlUrl: string) {
  const url = new URL(graphqlUrl);
  const origin = url.origin;
  console.log(`\n[${chain}]`);

  const host = await describeHost(url.hostname);
  console.log(`  host:                        ${host.label}, ${url.protocol.replace(":", "")}`);
  if (!host.resolves) {
    console.log("  not reachable from here - only from inside the same network. Not publicly exposed by this URL.");
    return;
  }

  const read = await post(graphqlUrl, { query: "{ chain_metadata(limit: 1) { chain_id } }" });
  const readable = read.status === 200 && Array.isArray(read.json?.data?.chain_metadata);
  console.log(
    `  anonymous read:              ${read.status === 0 ? `unreachable (${read.error})` : readable ? "YES - data is public" : `no (HTTP ${read.status})`}`,
  );
  if (read.status === 0) {
    console.log("  public host, but nothing answered - the service may be down or firewalled. Skipping the rest.");
    return;
  }

  const anon = await post(graphqlUrl, { query: INTROSPECT });
  console.log(`  anonymous introspection:     ${mutationSummary(anon)}`);

  // Without an admin secret configured, Hasura trusts this header as-is.
  const asAdmin = await post(graphqlUrl, { query: INTROSPECT }, { "x-hasura-role": "admin" });
  console.log(`  with x-hasura-role: admin:   ${mutationSummary(asAdmin)}`);

  const meta = await post(`${origin}/v1/metadata`, { type: "export_metadata", args: {} });
  const metaOpen = meta.status === 200 && meta.json && !meta.json.error && !meta.json.code;
  console.log(
    `  metadata API (admin test):   ${meta.status === 0 ? `unreachable (${meta.error})` : metaOpen ? "OPEN - full admin access without a secret" : `refused (HTTP ${meta.status})`}`,
  );
}

async function main() {
  for (const { chain, url } of ENDPOINTS) {
    if (!url) {
      console.log(`\n[${chain}] skipped: URL not set`);
      continue;
    }
    await probe(chain, url);
  }
  console.log(
    "\nReading this: public reads are expected (the API reads anonymously). " +
      "Any insert/update/delete mutation, or an OPEN metadata API, means anyone can change or wipe indexed data.",
  );
}

main();
