import { getHistoricalPriceUsd } from "../services/pricingService";

const [chain, tokenAddress, poolId, timestampStr] = process.argv.slice(2);
if (!chain || !tokenAddress || !poolId || !timestampStr) {
  console.error("Usage: bun run src/scripts/testPricing.ts <chain> <tokenAddress> <poolId> <unixTimestamp>");
  process.exit(1);
}

async function main() {
  const price = await getHistoricalPriceUsd(chain, tokenAddress, Number(timestampStr), poolId);
  console.log("PRICE:", price);
}

main().catch((err) => {
  console.error("PRICING FAILED:", err.message);
  process.exit(1);
});
