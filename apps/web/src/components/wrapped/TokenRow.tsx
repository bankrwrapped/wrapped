import { CHAIN_LABEL, formatEth, type TokenEntry } from "@/lib/wrapped-data";
import { tokenHue, tokenInitials } from "@/lib/token-badge";
export function TokenRow({ token, index }: { token: TokenEntry; index: number }) {
  const hue = tokenHue(token.tokenAddress);
  return (
    <li
      className="glass flex items-center gap-3 rounded-2xl px-4 py-3 animate-rise"
      style={{ animationDelay: (300 + index * 110) + "ms" }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-border"
        style={{ backgroundColor: `hsl(${hue}, 60%, 38%)` }}
        aria-hidden
      >
        {tokenInitials(token.symbol)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold">{token.name}</p>
        <p className="text-xs text-muted-foreground">
          {token.symbol} · {CHAIN_LABEL[token.chain]}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display text-base font-bold text-accent">
          {formatEth(token.feesEarnedEth)}
        </p>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
          earned
        </p>
      </div>
    </li>
  );
}
