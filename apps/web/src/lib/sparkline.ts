// Renders a numeric series as an inline sparkline using Unicode block
// characters — genuine terminal/CLI vocabulary, not a chart widget wearing
// a terminal costume. Used in Scene 3's activity log to show the
// dailyEarnings trend inline in Departure Mono, no chart component needed.
//
// Per locked decision (2026-08-15): renders whatever data is present,
// however sparse — no minimum-history floor. An empty or all-zero series
// still returns a valid, non-broken string.

// Eight levels, matching the eight-step block ramp. Index 0 is the lowest
// non-empty level; a true zero-value slot renders as the baseline block so
// the row keeps a consistent height instead of showing gaps.
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

// Rendered for a slot whose value is exactly zero — distinct from a low-
// but-nonzero slot, so "no activity that day" reads differently from "a
// little activity that day". A middle dot sits visually below the blocks.
const EMPTY_SLOT = "·";

export type SparklineOptions = {
  // If the series is longer than this, it's downsampled to fit (averaging
  // buckets, not truncating — so the whole span stays represented). If
  // shorter, it's rendered as-is; we never pad it out to width.
  width?: number;
};

/**
 * Turn a series of numbers into a sparkline string.
 *
 * - Empty input → "" (caller decides what to show instead; never throws)
 * - All-zero input → a row of EMPTY_SLOT of the series' length
 * - Otherwise → block chars scaled against the series max, zeros as EMPTY_SLOT
 */
export function sparkline(values: number[], opts: SparklineOptions = {}): string {
  if (values.length === 0) return "";

  const series = opts.width && values.length > opts.width
    ? downsample(values, opts.width)
    : values;

  const max = Math.max(...series);

  // All zero (or negative-safe: nothing above zero) — no scale to draw
  // against, so the whole row is the empty-slot marker. Still a valid,
  // fixed-width string, never a broken render.
  if (max <= 0) return EMPTY_SLOT.repeat(series.length);

  return series
    .map((v) => {
      if (v <= 0) return EMPTY_SLOT;
      // Scale into 0..(BLOCKS.length-1). A tiny-but-nonzero value should
      // still show at least the lowest block, never collapse to baseline —
      // so we floor to a minimum index of 0 (BLOCKS[0]), not to EMPTY_SLOT.
      const ratio = v / max;
      const idx = Math.min(BLOCKS.length - 1, Math.max(0, Math.round(ratio * (BLOCKS.length - 1))));
      return BLOCKS[idx];
    })
    .join("");
}

// Average the series down into `width` buckets. Averaging (not sampling
// every Nth point) keeps spikes from being silently dropped between
// samples — a busy day inside a bucket still lifts that bucket's block.
function downsample(values: number[], width: number): number[] {
  const bucketSize = values.length / width;
  const out: number[] = [];
  for (let i = 0; i < width; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const slice = values.slice(start, Math.max(end, start + 1));
    const avg = slice.reduce((s, n) => s + n, 0) / slice.length;
    out.push(avg);
  }
  return out;
}