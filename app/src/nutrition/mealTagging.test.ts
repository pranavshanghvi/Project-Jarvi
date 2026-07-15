import { inferMealType } from './mealTagging';

function at(hour: number, minute = 0): Date {
  const d = new Date(2026, 0, 1, hour, minute);
  return d;
}

describe('inferMealType', () => {
  it('returns breakfast from 5:00 to 10:59', () => {
    expect(inferMealType(at(5, 0))).toBe('breakfast');
    expect(inferMealType(at(10, 59))).toBe('breakfast');
  });

  it('returns lunch from 11:00 to 15:59', () => {
    expect(inferMealType(at(11, 0))).toBe('lunch');
    expect(inferMealType(at(15, 59))).toBe('lunch');
  });

  it('returns dinner from 16:00 to 20:59', () => {
    expect(inferMealType(at(16, 0))).toBe('dinner');
    expect(inferMealType(at(20, 59))).toBe('dinner');
  });

  it('returns snack from 21:00 to 4:59', () => {
    expect(inferMealType(at(21, 0))).toBe('snack');
    expect(inferMealType(at(4, 59))).toBe('snack');
    expect(inferMealType(at(0, 0))).toBe('snack');
  });
});
