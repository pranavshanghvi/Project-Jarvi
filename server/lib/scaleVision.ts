import { callModel, RouterResponse } from './modelRouter';

export interface ScaleReading {
  weight: number | null; // null when no clear reading is visible
  unit: 'lb' | 'kg' | null; // null when the display shows no unit; the app then assumes the user's own
}

const PROMPT = `This photo should show a bathroom scale display, or a screen showing a body weight. Read the body weight shown.

Respond with ONLY valid JSON, minified on a single line, in this exact shape, no other text:
{"weight": number or null, "unit": "lb" or "kg" or null}

Rules:
- "weight" is the number on the display, including the decimal place if one is shown.
- "unit" is the unit printed or shown next to the number. If no unit is visible, use null.
- If the display shows stones and pounds, convert to pounds and use "lb".
- If there is no scale or no readable weight (blank display, glare, cut off, a different kind of photo), respond {"weight":null,"unit":null}. Do not guess.`;

function textOf(response: RouterResponse): string {
  const block = response.content.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block || !block.text) throw new Error('Model response had no text content');
  return block.text;
}

// Turns the model's reply into a reading, or throws if it is not the JSON asked for. A number
// outside any human body weight is treated as "could not read it" rather than passed along: a
// misread digit should send the person back to typing, not put 18 lb or 1,824 lb in their log.
export function parseScaleReading(raw: string): ScaleReading {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  let parsed: any;
  try {
    parsed = JSON.parse(start !== -1 && end > start ? trimmed.slice(start, end + 1) : trimmed);
  } catch {
    throw new Error('Scale reading was not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || !('weight' in parsed)) {
    throw new Error('Scale reading is missing "weight"');
  }
  const unit = parsed.unit === 'lb' || parsed.unit === 'kg' ? parsed.unit : null;
  const weight = typeof parsed.weight === 'number' && Number.isFinite(parsed.weight) ? parsed.weight : null;
  const [low, high] = unit === 'kg' ? [20, 400] : unit === 'lb' ? [40, 900] : [20, 900];
  if (weight === null || weight < low || weight > high) return { weight: null, unit: null };
  return { weight: Math.round(weight * 10) / 10, unit };
}

// Free providers only (CLAUDE.md): `freeOnly: true` makes exhaustion throw instead of spending.
// `validate` rejects a prose answer so the rotation tries the next free provider.
export async function readScaleImage(imageBase64: string, mimeType: string): Promise<ScaleReading> {
  const response = await callModel(
    {
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    },
    {
      freeOnly: true,
      timeoutMs: 50000,
      validate: (parsed) => {
        parseScaleReading(textOf(parsed));
      },
    }
  );
  return parseScaleReading(textOf(response));
}
