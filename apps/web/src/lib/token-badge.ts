// Deterministic per-token visual identity - no external logo API (DexScreener
// coverage confirmed too sparse for real Bankr-launched tokens to be worth
// the dependency; see session notes). Same token always gets the same
// color/initials, so it's recognizable across repeat views, not random.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function tokenHue(address: string): number {
  return hashString(address) % 360;
}

export function tokenInitials(symbol: string): string {
  const clean = symbol.trim().replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length === 0) return "?";
  return clean.slice(0, 2).toUpperCase();
}
