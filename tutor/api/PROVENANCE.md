# `_modelRouter.js` is a verbatim copy

| | |
|---|---|
| Source | `pranavshanghvi/taxwise-backend` → `lib/modelRouter.js` |
| Commit | `5578084f0ad05920acfc52f781629c6bb8f81bfe` (2026-08-15) |
| SHA-256 | `82b0f33d7d68173c13d56c40339e7db0176afcfa01d8a8c31b31fc0540b18f83` |

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

## Why the Anthropic SDK is a stub

The router's first line is `require('@anthropic-ai/sdk')`, used only by the paid fallback that
`freeOnly: true` disables. Rather than install the real SDK and rely on every call site
remembering the flag, `package.json` points that name at `stubs/anthropic-sdk`, which throws.

The paid path is then not merely unused but absent: if someone drops `freeOnly` in a year, the
request fails loudly with a pointer to the directive instead of quietly starting a bill. That
is the failure mode CLAUDE.md asks for — degrade, never spend — enforced by the module graph
rather than by discipline.
