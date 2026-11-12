import { formatSigned, ringNumberSize } from './theme';

describe('ringNumberSize', () => {
  it('uses smaller type for a longer figure so it stays on one line', () => {
    expect(ringNumberSize('+130')).toBe(36);
    expect(ringNumberSize(formatSigned(-1566))).toBe(27); // "−1,566", the case that wrapped
    expect(ringNumberSize(formatSigned(-12345))).toBe(22);
  });

  it('never grows as the figure gets longer', () => {
    const sizes = ['0', '+13', '+130', '−1,56', '−1,566', '−12,345'].map(ringNumberSize);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });
});
