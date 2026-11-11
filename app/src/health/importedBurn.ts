import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDateKey } from '../nutrition/aggregation';

// Calories burned on the WEB version. A website is not allowed to read Apple Health, so the
// numbers arrive one of two ways: an Apple Shortcut on the person's iPhone reads Health and opens
// BiteLog with the figures on the end of the address, or the person types them in.
//
// The figures ride after a "#" in the address (the fragment). Browsers never send that part to
// the server, so someone's calorie numbers do not end up in a web host's request logs.

const KEY = 'jarvi.importedBurn';
const MAX_PER_DAY = 20000; // far above any real day; guards against a mangled link

export interface DayBurn {
  active: number;
  resting: number;
}
export type BurnByDay = Record<string, DayBurn>;

// A Shortcut writes the number the way the phone's region formats it: "1620.4", "1,620.4",
// "1.620,4" or "1 620". Work out which mark is the thousands separator and drop it.
export function parseLooseNumber(value: string): number | null {
  let text = value.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (text === '' || !/^[\d.,]+$/.test(text)) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal mark.
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // Only commas: "1,620" is a thousands mark, "519,6" is a decimal mark.
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text) && text.length > 5) {
    // Only dots, grouped in threes, and too big to be a decimal: "1.620" could be either, so it
    // is left as a decimal; "12.345.678" is plainly thousands.
    text = text.replace(/\./g, '');
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function clean(value: string | null): number | null {
  if (value === null) return null;
  const number = parseLooseNumber(value);
  return number !== null && number >= 0 && number <= MAX_PER_DAY ? Math.round(number) : null;
}

// Reads a link such as "#active=520&resting=1620&yactive=610&yresting=1650". `active`/`resting`
// are for the day the link is opened; the optional y-prefixed pair is the day before, so a day
// that was last sent at 6 PM gets its full total the next morning. A lone `burned` is accepted
// too (a total with no split). Returns {} for anything that is not a burn link.
export function parseBurnLink(fragment: string, now: Date): BurnByDay {
  const params = new URLSearchParams(fragment.replace(/^[#?]/, ''));
  const result: BurnByDay = {};
  const day = (offset: number) => toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
  for (const [prefix, offset] of [['', 0], ['y', 1]] as const) {
    const active = clean(params.get(`${prefix}active`));
    const resting = clean(params.get(`${prefix}resting`));
    const total = clean(params.get(`${prefix}burned`));
    if (active !== null || resting !== null) result[day(offset)] = { active: active ?? 0, resting: resting ?? 0 };
    else if (total !== null) result[day(offset)] = { active: total, resting: 0 };
  }
  return result;
}

async function readAll(): Promise<BurnByDay> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BurnByDay) : {};
  } catch {
    return {};
  }
}

// Saves the days given, replacing what was stored for those days. A day's burn only ever grows
// as the day goes on, so a newer, larger figure should win; a smaller one for the same day (an
// old link reopened from history) is ignored.
export async function saveImportedBurn(days: BurnByDay): Promise<BurnByDay> {
  const all = await readAll();
  for (const [date, burn] of Object.entries(days)) {
    const existing = all[date];
    if (!existing || burn.active + burn.resting >= existing.active + existing.resting) all[date] = burn;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

// A figure typed in by hand always replaces what is there: the person is correcting it.
export async function setBurnForDay(date: string, burn: DayBurn): Promise<void> {
  const all = await readAll();
  all[date] = burn;
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

export async function getImportedBurn(start: Date, end: Date): Promise<BurnByDay> {
  const all = await readAll();
  const from = toDateKey(start);
  const to = toDateKey(end);
  const result: BurnByDay = {};
  for (const [date, burn] of Object.entries(all)) if (date >= from && date <= to) result[date] = burn;
  return result;
}
