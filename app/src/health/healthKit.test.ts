jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn().mockResolvedValue(true),
  requestAuthorization: jest.fn().mockResolvedValue(true),
  queryStatisticsCollectionForQuantity: jest.fn(),
  queryQuantitySamples: jest.fn(),
  queryWorkoutSamples: jest.fn(),
  getDateOfBirthAsync: jest.fn(),
  getBiologicalSexAsync: jest.fn(),
}));

import {
  getBiologicalSexAsync,
  getDateOfBirthAsync,
  queryQuantitySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';
import {
  addDailyStats,
  getCaloriesBurnedByDay,
  getEnergySplitByDay,
  getHealthProfile,
  getHealthWeights,
  getWorkouts,
  requestHealthPermissions,
} from './healthKit';

const mockedQuery = queryStatisticsCollectionForQuantity as unknown as jest.Mock;

describe('addDailyStats', () => {
  it('keys totals by local calendar day and adds to what is already there', () => {
    const result = addDailyStats({ '2026-11-10': 400 }, [
      { startDate: new Date(2026, 10, 10), sumQuantity: { quantity: 1700 } },
      { startDate: new Date(2026, 10, 9), sumQuantity: { quantity: 1650 } },
    ]);
    expect(result).toEqual({ '2026-11-10': 2100, '2026-11-09': 1650 });
  });

  it('ignores days with no total', () => {
    expect(addDailyStats({}, [{ startDate: new Date(2026, 10, 10) }, { sumQuantity: { quantity: 5 } }])).toEqual({});
  });
});

describe('getCaloriesBurnedByDay', () => {
  beforeEach(() => mockedQuery.mockReset());

  it('sums active and resting energy for each day', async () => {
    mockedQuery
      .mockResolvedValueOnce([{ startDate: new Date(2026, 10, 10), sumQuantity: { quantity: 450 } }])
      .mockResolvedValueOnce([{ startDate: new Date(2026, 10, 10), sumQuantity: { quantity: 1750 } }]);
    const burned = await getCaloriesBurnedByDay(new Date(2026, 10, 10, 9), new Date(2026, 10, 10, 18));
    expect(burned).toEqual({ '2026-11-10': 2200 });
    expect(mockedQuery.mock.calls.map((c) => c[0])).toEqual([
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierBasalEnergyBurned',
    ]);
  });

  it('asks for whole local days, midnight to midnight', async () => {
    mockedQuery.mockResolvedValue([]);
    await getCaloriesBurnedByDay(new Date(2026, 10, 4, 13), new Date(2026, 10, 10, 18));
    const [, , anchor, interval, options] = mockedQuery.mock.calls[0];
    expect(anchor).toEqual(new Date(2026, 10, 4));
    expect(interval).toEqual({ day: 1 });
    expect(options.filter.date).toEqual({ startDate: new Date(2026, 10, 4), endDate: new Date(2026, 10, 11) });
    expect(options.unit).toBe('kcal');
  });

  it('returns nothing rather than throwing when Health refuses', async () => {
    mockedQuery.mockRejectedValue(new Error('not authorized'));
    expect(await getCaloriesBurnedByDay(new Date(), new Date())).toEqual({});
  });
});

describe('requestHealthPermissions', () => {
  it('asks to read energy, workouts, weight, height, birth date and sex, and never to write', async () => {
    expect(await requestHealthPermissions()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: [
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierBasalEnergyBurned',
        'HKWorkoutTypeIdentifier',
        'HKQuantityTypeIdentifierBodyMass',
        'HKQuantityTypeIdentifierHeight',
        'HKCharacteristicTypeIdentifierDateOfBirth',
        'HKCharacteristicTypeIdentifierBiologicalSex',
      ],
    });
  });
});

describe('getEnergySplitByDay', () => {
  beforeEach(() => mockedQuery.mockReset());

  it('keeps active and resting energy apart per day', async () => {
    mockedQuery
      .mockResolvedValueOnce([{ startDate: new Date(2026, 10, 10), sumQuantity: { quantity: 450 } }])
      .mockResolvedValueOnce([
        { startDate: new Date(2026, 10, 10), sumQuantity: { quantity: 1750 } },
        { startDate: new Date(2026, 10, 11), sumQuantity: { quantity: 900 } },
      ]);
    expect(await getEnergySplitByDay(new Date(2026, 10, 10), new Date(2026, 10, 11))).toEqual({
      '2026-11-10': { active: 450, resting: 1750 },
      '2026-11-11': { active: 0, resting: 900 },
    });
  });

  it('returns nothing when Health refuses', async () => {
    mockedQuery.mockRejectedValue(new Error('no'));
    expect(await getEnergySplitByDay(new Date(), new Date())).toEqual({});
  });
});

