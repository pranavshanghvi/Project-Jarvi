// goals.ts reuses helpers from weightStore, which imports AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  ageOn,
  dailyNetTarget,
  dayOnTarget,
  estimateRestingCalories,
  Goal,
  goalProgress,
  intakeTarget,
  isLossGoal,
  MIN_DAILY_INTAKE,
  PACE_DAILY_CALORIES,
  PACE_LB_PER_WEEK,
  projectedDate,
} from './goals';
import { toDateKey } from '../nutrition/aggregation';
import type { WeightEntry } from '../weight/weightStore';

const loss: Goal = { startWeightKg: 90, targetWeightKg: 80, pace: 'steady', startedOn: '2026-10-01' };
const gain: Goal = { startWeightKg: 60, targetWeightKg: 65, pace: 'gentle', startedOn: '2026-10-01' };
const maintain: Goal = { startWeightKg: 75, targetWeightKg: 75, pace: 'steady', startedOn: '2026-10-01' };
const today = new Date(2026, 10, 11);
const w = (date: string, kg: number): WeightEntry => ({ date, kg, source: 'manual' });

describe('pace tables', () => {
  it('has the agreed numbers', () => {
    expect(PACE_DAILY_CALORIES).toEqual({ gentle: 250, steady: 500, faster: 750 });
    expect(PACE_LB_PER_WEEK).toEqual({ gentle: 0.5, steady: 1, faster: 1.5 });
  });
});

describe('daily targets', () => {
  it('is negative for loss, positive for gain, zero to maintain', () => {
    expect(isLossGoal(loss)).toBe(true);
    expect(isLossGoal(gain)).toBe(false);
    expect(dailyNetTarget(loss)).toBe(-500);
    expect(dailyNetTarget(gain)).toBe(250);
    expect(dailyNetTarget(maintain)).toBe(0);
  });

  it('suggests burn plus the target, never below the floor', () => {
    expect(intakeTarget(2400, loss)).toBe(1900);
    expect(intakeTarget(2400, gain)).toBe(2650);
    expect(intakeTarget(1500, loss)).toBe(MIN_DAILY_INTAKE);
    expect(intakeTarget(1500.4, maintain)).toBe(1500);
  });

  it('judges a day with 100 calories of slack', () => {
    expect(dayOnTarget(-400, loss)).toBe(true);
    expect(dayOnTarget(-401, loss)).toBe(true);
    expect(dayOnTarget(-399, loss)).toBe(false);
    expect(dayOnTarget(150, gain)).toBe(true); // gain target is +250, so 150 is the floor
    expect(dayOnTarget(100, gain)).toBe(false);
    expect(dayOnTarget(120, maintain)).toBe(true);
    expect(dayOnTarget(-151, maintain)).toBe(false);
  });
});

describe('goalProgress', () => {
  it('measures the way from start to target', () => {
    const p = goalProgress(loss, 85);
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.doneKg).toBeCloseTo(5);
    expect(p.remainingKg).toBeCloseTo(5);
  });

  it('clamps when past the target or moved the wrong way', () => {
    expect(goalProgress(loss, 78)).toMatchObject({ fraction: 1, doneKg: 12, remainingKg: 0 });
    expect(goalProgress(loss, 92)).toMatchObject({ fraction: 0, doneKg: 0, remainingKg: 12 });
  });

  it('works for gain goals', () => {
    const p = goalProgress(gain, 62);
    expect(p.fraction).toBeCloseTo(0.4);
    expect(p.doneKg).toBeCloseTo(2);
    expect(p.remainingKg).toBeCloseTo(3);
  });
});

describe('projectedDate', () => {
  it('follows the real trend when there is enough history', () => {
    // losing 0.5 kg every 5 days = 0.1 kg/day; 4 kg left -> 40 days
    const weights = [w('2026-10-22', 85), w('2026-10-27', 84.5), w('2026-11-01', 84), w('2026-11-06', 83.5), w('2026-11-11', 83)];
    const g = { ...loss, targetWeightKg: 79 };
    expect(toDateKey(projectedDate(g, weights, today)!)).toBe('2026-12-21');
  });

  it('falls back to the pace when history is too short', () => {
    // steady = 1 lb/week = 0.4536 kg/week; 3 kg left at 83 -> ceil(3 / (0.45359/7)) = 47 days
    const weights = [w('2026-11-09', 83.2), w('2026-11-11', 83)];
    expect(toDateKey(projectedDate(loss, weights, today)!)).toBe('2026-12-28');
  });

  it('falls back to the pace when the trend points the wrong way', () => {
    const weights = [w('2026-10-25', 82), w('2026-11-11', 83)];
    expect(toDateKey(projectedDate(loss, weights, today)!)).toBe('2026-12-28');
  });

  it('ignores weigh-ins older than four weeks for the trend', () => {
    const weights = [w('2026-09-01', 95), w('2026-11-10', 83.1), w('2026-11-11', 83)];
    expect(toDateKey(projectedDate(loss, weights, today)!)).toBe('2026-12-28');
  });

  it('handles gain goals', () => {
    // gentle = 0.5 lb/week = 0.2268 kg/week; 2 kg left -> ceil(2 / 0.032399) = 62 days
    const weights = [w('2026-11-11', 63)];
    expect(toDateKey(projectedDate(gain, weights, today)!)).toBe('2027-01-12');
  });

  it('is null once at or past the target, or with no weight', () => {
    expect(projectedDate(loss, [w('2026-11-11', 80)], today)).toBeNull();
    expect(projectedDate(loss, [w('2026-11-11', 79)], today)).toBeNull();
    expect(projectedDate(loss, [], today)).toBeNull();
    expect(projectedDate(maintain, [w('2026-11-11', 75)], today)).toBeNull();
  });
});

describe('resting calories', () => {
  it('counts whole years only', () => {
    expect(ageOn('1985-11-12', today)).toBe(40);
    expect(ageOn('1985-11-11', today)).toBe(41);
    expect(ageOn('1985-03-09', today)).toBe(41);
  });

  it('uses Mifflin-St Jeor', () => {
    // 10*80 + 6.25*180 - 5*41 + 5 = 1725
    expect(estimateRestingCalories({ dateOfBirth: '1985-03-09', sex: 'male', heightCm: 180 }, 80, today)).toBe(1725);
    // 10*60 + 6.25*165 - 5*41 - 161 = 1265.25
    expect(estimateRestingCalories({ dateOfBirth: '1985-03-09', sex: 'female', heightCm: 165 }, 60, today)).toBe(1265);
  });
});
