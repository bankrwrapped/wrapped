// apps/api/src/services/indexerSync/wrappedNotify.ts (new file)
//
// Called from syncJob.ts's backfillToken(), right after a token's
// backfill_status is successfully set to "complete" — see wiring note
// at the bottom of this file for the exact insertion point.
//
// One token completing can affect multiple wallets (any wallet holding
// that token). For each affected wallet, re-check whether THAT wallet
// is now fully complete (all its tracked tokens done) — only notify
// the ones that just crossed the finish line, not every wallet that
// merely had this one token among others still pending.
//
// UNCONFIRMED / to verify:
//   - wrappedCacheRepository.findByWallet() returning a `username` field
//     is inferred from the upsert(evmAddress, username, payload) signature
//     shown earlier this session, not independently re-read here.
//   - No "already notified" tracking exists yet. Without it, if this
//     function is ever called twice for the same now-complete wallet
//     (e.g. two of its tokens finish in quick succession, both checks
//     land after isComplete is already true), the user gets tagged
//     twice. Real gap — needs a notified_at column or similar on
//     wallet_backfill_requests (or a new small table) before this ships,
//     not solved here.

import { createHmac } from "node:crypto";
import { walletBackfillRequestsRepository } from "../../repositories/walletBackfillRequestsRepository";
import { wrappedCacheRepository } from "../../repositories/wrappedCacheRepository";

const WEBHOOK_URL =
  "https://webhooks.bankr.bot/u/0xb4cbf18e7336ab99b7590564cd8d87f128de4ae7/wrapped-ready";

function sign(body: string): string {
  const secret = process.env.WRAPPED_WEBHOOK_SECRET ?? "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

async function notifyWallet(walletAddress: string): Promise<void> {
  const cached = await wrappedCacheRepository.findByWallet(walletAddress);
  if (!cached?.username) {
    console.log(`[wrappedNotify] no cached handle for ${walletAddress}, skipping notify`);
    return;
  }

  const body = JSON.stringify({ handle: cached.username });
  const signature = sign(body);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wrapped-Signature": signature,
      },
      body,
    });
    if (!res.ok) {
      console.error(`[wrappedNotify] webhook call failed for ${walletAddress}: ${res.status}`);
      return;
    }
    console.log(`[wrappedNotify] notified for ${cached.username} (${walletAddress})`);
  } catch (err) {
    console.error(`[wrappedNotify] webhook call threw for ${walletAddress}:`, err);
  }
}

// Call this after a token's backfill_status is set to "complete".
export async function checkAndNotifyWalletsForToken(
  chain: string,
  tokenAddress: string,
): Promise<void> {
  const wallets = await walletBackfillRequestsRepository.getWalletsForToken(chain, tokenAddress);
  for (const walletAddress of wallets) {
    const cached = await wrappedCacheRepository.findByWallet(walletAddress);
    const isComplete = cached?.payload?.tradingVolume?.isComplete === true;
    if (isComplete) {
      await notifyWallet(walletAddress);
    }
  }
}
