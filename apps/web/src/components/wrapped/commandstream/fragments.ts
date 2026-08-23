// apps/web/src/components/wrapped/commandstream/fragments.ts
//
// Phase 1 of 2 — the ambient fragment pool for the command-stream background.
// Recognizable Base tickers in CLEARLY-ILLUSTRATIVE Bankr command syntax.
// Amounts are round, obvious examples — never invented transaction numbers
// passed off as real activity. Real leaderboard data is a separate layer
// (phase 2).
//
// $BNW is the "main character" — weighted to appear most, since this whole
// site is about it. Other tickers are occasional texture.

// Recognizable Base tokens people remember. $BNW leads.
const TICKERS = ["$BNW", "$BNKR", "$DEGEN", "$BRETT", "$TOSHI", "$HIGHER", "$MOCHI"];

// Command TEMPLATES — illustrative syntax, not claims of activity. {t} is a
// ticker slot. Amounts are round examples only.
const TEMPLATES = [
  "buy $100 of {t}",
  "swap ETH → {t}",
  "sell {t}",
  "launch {t}",
  "claim rewards",
  "send {t} to @handle",
  "limit buy {t}",
  "@bankrbot price {t}",
  "bridge {t} to Base",
  "stake {t}",
];

// Build the pool with $BNW over-represented (main character).
export function buildFragments(): string[] {
  const out: string[] = [];
  for (const tpl of TEMPLATES) {
    if (!tpl.includes("{t}")) {
      out.push(tpl);
      continue;
    }
    // $BNW gets every template; others get a subset, so $BNW dominates.
    out.push(tpl.replace("{t}", "$BNW"));
    // A couple of other tickers per template for texture.
    const others = pickTwo(TICKERS.filter((t) => t !== "$BNW"), tpl);
    for (const t of others) out.push(tpl.replace("{t}", t));
  }
  // Extra standalone $BNW mentions so it recurs as the through-line.
  out.push("$BNW", "$BNW · Robinhood Chain", "your $BNW year");
  return out;
}

// Deterministic-ish two-pick so the pool is stable across renders.
function pickTwo(arr: string[], seedStr: string): string[] {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 9973;
  const a = arr[seed % arr.length];
  const b = arr[(seed * 7 + 3) % arr.length];
  return a === b ? [a] : [a, b];
}

// Which fragments carry the orange "this one matters" accent: anything
// mentioning $BNW. (Phase 2 also accents real leaderboard fragments.)
export function isAccented(fragment: string): boolean {
  return fragment.includes("$BNW");
}