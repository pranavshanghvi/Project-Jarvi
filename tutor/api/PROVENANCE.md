# `_modelRouter.js` is a verbatim copy

| | |
|---|---|
| Source | `pranavshanghvi/taxwise-backend` → `lib/modelRouter.js` |
| Commit | `26cbc21a16d4a8c980271cc9015440f667ca5848` (2026-08-18) |
| SHA-256 | `46b78b9c8e86f093be4f1a15595de91a115b09ddc3c13e1e39956962fc230b01` |

CLAUDE.md requires AI calls to go through *the same rotation running in production*, not a
lookalike. A fork that drifts silently would satisfy the letter and break the point: the
production report in `taxwise-backend/logs/PROVIDER-REPORT.md` would stop describing what this
app actually does.

So the file is copied byte for byte and never edited here. `tools/test-server.mjs` recomputes
the hash and fails if it changes, which catches an accidental local edit. When the upstream
router changes — a provider retired, a model id rotated — re-copy it and update this file:

```sh
cp ../taxwise-backend/lib/modelRouter.js tutor/api/_modelRouter.js
sha256sum tutor/api/_modelRouter.js        # paste above
```

## Re-copied 2026-08-18 — two retired-model outages, one cause

This copy was carrying `llama-3.3-70b-versatile` for Groq, which Groq has retired: every call
returned HTTP 404 `model_not_found`. It is why this deployment looked like it had no provider key
— the key was set all along, and the router was asking for a model that no longer exists.

The identical fault was found the same day in the upstream router, where Groq had served 0 of 500
calls in a test run while the rotation quietly spent the smaller quotas instead. Upstream is now on
`openai/gpt-oss-120b`, chosen after testing every tool-capable model Groq lists.

The same re-copy also brings `thinkingConfig.thinkingBudget = 0` for Gemini: the floating
`gemini-flash-latest` alias now resolves to a thinking model, and Gemini charges that reasoning
against `maxOutputTokens` — so on small budgets it returned empty text, or a fragment of its own
reasoning presented as the answer.

**Neither was catchable by a unit test**, here or upstream, because the tests mock `fetch`. Both
were found by making a real call. That is what `scripts/check-providers.js` exists for upstream, and
what the live POST in `tools/test-server.mjs` is worth here.

## Why the Anthropic SDK is a stub

The router's first line is `require('@anthropic-ai/sdk')`, used only by the paid fallback that
`freeOnly: true` disables. Rather than install the real SDK and rely on every call site
remembering the flag, `package.json` points that name at `stubs/anthropic-sdk`, which throws.

The paid path is then not merely unused but absent: if someone drops `freeOnly` in a year, the
request fails loudly with a pointer to the directive instead of quietly starting a bill. That
is the failure mode CLAUDE.md asks for — degrade, never spend — enforced by the module graph
rather than by discipline.
