import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors';
import { analyzeFoodImage } from '../lib/foodVision';
import { parseClaudeResponse } from '../lib/parseResponse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requiredSecret = process.env.PROXY_SHARED_SECRET;
  if (requiredSecret) {
    const providedSecret = req.headers['x-proxy-secret'];
    if (providedSecret !== requiredSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const { imageBase64, mimeType } = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  try {
    const rawText = await analyzeFoodImage(imageBase64, mimeType ?? 'image/jpeg');
    const parsed = parseClaudeResponse(rawText);
    res.status(200).json(parsed);
  } catch (error: any) {
    // Every free provider declined (out of quota, not configured, or unusable answers). Degrade,
    // never spend: tell the app plainly so it queues the photo and retries later.
    if (error?.allDeclined) {
      res.status(503).json({ error: 'Photo reading is unavailable right now. Your photo is saved and will be retried.', declined: error.declined });
      return;
    }
    res.status(502).json({ error: error.message ?? 'Analysis failed' });
  }
}
