import { fromDisplayWeight, WeightUnit } from '../units';
import { prepareForUpload } from './analyzePhoto';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;

// Sends a photo of a scale to the free photo reader and returns the weight in kilograms, or null
// when no clear number could be read. `assumedUnit` is used only when the display shows no unit.
// Throws when the reader is unavailable, so the screen can say "type it in instead".
export async function readScalePhoto(photoUri: string, assumedUnit: WeightUnit): Promise<number | null> {
  const imageBase64 = await prepareForUpload(photoUri);
  const response = await fetch(`${API_BASE_URL}/api/read-scale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(PROXY_SECRET ? { 'x-proxy-secret': PROXY_SECRET } : {}) },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  });
  if (!response.ok) throw new Error(`Scale reading failed with status ${response.status}`);
  return scaleReadingToKg(await response.json(), assumedUnit);
}

export function scaleReadingToKg(reading: { weight?: unknown; unit?: unknown }, assumedUnit: WeightUnit): number | null {
  if (typeof reading?.weight !== 'number' || !Number.isFinite(reading.weight) || reading.weight <= 0) return null;
  const unit: WeightUnit = reading.unit === 'kg' || reading.unit === 'lb' ? reading.unit : assumedUnit;
  return fromDisplayWeight(reading.weight, unit);
}
