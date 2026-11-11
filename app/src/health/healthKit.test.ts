jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailable: jest.fn().mockResolvedValue(true),
  requestAuthorization: jest.fn().mockResolvedValue(true),
  queryStatisticsCollectionForQuantity: jest.fn(),
}));

import { queryStatisticsCollectionForQuantity, requestAuthorization } from '@kingstinct/react-native-healthkit';
import { addDailyStats, getCaloriesBurnedByDay, requestHealthPermissions } from './healthKit';

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
  it('asks to read active and resting energy only', async () => {
    expect(await requestHealthPermissions()).toBe(true);
    expect(requestAuthorization).toHaveBeenCalledWith({
      toRead: ['HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierBasalEnergyBurned'],
    });
  });
});
