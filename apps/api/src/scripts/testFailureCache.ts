import { wrappedService } from "../services/wrappedService";
import { getBeneficiaryFeesBreakdown } from "../services/module8FeesBreakdown";

const HANDLE = process.argv[2] ?? "basedkabeer";
const RUNS = Number(process.argv[3] ?? 4);
const DELAY_MS = Number(process.argv[4] ?? 5000);

async function main() {
  const match = await wrappedService.resolveWallet(HANDLE);
  if (!match) {
    console.error(`no match for handle=${HANDLE}`);
    process.exit(1);
  }
  console.log(`testing wallet=${match.evmAddress} (${HANDLE})`);

  for (let i = 1; i <= RUNS; i++) {
    const start = Date.now();
    const result = await getBeneficiaryFeesBreakdown(match.evmAddress);
    const elapsed = Date.now() - start;
    console.log(
      `run ${i}: incomplete=${result.incomplete} reasons=${result.incompleteReasons?.length ?? 0} took=${elapsed}ms`
    );
    if (result.incompleteReasons?.length) {
      console.log(`  reasons detail: ${JSON.stringify(result.incompleteReasons, null, 2)}`);
    }
    if (i < RUNS) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

main().catch((err) => {
  console.error("script failed:", err);
  process.exit(1);
});
