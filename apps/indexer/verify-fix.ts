// verify-fix.ts — v3: filters by the token's actual address (topic1 OR
// topic2), same as the original working query, PLUS a tight block range
// for speed. v2's bug: block range alone isn't enough since PoolManager
// is shared by the whole chain — grabbed an unrelated pool's Initialize
// event. Read-only.
//
// Run from apps/indexer: bunx tsx verify-fix.ts

import { HypersyncClient } from "@envio-dev/hypersync-client";

const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const INITIALIZE_TOPIC0 = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";

const KNOWN_CASES = [
  { symbol: "BIS", tokenAddress: "0x3e7ae0a7dcc90ef86b06b031972ae8476802bba3", block: 43359568 },
  { symbol: "TRENCH", tokenAddress: "0x2234d53c2499fe180c3bcdb074e0237dd971aba3", block: 43272954 },
];

const GRAPHQL_URL = "http://localhost:8080/v1/graphql";
const HASURA_SECRET = "testing";

function toTopicAddr(addr: string): string {
  return "0x" + "0".repeat(24) + addr.replace("0x", "").toLowerCase();
}

function topicToAddr(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

async function checkKnownAsset(tokenAddress: string): Promise<boolean> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hasura-admin-secret": HASURA_SECRET },
    body: JSON.stringify({
      query: `{ base_KnownAsset(where: {tokenAddress: {_eq: "${tokenAddress}"}}) { tokenAddress } }`,
    }),
  });
  const json = await res.json();
  return (json.data?.base_KnownAsset?.length ?? 0) > 0;
}

async function main() {
  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("ENVIO_API_TOKEN not set");
    process.exit(1);
  }

  const client = new HypersyncClient({ url: "https://base.hypersync.xyz", apiToken });

  for (const testCase of KNOWN_CASES) {
    console.log(`\n=== ${testCase.symbol} (near block ${testCase.block}) ===`);
    const paddedAddr = toTopicAddr(testCase.tokenAddress);

    // Filter by address match (topic1 OR topic2), same as the original
    // proven-working query — plus a small block-range buffer for speed.
    const query = {
      fromBlock: testCase.block - 5,
      toBlock: testCase.block + 5,
      logs: [
        { address: [POOL_MANAGER], topics: [[INITIALIZE_TOPIC0], [paddedAddr], []] },
        { address: [POOL_MANAGER], topics: [[INITIALIZE_TOPIC0], [], [paddedAddr]] },
      ],
      fieldSelection: { log: ["BlockNumber", "TransactionHash", "Topic0", "Topic1", "Topic2"] },
    };

    const receiver = await client.stream(query as any, {});
    let initLog: any = null;
    while (true) {
      const res = await receiver.recv();
      if (res === null) break;
      for (const log of res.data.logs) initLog = log;
    }

    if (!initLog) {
      console.log("No matching Initialize log found — investigate block/address.");
      continue;
    }

    const currency0 = topicToAddr(initLog.topics[1] || "");
    const currency1 = topicToAddr(initLog.topics[2] || "");
    console.log(`Real currency0: ${currency0}`);
    console.log(`Real currency1: ${currency1}`);

    const c0Known = await checkKnownAsset(currency0);
    const c1Known = await checkKnownAsset(currency1);
    console.log(`currency0 in KnownAsset? ${c0Known}`);
    console.log(`currency1 in KnownAsset? ${c1Known}`);

    const matches = (c0Known && currency0 === testCase.tokenAddress) || (c1Known && currency1 === testCase.tokenAddress);
    console.log(`Fix logic would resolve this pool to ${testCase.symbol}: ${matches ? "YES — fix works" : "NO — needs investigation"}`);
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});