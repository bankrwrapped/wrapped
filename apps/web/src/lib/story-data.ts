// Formatting and derived series shared by the story scenes and share cards.

export function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

// "2026-09-14" or a full ISO timestamp → "September 14, 2026" (UTC).
export function formatDate(iso: string, opts: { short?: boolean } = {}): string {
  return new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso).toLocaleDateString("en-US", {
    month: opts.short ? "short" : "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(
    0,
    Math.floor((now - Date.parse(iso.length === 10 ? iso + "T00:00:00Z" : iso)) / 86_400_000),
  );
}

const DAY_MS = 86_400_000;

// One entry per day from the first claim day to the last, zeros filled in,
// so a chart's x axis is real time rather than claim count.
export function dailySeries(
  daily: Array<{ date: string; eth: number }>,
): Array<{ date: string; eth: number }> {
  const byDay = new Map<number, number>();
  for (const d of daily) {
    const t = Date.parse(d.date + "T00:00:00Z");
    if (Number.isFinite(t)) byDay.set(t, (byDay.get(t) ?? 0) + d.eth);
  }
  if (byDay.size === 0) return [];
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const out: Array<{ date: string; eth: number }> = [];
  for (let t = days[0]; t <= days[days.length - 1]; t += DAY_MS) {
    out.push({ date: new Date(t).toISOString().slice(0, 10), eth: byDay.get(t) ?? 0 });
  }
  return out;
}

export type ChartBar = { date: string; end: string; eth: number };

// Bars for a claims chart: one per day for up to ~4 months, else one per
// week (Monday start, summed), so a full year still fits a phone. `end` is
// the bar's last day, for finding the bar that holds a given date.
export function chartBars(daily: Array<{ date: string; eth: number }>): ChartBar[] {
  const series = dailySeries(daily);
  if (series.length <= 120) return series.map((d) => ({ ...d, end: d.date }));
  const weeks = new Map<number, ChartBar>();
  for (const d of series) {
    const t = Date.parse(d.date + "T00:00:00Z");
    const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
    const bar = weeks.get(monday) ?? {
      date: new Date(monday).toISOString().slice(0, 10),
      end: d.date,
      eth: 0,
    };
    bar.eth += d.eth;
    bar.end = d.date;
    weeks.set(monday, bar);
  }
  return [...weeks.values()];
}

export const barHolds = (bar: ChartBar, date: string) => bar.date <= date && date <= bar.end;
