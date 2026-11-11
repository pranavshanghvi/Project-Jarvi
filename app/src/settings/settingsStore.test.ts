jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getChartStyle, getWeightUnit, saveChartStyle, saveWeightUnit } from './settingsStore';

beforeEach(() => AsyncStorage.clear());

describe('settingsStore', () => {
  it('defaults to pounds and remembers a change', async () => {
    expect(await getWeightUnit()).toBe('lb');
    await saveWeightUnit('kg');
    expect(await getWeightUnit()).toBe('kg');
  });

  it('falls back to the card default until a style is chosen, per card', async () => {
    expect(await getChartStyle('balance', 'bars')).toBe('bars');
    await saveChartStyle('balance', 'line');
    expect(await getChartStyle('balance', 'bars')).toBe('line');
    expect(await getChartStyle('weight', 'pie')).toBe('pie');
  });

  it('ignores an unknown stored style', async () => {
    await AsyncStorage.setItem('jarvi.settings.chartStyle.balance', 'donut');
    expect(await getChartStyle('balance', 'flow')).toBe('flow');
  });
});
