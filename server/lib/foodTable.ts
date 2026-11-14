import { NutrientProfile } from './types';

// Calories per gram come from a table, not from the AI's memory.
//
// A photo read has two guesses in it: how MUCH food there is, and how many calories that kind of
// food has. The second one does not need guessing: the US Department of Agriculture publishes it
// for about 5,300 everyday foods as eaten (its "Survey Foods" table, the one dietitians use to turn
// "what a person said they ate" into nutrients). So the AI is asked only for the food and its
// weight, and the numbers are worked out here as weight x the table's values. The same food then
// gets the same calories per gram every time, whatever the AI happens to remember that day.
//
// The data file is built by scripts/build-food-table.py; see that file for the source.

// [name, calories, protein, carbs, fat, saturated fat, fiber, sugar, sodium mg, cholesterol mg, portions], per 100 g
type Row = [string, number, number, number, number, number, number, number, number, number, [string, number][]];
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ROWS: Row[] = require('./foodTableData.json');

export interface TableFood {
  name: string;
  per100g: Omit<NutrientProfile, 'addedSugarG'>;
  portions: { name: string; grams: number }[];
}

// Words that say nothing about which food it is.
const NOISE = new Set(
  'a an and or of the with without in on as to for from ns nfs type made eaten not no added style about some fresh plain regular side small medium large piece pieces slice slices cup cups serving servings portion homemade fillet filet glazed hard soft'.split(' ')
);
// Different words for the same thing, so "donut" finds "doughnut" and "steamed" finds "cooked".
const SAME: Record<string, string> = {
  donut: 'doughnut', yoghurt: 'yogurt', steamed: 'cooked', boiled: 'cooked', sauteed: 'cooked', sautéed: 'cooked', stir: 'cooked',
  bbq: 'barbecue', barbecued: 'barbecue', broiled: 'grilled', chargrilled: 'grilled', seared: 'grilled', toasted: 'toast',
  hamburger: 'burger', veggie: 'vegetable', veggies: 'vegetable', omelette: 'omelet', mac: 'macaroni', spaghetti: 'pasta', penne: 'pasta', fettuccine: 'pasta', linguine: 'pasta', rigatoni: 'pasta', fusilli: 'pasta', ziti: 'pasta',
  shrimps: 'shrimp', prawn: 'shrimp', prawns: 'shrimp', roast: 'roasted', capsicum: 'pepper', scallion: 'onion', garbanzo: 'chickpea',
  aubergine: 'eggplant', courgette: 'zucchini', coriander: 'cilantro',
};
// Everyday names the table files under something else.
const RENAMES: [RegExp, string][] = [
  [/\b(french )?fries\b/, 'french fries'],
  [/\b(cherry|grape) tomato(es)?\b/, 'tomatoes raw'],
  [/\bbell peppers?\b/, 'peppers raw'],
  [/\b(mandarin|clementine)( orange)?s?\b/, 'tangerine'],
  [/\b(bok choy|pak choi)\b/, 'chinese cabbage'],
  [/\b(mixed greens|spring mix|salad greens|mixed salad leaves)\b/, 'lettuce raw'],
  [/\bkiwis?\b/, 'kiwi fruit'],
  [/\bbrownies?\b/, 'cookie brownie'],
  [/\bhash ?browns?\b/, 'potato hash brown'],
  [/\bcorn on the cob\b/, 'corn cooked'],
  [/\btofu\b/, 'soybean curd'],
  [/\b(zucchini|courgette)s?\b/, 'summer squash'],
  [/\byams?\b/, 'sweet potato'],
  [/\b(bowl|plate|cup|glass|handful|scoop) of\b/, ''],
  [/\b(bavarian|boston) (cream|kreme|creme)\b/, 'custard filled'],
  [/\b(?<!french )toast\b/, 'bread white toasted'],
  [/\beggs?\b(?!.*\b(whites?|yolks?|salad|roll|sandwich|noodles?)\b)/, 'egg whole'],
];

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

export function foodWords(text: string): string[] {
  const seen = new Set<string>();
  let plain = text.toLowerCase();
  for (const [from, to] of RENAMES) plain = plain.replace(from, to);
  for (const raw of plain.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').split(' ')) {
    if (!raw || NOISE.has(raw)) continue;
    const word = SAME[raw] ?? SAME[singular(raw)] ?? singular(raw);
    if (!NOISE.has(word)) seen.add(word);
  }
  return [...seen];
}

interface Indexed {
  row: Row;
  words: Set<string>;
  // The table names a food "Chicken breast, grilled" or, under a family name, "Fish, salmon, grilled".
  // These are the ways an entry may be asked for: its opening words, or the words after a
  // one-word family name. "Egg omelet or scrambled egg" counts as two ways.
  ways: string[][];
  own: number; // how many of those ways are the entry's opening words
  liquid: string[]; // set when the entry itself is a sauce, soup or juice
  vague: boolean; // the table's own "not further specified" entry, which is its default for that food
  weight: number;
}