describe('getWorkouts', () => {
  const mockedWorkouts = queryWorkoutSamples as unknown as jest.Mock;
  const workout = (over: object) => ({
    uuid: 'a',
    workoutActivityType: 37,
    startDate: new Date(2026, 10, 10, 7),
    endDate: new Date(2026, 10, 10, 7, 45),
    duration: { quantity: 2700, unit: 's' },
    totalEnergyBurned: { quantity: 420.4, unit: 'kcal' },
    totalDistance: { quantity: 6500, unit: 'm' },
    metadata: {},
    ...over,
  });

  it('maps library workouts to plain ones, newest first', async () => {
    mockedWorkouts.mockResolvedValue([
      workout({ uuid: 'old', startDate: new Date(2026, 10, 9, 7), endDate: new Date(2026, 10, 9, 8), workoutActivityType: 50, totalDistance: undefined }),
      workout({ uuid: 'new' }),
    ]);
    const result = await getWorkouts(new Date(2026, 10, 9), new Date(2026, 10, 10));
    expect(result.map((w) => w.id)).toEqual(['new', 'old']);
    expect(result[0]).toEqual({
      id: 'new',
      name: 'Outdoor run',
      start: new Date(2026, 10, 10, 7).toISOString(),
      end: new Date(2026, 10, 10, 7, 45).toISOString(),
      minutes: 45,
      calories: 420,
      distanceMeters: 6500,
    });
    expect(result[1].name).toBe('Strength training');
    expect(result[1]).not.toHaveProperty('distanceMeters');
    expect(mockedWorkouts.mock.calls[0][0].filter.date).toEqual({
      startDate: new Date(2026, 10, 9),
      endDate: new Date(2026, 10, 11),
    });
  });

  it('names indoor runs, walks and unknown activities', async () => {
    mockedWorkouts.mockResolvedValue([
      workout({ uuid: '1', metadata: { HKIndoorWorkout: true } }),
      workout({ uuid: '2', workoutActivityType: 52 }),
      workout({ uuid: '3', workoutActivityType: 3000 }),
    ]);
    const names = (await getWorkouts(new Date(), new Date())).map((w) => w.name).sort();
    expect(names).toEqual(['Indoor run', 'Walk', 'Workout']);
  });

  it('returns nothing rather than throwing', async () => {
    mockedWorkouts.mockRejectedValue(new Error('no'));
    expect(await getWorkouts(new Date(), new Date())).toEqual([]);
  });
});

describe('getHealthWeights', () => {
  const mockedSamples = queryQuantitySamples as unknown as jest.Mock;

  it('keeps the latest reading of each local day, ascending', async () => {
    mockedSamples.mockResolvedValue([
      { quantity: 81.2, startDate: new Date(2026, 10, 10, 7) },
      { quantity: 80.9, startDate: new Date(2026, 10, 10, 21) },
      { quantity: 82, startDate: new Date(2026, 10, 8, 7) },
    ]);
    const result = await getHealthWeights(new Date(2026, 10, 8), new Date(2026, 10, 10));
    expect(result.map((e) => [e.date, e.kg, e.source])).toEqual([
      ['2026-11-08', 82, 'health'],
      ['2026-11-10', 80.9, 'health'],
    ]);
    expect(mockedSamples.mock.calls[0][0]).toBe('HKQuantityTypeIdentifierBodyMass');
    expect(mockedSamples.mock.calls[0][1].unit).toBe('kg');
  });

  it('returns nothing rather than throwing', async () => {
    mockedSamples.mockRejectedValue(new Error('no'));
    expect(await getHealthWeights(new Date(), new Date())).toEqual([]);
  });
});

describe('getHealthProfile', () => {
  const mockedSamples = queryQuantitySamples as unknown as jest.Mock;

  it('collects birth date, sex, height and weight', async () => {
    (getDateOfBirthAsync as jest.Mock).mockResolvedValue(new Date(1985, 2, 9));
    (getBiologicalSexAsync as jest.Mock).mockResolvedValue(2);
    mockedSamples.mockImplementation(async (id: string) => [{ quantity: id.endsWith('Height') ? 178 : 82.5 }]);
    expect(await getHealthProfile()).toEqual({ dateOfBirth: '1985-03-09', sex: 'male', heightCm: 178, weightKg: 82.5 });
  });

  it('keeps what it could read when other items fail or are unset', async () => {
    (getDateOfBirthAsync as jest.Mock).mockResolvedValue(undefined);
    (getBiologicalSexAsync as jest.Mock).mockResolvedValue(0); // not set
    mockedSamples.mockImplementation(async (id: string) => {
      if (id.endsWith('Height')) throw new Error('denied');
      return [{ quantity: 70 }];
    });
    expect(await getHealthProfile()).toEqual({ weightKg: 70 });
  });
});

describe('off iOS', () => {
  const original = Platform.OS;
  beforeAll(() => {
    Platform.OS = 'android';
  });
  afterAll(() => {
    Platform.OS = original;
  });

  it('returns empty values everywhere', async () => {
    const now = new Date();
    expect(await getWorkouts(now, now)).toEqual([]);
    expect(await getEnergySplitByDay(now, now)).toEqual({});
    expect(await getCaloriesBurnedByDay(now, now)).toEqual({});
    expect(await getHealthWeights(now, now)).toEqual([]);
    expect(await getHealthProfile()).toEqual({});
  });
});
