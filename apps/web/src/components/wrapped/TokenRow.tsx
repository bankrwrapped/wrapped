import { cn } from "@/lib/utils";
import { CHAIN_LABEL, formatUsdOrUnavailable, type TokenEntry } from "@/lib/wrapped-data";
const chainDot: Record<TokenEntry["chain"], string> = {
  base: "bg-chain-base",
  robinhood: "bg-chain-robinhood",
};
export function TokenRow({ token, index }: { token: TokenEntry; index: number }) {
  return (
    <li
      className="glass flex items-center gap-3 rounded-2xl px-4 py-3 animate-rise"
      style={{ animationDelay: (300 + index * 110) + "ms" }}
    >
      <span
        className={cn(
          "size-8 shrink-0 rounded-full opacity-90 ring-1 ring-border",
          chainDot[token.chain],
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold">{token.name}</p>
        <p className="text-xs text-muted-foreground">
          {token.symbol} · {CHAIN_LABEL[token.chain]}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display text-base font-bold text-accent">
          {formatUsdOrUnavailable(token.volume)}
        </p>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {token.volume === null ? "n/a" : "volume"}
        </p>
      </div>
    </li>
  );
}