const idf = new Map<string, number>();
const INDEX: Indexed[] = ROWS.map((row) => {
  const name = row[0];
  const parts = name.split(',');
  const waysOf = (part: string) => part.split(/\bor\b|\//).map(foodWords).filter((w) => w.length > 0);
  const first = waysOf(parts[0]);
  const family = parts.length > 1 && foodWords(parts[0]).length === 1 ? waysOf(parts[1]) : [];
  return { row, words: new Set(foodWords(name)), ways: [...first, ...family], own: first.length, liquid: [], vague: /\bNFS\b|NS as to/.test(name), weight: 0 };
});
{
  const counts = new Map<string, number>();
  for (const entry of INDEX) for (const word of entry.words) counts.set(word, (counts.get(word) ?? 0) + 1);
  for (const [word, count] of counts) idf.set(word, Math.log(1 + INDEX.length / count));
  for (const entry of INDEX) entry.weight = [...entry.words].reduce((sum, word) => sum + idf.get(word)!, 0);
}
// A word the table has never seen ("Bavarian", a brand, a misspelling) counts as an ordinary word:
// enough that a name made mostly of unknown words finds nothing, not so much that one stray word does.
const ORDINARY = Math.log(1 + INDEX.length / 20);
const rarity = (word: string) => idf.get(word) ?? ORDINARY;

function toFood(row: Row): TableFood {
  const [name, calories, proteinG, carbsG, fatG, saturatedFatG, fiberG, sugarG, sodiumMg, cholesterolMg, portions] = row;
  return { name, per100g: { calories, proteinG, carbsG, fatG, saturatedFatG, fiberG, sugarG, sodiumMg, cholesterolMg }, portions: portions.map(([p, grams]) => ({ name: p, grams })) };
}

// An entry that carries one of these is a special version of the food ("Chicken, meatless",
// "Zucchini, pickled", "Yogurt, nonfat"). It is only ever the answer when the name asked for it.
const SPECIAL = new Set(
  'meatless imitation substitute vegetarian vegan diet light lite reduced low free nonfat skim dried dehydrated powder dry mix pickled souffle casserole creamed candied baby juice soup sandwich dip sauce salad pie cake bar cereal candy chip ingredient school decaffeinated sweetened unsweetened flavored chocolate cheese bacon stuffed coated breaded fried tempura gravy syrup icing filled'.split(' ')
);
const PRESERVED = new Set(['canned', 'frozen', 'smoked']);
// A sauce is not the dish it goes on. "Spaghetti with meat sauce" is spaghetti, so an entry that is
// a sauce, soup or juice only counts when that word is in the main part of the name, before any
// "with", "and" or comma.
const LIQUID = ['sauce', 'gravy', 'dip', 'dressing', 'syrup', 'soup', 'juice', 'broth'];
const mainPart = (name: string) => foodWords(name.toLowerCase().split(/,| with | and | in | on | topped /)[0]);
for (const entry of INDEX) entry.liquid = mainPart(entry.row[0]).filter((word) => LIQUID.includes(word));

// How well a table entry answers a food name, or null when it does not.
//  - the name must contain one of the ways the entry can be asked for, so "broccoli" can never
//    land on "Beef and broccoli";
//  - most of the name's words (by rarity) must be in the entry, so "almond croissant" does not
//    settle for plain "Almonds";
//  - among entries that pass, the one with the least left over wins. The table's own
//    "not specified" entry wins a tie, because that is the default it was written to be, and
//    fresh beats canned or frozen.
function score(asked: string[], main: string[], askedWeight: number, entry: Indexed): number | null {
  if (entry.liquid.some((word) => !main.includes(word))) return null;
  const way = entry.ways.findIndex((words) => words.every((word) => asked.includes(word)));
  if (way < 0) return null;
  let covered = 0;
  for (const word of asked) if (entry.words.has(word)) covered += rarity(word);
  const coverage = covered / askedWeight;
  if (coverage < 0.72) return null;
  let penalty = 0;
  for (const word of entry.words) {
    if (asked.includes(word)) continue;
    if (SPECIAL.has(word)) return null;
    if (PRESERVED.has(word)) penalty += 0.4;
  }
  const leftOver = (entry.weight - covered) / entry.weight; // how much of the entry the name never mentioned
  if (way >= entry.own) penalty += 0.3; // reached by its family name ("Bread, zucchini"): fine when nothing closer exists
  return coverage * 2 - leftOver - penalty + (entry.vague ? 0.25 : 0) + (entry.words.has('raw') ? 0.05 : 0);
}

const cache = new Map<string, TableFood | null>();

export function findFood(name: string): TableFood | null {
  const asked = foodWords(name);
  if (asked.length === 0) return null;
  const key = [...asked].sort().join(' ');
  if (cache.has(key)) return cache.get(key)!;
  const askedWeight = asked.reduce((sum, word) => sum + rarity(word), 0);
  const main = mainPart(name);
  let best: Indexed | null = null;
  let bestScore = -Infinity;
  for (const entry of INDEX) {
    const s = score(asked, main, askedWeight, entry);
    if (s !== null && s > bestScore) {
      best = entry;
      bestScore = s;
    }
  }
  const found = best ? toFood(best.row) : null;
  cache.set(key, found);
  return found;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// The table's values for a given weight. The table has no "added sugar" column, so the AI's own
// split is kept: the same share of the sugar counts as added.
export function nutrientsFor(food: TableFood, grams: number, guess: NutrientProfile): NutrientProfile {
  const k = grams / 100;
  const sugarG = round1(food.per100g.sugarG * k);
  const addedShare = guess.sugarG > 0 ? Math.min(1, guess.addedSugarG / guess.sugarG) : 0;
  return {
    calories: Math.round(food.per100g.calories * k),
    proteinG: round1(food.per100g.proteinG * k),
    carbsG: round1(food.per100g.carbsG * k),
    fatG: round1(food.per100g.fatG * k),
    saturatedFatG: round1(food.per100g.saturatedFatG * k),
    fiberG: round1(food.per100g.fiberG * k),
    sugarG,
    addedSugarG: round1(sugarG * addedShare),
    sodiumMg: Math.round(food.per100g.sodiumMg * k),
    cholesterolMg: Math.round(food.per100g.cholesterolMg * k),
  };
}
