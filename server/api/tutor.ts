import type { VercelRequest, VercelResponse } from '@vercel/node';

// The relativity tutor lived in the Snaptly backend (pranavshanghvi/taxwise-backend) until
// 2026-08-18, because that is where the five free-provider keys already were. It was moved here
// because sharing a process with Snaptly turned out to cost more than the duplicated credentials
// saved:
//
//   1. `installProviderKeys` writes a reader-supplied key into process.env for the life of the
//      process. An environment key wins, so it was inert while all five were set — but one unset
//      or rotated variable would have let an anonymous caller install their own key, and Snaptly's
//      own traffic (receipts, categorization, the household assistant) would then have run on a
//      stranger's account. Financial prompts, silently, to someone else's API.
//   2. The tutor spent the same free-tier quota Snaptly depends on for bank categorization. With
//      the daily AI test runs starting, an unauthenticated public endpoint sharing that pool would
//      have made both numbers unreadable.
//
// Here it has its own keys and its own quota, and neither concern applies to Snaptly at all.
//
// ⚠️ STILL TO FIX in this deployment: `installProviderKeys` is process-wide rather than
// per-request, so one reader's supplied key can be used to serve another reader's question. No
// financial data is involved now, but it is still the wrong shape — the keys should be threaded
// through the call rather than written to the environment.

// Required rather than imported: lib/relativityTutor.js and lib/modelRouter.js are CommonJS,
// carried over verbatim from the Snaptly backend so their behaviour and their tests are unchanged.
// Rewriting 900 lines into TypeScript as part of a move is how a move introduces bugs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { answerQuestion, rateLimited } = require('../lib/relativityTutor');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // The reader has no account and never will, so the endpoint is public. What that can cost is
  // bounded by rate rather than by auth: an unauthenticated endpoint on a free tier can only ever
  // spend quota, and the caller already falls back to answers written into the app when it runs out.
  const ip = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
  ).split(',')[0].trim();

  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Too many questions just now — try again in a minute.' });
    return;
  }

  try {
    const { status, body } = await answerQuestion(req.body || {});
    res.status(status).json(body);
  } catch (err: any) {
    console.error('[tutor] unexpected:', err?.message);
    res.status(500).json({ error: 'Something went wrong answering that.' });
  }
}
