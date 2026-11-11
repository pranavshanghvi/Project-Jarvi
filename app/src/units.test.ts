import { cmToFtIn, formatWeight, fromDisplayWeight, ftInToCm, kgToLb, lbToKg, toDisplayWeight } from './units';

describe('weight conversion', () => {
  it('converts with the standard factor', () => {
    expect(kgToLb(1)).toBeCloseTo(2.2046226218, 8);
    expect(lbToKg(220.46226218)).toBeCloseTo(100, 6);
  });

  it('round-trips', () => {
    expect(lbToKg(kgToLb(82.7))).toBeCloseTo(82.7, 9);
    expect(kgToLb(lbToKg(182.4))).toBeCloseTo(182.4, 9);
  });

  it('formats to one decimal in either unit', () => {
    expect(formatWeight(82.7, 'kg')).toBe('82.7 kg');
    expect(formatWeight(82.7, 'lb')).toBe('182.3 lb');
    expect(formatWeight(80, 'kg')).toBe('80.0 kg');
  });

  it('gives a one-decimal display number and converts typed values back to kg', () => {
    expect(toDisplayWeight(82.7, 'lb')).toBe(182.3);
    expect(toDisplayWeight(82.74, 'kg')).toBe(82.7);
    expect(fromDisplayWeight(180, 'lb')).toBeCloseTo(81.6466, 3);
    expect(fromDisplayWeight(80, 'kg')).toBe(80);
  });
});

describe('height conversion', () => {
  it('splits centimetres into feet and whole inches', () => {
    expect(cmToFtIn(175.26)).toEqual({ ft: 5, inches: 9 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inches: 0 });
  });

  it('carries 12 inches into the next foot', () => {
    // 5 ft 11.6 in (181.7 cm) rounds to 5 ft 12 in, which is 6 ft 0 in
    expect(cmToFtIn(181.7)).toEqual({ ft: 6, inches: 0 });
  });

  it('converts back and round-trips', () => {
    expect(ftInToCm(5, 9)).toBeCloseTo(175.26, 6);
    expect(cmToFtIn(ftInToCm(5, 11))).toEqual({ ft: 5, inches: 11 });
  });
});
