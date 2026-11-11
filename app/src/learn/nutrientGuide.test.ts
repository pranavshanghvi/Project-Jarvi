import { NUTRIENT_KEYS } from '../types/nutrition';
import { describeDailyValue, NUTRIENT_GUIDE, percentOfDailyValue } from './nutrientGuide';

describe('nutrient guide', () => {
  it('explains every number a meal carries, with a link to FDA', () => {
    for (const key of NUTRIENT_KEYS) {
      const guide = NUTRIENT_GUIDE[key];
      expect(guide).toBeDefined();
      expect(guide.what.length).toBeGreaterThan(20);
      expect(guide.advice.length).toBeGreaterThan(20);
      expect(guide.url).toMatch(/^https:\/\/www\.accessdata\.fda\.gov\/scripts\/InteractiveNutritionFactsLabel\/[a-z-]+\.cfm$/);
    }
  });

  it("uses FDA's Daily Values", () => {
    const values = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, NUTRIENT_GUIDE[key].dailyValue?.amount ?? null]));
    expect(values).toEqual({
      calories: 2000, proteinG: 50, carbsG: 275, fatG: 78, saturatedFatG: 20,
      fiberG: 28, sugarG: null, addedSugarG: 50, sodiumMg: 2300, cholesterolMg: 300,
    });
  });

  it('says why total sugar has no Daily Value instead of leaving a gap', () => {
    expect(NUTRIENT_GUIDE.sugarG.dailyValueNote).toMatch(/no Daily Value/);
  });

  it('works out the share of the Daily Value', () => {
    expect(percentOfDailyValue('fatG', 24)).toBe(31);
    expect(percentOfDailyValue('sodiumMg', 2300)).toBe(100);
    expect(percentOfDailyValue('sugarG', 40)).toBeNull();
  });

  it('words a limit, a target and a plain reference differently', () => {
    expect(describeDailyValue(NUTRIENT_GUIDE.saturatedFatG.dailyValue!)).toBe('Less than 20 g a day');
    expect(describeDailyValue(NUTRIENT_GUIDE.fiberG.dailyValue!)).toBe('At least 28 g a day');
    expect(describeDailyValue(NUTRIENT_GUIDE.fatG.dailyValue!)).toBe('78 g a day');
    expect(describeDailyValue(NUTRIENT_GUIDE.calories.dailyValue!)).toBe('2,000 calories a day');
  });
});
