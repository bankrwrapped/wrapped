// apps/api/src/services/indexerSync/wrappedNotify.ts
//
// Called from syncJob.ts's backfillToken(), right after a token's
// backfill_status is successfully set to "complete".
//
// One token completing can affect multiple wallets (any wallet holding
// that token). For each affected wallet, re-check whether THAT wallet
// is now fully complete (all its tracked tokens done) — only notify
// the ones that just crossed the finish line, not every wallet that
// merely had this one token among others still pending.
//
// Completion is recomputed here, not read from the cached payload: the
// cached tradingVolume.isComplete was computed BEFORE this token finished,
// so it was still false at exactly the moment it mattered and the
// notification almost never fired. Recomputing also stores the fresh,
// complete volume, so the page the tweet links to shows the final number.
//
// Each wallet is notified at most once (public tweet), enforced by an
// atomic claim on wrapped_profiles.ready_notified_at.

import { createHmac } from "node:crypto";
import { walletBackfillRequestsRepository } from "../../repositories/walletBackfillRequestsRepository";
import { wrappedCacheRepository } from "../../repositories/wrappedCacheRepository";

const WEBHOOK_URL =
  "https://webhooks.bankr.bot/u/0xb4cbf18e7336ab99b7590564cd8d87f128de4ae7/wrapped-ready";
const WEBHOOK_TIMEOUT_MS = 10_000;

async function notifyWallet(walletAddress: string): Promise<void> {
  // Was `?? ""`: an unset secret silently signed with an empty key and every
  // call was rejected by the receiver. Fail loudly instead, and before
  // claiming, so the wallet stays eligible once the secret is configured.
  const secret = process.env.WRAPPED_WEBHOOK_SECRET;
  if (!secret) {
    console.error(`[wrappedNotify] WRAPPED_WEBHOOK_SECRET is not set - not notifying ${walletAddress}`);
    return;
  }

  const handle = await wrappedCacheRepository.claimReadyNotification(walletAddress);
  if (!handle) {
    console.log(`[wrappedNotify] ${walletAddress} already notified (or no cached profile), skipping`);
    return;
  }

  const body = JSON.stringify({ handle });
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wrapped-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[wrappedNotify] webhook call failed for ${walletAddress}: ${res.status}`);
      await wrappedCacheRepository.releaseReadyNotification(walletAddress);
      return;
    }
    console.log(`[wrappedNotify] notified for ${handle} (${walletAddress})`);
  } catch (err) {
    // A timeout is ambiguous (the receiver may have acted), but a missed
    // notification is recoverable and a lost claim isn't - release to retry.
    console.error(`[wrappedNotify] webhook call threw for ${walletAddress}:`, err);
    await wrappedCacheRepository.releaseReadyNotification(walletAddress);
  }
}

// Call this after a token's backfill_status is set to "complete".
export async function checkAndNotifyWalletsForToken(
  chain: string,
  tokenAddress: string,
): Promise<void> {
  // Dynamic import: wrappedService -> tradingVolumeEngine -> ... ->
  // syncJob -> this file is an import cycle; resolving it at call time
  // keeps module initialization order out of it.
  const { wrappedService } = await import("../wrappedService");

  const wallets = await walletBackfillRequestsRepository.getWalletsForToken(chain, tokenAddress);
  for (const walletAddress of wallets) {
    try {
      const completion = await walletBackfillRequestsRepository.getCompletionSummary(walletAddress);
      if (completion.total === 0 || completion.complete !== completion.total) continue;

      const tradingVolume = await wrappedService.refreshTradingVolumeNow(walletAddress);
      if (!tradingVolume?.isComplete) continue;

      await notifyWallet(walletAddress);
    } catch (err) {
      console.error(`[wrappedNotify] completion check failed for ${walletAddress}:`, err);
    }
  }
}
