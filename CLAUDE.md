# Project Jarvi

## ULTIMATE DIRECTIVE — asking the AI a question must never cost money

Nothing built in this repository may reach a paid AI API. Not the tutor, not the food logger,
not any tool added later. If a feature cannot be delivered on free inference, it ships degraded
or it does not ship.

This is not a cost target to optimise toward. It is a hard constraint on the architecture, and
it outranks answer quality, latency, and convenience.

### How every AI call must be made

Route through the smart model router — `taxwise-backend/lib/modelRouter.js`, the same rotation
running in production for TaxWise and Snaptly (Groq → Mistral → OpenRouter → Cloudflare).

```js
const { callModel } = require('./lib/modelRouter');
const response = await callModel(params, { freeOnly: true });   // freeOnly is mandatory
```

**`freeOnly: true` is the cost ceiling, not a preference.** Without it the router falls through
to paid Anthropic (Haiku, or Sonnet for anything it classifies as complex). With it, a request
that exhausts every free provider *throws*, carrying why each provider declined.

`callModel` is a drop-in for `anthropic.messages.create()` — same params, same response shape —
so call sites do not change when providers do.

### Rules a reviewer should be able to check by grep

- Every `callModel` call site passes `freeOnly: true`. No exceptions, no "just this one".
- `@anthropic-ai/sdk` appears nowhere in a runtime path. The router imports it only for the
  paid fallback that `freeOnly` disables; nothing else in this repo may import it.
- No API key of any kind is ever shipped to the client. Keys live in the server environment.
  A key in a PWA bundle is readable by anyone who opens the page.
- One narrow exception, added deliberately: a key the **user types into their own device** may be
  stored in that device's `localStorage` and sent to their own endpoint, which hands it to the
  router exactly as it would an environment key. Nothing is shipped to anyone — the key
  originates from the user, never enters the bundle, and never enters git. The server takes it
  only when it has no key of its own, only for free providers, and never logs the value.
  An environment variable remains the correct configuration; this exists for a deployment whose
  environment cannot be reached.
- Build-time generation obeys this too. The knowledge pack is written on the free rotation, not
  by a paid model.

### The correct failure mode

Free providers run out. When they do:

**Degrade, never spend.** Serve cached or pre-generated content, tell the user plainly that the
live tutor is unavailable, and queue the question for later. An outage is acceptable. A bill is
not.

### Scope

This binds **what the shipped product does at runtime and at build time**.

It does not describe development sessions — a Claude Code session working in this repo is
itself Anthropic usage and cannot route through the router. Keep that work economical
(generate code and specifications, not bulk prose content), but do not confuse the two: the
directive is about what the user's tool costs the user, every day, forever.

---

## Repository layout

| Path | What it is |
|---|---|
| `tutor/` | Relativity tutor — offline-first PWA. `PACK-SPEC.md` is the build contract |
| `tutor/data/corpus.json` | Einstein's *Relativity*, Gutenberg #30155, parsed to 37 sections / 408 paragraphs |
| `.claude/skills/relativity-tutor/` | Tutoring pedagogy — the source of truth for *how to teach* |
| `docs/superpowers/specs/` | Design docs |
| `docs/superpowers/plans/` | Task-by-task implementation plans |
| `app/`, `server/` | Phase 1 food logging (Expo + Vercel function) |

## Related repositories

`pranavshanghvi/taxwise-backend` holds the model router and its measured provider report
(`logs/PROVIDER-REPORT.md`). Consult that report before assuming a provider works — as of
2026-08-14 Gemini leads the rotation and answers 0% of probes.
