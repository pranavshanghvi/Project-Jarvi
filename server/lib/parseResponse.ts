import { AnalyzePhotoResponse, DetectedFoodItem, NutrientProfile } from './types';

const REQUIRED_NUTRIENT_KEYS: (keyof NutrientProfile)[] = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'saturatedFatG',
  'fiberG',
  'sugarG',
  'sodiumMg',
  'cholesterolMg',
];

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function parseClaudeResponse(raw: string): AnalyzePhotoResponse {
  let parsed: any;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Claude response was not valid JSON');
  }

  if (!Array.isArray(parsed?.items)) {
    throw new Error('Claude response missing "items" array');
  }

  const items: DetectedFoodItem[] = parsed.items.map((item: any) => {
    const missing = REQUIRED_NUTRIENT_KEYS.filter((key) => typeof item?.nutrients?.[key] !== 'number');
    if (missing.length > 0) {
      throw new Error(`Claude item "${item?.name ?? 'unknown'}" is missing nutrient fields: ${missing.join(', ')}`);
    }
    return {
      name: item.name,
      confidence: item.confidence === 'low' ? 'low' : 'normal',
      portionDescription: item.portionDescription ?? '',
      nutrients: item.nutrients,
    };
  });

  return { items };
}
