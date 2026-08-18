// A tutor for Einstein's "Relativity", answered on the free rotation.
//
// This is not a TaxWise feature. It lives here because this is where the five free-provider keys
// already are: the reader's app is a static PWA with no server of its own, and the alternative
// was standing up a second deployment and copying the keys into it. One place holding provider
// credentials is better than two.
//
// Nothing here touches the database, the household scope, or any user data. The route is public
// (see the /api auth bypass in server.js) because the reader has no TaxWise account and never
// will. What that costs is bounded by RATE: an unauthenticated endpoint on a free tier can only
// ever spend quota, and the failure mode when quota runs out is the one the caller already
// handles — it falls back to answers written into the app.
//
// The prompt below is a verbatim copy of tutor/api/_prompt.js in pranavshanghvi/Project-Jarvi.
// Two copies is one too many, and the intent is to retire the Vercel one once this is proven;
// until then, edit them together.

// Required lazily, inside the one function that calls it. modelRouter pulls in the Anthropic SDK
// at load time for a fallback this file never uses, and there is no reason for a unit test of a
// prompt builder to need that dependency present.
const routerCallModel = (...args) => require('./modelRouter').callModel(...args);

const MAX_TOKENS = 900;          // three paragraphs and a question; free tiers charge context
const MAX_SECTION_CHARS = 7000;  // free-tier context windows are the smallest thing in this system

const LEVELS = {
  plain:     'Explain as you would to a bright person who left physics at sixteen. No equations, no jargon that is not immediately unpacked.',
  intuition: 'They have the basic picture. Go one layer deeper into why it has to be this way — but still no algebra.',
  careful:   'They want it precise. Be exact about what is claimed and what is assumed. Simple algebra is fine; tensor calculus is not.',
};

const SYSTEM = `You are a tutor for a reader working through Einstein's "Relativity: The Special and General Theory" — the 1920 Lawson translation. They are not a physicist and are not studying for an exam. They want to understand what the theory MEANS.

Answer whatever they ask. Not only what is in the book — who the people were, why a chapter carries someone's name, what happened historically, physics that comes after this book ends. The book is what they happen to be reading, not the boundary of what they are allowed to wonder about. If a passage is supplied below it is context, not a fence: use it where it helps and go past it where the question needs you to.

How to answer:

- Plain English. Short sentences. If you use a technical word, define it in the same breath.
- Reach for a real-world analogy, then say where the analogy breaks down. An analogy without its limits creates a confident false belief, which is worse than confusion.
- Answer the question that was asked. Do not deliver a lecture on the surrounding topic.
- If the question rests on a misconception, do not just correct it. Describe a situation where their own assumption leads somewhere absurd, and let them see it.
- Never end flat. Finish with one specific question that opens the next step.
- If the book passage does not settle it, say which part is you filling in a gap.
- Never invent an experiment, a number, or a date. If you are not sure of a figure, say the figure is something you would want to check rather than stating it.

This is a conversation, not a lookup. They will push back, and when they do:

- "I do not follow" means the approach failed, not that it needs repeating. Change the angle entirely — a different analogy, a concrete case with numbers, or the same idea from the opposite direction. Never paraphrase yourself and call it a new explanation.
- If they disagree, take the objection seriously and answer it on its merits. Say plainly which part of their reasoning is right, because usually some of it is, and locate the exact step where it goes wrong. Never wave it away with "that is just how relativity works".
- If they ask what a specific phrase in your last answer meant, define that phrase. Do not restate the whole thing around it.
- If they are right and you were wrong, say so directly and correct it.

Format your reply as these labelled lines, in this order. Use only the labels you actually need, but ANSWER and NEXT are required:

ANSWER: the explanation, two or three short paragraphs at most
ANALOGY: one everyday comparison
BREAKS: where that analogy stops being true
MEANS: why this matters for how to picture reality — one or two sentences
NEXT: one question inviting them further in

Write nothing outside those labels. No preamble, no sign-off, no markdown headings.`;

