const Anthropic = require('@anthropic-ai/sdk');
const { randomUUID } = require('crypto');

// Drop-in replacement for anthropic.messages.create() that tries free models before paying for
// Haiku. Every call site passes the same Anthropic params shape and gets back the same Anthropic
// response shape regardless of which provider actually answered, so the agents and endpoints that
// use this never know (or care) where the text came from.
//
// The rotation itself is the FREE_PROVIDERS table further down -- read that, not this comment, for
// the current order and the reasoning behind it. Providers are configured entirely by environment
// variable: an unset key means that row is skipped, and with none set this degrades to exactly the
// old behaviour, a plain Anthropic messages.create call.
//
// As of 2026-08-13 the app runs FREE-ONLY in production: ANTHROPIC_API_KEY is deliberately unset
// while Pranav measures how the free tiers hold up over ~15 days. In that state there is no paid
// backstop -- a request that exhausts every free provider throws rather than degrading -- which is
// why the boot log says so out loud and why scripts/check-providers.js exists.

// ─── In-memory rate-limit state ─────────────────────────────────────────────
// Per-provider epoch-ms until which the provider is skipped. A 429 or 5xx marks it down for 60s so
// a burst of questions doesn't hammer a limping free tier; anything else (network blip, bad key,
// safety block) falls through without a cooldown so the next question can try it again.
const RATE_LIMIT_MS = 60 * 1000;
const rateLimitedUntil = { gemini: 0, groq: 0, mistral: 0, openrouter: 0, cloudflare: 0 };
function isRateLimited(name) { return Date.now() < rateLimitedUntil[name]; }
function markRateLimited(name) { rateLimitedUntil[name] = Date.now() + RATE_LIMIT_MS; }
function resetRateLimits() { for (const k of Object.keys(rateLimitedUntil)) rateLimitedUntil[k] = 0; }

// Lazily constructed -- same reason the agents' getAnthropicClient() was lazy: instantiating the
// SDK client at require-time triggers async credential resolution that outlives a Jest run.
let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

// ─── Message-shape helpers ──────────────────────────────────────────────────
// The codebase passes system as a string everywhere; the API also accepts an array of text blocks.
// Normalise both so each provider translator only handles one shape.
function systemText(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return system.map(b => (b && b.type === 'text' ? b.text : '')).join('\n');
  return '';
}

// A message's content is either a plain string or an array of content blocks (text / image /
// tool_use / tool_result). Normalise to the block array form once.
function messageBlocks(m) {
  if (!m || !m.content) return [];
  return Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
}

// Groq has no vision, so an image anywhere in the conversation must keep it out of the rotation.
function messagesContainImage(messages) {
  return (messages || []).some(m => messageBlocks(m).some(b => b.type === 'image'));
}

function tryParseJson(x) {
  if (typeof x === 'string') {
    try { return { parsed: JSON.parse(x), raw: x }; } catch { return { parsed: null, raw: x }; }
  }
  return { parsed: x, raw: x };
}

// ─── Complexity tier ────────────────────────────────────────────────────────
// The rotation picks a PROVIDER (free first); the paid fallback model should still match the
// difficulty of the request -- a lookup and a tax-strategy question are not worth the same Haiku
// call. `classifyComplexity` reads the user's actual question and decides which paid model the
// fallback uses. Deliberately text-only signals: statement-import batches and CSV parsing carry big
// max_tokens budgets but are simple free-tier work, and analytics questions loop with a tool yet are
// plain aggregations -- either signal would misroute them to the expensive tier. The question text is
// the stable signal: a genuinely multi-step task starts with a strategy question, and this re-runs
// every loop turn over that same question (tool results are skipped), so the tier stays fixed for
// the whole conversation.

// The most recent user message that carries real text, ignoring tool_result blocks (the agent loops
// append tool results as user messages, but the original question is what we classify on).
function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const text = messageBlocks(m).filter(b => b.type === 'text').map(b => b.text).join(' ');
    if (text.trim()) return text.trim();
  }
  return '';
}

// Advice/strategy intent -- phrases that ask the model to weigh options, not to look something up.
// NOTE these must never appear inside the system's OWN prompt text: the categorization and
// compliance endpoints stuff their IRS guidance into the user message, so a term like the bare word
// "strategy" (present in a compliance example, "listing strategy") would misroute that batch work to
// the expensive tier. Every term here is a phrase a person asking for advice would actually type.
const STRATEGY_TERMS = [
  'should i', 'should we', 'what should', 'recommend', 'best way', 'better to', 'is it better',
  'worth it', 'help me decide', 'planning', 'optimize', 'maximize', 'minimize', 'save on',
  'tax strategy',
];

