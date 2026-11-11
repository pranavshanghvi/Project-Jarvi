import { NutrientProfile } from '../types/nutrition';

// Short explanations of what each number on a meal means, written in plain words from the facts
// on the U.S. Food and Drug Administration's Interactive Nutrition Facts Label site. Each one
// links to FDA's own page for the full story. Daily Values are FDA's, for a 2,000 calorie day.
// Checked against the FDA pages on 2026-11-11; if FDA revises a Daily Value, change it here.

const FDA = 'https://www.accessdata.fda.gov/scripts/InteractiveNutritionFactsLabel';

export interface DailyValue {
  amount: number;
  unit: 'g' | 'mg' | 'cal';
  // limit: stay under it. aim: try to reach it. guide: a reference point, neither floor nor ceiling.
  kind: 'limit' | 'aim' | 'guide';
}

export interface NutrientGuide {
  title: string;
  what: string;
  dailyValue: DailyValue | null;
  dailyValueNote?: string; // shown when there is no Daily Value, or when it needs a caveat
  foundIn?: string;
  advice: string;
  url: string;
}

export const NUTRIENT_GUIDE: Record<keyof NutrientProfile, NutrientGuide> = {
  calories: {
    title: 'Calories',
    what: 'The energy a food gives you. It comes from the carbohydrate, fat, protein and alcohol in it.',
    dailyValue: { amount: 2000, unit: 'cal', kind: 'guide' },
    dailyValueNote: 'Food labels use 2,000 a day as a general guide. Your own need depends on your age, sex, height, weight and how active you are.',
    advice: 'For one serving of a packaged food, about 100 calories is moderate and 400 or more is high.',
    url: `${FDA}/calories.cfm`,
  },
  proteinG: {
    title: 'Protein',
    what: 'Made of amino acids. It builds and repairs muscle, bone, skin and organs, and supports your immune system.',
    dailyValue: { amount: 50, unit: 'g', kind: 'guide' },
    foundIn: 'Meat, poultry, seafood, eggs, dairy, beans, lentils, soy, nuts and seeds.',
    advice: 'Eat a variety, from both plants and animals, and favour the choices lower in saturated fat.',
    url: `${FDA}/protein.cfm`,
  },
  carbsG: {
    title: 'Carbohydrate',
    what: "Your body's main source of energy. The total includes sugars, fiber and sugar alcohols.",
    dailyValue: { amount: 275, unit: 'g', kind: 'guide' },
    foundIn: 'Grains, beans, fruit, vegetables and milk, and also sweets and sugary drinks.',
    advice: 'The kind matters. Make at least half your grains whole grains, get enough fiber, and keep added sugar low.',
    url: `${FDA}/total-carbohydrate.cfm`,
  },
  fatG: {
    title: 'Fat',
    what: 'Fat gives you energy, helps you absorb vitamins A, D, E and K, and helps you feel full.',
    dailyValue: { amount: 78, unit: 'g', kind: 'guide' },
    foundIn: 'Oils, nuts, seeds, avocado, fish, dairy, meat, baked goods and snacks.',
    advice: 'The kind matters more than the total. Replace saturated fat with unsaturated fat (oils, nuts, fish) and keep trans fat as low as you can.',
    url: `${FDA}/total-fat.cfm`,
  },
  saturatedFatG: {
    title: 'Saturated fat',
    what: 'A kind of fat that is usually solid at room temperature. Your body makes all it needs, so you do not need any from food.',
    dailyValue: { amount: 20, unit: 'g', kind: 'limit' },
    foundIn: 'Fatty and processed meat, butter, cheese and other dairy, pizza, desserts, and coconut and palm oil.',
    advice: 'Keep it under 10% of your calories. Diets higher in saturated fat are linked with a higher risk of heart disease.',
    url: `${FDA}/saturated-fat.cfm`,
  },
  fiberG: {
    title: 'Fiber',
    what: 'A carbohydrate your body cannot easily digest. It slows digestion, helps control blood sugar and cholesterol, and keeps you full.',
    dailyValue: { amount: 28, unit: 'g', kind: 'aim' },
    foundIn: 'Beans, peas, lentils, fruit, vegetables, nuts, seeds and whole grains.',
    advice: 'This is one to get more of. Diets higher in fiber are linked with a lower risk of heart disease.',
    url: `${FDA}/dietary-fiber.cfm`,
  },
  sugarG: {
    title: 'Sugar',
    what: 'All the sugar in a food: what is naturally there, as in fruit and milk, plus any that was added.',
    dailyValue: null,
    dailyValueNote: 'There is no Daily Value for total sugar, because no recommendation has been set for it. The number to watch is added sugar.',
    foundIn: 'Fruit, milk, and anything that has been sweetened.',
    advice: 'Sugar that comes with fruit or plain milk arrives with fiber, vitamins or protein. Added sugar does not.',
    url: `${FDA}/total-carbohydrate.cfm`,
  },
  addedSugarG: {
    title: 'Added sugar',
    what: 'Sugar put in during cooking or manufacturing: table sugar, syrups, honey and concentrated fruit juice. It does not count the sugar naturally in fruit or milk.',
    dailyValue: { amount: 50, unit: 'g', kind: 'limit' },
    foundIn: 'Sugary drinks, desserts and sweet snacks, sweetened coffee and tea, and candy.',
    advice: 'Keep it under 10% of your calories. It adds calories without nutrients, and diets lower in sugary drinks and sweets are linked with a lower risk of heart disease.',
    url: `${FDA}/added-sugars.cfm`,
  },
  sodiumMg: {
    title: 'Sodium',
    what: 'A mineral, eaten mostly as salt. You need a little for fluid balance, muscles and nerves.',
    dailyValue: { amount: 2300, unit: 'mg', kind: 'limit' },
    foundIn: 'Mostly packaged and restaurant food: sandwiches, pizza, soups, burritos and tacos, savory snacks and burgers.',
    advice: 'Diets high in sodium raise the risk of high blood pressure, which can lead to heart attack, stroke and kidney disease.',
    url: `${FDA}/sodium.cfm`,
  },
  cholesterolMg: {
    title: 'Cholesterol',
    what: 'A waxy substance in every cell. Your body makes it, and you also get it from animal foods.',
    dailyValue: { amount: 300, unit: 'mg', kind: 'limit' },
    foundIn: 'Egg yolks, meat, poultry, shellfish, processed meat and full-fat dairy.',
    advice: 'Keep it as low as you can while still eating well. Foods high in cholesterol are usually high in saturated fat too.',
    url: `${FDA}/cholesterol.cfm`,
  },
};

// "31% of the Daily Value", or null when there is no Daily Value to compare with.
export function percentOfDailyValue(key: keyof NutrientProfile, amount: number): number | null {
  const dv = NUTRIENT_GUIDE[key].dailyValue;
  if (!dv || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round((amount / dv.amount) * 100);
}

// "Less than 20 g a day" / "At least 28 g a day" / "78 g a day".
export function describeDailyValue(dv: DailyValue): string {
  const amount = `${dv.amount.toLocaleString('en-US')} ${dv.unit === 'cal' ? 'calories' : dv.unit}`;
  if (dv.kind === 'limit') return `Less than ${amount} a day`;
  if (dv.kind === 'aim') return `At least ${amount} a day`;
  return `${amount} a day`;
}
