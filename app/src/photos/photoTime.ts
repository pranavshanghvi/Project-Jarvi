// A photo's own record of when it was taken looks like "2026:11:11 13:15:02". Using it means a
// lunch photographed at 1 PM and logged at 9 PM still lands at 1 PM.
export function parsePhotoTime(exif: Record<string, unknown> | null | undefined): number | undefined {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== 'string') return undefined;
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const time = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isFinite(time) && time <= Date.now() ? time : undefined;
}
