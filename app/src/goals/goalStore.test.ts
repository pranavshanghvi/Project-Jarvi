jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearGoal, getGoal, saveGoal } from './goalStore';

beforeEach(() => AsyncStorage.clear());

describe('goalStore', () => {
  const goal = { startWeightKg: 90, targetWeightKg: 80, pace: 'steady' as const, startedOn: '2026-11-01' };

  it('saves, reads and clears a goal', async () => {
    expect(await getGoal()).toBeNull();
    await saveGoal(goal);
    expect(await getGoal()).toEqual(goal);
    await clearGoal();
    expect(await getGoal()).toBeNull();
  });

  it('ignores a damaged goal', async () => {
    await AsyncStorage.setItem('jarvi.goal', JSON.stringify({ ...goal, pace: 'insane' }));
    expect(await getGoal()).toBeNull();
  });
});
