// Turns a question into a request the free models can actually answer well.
//
// Two things make this work at all on Llama/Nemotron/Mistral rather than a frontier model:
//
// 1. The book travels with the question. The reader is looking at a specific section, and that
//    section's text goes in the prompt. A small model asked "who is Gauss" from memory will
//    produce a biography; the same model handed §XXV and asked what Gauss is doing *in this
//    argument* stays on the rails. This also keeps answers consistent with what the reader is
//    actually holding, which a from-memory answer cannot promise.
//
// 2. The output format is labelled lines, not JSON. Free models emit malformed JSON often
//    enough that a parser becomes the failure mode; ANSWER:/ANALOGY:/… survives a model that
//    ignores half the instruction, and anything unparseable still renders as prose.
//
// The pedagogy is from .claude/skills/relativity-tutor/SKILL.md, compressed to what a small
// model will actually follow: plain English, an analogy with its limits stated, never end flat.
//
// This prompt is mirrored verbatim in taxwise-backend/lib/relativityTutor.js, which is the
// endpoint the app calls by default. Edit both together until one of them is retired.

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

// The book text is the expensive part of the prompt and the part that keeps the answer honest,
// so it gets a generous budget — but not an unbounded one, because free-tier context windows
// are the smallest thing in this system.
const MAX_SECTION_CHARS = 7000;

function clip(s, n) {
  s = String(s || '').trim();
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

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

// Lenient by design: a model that ignores the format entirely should still produce a usable
// answer rather than an error. Anything before the first recognised label, or a reply with no
// labels at all, becomes the answer body.
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

// Prior turns, as the model's own message shape. The first turn of a thread carries the passage
// and the framing; a follow-up is just what the reader typed, because the context is already in
// the conversation and repeating a 7000-character section on every turn would spend the free
// tier's context window on nothing.
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

module.exports = { buildPrompt, parseAnswer, sanitizeHistory, SYSTEM, LEVELS,
                   MAX_SECTION_CHARS, MAX_TURNS, MAX_HISTORY_CHARS };
