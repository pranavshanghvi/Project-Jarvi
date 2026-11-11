import { parsePhotoTime } from './photoTime';

describe('parsePhotoTime', () => {
  it('reads the time a photo was taken from its own record', () => {
    expect(parsePhotoTime({ DateTimeOriginal: '2026:11:10 13:15:02' })).toBe(new Date(2026, 10, 10, 13, 15, 2).getTime());
  });

  it('falls back to the plain DateTime field', () => {
    expect(parsePhotoTime({ DateTime: '2026:11:10 08:05:00' })).toBe(new Date(2026, 10, 10, 8, 5, 0).getTime());
  });

  it('gives nothing when the record is missing, malformed, or in the future', () => {
    expect(parsePhotoTime(null)).toBeUndefined();
    expect(parsePhotoTime({})).toBeUndefined();
    expect(parsePhotoTime({ DateTimeOriginal: 'yesterday' })).toBeUndefined();
    expect(parsePhotoTime({ DateTimeOriginal: '2999:01:01 00:00:00' })).toBeUndefined();
  });
});
