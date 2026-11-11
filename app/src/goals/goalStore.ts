import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Goal } from './goals';

const KEY = 'jarvi.goal';
const PACES = ['gentle', 'steady', 'faster'];

function isGoal(value: any): value is Goal {
  return (
    !!value &&
    typeof value.startWeightKg === 'number' &&
    typeof value.targetWeightKg === 'number' &&
    PACES.includes(value.pace) &&
    typeof value.startedOn === 'string'
  );
}

export async function getGoal(): Promise<Goal | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isGoal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveGoal(goal: Goal): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(goal));
}

export async function clearGoal(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
