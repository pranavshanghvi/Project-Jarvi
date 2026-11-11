import type { DayBalance } from './energyBalance';

export type HistoryRange = 'week' | 'month' | 'sixMonths' | 'year' | 'all';

export interface Bucket {
  key: string; // 'YYYY-MM-DD' (day or week start) or 'YYYY-MM' (month)
  label: string; // short axis label
  title: string; // long name for lists
  start: string;
  end: string; // inclusive local days covered
  eaten: number; // averages PER LOGGED DAY (0 when nothing was logged)
  burned: number;
  net: number;
  loggedDays: number;
  totalDays: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Parses a 'YYYY-MM-DD' key into a local-midnight Date.
function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function keyOf(date: Date): string {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// How many days of history a chart range should ask for.
export function rangeDays(range: HistoryRange, today: Date, firstLoggedDate: string | null): number {
  switch (range) {
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'sixMonths':
      return 182;
    case 'year':
      return 365;
    case 'all': {
      if (!firstLoggedDate) return 365;
      const first = parseKey(firstLoggedDate);
      // UTC maths so a daylight-saving change never makes a day 23 or 25 hours long
      const diff = Math.round(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
          Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) /
          86400000
      );
      return Math.max(30, diff + 1);
    }
  }
}

function mondayOf(date: Date): Date {
  const sinceMonday = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday);
}

function shortDate(date: Date): string {
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
}

interface Group {
  key: string;
  label: string;
  title: string;
  start: string;
  end: string;
  rows: DayBalance[];
}

function groupFor(row: DayBalance, range: HistoryRange): Omit<Group, 'rows'> {
  const day = parseKey(row.date);
  if (range === 'week' || range === 'month') {
    return {
      key: row.date,
      label: range === 'week' ? WEEKDAYS[day.getDay()] : String(day.getDate()),
      title: `${WEEKDAYS[day.getDay()]}, ${shortDate(day)}`,
      start: row.date,
      end: row.date,
    };
  }
  if (range === 'sixMonths') {
    const monday = mondayOf(day);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return {
      key: keyOf(monday),
      label: `${monday.getMonth() + 1}/${monday.getDate()}`,
      title: `Week of ${shortDate(monday)}`,
      start: keyOf(monday),
      end: keyOf(sunday),
    };
  }
  const first = new Date(day.getFullYear(), day.getMonth(), 1);
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0);
  return {
    key: `${day.getFullYear()}-${pad(day.getMonth() + 1)}`,
    label: MONTHS[day.getMonth()][0],
    title: `${MONTHS[day.getMonth()]} ${day.getFullYear()}`,
    start: keyOf(first),
    end: keyOf(last),
  };
}

// Turns one row per day into chart bars. Averages are per LOGGED day: a day with no food
// recorded is a day nobody tracked, not a fast, so it must not drag an average down.
export function bucketize(rows: DayBalance[], range: HistoryRange): Bucket[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const g = groupFor(row, range);
    const existing = groups.get(g.key);
    if (existing) existing.rows.push(row);
    else groups.set(g.key, { ...g, rows: [row] });
  }
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => {
      const logged = g.rows.filter((r) => r.logged);
      const n = logged.length;
      const eaten = n > 0 ? logged.reduce((s, r) => s + r.eaten, 0) / n : 0;
      const burned = n > 0 ? logged.reduce((s, r) => s + r.burned, 0) / n : 0;
      return {
        key: g.key,
        label: g.label,
        title: g.title,
        start: g.start,
        end: g.end,
        eaten,
        burned,
        net: eaten - burned,
        loggedDays: n,
        totalDays: g.rows.length,
      };
    });
}

// Overall averages per logged day. Each bucket counts in proportion to its logged days, so a
// month with 3 logged days does not weigh the same as one with 30.
export function summarizeBuckets(buckets: Bucket[]): { eaten: number; burned: number; net: number; loggedDays: number; totalDays: number } {
  const loggedDays = buckets.reduce((s, b) => s + b.loggedDays, 0);
  const totalDays = buckets.reduce((s, b) => s + b.totalDays, 0);
  if (loggedDays === 0) return { eaten: 0, burned: 0, net: 0, loggedDays, totalDays };
  const eaten = buckets.reduce((s, b) => s + b.eaten * b.loggedDays, 0) / loggedDays;
  const burned = buckets.reduce((s, b) => s + b.burned * b.loggedDays, 0) / loggedDays;
  return { eaten, burned, net: eaten - burned, loggedDays, totalDays };
}