// IRS-treatment judgment -- vocabulary rare in plain lookup queries ("how much did I spend") that
// flags a question as needing real tax judgment rather than an aggregation. Only terms that never
// appear in the embedded categorization/compliance guidance survive here: common ones like "deduct",
// "home office" and "depreciate" are part of the system's own instructions ("...not deductible...",
// "...depreciated over 27.5 years...") and would misroute batch work if kept.
const TAX_TREATMENT_TERMS = [
  'amortiz', 'filing status', 'pass-through', 'like-kind', 'wash sale', 'capital gain',
];

function classifyComplexity(params) {
  const q = (lastUserText(params.messages) || '').toLowerCase();
  if (!q) return 'standard';
  for (const t of STRATEGY_TERMS) if (q.includes(t)) return 'complex';
  for (const t of TAX_TREATMENT_TERMS) if (q.includes(t)) return 'complex';
  return 'standard';
}

// ─── Anthropic → Gemini ─────────────────────────────────────────────────────
// Tracks tool_use_id → name while walking the conversation so a tool_result's functionResponse can
// name the function it answers (Gemini requires the name; Anthropic only carries the id, and the
// loop that builds these messages always sends the tool_result after the tool_use that named it).
function anthropicToGemini(params) {
  const nameById = {};
  const contents = [];
  for (const m of params.messages || []) {
    const parts = [];
    for (const b of messageBlocks(m)) {
      if (b.type === 'text') {
        parts.push({ text: b.text });
      } else if (b.type === 'image') {
        parts.push({ inlineData: { mimeType: b.source?.media_type, data: b.source?.data } });
      } else if (b.type === 'tool_use') {
        if (b.id) nameById[b.id] = b.name;
        parts.push({ functionCall: { name: b.name, args: b.input || {} } });
      } else if (b.type === 'tool_result') {
        const content = tryParseJson(b.content);
        // Gemini's functionResponse.response is a free-form struct -- hand it the structured JSON
        // the tool returned (tool results here are JSON.stringify'd rows), or a small object if the
        // content wasn't parseable.
        parts.push({
          functionResponse: {
            name: nameById[b.tool_use_id] || 'unknown',
            response: content.parsed !== null ? content.parsed : { content: content.raw },
          },
        });
      }
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
  }

  const body = { contents };
  const sys = systemText(params.system);
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  // Gemini's generationConfig.maxOutputTokens plays the role of Anthropic's max_tokens -- without
  // it Gemini defaults to a lower cap than the agents expect.
  //
  // thinkingBudget: 0 is NOT an optimisation, it is a correctness fix (2026-08-18). The floating
  // `gemini-flash-latest` alias now resolves to a THINKING model, and Gemini charges its reasoning
  // against maxOutputTokens. On this app's budgets that means the model spends the whole allowance
  // deliberating and returns `finishReason: MAX_TOKENS` with `parts: [{text: ""}]` -- which the
  // parser below correctly reports as "Gemini returned an empty response", and which the router
  // then treats as a provider failure and pays another provider to redo.
  //
  // Worse than empty: one reproduction returned the fragment " adds it" -- a piece of the model's
  // own reasoning leaking out as the answer. A user would have read that as Snaptly's reply.
  //
  // Measured on a 64-token budget: 1/3 usable without this, 3/3 with it (finishReason STOP, not
  // MAX_TOKENS). This is the same trap Nemotron Super set in August, and it arrived here WITHOUT a
  // deploy -- which is the cost of the floating alias, knowingly accepted on line 284 above.
  if (params.max_tokens) body.generationConfig = { maxOutputTokens: params.max_tokens, thinkingConfig: { thinkingBudget: 0 } };
  if (params.tools && params.tools.length) {
    body.tools = [{
      functionDeclarations: params.tools.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema })),
    }];
    if (params.tool_choice && params.tool_choice.type === 'tool') {
      body.toolConfig = { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [params.tool_choice.name] } };
    }
  }
  return body;
}

