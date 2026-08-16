// Tests the online path without spending anything and without a network.
//
// The provider calls are stubbed by unsetting every provider key, which makes the real router
// take its real "nothing is configured" path — so the exhaustion behaviour under test is the
// actual behaviour, not a mock of it. The prompt builder, the parser and the guards are driven
// directly.
//
// Run:  node tutor/tools/test-server.mjs

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0, passed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; return; }
  failed++; console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
};
const group = n => console.log('\n' + n);

// A stand-in for the Vercel response object.
function mockRes() {
  const r = { code: 0, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = c => { r.code = c; return r; };
  r.send = b => { r.body = b; return r; };
  r.json = () => JSON.parse(r.body);
  return r;
}
const post = (body, headers = {}) => ({ method: 'POST', headers: { origin: 'https://claude.ai', ...headers }, body });

// ── the cost directive, checked the way a reviewer would ──────────────────
group('the ultimate directive');
{
  const src = readFileSync(join(ROOT, 'api/ask.js'), 'utf8');
  const calls = [...src.matchAll(/callModel\(/g)];
  ok('there is exactly one callModel call site', calls.length === 1, calls.length + ' found');
  ok('it passes freeOnly: true', /\{ freeOnly: true \}/.test(src));
  ok('freeOnly is hardcoded, not read from the request',
     !/freeOnly:\s*(body|req|opts|params)\./.test(src));
  ok('exhaustion degrades rather than escalating',
     /no_free_provider/.test(src) && !/paidOnly/.test(src));

  // Nothing else in the tutor may import the SDK, and the router's import must resolve to the
  // stub. Both together are what makes spending impossible rather than merely discouraged.
  const stub = require(join(ROOT, 'node_modules/@anthropic-ai/sdk/package.json'));
  ok('@anthropic-ai/sdk resolves to the deliberate stub',
     stub.version === '0.0.0-paid-path-disabled', stub.version);
  let threw = null;
  try { const A = require('@anthropic-ai/sdk'); new A({ apiKey: 'x' }); }
  catch (e) { threw = e; }
  ok('constructing it throws', threw && threw.code === 'PAID_PATH_DISABLED');
  ok('and the error names the directive', threw && /never cost money/.test(threw.message));
}

// ── the vendored router has not drifted ───────────────────────────────────
group('vendored router');
{
  const src = readFileSync(join(ROOT, 'api/_modelRouter.js'), 'utf8');
  const want = readFileSync(join(ROOT, 'api/PROVENANCE.md'), 'utf8').match(/`([0-9a-f]{64})`/);
  const got = createHash('sha256').update(src).digest('hex');
  ok('matches the hash recorded in PROVENANCE.md', want && want[1] === got,
     'recorded ' + (want && want[1]) + '\n        actual   ' + got);
  ok('it is the production rotation, in order',
     /'gemini'[\s\S]*'groq'[\s\S]*'mistral'[\s\S]*'openrouter'[\s\S]*'cloudflare'/.test(src));
  ok('freeOnly still throws rather than falling through',
     /if \(opts\.freeOnly\) \{[\s\S]{0,220}throw err;/.test(src));
}

// ── the prompt ────────────────────────────────────────────────────────────
group('prompt');
{
  const { buildPrompt, parseAnswer, MAX_SECTION_CHARS } = require(join(ROOT, 'api/_prompt.js'));
  const corpus = JSON.parse(readFileSync(join(ROOT, 'data/corpus.json'), 'utf8'));
  const s25 = corpus.sections.find(s => s.number === 25);
  const text = s25.blocks.filter(b => b.type === 'text').map(b => b.text).join('\n\n');

  const p = buildPrompt({
    question: 'Who is Gauss?',
    line: 'We shall now consider Gaussian co-ordinates.',
    section: { numeral: s25.numeral, title: s25.title, text },
    level: 'plain',
    needsSupport: ['algebra'],
  });
  // The whole reason a small model can answer "who is Gauss" usefully: it is not answering
  // from memory, it is answering about the page in front of the reader.
  ok('the section travels with the question', p.user.includes('Gaussian co-ordinate') ||
     p.user.includes('Gauss'));
  ok('the tapped line is quoted', p.user.includes('We shall now consider Gaussian co-ordinates.'));
  ok('the question is included', p.user.includes('Who is Gauss?'));
  ok('what they struggle with is included', p.user.includes('algebra'));
  ok('a huge section is clipped', buildPrompt({
       question: 'x', section: { title: 't', text: 'word '.repeat(50000) },
     }).user.length < MAX_SECTION_CHARS + 3000);
  ok('an unknown level falls back to plain rather than erroring',
     buildPrompt({ question: 'x', level: 'nonsense' }).user.includes('left physics at sixteen'));
  ok('a question with no section still builds', buildPrompt({ question: 'hi' }).user.includes('hi'));

  // The pedagogy the reader asked for has to actually be in the instruction.
  for (const [what, re] of [
    ['plain English',            /Plain English/],
    ['analogies',                /analogy/i],
    ['analogies state their limits', /where the analogy breaks down/],
    ['never ending flat',        /Never end flat/],
    ['not inventing evidence',   /Never invent an experiment/],
    ['surfacing misconceptions', /misconception/i],
  ]) ok('the system prompt asks for ' + what, re.test(p.system));
}

// ── parsing what a small model actually returns ───────────────────────────
group('answer parsing');
{
  const { parseAnswer } = require(join(ROOT, 'api/_prompt.js'));

  const full = parseAnswer(
    'ANSWER: Gauss was a mathematician.\nHe invented the co-ordinates.\n' +
    'ANALOGY: Like a rubber grid.\nBREAKS: The grid is not made of anything.\n' +
    'MEANS: Space needs no straight lines.\nNEXT: What would a curved ruler measure?');
  ok('all five labels parse', full.answer.includes('mathematician') && full.analogy &&
     full.breaks && full.means && full.next);
  ok('a label keeps its continuation lines', full.answer.includes('invented the co-ordinates'));

  ok('markdown-bolded labels parse too',
     parseAnswer('**ANSWER:** hello\n**NEXT:** why?').answer === 'hello');
  ok('lowercase labels parse', parseAnswer('answer: hi\nnext: eh?').answer === 'hi');
  ok('emphasis is stripped from the body',
     !parseAnswer('ANSWER: this is **very** important').answer.includes('**'));
  // A model that ignores the format entirely must still produce a usable answer.
  ok('unlabelled prose becomes the answer',
     parseAnswer('Gauss was a mathematician who worked on curved surfaces.')
       .answer.startsWith('Gauss was'));
  ok('a preamble before the first label is kept, not dropped',
     parseAnswer('Sure, happy to help!\nANSWER: the real answer').answer.includes('Sure, happy to help!'));
  ok('empty input does not throw', parseAnswer('').answer === '');
  ok('null input does not throw', parseAnswer(null).answer === '');
}

// ── the endpoint's guards ─────────────────────────────────────────────────
group('endpoint guards');
{
  const ask = require(join(ROOT, 'api/ask.js'));
  const { originAllowed } = ask._internals;

  ok('the artifact host is allowed', originAllowed('https://claude.ai'));
  ok('a claude.ai subdomain is allowed', originAllowed('https://www.claude.ai'));
  ok('a vercel preview is allowed', originAllowed('https://relativity-abc.vercel.app'));
  ok('a home-screen PWA (null origin) is allowed', originAllowed('null'));
  ok('localhost is allowed', originAllowed('http://localhost:3000'));
  ok('someone else embedding it is not', !originAllowed('https://example.com'));
  // The check must not be a substring match — that is the classic way an allowlist leaks.
  ok('a lookalike domain is not allowed', !originAllowed('https://claude.ai.evil.com'));
  ok('a prefixed lookalike is not allowed', !originAllowed('https://notclaude.ai'));

  let r = mockRes();
  await ask({ method: 'OPTIONS', headers: { origin: 'https://claude.ai' } }, r);
  ok('preflight succeeds', r.code === 204);
  ok('preflight carries CORS headers', !!r.headers['access-control-allow-origin']);

  r = mockRes();
  await ask({ method: 'GET', headers: {} }, r);
  ok('GET is rejected', r.code === 405);

  r = mockRes();
  await ask(post({ question: '' }), r);
  ok('an empty question is rejected', r.code === 400);

  r = mockRes();
  await ask(post('not json at all'), r);
  ok('an unparseable body is rejected', r.code === 400);

  r = mockRes();
  await ask({ method: 'POST', headers: { origin: 'https://example.com' }, body: { question: 'x' } }, r);
  ok('a disallowed origin is rejected', r.code === 403);

  r = mockRes();
  await ask(post({ question: 'x', pad: 'y'.repeat(70000) }), r);
  ok('an oversized body is rejected', r.code === 413);
}

// ── what happens when the free tiers are gone ─────────────────────────────
// The whole directive comes down to this path. Every provider key is unset, so the real router
// runs its real "not configured" branch for all five and then throws — exactly what an
// exhausted rotation does.
group('free rotation exhausted');
{
  for (const k of ['GEMINI_API_KEY','GROQ_API_KEY','MISTRAL_API_KEY','OPENROUTER_API_KEY',
                   'CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','ANTHROPIC_API_KEY'])
    delete process.env[k];

  const ask = require(join(ROOT, 'api/ask.js'));
  const r = mockRes();
  await ask(post({ question: 'Who is Gauss?' }, { 'x-forwarded-for': '10.0.0.99' }), r);

  ok('it degrades with 503, not 500', r.code === 503, 'got ' + r.code + ': ' + String(r.body).slice(0, 200));
  const b = r.json();
  ok('the reason is machine-readable', b.error === 'no_free_provider');
  ok('and the message is written for the reader', /free models are all out/i.test(b.message || ''));
  ok('it reports why each provider declined', Array.isArray(b.declined) && b.declined.length >= 5,
     JSON.stringify(b.declined));
  ok('no paid call was attempted', !/PAID_PATH_DISABLED/.test(JSON.stringify(b)),
     'the stub threw, which means something reached the Anthropic fallback');
}

// ── a provider actually answering ─────────────────────────────────────────
// Intercepting fetch rather than the router means the request that goes out is the one the real
// router builds, and the reply comes back through its real translation layer. What is faked is
// the free tier, which is the only part that cannot be exercised from here.
group('a free provider answers');
{
  process.env.GROQ_API_KEY = 'test-key-not-real';
  const realFetch = globalThis.fetch;
  let sentTo = null, sentBody = null;
  globalThis.fetch = async (url, init) => {
    sentTo = String(url); sentBody = JSON.parse(init.body);
    return {
      ok: true, status: 200,
      json: async () => ({
        model: 'llama-test',
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content:
          'ANSWER: Gauss was a mathematician who worked out how to describe a curved surface ' +
          'from inside it.\nANALOGY: Like mapping a hilly field with a tape measure.\n' +
          'BREAKS: A field has an outside to stand in; spacetime does not.\n' +
          'MEANS: Curvature is something you can detect without leaving.\n' +
          'NEXT: What would you measure to tell a flat field from a curved one?' } }],
        usage: { prompt_tokens: 100, completion_tokens: 80 },
      }),
    };
  };

  const path = join(ROOT, 'api/ask.js');
  delete require.cache[require.resolve(path)];   // reset the rate-limit table
  const ask = require(path);
  const r = mockRes();
  await ask(post({
    question: 'Who is Gauss?',
    line: 'We shall now consider Gaussian co-ordinates.',
    section: { numeral: 'XXV', title: 'GAUSSIAN CO-ORDINATES', text: 'In accordance with Gauss…' },
    level: 'plain',
  }, { 'x-forwarded-for': '10.0.0.7' }), r);

  ok('it answers 200', r.code === 200, 'got ' + r.code + ': ' + String(r.body).slice(0, 300));
  const b = r.code === 200 ? r.json() : {};
  ok('the answer comes through parsed', /mathematician/.test(b.answer || ''));
  ok('so does the analogy', /tape measure/.test(b.analogy || ''));
  ok('and where it breaks', /does not/.test(b.breaks || ''));
  ok('and what it means', /without leaving/.test(b.means || ''));
  ok('and it ends with a question', /\?$/.test((b.next || '').trim()));
  ok('the answer is marked as live', b.source === 'live');
  // The free providers' translator does not carry a model name back. Reporting null is the
  // honest outcome; inventing one would be worse than saying nothing.
  ok('an unknown model is null, not fabricated', b.model === null, JSON.stringify(b.model));

  ok('it went to groq, not anywhere paid', /groq\.com/.test(sentTo || ''), String(sentTo));
  ok('the book passage was actually sent',
     JSON.stringify(sentBody).includes('GAUSSIAN CO-ORDINATES'));
  ok('the token budget is bounded', sentBody.max_tokens <= ask._internals.MAX_TOKENS);
  ok('CORS lets the app read it', !!r.headers['access-control-allow-origin']);
  ok('answers are not cached by any intermediary', /no-store/.test(r.headers['cache-control'] || ''));

  globalThis.fetch = realFetch;
  delete process.env.GROQ_API_KEY;
  delete require.cache[require.resolve(path)];
}

// ── the rate limit ────────────────────────────────────────────────────────
group('rate limit');
{
  const ask = require(join(ROOT, 'api/ask.js'));
  let sawLimit = false, code = 0;
  for (let i = 0; i < 15; i++) {
    const r = mockRes();
    await ask(post({ question: 'q' + i }, { 'x-forwarded-for': '10.0.0.1' }), r);
    if (r.code === 429) { sawLimit = true; code = r.code; break; }
  }
  ok('a burst from one address is throttled', sawLimit, 'last code ' + code);

  const r = mockRes();
  await ask(post({ question: 'q' }, { 'x-forwarded-for': '10.0.0.2' }), r);
  ok('a different address is unaffected', r.code !== 429);
}

console.log('\n' + (failed ? 'FAILED  ' : 'passed  ') + passed + ' checks' +
            (failed ? ', ' + failed + ' failures' : '') + '\n');
process.exit(failed ? 1 : 0);
