import Anthropic from '@anthropic-ai/sdk';

const PROMPT = `You are a nutrition analysis assistant. Look at the food in this photo and identify each distinct food item separately (do not combine them into one estimate).

For each item, estimate: name, a portion description (e.g. "1 cup, ~150g"), a confidence level ("normal" or "low" if you're unsure what it is or how much is there), and a full nutrient profile with these exact fields: calories, proteinG, carbsG, fatG, saturatedFatG, fiberG, sugarG, sodiumMg, cholesterolMg (all numbers).

Respond with ONLY valid JSON in this exact shape, no other text:
{"items": [{"name": string, "confidence": "normal" | "low", "portionDescription": string, "nutrients": {"calories": number, "proteinG": number, "carbsG": number, "fatG": number, "saturatedFatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number, "cholesterolMg": number}}]}

If you cannot identify any food, respond with {"items": []}.`;

export async function analyzeImageWithClaude(imageBase64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  const textBlock = response.content.find((block: any) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude response had no text content');
  }
  return textBlock.text;
}