function geminiToAnthropic(data) {
  const candidate = data.candidates && data.candidates[0];
  if (!candidate || !candidate.content || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
    const err = new Error('Gemini returned an empty response');
    err.status = 502;
    throw err;
  }
  // A safety/recitation block is not a rate limit -- fall through to the next provider rather than
  // leaving the user with a "try again later" cooldown for content that isn't coming back.
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
    const err = new Error(`Gemini blocked the response (${candidate.finishReason})`);
    err.status = 502;
    throw err;
  }

  const content = [];
  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      content.push({ type: 'tool_use', id: randomUUID(), name: part.functionCall.name, input: part.functionCall.args || {} });
    } else if (part.text != null) {
      content.push({ type: 'text', text: part.text });
    } else if (part.inlineData) {
      content.push({ type: 'image', source: { type: 'base64', media_type: part.inlineData.mimeType, data: part.inlineData.data } });
    }
  }

  const hasTool = content.some(b => b.type === 'tool_use');
  let stop_reason;
  if (hasTool) stop_reason = 'tool_use';
  else if (candidate.finishReason === 'MAX_TOKENS') stop_reason = 'max_tokens';
  else stop_reason = 'end_turn';

  const usage = data.usageMetadata || {};
  return { content, stop_reason, usage: { input_tokens: usage.promptTokenCount ?? 0, output_tokens: usage.candidatesTokenCount ?? 0 } };
}

// ─── Anthropic → Groq (OpenAI-compatible) ───────────────────────────────────
function anthropicToOpenAI(params) {
  const out = [];
  const sys = systemText(params.system);
  if (sys) out.push({ role: 'system', content: sys });

  for (const m of params.messages || []) {
    const blocks = messageBlocks(m);
    if (m.role === 'user') {
      const textParts = blocks.filter(b => b.type === 'text').map(b => b.text);
      // OpenAI has no tool_result block -- a tool answer is its own `role: 'tool'` message keyed by
      // the tool_call_id it answers, and must directly follow the assistant message that called it.
      for (const tr of blocks.filter(b => b.type === 'tool_result')) {
        const c = typeof tr.content === 'string' ? tr.content : (tr.content ? JSON.stringify(tr.content) : '');
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: c });
      }
      // Images become data: URLs in a multi-part content array -- OpenAI's shape for vision. Until
      // 2026-08-13 this function simply ignored image blocks, so an image sent here would have been
      // silently dropped and the model asked to read a receipt it could not see. The rotation hid
      // that by refusing to route images to OpenRouter at all, which also meant Gemini was the only
      // free provider that could ever see a receipt -- one provider deep, with paid Anthropic as the
      // only thing behind it. Verified live: with Gemini failing, receipt extraction had no free
      // path whatsoever.
      const images = blocks.filter(b => b.type === 'image' && b.source?.data);
      if (images.length) {
        const content = images.map(b => ({
          type: 'image_url',
          image_url: { url: `data:${b.source.media_type || 'image/jpeg'};base64,${b.source.data}` },
        }));
        if (textParts.length) content.push({ type: 'text', text: textParts.join('\n') });
        out.push({ role: 'user', content });
      } else if (textParts.length) {
        out.push({ role: 'user', content: textParts.join('\n') });
      }
    } else if (m.role === 'assistant') {
      const textParts = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const toolCalls = blocks.filter(b => b.type === 'tool_use').map(b => ({
        id: b.id || randomUUID(),
        type: 'function',
        function: { name: b.name, arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input || {}) },
      }));
      const msg = { role: 'assistant' };
      if (textParts) msg.content = textParts;
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    }
  }
  return out;
}

// Named for Groq because Groq was the first provider to use it, but it now parses every
// OpenAI-compatible provider in the table: Groq, Mistral, OpenRouter and Cloudflare. Error text is
// therefore provider-neutral -- callModel already prefixes the provider name, and an inner message
// naming the wrong vendor sends the next reader of the log looking in the wrong place.
function groqToAnthropic(data) {
  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    const err = new Error('OpenAI-compatible response contained no choices');
    err.status = 502;
    throw err;
  }
  const content = [];
  const msg = choice.message;
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input = {};
    try { input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { /* leave input empty */ }
    content.push({ type: 'tool_use', id: tc.id || randomUUID(), name: tc.function.name, input });
  }

  const hasTool = content.some(b => b.type === 'tool_use');
  let stop_reason;
  if (hasTool) stop_reason = 'tool_use';
  else if (choice.finish_reason === 'length') stop_reason = 'max_tokens';
  else stop_reason = 'end_turn';

  const usage = data.usage || {};
  return { content, stop_reason, usage: { input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0 } };
}

