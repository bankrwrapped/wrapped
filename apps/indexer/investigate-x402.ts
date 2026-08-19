// investigate-x402.ts — find out X402's real creation/trading mechanism.
// It's in KnownAsset (Airlock.Create fired) but has zero
// PoolManager.Initialize event — this pulls the real Create tx details
// plus every event X402's own contract has ever emitted, to identify what
// non-standard-V4 mechanism it actually uses. Read-only.
//
// Run from apps/indexer: bunx tsx investigate-x402.ts

import { HypersyncClient } from "@envio-dev/hypersync-client";

const AIRLOCK = "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12";
const X402 = "0xd0863418b9aa5b9e3b2b7c3c96e38e6ff057bba3";
const AIRLOCK_DEPLOY_BLOCK = 28415516;

// keccak256("Create(address,address,address,address)") — computed fresh,
// matching the real event signature already confirmed working in
// config.yaml: "Create(address asset, address indexed numeraire, address initializer, address poolOrHook)"

function toTopicAddr(addr: string): string {
  return "0x" + "0".repeat(24) + addr.replace("0x", "").toLowerCase();
}

async function main() {
  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("ENVIO_API_TOKEN not set");
    process.exit(1);
  }

  const client = new HypersyncClient({ url: "https://base.hypersync.xyz", apiToken });

  console.log("=== Step 1: X402's own contract — every event it has ever emitted ===");
  const query1 = {
    fromBlock: AIRLOCK_DEPLOY_BLOCK,
    logs: [{ address: [X402] }],
    fieldSelection: {
      log: ["BlockNumber", "TransactionHash", "Address", "Topic0", "Topic1", "Topic2", "Data"],
    },
  };

  const receiver1 = await client.stream(query1 as any, {});
  const topic0Counts: Record<string, number> = {};
  let total1 = 0;
  while (true) {
    const res = await receiver1.recv();
    if (res === null) break;
    for (const log of res.data.logs) {
      total1++;
      const t0 = log.topics?.[0] || "unknown";
      topic0Counts[t0] = (topic0Counts[t0] || 0) + 1;
    }
  }
  console.log(`X402 contract emitted ${total1} total events across its lifetime.`);
  console.log("Distinct event signatures (topic0) and counts:");
  for (const [t0, count] of Object.entries(topic0Counts)) {
    console.log(`  ${t0}: ${count} times`);
  }

  console.log("\n=== Step 2: Airlock.Create transaction involving X402 — full tx context ===");
  const paddedX402 = toTopicAddr(X402);
  const query2 = {
    fromBlock: AIRLOCK_DEPLOY_BLOCK,
    logs: [{ address: [AIRLOCK] }],
    fieldSelection: {
      log: ["BlockNumber", "TransactionHash", "Topic0", "Topic1", "Topic2", "Data"],
    },
  };
  const receiver2 = await client.stream(query2 as any, {});
  let createTx: any = null;
  while (true) {
    const res = await receiver2.recv();
    if (res === null) break;
    for (const log of res.data.logs) {
      // Create's `asset` param is unindexed (in `data`, not topics) per the
      // real signature — check if X402's address appears in the raw data.
      if ((log.data || "").toLowerCase().includes(X402.replace("0x", "").toLowerCase())) {
        createTx = log;
      }
    }
  }
  if (createTx) {
    console.log(`Found: block ${createTx.blockNumber}, tx ${createTx.transactionHash}`);
    console.log(`Raw data: ${createTx.data}`);
  } else {
    console.log("Could not find X402's Create tx via data-field text match — may need manual lookup.");
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});