function clip(s, n) {
  s = String(s || '').trim();
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

// The section the reader is looking at travels with the question. That is what makes a small
// free model useful here: asked "who is Gauss" from memory it writes a biography, but handed
// §XXV it explains what Gauss is doing in that argument.
//
// opts: { question, line, section: {numeral, title, text}, level, needsSupport: [] }
function buildPrompt(opts = {}) {
  const question = clip(opts.question, 1200);
  const level = LEVELS[opts.level] ? opts.level : 'plain';
  const parts = [];

  const s = opts.section;
  if (s && s.text) {
    parts.push(
      'For context, here is the passage they are reading. Quote from it where that helps. If ' +
      'their question goes beyond it — a person, a date, a later development — answer that ' +
      'anyway, and say plainly which part the book does not cover.\n\n' +
      '--- ' + (s.numeral ? '§' + s.numeral + ' · ' : '') + (s.title || '') + ' ---\n' +
      clip(s.text, MAX_SECTION_CHARS) + '\n--- end of passage ---'
    );
  }
  if (opts.line) {
    parts.push('The exact sentence they tapped:\n\n"' + clip(opts.line, 900) + '"');
  }

  parts.push(LEVELS[level]);

  // What earlier questions revealed they were missing. The tutor is supposed to learn the
  // reader's level rather than make them declare it.
  const gaps = (opts.needsSupport || []).filter(Boolean).slice(0, 6);
  if (gaps.length) {
    parts.push('They have already needed things spelled out more slowly on: ' + gaps.join(', ') +
               '. Assume nothing there.');
  }

  parts.push('Their question:\n\n' + (question || 'Explain this passage.'));

  return { system: SYSTEM, user: parts.join('\n\n') };
}

// Labelled lines rather than JSON. Free models emit malformed JSON often enough that the parser
// becomes the failure mode; this survives a model that ignores half the instruction, and a reply
// with no labels at all still renders as prose.
const LABELS = ['ANSWER', 'ANALOGY', 'BREAKS', 'MEANS', 'NEXT'];
const LABEL_RE = new RegExp('^\\s*\\**\\s*(' + LABELS.join('|') + ')\\s*\\**\\s*:\\s*', 'i');

function parseAnswer(text) {
  const out = {};
  let current = null, buf = [], preamble = [];
  for (const rawLine of String(text || '').split('\n')) {
    const m = rawLine.match(LABEL_RE);
    if (m) {
      if (current) out[current] = buf.join('\n').trim();
      current = m[1].toUpperCase();
      buf = [rawLine.slice(m[0].length)];
    } else if (current) {
      buf.push(rawLine);
    } else {
      preamble.push(rawLine);
    }
  }
  if (current) out[current] = buf.join('\n').trim();

  const stray = preamble.join('\n').trim();
  if (!out.ANSWER) out.ANSWER = stray;
  else if (stray) out.ANSWER = stray + '\n\n' + out.ANSWER;

  // Strip the markdown emphasis small models sprinkle in regardless of instructions — the
  // client renders plain text and would otherwise show the asterisks.
  const clean = v => v ? v.replace(/\*\*/g, '').replace(/^[-*]\s+/gm, '').trim() : '';
  return {
    answer:  clean(out.ANSWER),
    analogy: clean(out.ANALOGY),
    breaks:  clean(out.BREAKS),
    means:   clean(out.MEANS),
    next:    clean(out.NEXT),
  };
}

// ─── Prior turns ────────────────────────────────────────────────────────────
// The first turn of a thread carries the passage and the framing; a follow-up is just what the
// reader typed, because the context is already in the conversation and repeating a
// 7000-character section every turn would spend the free tier's context window on nothing.
const MAX_TURNS = 12, MAX_HISTORY_CHARS = 24000;

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!role || !content) continue;
    out.push({ role, content });
  }
  // Oldest first out, so a long thread loses its beginning rather than its most recent turn.
  let total = out.reduce((n, m) => n + m.content.length, 0);
  while (out.length > 2 && total > MAX_HISTORY_CHARS) total -= out.shift().content.length;
  // A conversation must start with the reader and alternate; anything else confuses the models.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// ─── What the auth bypass opens ─────────────────────────────────────────────
