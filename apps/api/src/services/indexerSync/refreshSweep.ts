import { runScheduledRefresh } from "./refreshJob";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let running = false;

export function startRefreshSweep(chain: string): void {
  const run = async () => {
    if (running) {
      console.warn(
        `[refreshSweep] previous refresh still running for chain=${chain}; skipping`,
      );
      return;
    }

    running = true;

    try {
      await runScheduledRefresh(chain);
    } catch (err) {
      console.error(
        `[refreshSweep] refresh failed for chain=${chain}:`,
        err,
      );
    } finally {
      running = false;
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