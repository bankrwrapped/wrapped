// When a wallet claims, from dailyEarnings (Bankr's last 90 days, one entry
// per claim day, UTC dates). Bankr gives no launch timestamps, so the rhythm
// card is about claims, and by day rather than by hour.

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

// "Tue" → "Tuesdays", for copy like "Tuesdays are payday".
export function weekdayPlural(day: (typeof WEEKDAYS)[number]): string {
  return WEEKDAY_NAMES[WEEKDAYS.indexOf(day)] + "s";
}

export type RhythmCell = { date: string; eth: number };

export type ClaimRhythm = {
  // Columns of 7 (Mon..Sun), oldest week first, covering the series' range.
  // null pads days before the first or after the last date.
  weeks: Array<Array<RhythmCell | null>>;
  claimDays: number;
  // Claim days per weekday, Mon..Sun.
  byWeekday: number[];
  busiestWeekday: (typeof WEEKDAYS)[number] | null;
};

const DAY_MS = 86_400_000;
const weekdayIndex = (t: number) => (new Date(t).getUTCDay() + 6) % 7; // Mon = 0

export function claimRhythm(daily: Array<{ date: string; eth: number }>): ClaimRhythm {
  const days = daily
    .map((d) => ({ date: d.date, eth: d.eth, t: Date.parse(d.date + "T00:00:00Z") }))
    .filter((d) => Number.isFinite(d.t))
    .sort((a, b) => a.t - b.t);

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const ethByDate = new Map<number, number>();
  for (const d of days) {
    ethByDate.set(d.t, (ethByDate.get(d.t) ?? 0) + d.eth);
  }
  for (const [t, eth] of ethByDate) if (eth > 0) byWeekday[weekdayIndex(t)] += 1;

  const weeks: ClaimRhythm["weeks"] = [];
  if (days.length > 0) {
    const first = days[0].t;
    const last = days[days.length - 1].t;
    const start = first - weekdayIndex(first) * DAY_MS;
    for (let weekStart = start; weekStart <= last; weekStart += 7 * DAY_MS) {
      const week: Array<RhythmCell | null> = [];
      for (let i = 0; i < 7; i++) {
        const t = weekStart + i * DAY_MS;
        week.push(t < first || t > last ? null : { date: new Date(t).toISOString().slice(0, 10), eth: ethByDate.get(t) ?? 0 });
      }
      weeks.push(week);
    }
  }

  const max = Math.max(...byWeekday);
  return {
    weeks,
    claimDays: byWeekday.reduce((a, b) => a + b, 0),
    byWeekday,
    busiestWeekday: max > 0 ? WEEKDAYS[byWeekday.indexOf(max)] : null,
  };
}