// One line in server.js lets these paths past the session gate, which makes it the only line in
// this feature that could open something it should not. It lives here so it is testable: a
// prefix check written slightly wrong — '/tutor' without the slash — would also match
// '/tutorials' or any future route whose name merely starts the same way.
//
// `path` is what express gives the handler mounted at '/api', so it is already relative:
// '/tutor/ask' rather than '/api/tutor/ask'.
function isPublicTutorPath(path) {
  return String(path || '') === '/tutor/ask';
}

// ─── Rate limit ─────────────────────────────────────────────────────────────
// The route is public, so the only thing standing between a stranger and this household's free
// tier is this counter. In-memory and per-process, which is the right size for the threat: it
// is not protecting a secret, it is stopping one client from draining a quota.
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
function _resetRateLimit() { seen.clear(); }

// ─── The handler, minus HTTP ────────────────────────────────────────────────
// Returns { status, body } so the express route stays two lines and this stays testable without
// standing up a server. `ask` is injectable for the same reason.
// Only the free providers, and only when this deployment has no key of its own. A request must
// never be able to redirect our traffic onto someone else's account, so an environment key wins.
const ACCEPTED_KEYS = ['GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY',
                       'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'GEMINI_API_KEY'];
function installProviderKeys(supplied) {
  if (!supplied || typeof supplied !== 'object') return;
  for (const name of ACCEPTED_KEYS) {
    const v = supplied[name];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (process.env[name]) continue;
    process.env[name] = v.trim();
    console.log('[tutor] using a provider key supplied by the client for ' + name);  // never the value
  }
}

async function answerQuestion(input = {}, opts = {}) {
  const ask = opts.callModel || routerCallModel;
  const question = String(input.question || '').trim();
  if (!question) return { status: 400, body: { error: 'No question' } };

  // Bring-your-own-key, for a deployment whose environment cannot be reached. The key comes
  // from the reader's own browser, is never in any bundle or in git, and is handed to the same
  // router under the same freeOnly. Never logged, never returned.
  installProviderKeys(input.providerKeys);

  const { system, user } = buildPrompt({
    question,
    line: input.line,
    section: input.section,
    level: input.level,
    needsSupport: input.needsSupport,
  });

  // A follow-up arrives with the turns before it, so "I still do not follow" means something.
  const history = sanitizeHistory(input.history);
  const messages = history.length
    ? [...history, { role: 'user', content: question }]
    : [{ role: 'user', content: user }];

  let response;
  try {
    // freeOnly is hardcoded. Asking this tutor a question must never cost money, and that is a
    // property of the call site, not a setting the caller gets to pass in.
    response = await ask({
      model: 'claude-haiku-4-5-20251001',   // names the paid tier only; freeOnly never reaches it
      max_tokens: MAX_TOKENS,
      temperature: 0.4,
      system,
      messages,
    }, { freeOnly: true });
  } catch (e) {
    // Every free provider declined. That is the expected end state of a free tier rather than a
    // bug, so it is reported as a state the caller can sit in — it falls back to the answers
    // written into the app and saves the question for later.
    console.log('[tutor] free rotation exhausted: ' + String(e.message).replace(/\s+/g, ' ').slice(0, 400));
    return {
      status: 503,
      body: {
        error: 'no_free_provider',
        message: 'The free models are all out for now. Your question is saved — try again later.',
        declined: e.declined || [String(e.message)],
      },
    };
  }

  const text = (response.content || [])
    .filter(b => b && b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) {
    return { status: 502, body: { error: 'empty_answer', message: 'The model returned nothing usable.' } };
  }

  return {
    status: 200,
    body: {
      ...parseAnswer(text),
      // The free providers' translation layer does not carry a model name back — it is logged,
      // not returned. Say null rather than guessing one.
      source: 'live',
      model: response.model || null,
      askedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  answerQuestion,
  sanitizeHistory,
  installProviderKeys,
  ACCEPTED_KEYS,
  isPublicTutorPath,
  buildPrompt,
  parseAnswer,
  rateLimited,
  SYSTEM,
  LEVELS,
  MAX_TOKENS,
  MAX_SECTION_CHARS,
  _resetRateLimit,
};
