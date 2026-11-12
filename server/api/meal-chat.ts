import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../lib/cors';
import { ChatItem, MAX_IMAGES, MAX_ITEMS, MAX_MESSAGE_LENGTH, MealChatImage, runMealChat } from '../lib/mealChat';

// One turn of the meal helper. Same rules as /api/analyze: free AI only, and when every free
// provider is out, say so plainly rather than spend.
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

  const body = req.body ?? {};
  const images: MealChatImage[] = Array.isArray(body.images) ? body.images : [];
  const message: string = typeof body.message === 'string' ? body.message : '';
  const items: ChatItem[] = Array.isArray(body.items) ? body.items : [];

  if (images.length === 0 && message.trim().length === 0) {
    res.status(400).json({ error: 'Send a photo or a message' });
    return;
  }
  if (images.length > MAX_IMAGES || message.length > MAX_MESSAGE_LENGTH || items.length > MAX_ITEMS) {
    res.status(400).json({ error: 'Too much in one request' });
    return;
  }
  if (images.some((image) => typeof image?.imageBase64 !== 'string' || image.imageBase64.length === 0)) {
    res.status(400).json({ error: 'Each image needs imageBase64' });
    return;
  }

  try {
    const result = await runMealChat(
      items,
      message,
      images.map((image) => ({ imageBase64: image.imageBase64, mimeType: image.mimeType ?? 'image/jpeg' }))
    );
    res.status(200).json(result);
  } catch (error: any) {
    // Written to the server log so a failure can be traced afterwards: which kind it was, and
    // how much was sent. Never the photo or the words themselves.
    console.error('[meal-chat] failed', JSON.stringify({ reason: String(error?.message ?? error).slice(0, 300), allDeclined: !!error?.allDeclined, declined: error?.declined ?? null, images: images.length, imageBytes: images.reduce((sum, image) => sum + image.imageBase64.length, 0), items: items.length, messageLength: message.length }));
    if (error?.allDeclined) {
      res.status(503).json({ error: 'The meal helper is unavailable right now.', declined: error.declined });
      return;
    }
    res.status(502).json({ error: error.message ?? 'The helper could not answer' });
  }
}
