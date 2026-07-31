import { TokenRow } from "@/components/wrapped/TokenRow";
import { TokenChip } from "@/components/wrapped/TokenChip";
import type { TokenEntry } from "@/lib/wrapped-data";

export function TopTokensList({ tokens }: { tokens: TokenEntry[] }) {
  // null volume (can't be derived) sorts to the end, never treated as 0
  // or highest - Number.NEGATIVE_INFINITY as a stand-in only for compare purposes.
  const sorted = [...tokens].sort((a, b) => {
    const av = a.volume ?? Number.NEGATIVE_INFINITY;
    const bv = b.volume ?? Number.NEGATIVE_INFINITY;
    return bv - av;
  });
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="w-full space-y-4">
      <ul className="space-y-2">
        {top3.map((t, i) => (
          <TokenRow key={t.tokenAddress} token={t} index={i} />
        ))}
      </ul>

      {rest.length > 0 && (
        <ul
          className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Other tokens"
        >
          {rest.map((t, i) => (
            <TokenChip key={t.tokenAddress} token={t} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
