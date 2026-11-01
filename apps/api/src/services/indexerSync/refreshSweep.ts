import { runScheduledRefresh } from "./refreshJob";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Per chain: one chain's slow refresh mustn't make the other's skip.
const running = new Set<string>();

export function startRefreshSweep(chain: string): void {
  const run = async () => {
    if (running.has(chain)) {
      console.warn(
        `[refreshSweep] previous refresh still running for chain=${chain}; skipping`,
      );
      return;
    }

    running.add(chain);

    try {
      await runScheduledRefresh(chain);
    } catch (err) {
      console.error(
        `[refreshSweep] refresh failed for chain=${chain}:`,
        err,
      );
    } finally {
      running.delete(chain);
    }
  };

  // Run immediately on boot.
  run().catch((err) =>
    console.error(`[refreshSweep] initial refresh failed:`, err),
  );

  setInterval(() => {
    run().catch((err) =>
      console.error(`[refreshSweep] periodic refresh failed:`, err),
    );
  }, REFRESH_INTERVAL_MS);
}