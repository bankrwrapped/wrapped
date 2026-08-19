// apps/api/src/controllers/installCaptureController.ts
//
// GENUINELY UNCONFIRMED, more than the other two files: nothing in this
// session's research showed what Bankr actually sends on skill install
// (an install webhook? a one-time callback URL field in SKILL.md's
// frontmatter? nothing at all, and we only learn the handle on first
// invocation?). None of docs.bankr.bot/skills/* pages fetched this
// session described an install-time event.
//
// This file is written defensively against the MOST LIKELY shape
// (an install POST carrying the installer's handle/user id, similar
// in spirit to the webhook completion payload) so there's something
// real to test against — but treat every field name below as a
// placeholder to verify against Bankr's real install flow, not a
// confirmed contract. If no install-time event exists at all, the
// fallback plan is: capture the handle on first `/api/wrapped/:handle`
// call instead (that endpoint already receives it) and skip a
// dedicated install step entirely — simpler, and doesn't depend on
// an unconfirmed Bankr feature.

import { wrappedCacheRepository } from "../repositories/wrappedCacheRepository";

interface InstallEvent {
  handle: string;         // UNCONFIRMED field name
  installedAt?: string;   // UNCONFIRMED field name
}

export async function handleSkillInstall(req: Request): Promise<Response> {
  let body: InstallEvent;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.handle || body.handle.trim().length === 0) {
    return Response.json({ error: "handle required" }, { status: 400 });
  }

  const handle = body.handle.trim().replace(/^@/, "");

  // Store just enough to address this user later from the webhook
  // handler (wrapped-ready/index.ts) — reuses the same repository the
  // wrapped-serving path already writes to, no new table.
  //
  // NOTE: wrappedCacheRepository.upsert() as shown in wrappedService.ts
  // requires (evmAddress, username, payload) — we don't have a wallet
  // or payload at install time, only a handle. This call is written to
  // show INTENT, not as a drop-in-ready call — it will not compile
  // against the real repository signature without either:
  //   (a) resolving the wallet here too (extra resolveWallet() call,
  //       costs an extra Bankr API round-trip at install time), or
  //   (b) a new, smaller repository method that just records
  //       (handle) with no wallet/payload required yet.
  // Pick (a) or (b) before this ships — flagging rather than guessing.

  console.log(`[installCapture] recorded handle for later tagging: ${handle}`);

  return Response.json({ ok: true });
}