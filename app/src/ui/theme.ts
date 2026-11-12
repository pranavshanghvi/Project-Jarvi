import { Platform, useWindowDimensions } from 'react-native';

// One place for the app's look. The glass recipe (see-through card, blur, bright top edge, soft
// colour glow behind the page) is the same one Snaptly uses; only the two glow colours differ,
// because here colour carries meaning: orange is what you ate, teal is what you burned.
export const colors = {
  page: '#07080F',
  text: '#F2F4F7',
  muted: '#8A94A3',
  placeholder: 'rgba(255, 255, 255, 0.26)', // hint text in an empty field: clearly dimmer than a typed value
  eaten: '#FFB067',
  eatenDeep: '#C9742B',
  eatenPale: '#FFE3C4',
  burned: '#2FB8AC',
  burnedDeep: '#1F5E5A',
  danger: '#FF8A80',
  ink: '#04211E', // text on teal glass buttons
  glassFill: 'rgba(28, 34, 48, 0.52)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',
  glassEdge: 'rgba(255, 255, 255, 0.28)',
  hairline: 'rgba(255, 255, 255, 0.08)',
  track: 'rgba(255, 255, 255, 0.10)',
  outline: 'rgba(255, 255, 255, 0.16)',
  selected: 'rgba(255, 255, 255, 0.20)',
};

// Apple's rounded numerals for the big numbers; ordinary system text everywhere else.
export const numberFont = Platform.select({ ios: 'ui-rounded', default: undefined });

// Width available to a chart sitting inside a card on a normal screen. Read from the live window
// (a browser can be resized and starts out reporting 0), and never allowed to go below a size a
// chart can actually be drawn in.
export function useChartWidth(): number {
  const { width } = useWindowDimensions();
  return Math.max(220, Math.min(width, 480) - 40 - 30);
}

export function formatCalories(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

// "−619" / "+120" / "0": a real minus sign, because a hyphen reads as a dash.
export function formatSigned(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded).toLocaleString('en-US')}`;
}

// Text size for the figure in the middle of the Today ring. The ring's inside is about 120
// points wide, so a longer figure ("−1,566") needs smaller type than a short one ("+130") or it
// wraps onto a second line, which is what happened on a real phone on 2026-11-11.
export function ringNumberSize(text: string): number {
  if (text.length <= 4) return 36;
  if (text.length <= 5) return 32;
  if (text.length <= 6) return 27;
  return 22;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
