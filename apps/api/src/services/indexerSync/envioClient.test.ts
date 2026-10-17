// GraphQL the API sends to Envio: keyset (blockNumber, logIndex) paging,
// recipient matched in both cases, only earned-fee event types, and
// launchedToken selected only where the indexer has it (Base).
import "../../test/setupEnv";
import { test, expect, beforeEach, afterAll } from "bun:test";

const { fetchIndexedFeeEventsPage, fetchIndexedSwapsPage, cursorAfterBlock, cursorAfterEvent } = await import(
  "./envioClient"
);

let requests: { url: string; query: string; variables: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  requests.push({ url: String(url), query: body.query, variables: body.variables });
  const root = body.query.includes("IndexedSwap(") ? "IndexedSwap" : "IndexedFeeEvent";
  return Response.json({ data: { [root]: [] } });
}) as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });
beforeEach(() => { requests = []; });

test("cursor helpers", () => {
  expect(cursorAfterBlock("0")).toEqual({ blockNumber: "0", logIndex: 2147483647 });
  expect(cursorAfterEvent({ blockNumber: "12", logIndex: 4 })).toEqual({ blockNumber: "12", logIndex: 4 });
});

test("fee events: keyset paging, both address cases, earned-fee types, launchedToken on base", async () => {
  await fetchIndexedFeeEventsPage("base", "0xAbCdEf", { blockNumber: "500", logIndex: 7 });
  const [r] = requests;
  expect(r.url).toBe("http://envio-base.test/v1/graphql");
  expect(r.variables.recipients).toEqual(["0xabcdef", "0xAbCdEf"]);
  expect(r.variables.fromBlock).toBe("500");
  expect(r.variables.fromLogIndex).toBe(7);
  expect(r.query).toContain("_or:");
  expect(r.query).toContain("logIndex: { _gt: $fromLogIndex }");
  expect(r.query).toContain('order_by: [{ blockNumber: asc }, { logIndex: asc }]');
  expect(r.query).toContain('eventType: { _in: ["Release","StoreTokens"] }');
  expect(r.query).not.toContain("ClaimTokens");
  expect(r.query).toContain("launchedToken");
});

test("fee events: robinhood doesn't select launchedToken (its indexer has no such column)", async () => {
  await fetchIndexedFeeEventsPage("robinhood", "0xabc", cursorAfterBlock("0"));
  const [r] = requests;
  expect(r.url).toBe("http://envio-robinhood.test/v1/graphql");
  expect(r.query).not.toContain("launchedToken");
  expect(r.variables.recipients).toEqual(["0xabc"]); // already lowercase: no duplicate
});

test("swaps: keyset paging", async () => {
  await fetchIndexedSwapsPage("base", "0xtoken", { blockNumber: "42", logIndex: 3 });
  const [r] = requests;
  expect(r.variables.fromBlock).toBe("42");
  expect(r.variables.fromLogIndex).toBe(3);
  expect(r.query).toContain("{ blockNumber: { _eq: $fromBlock }, logIndex: { _gt: $fromLogIndex } }");
  expect(r.query).toContain('order_by: [{ blockNumber: asc }, { logIndex: asc }]');
});
