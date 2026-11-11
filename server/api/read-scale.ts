import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors';
import { readScaleImage } from '../lib/scaleVision';

// Reads the number off a photo of a bathroom scale. Same rules as /api/analyze: free AI only,
// and when every free provider is out, say so plainly rather than spend.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requiredSecret = process.env.PROXY_SHARED_SECRET;
  if (requiredSecret && req.headers['x-proxy-secret'] !== requiredSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { imageBase64, mimeType } = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  try {
    res.status(200).json(await readScaleImage(imageBase64, mimeType ?? 'image/jpeg'));
  } catch (error: any) {
    if (error?.allDeclined) {
      res.status(503).json({ error: 'Photo reading is unavailable right now. Type the weight in instead.', declined: error.declined });
      return;
    }
    res.status(502).json({ error: error.message ?? 'Reading failed' });
  }
}
