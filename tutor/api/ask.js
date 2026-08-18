// The online tutor. One endpoint, free providers only.
//
// There is a second implementation of this in pranavshanghvi/taxwise-backend
// (lib/relativityTutor.js, POST /api/tutor/ask), which is the one the app points at by default
// because that deployment already holds the free-provider keys. This one needs its own copy of a
// key set on the Vercel project. Two copies is one too many: the intent is to retire this file
// once the Railway route is proven, and until then _prompt.js and its counterpart there have to
// be edited together.
//
// CLAUDE.md governs this file completely: `freeOnly: true` is not a default that can be
// overridden by a query parameter, and when the rotation is exhausted this returns 503 with the
// reason each provider declined. It never falls back to a paid model — see PROVENANCE.md for why
// that is structurally impossible here rather than merely intended.
//
// The app works with no signal at all; this only ever adds to it. So every failure path returns
// something the client can degrade from, and none of them are retried aggressively enough to
// burn a free tier that is already struggling.

const { callModel } = require('./_modelRouter');
const { buildPrompt, parseAnswer, sanitizeHistory } = require('./_prompt');

const MAX_TOKENS = 900;          // three paragraphs and a question; free tiers charge context
const MAX_BODY = 64 * 1024;      // a section of the book plus a question, with room to spare

// Anyone who finds this URL can spend the free quota, and there is no key to protect it with —
// a secret in a PWA bundle is readable by whoever opens the page, which the directive forbids.
// So: a light origin check to stop casual embedding, and a per-IP rate limit to bound the
// damage. The worst case is quota exhaustion, whose failure mode is the one we already handle.
const ALLOWED = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/([a-z0-9-]+\.)*claude\.ai$/,
  /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/,
];
function originAllowed(origin) {
  if (!origin || origin === 'null') return true;   // file:// and home-screen PWAs send null
  return ALLOWED.some(re => re.test(origin));
}

const WINDOW_MS = 60 * 1000, PER_WINDOW = 12;
const seen = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter(t => now - t < WINDOW_MS);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some(t => now - t < WINDOW_MS)) seen.delete(k);
  return hits.length > PER_WINDOW;
}

// Only the free providers, and only when the deployment has no key of its own. An environment
// key is the proper configuration and must not be overridable by a request.
const ACCEPTED_KEYS = ['GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY',
                       'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'GEMINI_API_KEY'];
function installProviderKeys(supplied) {
  if (!supplied || typeof supplied !== 'object') return;
  for (const name of ACCEPTED_KEYS) {
    const v = supplied[name];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (process.env[name]) continue;                 // configured properly; leave it alone
    process.env[name] = v.trim();
    console.log('[ask] using a provider key supplied by the client for ' + name);  // never the value
  }
}

function send(res, status, body, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin && origin !== 'null' ? origin : '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(body));
}

async function handler(req, res) {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') return send(res, 204, '', origin);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, origin);
  if (!originAllowed(origin)) return send(res, 403, { error: 'Origin not allowed' }, origin);

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return send(res, 429, {
      error: 'rate_limited',
      // Phrased for the reader, not the developer — this string is shown in the app.
      message: 'That is a lot of questions in one minute. Give it a moment.',
    }, origin);
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Expected a JSON body' }, origin);
  if (JSON.stringify(body).length > MAX_BODY) return send(res, 413, { error: 'Body too large' }, origin);

  const question = String(body.question || '').trim();
  if (!question) return send(res, 400, { error: 'No question' }, origin);

  // Bring-your-own-key. The reader can paste a free-provider key into the app's Settings when
  // there is no way to set one in the deployment's environment — which is the situation this
  // was written for. It is stored in their own browser, never in this bundle and never in git,
  // and it is used exactly the same way an environment key would be: handed to the router,
  // which still runs freeOnly. It is never logged and never returned.
  //
  // Installed onto process.env rather than threaded through, because the router reads env by
  // design and forking it would be worse. Written once per warm process and not cleared: two
  // requests carrying the same key race harmlessly, and an environment key always wins.
  installProviderKeys(body.providerKeys);

  const { system, user } = buildPrompt({
    question,
    line: body.line,
    section: body.section,
    level: body.level,
    needsSupport: body.needsSupport,
  });

  // A follow-up arrives with the turns before it, so "I still do not follow" means something.
  // The passage rides on the first turn only — it is already in the conversation after that.
  const history = sanitizeHistory(body.history);
  const messages = history.length
    ? [...history, { role: 'user', content: question }]
    : [{ role: 'user', content: user }];

  let response;
  try {
    // The one call. `freeOnly` is hardcoded — it is the cost ceiling, not a parameter.
    response = await callModel({
      model: 'claude-haiku-4-5-20251001',   // only names the paid tier; freeOnly never reaches it
      max_tokens: MAX_TOKENS,
      temperature: 0.4,
      system,
      messages,
    }, { freeOnly: true });
  } catch (e) {
    // Every free provider declined. This is the expected end state of a free tier, not a bug,
    // so it is reported as a state the app can sit in rather than as an error.
    console.log('[ask] free rotation exhausted: ' + String(e.message).slice(0, 400));
    return send(res, 503, {
      error: 'no_free_provider',
      message: 'The free models are all out for now. Your question is saved — try again later.',
      declined: e.declined || [String(e.message)],
    }, origin);
  }

  const text = (response.content || [])
    .filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) return send(res, 502, { error: 'empty_answer', message: 'The model returned nothing usable.' }, origin);

  return send(res, 200, {
    ...parseAnswer(text),
    // The free providers' translation layer does not carry a model name back — it is logged
    // server-side, not returned. Say null rather than guessing one; the client only needs to
    // know the answer came from the live tutor, which `source` tells it.
    source: 'live',
    model: response.model || null,
    askedAt: new Date().toISOString(),
  }, origin);
}

module.exports = handler;
module.exports.default = handler;
// Exported for the tests, which drive these directly rather than standing up a server.
module.exports._internals = { originAllowed, rateLimited, installProviderKeys, ACCEPTED_KEYS, MAX_TOKENS };
