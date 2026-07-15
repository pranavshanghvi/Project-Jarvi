import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeImageWithClaude } from '../lib/claudeClient';
import { parseClaudeResponse } from '../lib/parseResponse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { imageBase64, mimeType } = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  try {
    const rawText = await analyzeImageWithClaude(imageBase64, mimeType ?? 'image/jpeg');
    const parsed = parseClaudeResponse(rawText);
    res.status(200).json(parsed);
  } catch (error: any) {
    res.status(502).json({ error: error.message ?? 'Analysis failed' });
  }
}