// ─── HTTP ───────────────────────────────────────────────────────────────────
// `gemini-flash-latest`, NOT a pinned version. This used to say `gemini-2.0-flash`, which Google
// retired -- the API returns 404 "This model is no longer available". That failure was invisible in
// exactly the way this router is supposed to prevent: the 404 isn't a 429 or a 5xx, so it skipped
// the rate-limit cooldown, logged one line, and fell straight through to paid Anthropic. A retired
// model and a working fallback produce identical behaviour from the outside.
//
// The floating alias means Google moves us to the current flash model instead of returning 404 when
// a version is sunset. The tradeoff -- model behaviour can shift under us without a deploy -- is
// worth it here: this path does transaction categorization, where a silent fallback to paid is a
// worse outcome than a slight change in model behaviour. Verified against the live API 2026-08-13.
const GEMINI_MODEL_NAME = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_NAME}:generateContent`;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// `llama-3.3-70b-versatile` until 2026-08-18, when it was found RETIRED -- Groq's /v1/models no
// longer lists it at all and every call had been returning HTTP 404. This is the third time a
// pinned free model has been sunset under this file, and it failed exactly the way the others did:
// invisibly. The 500-scenario user-testing run is what surfaced it, and only indirectly -- Groq
// served 0 of 500 calls while the router quietly spent the other providers' much smaller quotas.
//
// Groq is the HIGHEST-headroom free provider (~14,400 requests/day against Gemini's few hundred and
// OpenRouter's 50), so losing it silently is the most expensive single failure available here: it
// is what decides whether a bulk sync finishes free.
//
// gpt-oss-120b chosen 2026-08-18 after testing every tool-capable model Groq lists: it is the
// largest, answered a forced tool call correctly in 559ms, and is the only one besides its own 20b
// sibling that can call tools at all -- `qwen/qwen3.6-27b` returns 400 on a forced call and
// `groq/compound` rejects tool calling outright. That is the same trap Nemotron Super set in
// August: a free model that cannot call tools is useless on this path however good its prose is.
// Verify with `node scripts/check-providers.js`, never with the unit tests -- they mock fetch and
// cannot see a retired model.
const GROQ_MODEL = 'openai/gpt-oss-120b';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// The `:free` suffix requests the free tier. Two predecessors have already been retired out from
// under this file (`meta-llama/llama-3.3-70b-instruct:free`, then a spell on
// `nvidia/nemotron-3-super-120b-a12b:free`), so re-test before changing it -- free pools churn, and
// a 404 here is invisible: it isn't a 429 or a 5xx, so it skips the cooldown and falls straight
// through to paid Anthropic.
//
// Ultra 550B, chosen over Super 120B on measured behaviour 2026-08-13, not on parameter count.
// Tested against a forced tool call, Super ignores the tool entirely and narrates its reasoning as
// prose ("The user wants me to categorize..."); Ultra emits a well-formed tool_calls array. That is
// the difference between this provider serving only plain-text prompts and serving the whole
// rotation, so it is worth the slower model.
const OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

// Ultra is text-only, so an image needs a different model on this provider. This exists so that
// vision is not one provider deep: Gemini is the only *other* free model in the rotation that can
// see an image (Groq's catalog has no multimodal model at all, verified 2026-08-13), which meant a
// receipt scan had exactly one free path and paid Anthropic behind it.
//
// Picked by running a real receipt through every free vision model OpenRouter lists. This one
// returned {"merchant":"THE HOME DEPOT","total":68.01,"date":"2026-03-04"} -- all three correct --
// as clean JSON in 3.9s. nemotron-nano-12b-v2-vl was also correct but took 15.3s and wrapped its
// answer in markdown fences; the two gemma-4 models could not be tested because the free daily
// request cap was already spent. Re-test before switching.
const OPENROUTER_VISION_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
const OPENROUTER_REFERER = 'https://snaptly.ai';
const OPENROUTER_TITLE = 'Snaptly';

// Mistral La Plateforme. One multimodal model covers both text and images, so there is no
// text/vision split here. Its free "Experiment" tier is the largest of the free vision options by a
// wide margin, and Mistral states in writing that API data is not used for training -- which is the
// bar that matters for receipt images. Do NOT enable "Labs models" on the account: that permits
// training regardless of plan.
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
// `-latest`, not a pinned version, for the same reason Gemini uses `gemini-flash-latest`: a pinned
// id is a future 404 with no warning, and a silent fall-through costs more than a model changing
// slightly under us.
//
// This was `mistral-small-4-0-26-03` for a few hours, taken from Mistral's own published model
// table. The live API rejects it outright: `{"message":"Invalid model: mistral-small-4-0-26-03",
// "type":"invalid_model"}`. Documentation is not verification -- that is now five model ids in this
// file that were wrong when checked against a real key. Run scripts/check-providers.js.
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

// Cloudflare Workers AI. Sits last among the free tiers because its quota is the smallest in
// practice -- 10,000 Neurons/day, which on a vision model is roughly a tenth of a dollar of
// inference. That is a handful of receipts, not a bulk re-sync. It earns its place anyway: the
// allowance resets daily and never expires, Cloudflare commits in writing to not training on
// customer content, and it needs no card. llama-4-scout is multimodal, so one model serves both
// shapes.
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-4-scout-17b-16e-instruct';
function cloudflareUrl() {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
}

// Both model ids above were checked against each provider's official model catalog on 2026-08-13
// and both exist, are multimodal, and support function calling. They have NOT been confirmed by a
// live call, because neither key exists yet -- and in this file that distinction has teeth: every
// model id taken on trust has so far turned out to be wrong in a way documentation would not have
// caught (two retired outright, and Nemotron Super was listed as supporting tools while in practice
// ignoring them). Run `node scripts/check-providers.js` the moment a key is added. Both ids are
// env-overridable (MISTRAL_MODEL, CLOUDFLARE_MODEL) so a wrong one is a variable change rather than
// a deploy.
//
// Cloudflare tokens need Workers AI Read AND Edit. The dashboard's Workers AI → "Use REST API"
// button mints a correctly-scoped token and shows the account id on the same screen, which is the
// short path -- building one by hand through My Profile → API Tokens is easy to under-scope.

// How long to wait for any one provider before giving up and trying the next.
//
// There was no timeout here at all until 2026-08-13, which meant a provider that accepted the
// connection and then stalled would hang the request forever -- and since categorization runs a
// batch at a time inside a sync, one stalled call would hang the whole sync with nothing in the
// logs. Falling through to the next provider after a wait is strictly better than waiting for a
// provider that is never going to answer.
//
// 90s is deliberately generous: a 20-transaction batch on the slowest free model (Nemotron, ~22s
// measured) must not be cut off mid-answer, because a timeout costs a retry of the whole batch.
// Read per call, like every other environment lookup in this file, rather than captured at module
// load: a value frozen at require-time cannot be changed without a redeploy, and is invisible to a
// test that sets it after importing.
function providerTimeoutMs() {
  return Number(process.env.PROVIDER_TIMEOUT_MS) || 90000;
}

// Shared fetch wrapper: attaches a latency and an HTTP status to every error so the rotation knows
// whether to apply a rate-limit cooldown (429 / 5xx) or just move on.
async function providerFetch(url, body, headers = {}) {
  const t0 = Date.now();
  let res;
  const controller = new AbortController();
  const timeoutMs = providerTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e.name === 'AbortError';
    const err = new Error(timedOut ? `Timed out after ${timeoutMs}ms` : `Network error: ${e.message}`);
    // Treat a timeout like a 5xx: the provider is struggling, so stand it down for a minute rather
    // than making every remaining batch in the sync wait the full timeout too.
    if (timedOut) err.status = 504;
    err.latencyMs = Date.now() - t0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* keep the bare status */ }
    const err = new Error(`HTTP ${res.status}: ${detail}`);
    err.status = res.status;
    err.latencyMs = latencyMs;
    throw err;
  }
  return { data: await res.json(), latencyMs };
}

