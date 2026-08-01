import { CHAIN_LABEL, formatEth, type TokenEntry } from "@/lib/wrapped-data";
const chainDot: Record<TokenEntry["chain"], string> = {
  base: "bg-chain-base",
  robinhood: "bg-chain-robinhood",
};
export function TokenChip({ token, index }: { token: TokenEntry; index: number }) {
  return (
    <li
      className="glass flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 animate-rise"
      style={{ animationDelay: (700 + index * 60) + "ms" }}
      title={CHAIN_LABEL[token.chain]}
    >
      <span className={`size-2 shrink-0 rounded-full ${chainDot[token.chain]}`} aria-hidden />
      <span className="max-w-[7rem] truncate text-xs font-medium">{token.symbol}</span>
      <span className="text-xs font-semibold text-muted-foreground">{formatEth(token.feesEarnedEth)}</span>
    </li>
  );
}
