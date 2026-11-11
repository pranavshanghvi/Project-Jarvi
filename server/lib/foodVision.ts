import { callModel, RouterResponse } from './modelRouter';
import { parseClaudeResponse } from './parseResponse';

const PROMPT = `You are a nutrition analysis assistant. Look at the food in this photo and identify each distinct food item separately (do not combine them into one estimate).

For each item, estimate: name, a portion description (e.g. "1 cup, ~150g"), a confidence level ("normal" or "low" if you're unsure what it is or how much is there), and a full nutrient profile with these exact fields: calories, proteinG, carbsG, fatG, saturatedFatG, fiberG, sugarG, sodiumMg, cholesterolMg (all numbers).

Respond with ONLY valid JSON, minified on a single line with no spaces or line breaks between tokens, in this exact shape, no other text:
{"items": [{"name": string, "confidence": "normal" | "low", "portionDescription": string, "nutrients": {"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "saturatedFatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "cholesterolMg": number}}]}

If you cannot identify any food, respond with {"items": []}.`;

function textOf(response: RouterResponse): string {
  const block = response.content.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block || !block.text) throw new Error('Model response had no text content');
  return block.text;
}

// Free providers only (CLAUDE.md). `validate` makes a provider that answers in prose instead of
// the JSON we asked for count as a failure, so the rotation moves on to the next free provider
// rather than ending on an unusable answer. When every free provider declines, callModel throws
// with `allDeclined` set — the caller degrades; nothing here can fall back to a paid model.
export async function analyzeFoodImage(imageBase64: string, mimeType: string): Promise<string> {
  const response = await callModel(
    {
      max_tokens: 2048,
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
      // Measured 2026-11-11 on Cloudflare's free vision model: a four-item meal took 22.6s and
      // the next identical request ran past 25s. A timeout also benches the provider for a
      // minute, so a limit that close to the typical time turns one slow answer into an outage.
      // 50s leaves room under the function's 60s ceiling (vercel.json).
      timeoutMs: 50000,
      validate: (parsed) => {
        parseClaudeResponse(textOf(parsed));
      },
    }
  );
  return textOf(response);
}
