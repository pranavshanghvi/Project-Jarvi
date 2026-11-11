import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeightUnit } from '../units';

export type ChartStyle = 'bars' | 'line' | 'pie' | 'flow';

const UNIT_KEY = 'jarvi.settings.weightUnit';
const chartKey = (cardId: string) => `jarvi.settings.chartStyle.${cardId}`;
const CHART_STYLES: ChartStyle[] = ['bars', 'line', 'pie', 'flow'];

// Pounds is the default because the app's owner thinks in pounds.
export async function getWeightUnit(): Promise<WeightUnit> {
  try {
    const raw = await AsyncStorage.getItem(UNIT_KEY);
    return raw === 'kg' || raw === 'lb' ? raw : 'lb';
  } catch {
    return 'lb';
  }
}

export async function saveWeightUnit(unit: WeightUnit): Promise<void> {
  await AsyncStorage.setItem(UNIT_KEY, unit);
}

// Each dashboard card remembers its own chart style; `fallback` is the card's built-in default.
export async function getChartStyle(cardId: string, fallback: ChartStyle): Promise<ChartStyle> {
  try {
    const raw = await AsyncStorage.getItem(chartKey(cardId));
    return CHART_STYLES.includes(raw as ChartStyle) ? (raw as ChartStyle) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveChartStyle(cardId: string, style: ChartStyle): Promise<void> {
  await AsyncStorage.setItem(chartKey(cardId), style);
}