async function geminiCall(params) {
  const url = `${GEMINI_URL}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  return providerFetch(url, anthropicToGemini(params));
}

// Groq and OpenRouter both speak the OpenAI-compatible chat format, so the Anthropic messages/tools
// translate once and each provider just supplies its own model name and headers.
function openAICompatibleBody(params, model) {
  const body = {
    model,
    max_tokens: params.max_tokens,
    messages: anthropicToOpenAI(params),
  };
  if (params.tools && params.tools.length) {
    body.tools = params.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    if (params.tool_choice && params.tool_choice.type === 'tool') {
      body.tool_choice = { type: 'function', function: { name: params.tool_choice.name } };
    }
  }
  return body;
}

async function groqCall(params) {
  return providerFetch(GROQ_URL, openAICompatibleBody(params, GROQ_MODEL), { Authorization: `Bearer ${process.env.GROQ_API_KEY}` });
}

async function mistralCall(params) {
  return providerFetch(MISTRAL_URL, openAICompatibleBody(params, MISTRAL_MODEL), {
    Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
  });
}

async function cloudflareCall(params) {
  return providerFetch(cloudflareUrl(), openAICompatibleBody(params, CLOUDFLARE_MODEL), {
    Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
  });
}

async function openrouterCall(params, hasImage) {
  const body = openAICompatibleBody(params, hasImage ? OPENROUTER_VISION_MODEL : OPENROUTER_MODEL);
  // Nemotron is a reasoning model, and its thinking is charged against max_tokens. Left on, a
  // categorization call (max_tokens 512) spends ~370-450 of that budget reasoning about a $4.85
  // coffee before it starts writing, and a slightly longer transaction name tips it into
  // finish_reason=length -- truncated JSON, which the caller silently degrades to "Other / needs
  // review" rather than falling through to another provider. Off, the same prompt answers
  // identically in 3.0s instead of 10.7s, and tool calls still come back well-formed.
  body.reasoning = { enabled: false };
  return providerFetch(OPENROUTER_URL, body, {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    // OpenRouter requires a site URL + app name on every request so it can attribute traffic.
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': OPENROUTER_TITLE,
  });
}

// ─── The rotation ───────────────────────────────────────────────────────────
//
// One row per free provider, tried top to bottom. This used to be five near-identical if-blocks;
// they are a table now because the differences between providers -- which env var enables it, can it
// see an image, how the response translates -- are exactly what a reader needs to compare, and
// copied blocks hide that. Adding a provider is a row.
//
//   env       every listed variable must be set, or the provider is skipped
//   vision    false means an image request skips this provider entirely. Never send an image to a
//             text-only model: anthropicToOpenAI would drop the image block and the model would
//             confidently describe a receipt it never saw, which is worse than an outage.
//   call      builds and sends the request
//   parse     translates the provider's response back into Anthropic's shape
//
// ORDER IS BY DAILY HEADROOM, not by quality, because headroom is what decides whether a bulk sync
// finishes on free models or falls off the end. Published limits as of 2026-08-13:
//
//   Groq        ~14,400 req/day   no vision at all (its catalog has no multimodal model)
//   Gemini      a few hundred/day tools + vision, best quality -- so it leads despite less headroom
//   Mistral     largest of the vision tiers; exact numbers no longer published by Mistral
//   OpenRouter  50/day, or 1,000 once $10 of credits is purchased; also the slowest at ~3s
//   Cloudflare  10,000 Neurons/day, roughly $0.11 of vision inference -- a handful of receipts
//
// Cloudflare is last because that quota is the smallest in practice, not because it is worst; it is
// the only provider here with both a daily reset that never expires and a written no-training
// commitment, which is why it is present at all.
//
// A sixth provider used to lead this list: OmniRoute, a local proxy on Pranav's Mac at
// localhost:20128. Removed 2026-08-13 for two independent reasons. It could never have served
// production -- Railway cannot reach a laptop -- and it did not work in dev either: it streams by
// default, providerFetch's res.json() threw on the first SSE frame, and the branch had never once
// succeeded since the day it was written. Do not re-add it without a tunnel and a deliberate
// decision to make a personal machine a production dependency.
//   models    what this provider actually runs, as { text, vision }. Reported in logs and in the
//             monitoring report, because "openrouter" names a GATEWAY, not a model -- the thing
//             actually answering there is Nemotron, and a performance record that hides which model
//             produced a number is worthless the moment a model id changes mid-experiment.
const FREE_PROVIDERS = [
  { name: 'gemini', env: ['GEMINI_API_KEY'], vision: true, call: geminiCall, parse: geminiToAnthropic,
    models: { text: GEMINI_MODEL_NAME, vision: GEMINI_MODEL_NAME } },
  { name: 'groq', env: ['GROQ_API_KEY'], vision: false, call: groqCall, parse: groqToAnthropic,
    models: { text: GROQ_MODEL, vision: null } },
  { name: 'mistral', env: ['MISTRAL_API_KEY'], vision: true, call: mistralCall, parse: groqToAnthropic,
    models: { text: MISTRAL_MODEL, vision: MISTRAL_MODEL } },
  { name: 'openrouter', env: ['OPENROUTER_API_KEY'], vision: true, call: openrouterCall, parse: groqToAnthropic,
    models: { text: OPENROUTER_MODEL, vision: OPENROUTER_VISION_MODEL } },
  { name: 'cloudflare', env: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'], vision: true, call: cloudflareCall, parse: groqToAnthropic,
    models: { text: CLOUDFLARE_MODEL, vision: CLOUDFLARE_MODEL } },
];

// opts:
//   paidOnly  - skip free models entirely, go straight to Haiku (CPA package / premium features)
//   hasImage  - force the image path even if the messages don't carry one
//   freeOnly  - never touch the paid fallback; throw instead, carrying why each free provider
//               declined. The monitoring probe needs this: run against one provider in isolation,
//               a silent fall-through to Anthropic reports the *fallback's* error ("could not
//               resolve authentication method") rather than the real one ("429, quota exceeded"),
//               which is precisely the diagnosis the log exists to capture.
async function callModel(params, opts = {}) {
  const hasImage = opts.hasImage === true || messagesContainImage(params.messages);
  const declined = [];

  if (!opts.paidOnly) {
    for (const provider of FREE_PROVIDERS) {
      if (!provider.env.every(k => process.env[k])) { declined.push(`${provider.name}: not configured`); continue; }
      if (hasImage && !provider.vision) { declined.push(`${provider.name}: no vision`); continue; }
      if (isRateLimited(provider.name)) { declined.push(`${provider.name}: cooling down after a recent 429/5xx`); continue; }
      try {
        const { data, latencyMs } = await provider.call(params, hasImage);
        const usedModel = hasImage ? provider.models.vision : provider.models.text;
        console.log(`[modelRouter] provider=${provider.name} model=${usedModel} vision=${hasImage} latency=${latencyMs}ms`);
        return provider.parse(data);
      } catch (e) {
        // A 429 or 5xx means the provider is struggling, so stand it down for a minute rather than
        // hammering it on every transaction in a batch. Anything else (bad key, retired model,
        // safety block) falls straight through so the next request can try it again.
        if (e.status === 429 || (e.status && e.status >= 500)) markRateLimited(provider.name);
        // Collapsed to one line on purpose: provider errors are pretty-printed JSON, and a
        // multi-line failure in the middle of a 20-batch sync buries the lines around it.
        const why = String(e.message).replace(/\s+/g, ' ').slice(0, 200);
        declined.push(`${provider.name}: ${why}`);
        console.log(`[modelRouter] ${provider.name} failed (${why})`);
      }
    }
  }

  if (opts.freeOnly) {
    const err = new Error(`No free provider could answer — ${declined.join(' | ')}`);
    err.declined = declined;
    throw err;
  }

  // Anthropic fallback -- the exact call every site made before, returned as-is (the SDK response is
  // already in Anthropic format). This is also the whole path when no free key is set. The model is
  // tiered: complex requests (tax strategy, multi-step judgment) fall back to Sonnet, everything else
  // to Haiku. `opts.tier` overrides the classifier for a caller that knows its own difficulty.
  const t0 = Date.now();
  const tier = opts.tier || classifyComplexity(params);
  const fallbackModel = tier === 'complex'
    ? (process.env.SONNET_MODEL || 'claude-sonnet-5')
    : (params.model || 'claude-haiku-4-5-20251001');
  const response = await getAnthropicClient().messages.create({ ...params, model: fallbackModel });
  console.log(`[modelRouter] provider=haiku tier=${tier} model=${fallbackModel} latency=${Date.now() - t0}ms`);
  return response;
}

module.exports = {
  callModel,
  // Exported so tests can assert the request body carries the configured model without
  // hardcoding a model name. Free-tier model IDs churn -- two of them were retired out from
  // under this file already -- and a test that pins the exact string just breaks again on the
  // next rotation while proving nothing about the wiring.
  OPENROUTER_MODEL,
  OPENROUTER_VISION_MODEL,
  GROQ_MODEL,
  MISTRAL_MODEL,
  CLOUDFLARE_MODEL,
  FREE_PROVIDERS,
  anthropicToGemini,
  geminiToAnthropic,
  anthropicToOpenAI,
  groqToAnthropic,
  messagesContainImage,
  classifyComplexity,
  lastUserText,
  _resetRateLimits: resetRateLimits,
  _isRateLimited: isRateLimited,
};
