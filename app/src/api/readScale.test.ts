jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { scaleReadingToKg } from './readScale';

describe('scaleReadingToKg', () => {
  it('converts a reading in the unit shown on the scale', () => {
    expect(scaleReadingToKg({ weight: 82.5, unit: 'kg' }, 'lb')).toBeCloseTo(82.5, 5);
    expect(scaleReadingToKg({ weight: 181.8, unit: 'lb' }, 'kg')).toBeCloseTo(82.46, 1);
  });

  it('falls back to the person\'s own unit when the display shows none', () => {
    expect(scaleReadingToKg({ weight: 181.8, unit: null }, 'lb')).toBeCloseTo(82.46, 1);
    expect(scaleReadingToKg({ weight: 82.5 }, 'kg')).toBeCloseTo(82.5, 5);
  });

  it('gives nothing when there was no readable number', () => {
    expect(scaleReadingToKg({ weight: null, unit: null }, 'lb')).toBeNull();
    expect(scaleReadingToKg({}, 'lb')).toBeNull();
  });
});
