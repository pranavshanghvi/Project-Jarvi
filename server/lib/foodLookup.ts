import { NutrientProfile } from './types';

// Published nutrition numbers for a branded food, from two free public databases.
//
// Why this exists: the free AI model does not look anything up. It recalls typical numbers, and on
// 2026-11-12 it gave 350, 250 and 270 calories for the same shop donut whose published figure is
// about 240. So when the person names a shop or brand, we ask a real database before trusting it.
//
// The rule that matters: a WRONG published number is worse than an honest guess, because it is
// shown as a fact. A result is used only when the brand and the food name both match and the entry
// has a real serving size. Anything less is thrown away and the AI's estimate stays, labelled as one.
//
// Both sources are free. Neither is an AI and neither can cost money:
//   USDA FoodData Central - US government, public domain. Needs a free key in FDC_API_KEY; with no
//                           key this source is simply skipped.
//   Open Food Facts       - volunteer-entered, no key. Licence ODbL (credit "Open Food Facts
//                           contributors", shown in the app). Slow or down often; see below.

export type PublishedBy = 'USDA' | 'Open Food Facts';

export interface Published {
  nutrients: NutrientProfile; // for ONE serving
  portionDescription: string; // the published serving, e.g. "1 container (150 g)"
  from: PublishedBy;
}

type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

// ── Matching ─────────────────────────────────────────────────────────────────────────────────

// Spellings that mean the same thing on a menu board and in a database.
const SAME: Record<string, string> = { doughnut: 'donut', doughnuts: 'donut', donuts: 'donut', kreme: 'cream', creme: 'cream', caffe: 'cafe', yoghurt: 'yogurt' };
// Words that say nothing about which food it is.
const NOISE = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'in', 'by', 'from', 'for', 'one', 'my', 'some', 'inc', 'co', 'llc', 'company', 'brand', 'brands', 'original', 'classic']);

