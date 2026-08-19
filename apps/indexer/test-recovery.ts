// test-recovery.ts — v3: fixed fieldSelection to use the real LogField
// enum values confirmed from node_modules/@envio-dev/hypersync-client/index.d.ts
// (capitalized: BlockNumber, TransactionHash, Topic0-3, Data — not the
// lowercase names v1/v2 guessed). Read-only — makes no writes.
//
// Run from apps/indexer: bunx tsx test-recovery.ts

import { HypersyncClient } from "@envio-dev/hypersync-client";

const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const INITIALIZE_TOPIC0 = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const AIRLOCK_DEPLOY_BLOCK = 28415516;

const TARGETS: Record<string, string> = {
  BIS: "0x3e7ae0a7dcc90ef86b06b031972ae8476802bba3",
  X402: "0xd0863418b9aa5b9e3b2b7c3c96e38e6ff057bba3",
  TRENCH: "0x2234d53c2499fe180c3bcdb074e0237dd971aba3",
  WT: "0xfe967fc3fa4548d0ffa2b01e920bfea0eecaeba3",
  BEMOJI: "0xb9a5a5d47d3c8c414182dd4742c2f5bb22a5eba3",
  INF: "0x4e8cf7d96ade046b93928bdb30a3409a9e874ba3",
  ANY: "0x46af2c57124ec3ffd625ed5a9c985fd0da165ba3",
};

function toTopicAddr(addr: string): string {
  return "0x" + "0".repeat(24) + addr.replace("0x", "").toLowerCase();
}

async function main() {
  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("ENVIO_API_TOKEN not set — export it before running.");
    process.exit(1);
  }

  const client = new HypersyncClient({
    url: "https://base.hypersync.xyz",
    apiToken,
  });

  const paddedAddrs = Object.values(TARGETS).map(toTopicAddr);
  const addrToSymbol: Record<string, string> = {};
  for (const [symbol, addr] of Object.entries(TARGETS)) {
    addrToSymbol[toTopicAddr(addr)] = symbol;
  }

  const query = {
    fromBlock: AIRLOCK_DEPLOY_BLOCK,
    logs: [
      {
        address: [POOL_MANAGER],
        topics: [[INITIALIZE_TOPIC0], paddedAddrs, []],
      },
      {
        address: [POOL_MANAGER],
        topics: [[INITIALIZE_TOPIC0], [], paddedAddrs],
      },
    ],
    fieldSelection: {
      log: ["BlockNumber", "TransactionHash", "Topic0", "Topic1", "Topic2", "Data"],
    },
  };

  console.log(`Searching for ${Object.keys(TARGETS).length} tokens (server-side filtered), from block ${AIRLOCK_DEPLOY_BLOCK}...`);
  const start = Date.now();

  const receiver = await client.stream(query as any, {});
  const found: Record<string, { blockNumber: number; txHash: string; side: string }> = {};
  let batchCount = 0;

  while (true) {
    const res = await receiver.recv();
    if (res === null) break;
    batchCount++;
    console.log(`  batch ${batchCount}: ${res.data.logs.length} matching logs, elapsed ${((Date.now() - start) / 1000).toFixed(1)}s`);

    for (const log of res.data.logs) {
      const topic1 = (log.topics?.[1] || "").toLowerCase();
      const topic2 = (log.topics?.[2] || "").toLowerCase();
      const matchedAddr = addrToSymbol[topic1] ? topic1 : addrToSymbol[topic2] ? topic2 : null;
      if (!matchedAddr) continue;

      const symbol = addrToSymbol[matchedAddr];
      found[symbol] = {
        blockNumber: log.blockNumber ?? -1,
        txHash: log.transactionHash ?? "unknown",
        side: topic1 === matchedAddr ? "currency0" : "currency1",
      };
    }

    if (Object.keys(found).length === Object.keys(TARGETS).length) break;
  }

  const elapsedMs = Date.now() - start;
  console.log(`\nDone. ${elapsedMs}ms (${(elapsedMs / 1000).toFixed(1)}s) total.\n`);

  for (const [symbol, addr] of Object.entries(TARGETS)) {
    if (found[symbol]) {
      console.log(`${symbol} (${addr}): FOUND — block ${found[symbol].blockNumber}, tx ${found[symbol].txHash}, ${found[symbol].side}`);
    } else {
      console.log(`${symbol} (${addr}): NOT FOUND — genuinely missing an Initialize event`);
    }
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});