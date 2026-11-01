// The signed-in handle's place on every category board, for the rankings
// scene and card. null while loading; [] when unavailable or unranked.
import { useEffect, useState } from "react";
import { fetchLeaderboards, type BoardResult } from "@/lib/wrapped-data";

export function useRanks(handle: string): BoardResult[] | null {
  const [boards, setBoards] = useState<BoardResult[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLeaderboards({ handle })
      .then((r) => !cancelled && setBoards(r.boards))
      .catch(() => !cancelled && setBoards([]));
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return boards;
}

// Boards where the handle places in the top half, best placing (by share
// of the board) first. A bottom-of-the-board rank isn't worth a slide.
export function topPlacings(boards: BoardResult[] | null, limit = 4): BoardResult[] {
  return (boards ?? [])
    .filter((b) => b.personal && b.personal.rank / b.total <= 0.5)
    .sort((a, b) => a.personal!.rank / a.total - b.personal!.rank / b.total)
    .slice(0, limit);
}
