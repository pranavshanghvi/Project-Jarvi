jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getImportedBurn, parseBurnLink, parseLooseNumber, saveImportedBurn, setBurnForDay } from './importedBurn';

const now = new Date(2026, 10, 11, 21, 0, 0); // local 11 Nov 2026, 9 PM

describe('parseBurnLink', () => {
  it('reads today and yesterday from a Shortcut link', () => {
    expect(parseBurnLink('#active=520&resting=1620&yactive=610&yresting=1650', now)).toEqual({
      '2026-11-11': { active: 520, resting: 1620 },
      '2026-11-10': { active: 610, resting: 1650 },
    });
  });

  it('accepts decimals (Health reports them) and a single total', () => {
    expect(parseBurnLink('#active=519.6&resting=1620.4', now)).toEqual({ '2026-11-11': { active: 520, resting: 1620 } });
    expect(parseBurnLink('burned=2140', now)).toEqual({ '2026-11-11': { active: 2140, resting: 0 } });
    expect(parseBurnLink('#active=1,020.5&resting=1,620', now)).toEqual({ '2026-11-11': { active: 1021, resting: 1620 } });
  });

  it('ignores anything that is not a sane burn figure', () => {
    expect(parseBurnLink('', now)).toEqual({});
    expect(parseBurnLink('#/some/page', now)).toEqual({});
    expect(parseBurnLink('#active=abc&resting=-5', now)).toEqual({});
    expect(parseBurnLink('#active=999999', now)).toEqual({});
  });

  it('crosses a month boundary for yesterday', () => {
    expect(Object.keys(parseBurnLink('#yactive=500', new Date(2026, 10, 1, 8)))).toEqual(['2026-10-31']);
  });
});

describe('parseLooseNumber', () => {
  it('reads a number however the phone formats it', () => {
    expect(parseLooseNumber('1620')).toBe(1620);
    expect(parseLooseNumber('1620.4')).toBe(1620.4);
    expect(parseLooseNumber('1,620.4')).toBe(1620.4);
    expect(parseLooseNumber('1.620,4')).toBe(1620.4);
    expect(parseLooseNumber('1,620')).toBe(1620);
    expect(parseLooseNumber('519,6')).toBe(519.6);
    expect(parseLooseNumber('1 620')).toBe(1620);
  });

  it('rejects text that is not a number', () => {
    expect(parseLooseNumber('abc')).toBeNull();
    expect(parseLooseNumber('-5')).toBeNull();
    expect(parseLooseNumber('')).toBeNull();
  });
});

describe('stored burn', () => {
  beforeEach(() => AsyncStorage.clear());

  it('keeps the larger figure for a day, so an old link cannot shrink it', async () => {
    await saveImportedBurn({ '2026-11-11': { active: 520, resting: 1620 } });
    await saveImportedBurn({ '2026-11-11': { active: 300, resting: 900 } });
    await saveImportedBurn({ '2026-11-10': { active: 610, resting: 1650 } });
    expect(await getImportedBurn(new Date(2026, 10, 10), new Date(2026, 10, 11))).toEqual({
      '2026-11-10': { active: 610, resting: 1650 },
      '2026-11-11': { active: 520, resting: 1620 },
    });
  });

  it('lets a typed-in figure replace what is there, even when smaller', async () => {
    await saveImportedBurn({ '2026-11-11': { active: 520, resting: 1620 } });
    await setBurnForDay('2026-11-11', { active: 400, resting: 1500 });
    expect((await getImportedBurn(now, now))['2026-11-11']).toEqual({ active: 400, resting: 1500 });
  });

  it('returns only the days asked for', async () => {
    await saveImportedBurn({ '2026-11-01': { active: 1, resting: 1 }, '2026-11-11': { active: 2, resting: 2 } });
    expect(Object.keys(await getImportedBurn(new Date(2026, 10, 10), new Date(2026, 10, 12)))).toEqual(['2026-11-11']);
  });
});
