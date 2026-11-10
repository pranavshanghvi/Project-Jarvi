# `modelRouter.js` is a verbatim copy

| | |
|---|---|
| Source | `pranavshanghvi/taxwise-backend` → `lib/modelRouter.js` |
| Commit | `5888c6c2014bb40deef07c837f896570002cfb83` |
| SHA-256 | `c60faf136674bcbb5024c391f0efe9bcccfc696e0d8ffc0a9223821ddd0308aa` |
| Copied | 2026-11-10 |

CLAUDE.md requires every AI call to go through the same free rotation that runs in production,
with `freeOnly: true`. The file is copied byte for byte and never edited here;
`lib/foodVision.test.ts` recomputes the hash and fails if it drifts. When the upstream router
changes (a provider retired, a model id rotated), re-copy it and update this table:

```sh
cp "../../taxwise/taxwise-backend/lib/modelRouter.js" lib/modelRouter.js
shasum -a 256 lib/modelRouter.js        # paste above
```

`@anthropic-ai/sdk` resolves to `stubs/anthropic-sdk`, which throws on construction. The router
only reaches it in the paid fallback that `freeOnly` skips, so a call site that forgets the flag
gets a stack trace, not an invoice.
