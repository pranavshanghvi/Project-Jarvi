import type { VercelRequest, VercelResponse } from '@vercel/node';

// A browser refuses to let a web page call another site unless that site says it may. The phone
// app is not a browser and never needed this; the web version does. Only the web version's own
// address (plus a local test server) is allowed, so other websites cannot spend the free AI
// allowance from their visitors' browsers. ALLOWED_ORIGINS (comma separated) adds more.
// mybitelog is the address people are given; jarvi-web is the project's original address.
const DEFAULT_ORIGINS = ['https://mybitelog.vercel.app', 'https://jarvi-web.vercel.app'];

export function isAllowedOrigin(origin: string | undefined, extra: string | undefined = process.env.ALLOWED_ORIGINS): boolean {
  if (!origin) return false;
  const allowed = [...DEFAULT_ORIGINS, ...(extra ?? '').split(',').map((o) => o.trim()).filter(Boolean)];
  if (allowed.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Adds the permission headers. Returns true when the request was only the browser's advance
// "may I?" check (OPTIONS) and has been fully answered, so the caller should stop there.
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers?.origin as string | undefined;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-proxy-secret');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