export function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // caffè -> caffe
    .toLowerCase()
    .replace(/['’]s\b/g, '') // dunkin's -> dunkin
    .replace(/['’]/g, '')
    .split(/[^a-z0-9%]+/)
    .filter((w) => w && !NOISE.has(w))
    .map((w) => SAME[w] ?? (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

// How well a database entry matches what was asked for: 0 (no) to 1 (exact). The brand must be
// there. Then most of the asked-for words must be in the entry's name, AND the entry must not be
// mostly about something else ("Protein drink with coffee - caffè latte" is not a caffè latte).
export function matchScore(brand: string, name: string, entryBrand: string, entryName: string): number {
  const brandWords = [...new Set(words(brand))];
  const entryAll = new Set([...words(entryBrand), ...words(entryName)]);
  if (brandWords.length === 0 || !brandWords.some((w) => entryAll.has(w))) return 0;
  const isBrand = new Set([...brandWords, ...words(entryBrand)]);
  const asked = [...new Set(words(name))].filter((w) => !isBrand.has(w));
  const entry = [...new Set(words(entryName))].filter((w) => !isBrand.has(w));
  if (asked.length === 0 || entry.length === 0) return 0;
  const entrySet = new Set(entry);
  const askedSet = new Set(asked);
  const forward = asked.filter((w) => entrySet.has(w)).length / asked.length;
  const backward = entry.filter((w) => askedSet.has(w)).length / entry.length;
  return forward >= 0.75 && backward >= 0.6 ? Math.min(forward, backward) : 0;
}

// ── Numbers ──────────────────────────────────────────────────────────────────────────────────

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

// A profile is only usable when the four numbers everything else hangs on are present and add up:
// calories from protein, carbs and fat (4/4/9) must land within reach of the calories stated.
// This is what catches rows like the one seen in testing that claimed 1,620 calories for a coffee pod.
export function plausible(n: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null }): boolean {
  if (n.calories === null || n.proteinG === null || n.carbsG === null || n.fatG === null) return false;
  if (n.calories <= 0 || n.calories > 3000) return false;
  const fromMacros = 4 * n.proteinG + 4 * n.carbsG + 9 * n.fatG;
  return Math.abs(fromMacros - n.calories) <= Math.max(40, n.calories * 0.3);
}

// `fallbackAddedSugar` is the AI's figure: neither database reliably says how much sugar was added.
function profile(per: (key: string) => number | null, fallbackAddedSugar: number): NutrientProfile | null {
  const core = { calories: per('calories'), proteinG: per('protein'), carbsG: per('carbs'), fatG: per('fat') };
  if (!plausible(core)) return null;
  const sugarG = per('sugar') ?? 0;
  return {
    calories: Math.round(core.calories!),
    proteinG: round1(core.proteinG!),
    carbsG: round1(core.carbsG!),
    fatG: round1(core.fatG!),
    saturatedFatG: round1(per('saturatedFat') ?? 0),
    fiberG: round1(per('fiber') ?? 0),
    sugarG: round1(sugarG),
    addedSugarG: round1(Math.min(per('addedSugar') ?? fallbackAddedSugar, sugarG)),
    sodiumMg: Math.round(per('sodiumMg') ?? 0),
    cholesterolMg: Math.round(per('cholesterolMg') ?? 0),
  };
}

// ── Open Food Facts ──────────────────────────────────────────────────────────────────────────

const OFF_FIELDS: Record<string, { field: string; scale: number }> = {
  calories: { field: 'energy-kcal', scale: 1 },
  protein: { field: 'proteins', scale: 1 },
  carbs: { field: 'carbohydrates', scale: 1 },
  fat: { field: 'fat', scale: 1 },
  saturatedFat: { field: 'saturated-fat', scale: 1 },
  fiber: { field: 'fiber', scale: 1 },
  sugar: { field: 'sugars', scale: 1 },
  addedSugar: { field: 'added-sugars', scale: 1 },
  sodiumMg: { field: 'sodium', scale: 1000 }, // stored in grams
  cholesterolMg: { field: 'cholesterol', scale: 1000 }, // stored in grams
};

// One Open Food Facts product -> numbers for one serving, or null when it cannot be trusted.
// Many entries give "100 g" as the serving because nobody entered a real one. Those are refused:
// without the true size of one donut or one cup there is no honest way to get to "what you ate".
export function fromOpenFoodFacts(product: any, fallbackAddedSugar: number): Published | null {
  const grams = num(product?.serving_quantity);
  const servingText = typeof product?.serving_size === 'string' ? product.serving_size.trim() : '';
  // "100g", "100 g", "100.0g", "100 ml": a bare hundred with nothing else is a placeholder, not a serving.
  // ("1 bar (100 g)" is a real one and passes.)
  const placeholder = grams === 100 && /^[\d.,\s]*(g|gr|grams?|ml)?\.?$/i.test(servingText);
  if (!grams || !servingText || placeholder) return null;
  const n = product?.nutriments ?? {};
  const per = (key: string): number | null => {
    const { field, scale } = OFF_FIELDS[key];
    const perServing = num(n[`${field}_serving`]);
    if (perServing !== null) return perServing * scale;
    const per100 = num(n[`${field}_100g`]);
    return per100 === null ? null : (per100 * grams * scale) / 100;
  };
  const nutrients = profile(per, fallbackAddedSugar);
  return nutrients ? { nutrients, portionDescription: servingText.slice(0, 60), from: 'Open Food Facts' } : null;
}

// ── USDA FoodData Central (Branded foods) ────────────────────────────────────────────────────

// USDA nutrient ids. Values in a search result are per 100 g (or 100 ml).
const USDA_IDS: Record<string, number[]> = {
  calories: [1008, 2047, 2048],
  protein: [1003],
  carbs: [1005],
  fat: [1004],
  saturatedFat: [1258],
  fiber: [1079],
  sugar: [2000, 1063],
  addedSugar: [1235],
  sodiumMg: [1093],
  cholesterolMg: [1253],
};

export function fromUsda(food: any, fallbackAddedSugar: number): Published | null {
  const size = num(food?.servingSize);
  if (!size) return null;
  const rows: any[] = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
  const per = (key: string): number | null => {
    for (const id of USDA_IDS[key]) {
      const row = rows.find((r) => r?.nutrientId === id);
      const value = num(row?.value);
      if (value !== null) return (value * size) / 100;
    }
    return null;
  };
  const nutrients = profile(per, fallbackAddedSugar);
  if (!nutrients) return null;
  const unit = String(food?.servingSizeUnit ?? 'g').toLowerCase().replace('grm', 'g').replace('mlt', 'ml');
  const household = typeof food?.householdServingFullText === 'string' ? food.householdServingFullText.trim().toLowerCase() : '';
  const portionDescription = household ? `${household} (${round1(size)} ${unit})` : `${round1(size)} ${unit}`;
  return { nutrients, portionDescription: portionDescription.slice(0, 60), from: 'USDA' };
}

// ── Asking ───────────────────────────────────────────────────────────────────────────────────

// Says who is calling, as Open Food Facts asks. The app's public address only; never a person's details.
const AGENT = 'BiteLog/1.0 (https://mybitelog.vercel.app)';

async function getJson(fetchImpl: Fetch, url: string, timeoutMs: number): Promise<{ status: number; body: any }> {
  const response = await fetchImpl(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

// hit: used. miss: asked, nothing good enough. off: no key. resting: skipped after a recent failure. error: failed.
export type Outcome = 'hit' | 'miss' | 'off' | 'resting' | 'error';

async function askUsda(fetchImpl: Fetch, key: string | undefined, brand: string, name: string, addedSugar: number, timeoutMs: number): Promise<{ outcome: Outcome; found: Published | null }> {
  if (!key) return { outcome: 'off', found: null };
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(`${brand} ${name}`)}&dataType=Branded&pageSize=8&api_key=${encodeURIComponent(key)}`;
    const { status, body } = await getJson(fetchImpl, url, timeoutMs);
    if (status !== 200) return { outcome: 'error', found: null };
    return best(Array.isArray(body?.foods) ? body.foods : [], brand, name, (f) => `${f?.brandName ?? ''} ${f?.brandOwner ?? ''}`, (f) => String(f?.description ?? ''), (f) => fromUsda(f, addedSugar));
  } catch {
    return { outcome: 'error', found: null };
  }
}

// Open Food Facts has two services and neither does the whole job:
//   - the search service is fast, but its results carry no serving size;
//   - the product service has the serving size, but on 2026-11-12 it took 9 to 12 seconds or failed.
// So: search, keep the entries whose brand and name match, then read the best two in full. Every
// step has a short time limit, and after any failure Open Food Facts is left alone for ten minutes
// so that a slow day there never makes this app slow.
let offRestsUntil = 0;
const OFF_REST_MS = 10 * 60 * 1000;

const brandText = (brands: unknown): string => (Array.isArray(brands) ? brands.join(' ') : String(brands ?? ''));

async function askOpenFoodFacts(fetchImpl: Fetch, brand: string, name: string, addedSugar: number, timeoutMs: number): Promise<{ outcome: Outcome; found: Published | null }> {
  if (Date.now() < offRestsUntil) return { outcome: 'resting', found: null };
  const started = Date.now();
  const left = () => timeoutMs - (Date.now() - started);
  try {
    const query = `brands:"${brand.replace(/["\\]/g, ' ')}" ${name}`;
    const search = await getJson(fetchImpl, `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=10&fields=code,product_name,brands`, Math.min(2000, left()));
    if (search.status !== 200) throw new Error(`search ${search.status}`);
    const hits: any[] = Array.isArray(search.body?.hits) ? search.body.hits : [];
    const candidates = hits
      .map((hit) => ({ code: String(hit?.code ?? ''), score: matchScore(brand, name, brandText(hit?.brands), String(hit?.product_name ?? '')) }))
      .filter((c) => c.score > 0 && /^\d{6,14}$/.test(c.code))
      .sort((x, y) => y.score - x.score)
      .slice(0, 2);
    if (candidates.length === 0) return { outcome: 'miss', found: null };
    if (left() < 800) throw new Error('no time left');
    const products = await Promise.all(
      candidates.map((c) => getJson(fetchImpl, `https://world.openfoodfacts.org/api/v2/product/${c.code}?fields=product_name,brands,serving_size,serving_quantity,nutriments`, Math.min(3000, left())))
    );
    if (products.every((p) => p.status !== 200)) throw new Error('product service failed');
    for (const product of products) {
      const found = product.status === 200 ? fromOpenFoodFacts(product.body?.product, addedSugar) : null;
      if (found) return { outcome: 'hit', found };
    }
    return { outcome: 'miss', found: null };
  } catch {
    offRestsUntil = Date.now() + OFF_REST_MS;
    return { outcome: 'error', found: null };
  }
}

// The best-matching entry that also has usable numbers.
function best(entries: any[], brand: string, name: string, brandOf: (e: any) => string, nameOf: (e: any) => string, convert: (e: any) => Published | null): { outcome: Outcome; found: Published | null } {
  let top: { score: number; found: Published } | null = null;
  for (const entry of entries) {
    const score = matchScore(brand, name, brandOf(entry), nameOf(entry));
    if (score === 0 || (top && score <= top.score)) continue;
    const found = convert(entry);
    if (found) top = { score, found };
  }
  return top ? { outcome: 'hit', found: top.found } : { outcome: 'miss', found: null };
}

export interface LookupResult {
  found: Published | null;
  usda: Outcome;
  openFoodFacts: Outcome;
}

// Asked again within the life of one server process, the same food is answered from memory.
const remembered = new Map<string, Published | null>();

// Both databases are asked at once. The government one wins when both have it.
export async function lookupPublished(brand: string, name: string, fallbackAddedSugar: number, options: { timeoutMs?: number; fetchImpl?: Fetch; usdaKey?: string } = {}): Promise<LookupResult> {
  const cacheKey = `${words(brand).join(' ')}|${words(name).join(' ')}`;
  if (remembered.has(cacheKey)) return { found: remembered.get(cacheKey) ?? null, usda: 'off', openFoodFacts: 'off' };
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as Fetch);
  const timeoutMs = options.timeoutMs ?? 5000;
  const key = 'usdaKey' in options ? options.usdaKey : process.env.FDC_API_KEY;
  const [usda, off] = await Promise.all([
    askUsda(fetchImpl, key, brand, name, fallbackAddedSugar, Math.min(timeoutMs, 4000)),
    askOpenFoodFacts(fetchImpl, brand, name, fallbackAddedSugar, Math.min(timeoutMs, 4500)),
  ]);
  const found = usda.found ?? off.found;
  // Only remember a real answer or a clean "not there". A database that was down is asked again.
  const failed = (o: Outcome) => o === 'error' || o === 'resting';
  if (found || (!failed(usda.outcome) && !failed(off.outcome))) remembered.set(cacheKey, found);
  return { found, usda: usda.outcome, openFoodFacts: off.outcome };
}

export function forgetLookups(): void {
  remembered.clear();
  offRestsUntil = 0;
}
