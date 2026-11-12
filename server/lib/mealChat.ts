import { callModel, RouterResponse } from './modelRouter';
import { extractJson, parseItem } from './parseResponse';
import { DetectedFoodItem } from './types';

// The meal helper: one conversation turn. The app sends what the meal looks like so far, plus
// whatever is new (a photo of the food, a photo of a nutrition label, something the person said),
// and gets back the updated list and a short reply. Nothing is remembered here between turns; the
// app carries the list. Same rule as every other AI call in this project: free providers only.

// Where a line's numbers came from, so the app can show how far to trust them.
export type ItemSource = 'label' | 'estimate' | 'said';

// `nutrients` are for ONE serving (one label serving, or the one portion seen in a photo), and
// `servings` is how many of those were eaten. They are kept apart on purpose: on its first live
// test (2026-11-11) the free model was asked to scale the numbers itself and turned "a third of
// the bag" of an 8-serving bag into a third of ONE serving, 50 calories instead of 400. So the
// model now only reports what it read and what the person said, and the multiplying is done here
// in code, where it cannot be got wrong.
export interface ChatItem extends DetectedFoodItem {
  source: ItemSource;
  servings: number;
  servingsPerContainer: number | null;
}
export interface MealChatImage {
  imageBase64: string;
  mimeType: string;
}
export interface MealChatResult {
  reply: string;
  items: ChatItem[];
}

export const MAX_IMAGES = 3;
export const MAX_MESSAGE_LENGTH = 600;
export const MAX_ITEMS = 25;

const NUTRIENT_SHAPE =
  '{"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "saturatedFatG": number, "fiberG": number, "sugarG": number, "addedSugarG": number, "sodiumMg": number, "cholesterolMg": number}';

// What the model is shown and asked to return for each line. "eaten" is how much the person had,
// either as a count of servings or as a share of the whole container; code turns that into servings.
function forModel(item: ChatItem) {
  return {
    name: item.name,
    source: item.source,
    confidence: item.confidence,
    portionDescription: item.portionDescription,
    servingsPerContainer: item.servingsPerContainer,
    eaten: { quantity: item.servings, unit: 'servings' },
    nutrients: item.nutrients,
  };
}

export function buildMealChatPrompt(items: ChatItem[], message: string, imageCount: number): string {
  const list = items.length > 0 ? JSON.stringify(items.map(forModel)) : '[] (nothing logged yet)';
  const said = message.trim() ? JSON.stringify(message.trim()) : '(nothing)';
  return `You are the meal helper in a food logging app. You keep ONE list of what the person ate in this meal, and you update it when they show you a photo or tell you something.

THE LIST SO FAR: ${list}
NEW PHOTOS ATTACHED: ${imageCount}
THE PERSON SAYS: ${said}

Each item has "nutrients" for ONE serving and "eaten", which says how much the person had. NEVER multiply or scale the nutrients yourself: the app does the arithmetic. You only set "eaten".
- "eaten" is {"quantity": number, "unit": "servings"} or {"quantity": number, "unit": "containers"}.
- "two servings", "two slices", "half of it" -> unit "servings" (2, 2, 0.5).
- "a third of the bag", "half the box", "the whole can", "the entire package" -> unit "containers" (0.333, 0.5, 1, 1). Use "containers" only when servingsPerContainer is known.
- If the person has not said how much, eaten is {"quantity": 1, "unit": "servings"}.

How to update the list:
- A photo of food: add each distinct food as its own item. nutrients are your best estimate for the whole portion you can see, portionDescription describes that portion and is never empty ("1 sandwich", "about 1 cup"), servingsPerContainer is null, source is "estimate".
- A photo of a Nutrition Facts label: copy the printed numbers for ONE serving exactly as printed, and servingsPerContainer from the label. portionDescription is the printed serving size, for example "1 oz (28 g)". FIRST look for a food already in the list that could be the same product (the list has "kettle chips" and the label is for "kettle cooked potato chips": that is the same food). If there is one, REPLACE that item: keep its place in the list and its "eaten", give it the label's nutrients, serving size and servingsPerContainer, and set its source to "label". The same food must never appear twice. Only when nothing in the list matches, add the label as a new item with source "label".
- The person says how much they ate: change only that item's "eaten". When they speak of a bag, box, can or package, they mean the item whose servingsPerContainer is known.
- The person adds a food with no photo ("add a can of Coke"): add it with standard US reference values for one normal unit. A can of soda is 12 fl oz (a regular cola is 140 calories with 39 g of sugar, all of it added). source is "said".
- The person changes an ingredient ("no mayo", "that was water not soda"): change that item's name and its per-serving nutrients, or remove the item.
- Leave every item the person did not mention, and that no new photo is about, exactly as it is.
- If a photo shows no food and no label, or you cannot tell what the person means, return the list unchanged and ask ONE short question in reply.

sugarG is total sugar. addedSugarG is the part added in cooking or manufacturing (on a label it is the "Includes added sugars" line); natural sugar in whole fruit, plain milk and vegetables is not added sugar. addedSugarG is never more than sugarG.

reply: one or two short plain sentences for the person saying what you saw or changed. For a label, say the calories per serving and the servings per container. Do NOT state a total for the meal or do any arithmetic: the app shows the totals. No markdown, no lists, no emoji.

Respond with ONLY valid JSON, minified on a single line, in exactly this shape and nothing else:
{"reply": string, "items": [{"name": string, "source": "label" | "estimate" | "said", "confidence": "normal" | "low", "portionDescription": string, "servingsPerContainer": number | null, "eaten": {"quantity": number, "unit": "servings" | "containers"}, "nutrients": ${NUTRIENT_SHAPE}}]}`;
}

const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

// The one place a portion is worked out. A share of the container needs the container's size; if
// the model gave a share without one, there is nothing to multiply by, so it counts as servings.
export function servingsEaten(eaten: any, servingsPerContainer: number | null): number {
  const quantity = positive(eaten?.quantity) ?? 1;
  const servings = eaten?.unit === 'containers' && servingsPerContainer ? quantity * servingsPerContainer : quantity;
  return Math.min(50, Math.max(0.05, Math.round(servings * 100) / 100));
}

export function parseMealChat(raw: string): MealChatResult {
  let parsed: any;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Helper response was not valid JSON');
  }
  if (!Array.isArray(parsed?.items)) throw new Error('Helper response missing "items" array');
  const items: ChatItem[] = parsed.items.map((item: any) => {
    const servingsPerContainer = positive(item?.servingsPerContainer);
    return {
      ...parseItem(item),
      source: item?.source === 'label' || item?.source === 'said' ? item.source : 'estimate',
      servingsPerContainer,
      servings: servingsEaten(item?.eaten, servingsPerContainer),
    };
  });
  const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 500) : 'Updated.';
  return { reply, items };
}

function textOf(response: RouterResponse): string {
  const block = response.content.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block || !block.text) throw new Error('Model response had no text content');
  return block.text;
}

export async function runMealChat(items: ChatItem[], message: string, images: MealChatImage[]): Promise<MealChatResult> {
  const response = await callModel(
    {
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.imageBase64 } })),
            { type: 'text', text: buildMealChatPrompt(items, message, images.length) },
          ],
        },
      ],
    },
    {
      freeOnly: true, // the cost ceiling (CLAUDE.md): when free providers run out this throws, it never pays
      timeoutMs: 50000,
      validate: (parsed) => {
        parseMealChat(textOf(parsed));
      },
    }
  );
  return parseMealChat(textOf(response));
}
