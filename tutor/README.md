# Relativity tutor

Einstein's *Relativity: The Special and General Theory* with a tutor attached. Tap any sentence
and ask about that line, by voice if you want, and it answers in plain English with an analogy
and a question back. It is built to work on a plane: the book, the explainers and the search
index are all inside one HTML file, and nothing is fetched at runtime.

Asking it a question never costs money. That is not a target, it is the constraint the whole
design is bent around — see the root `CLAUDE.md`.

## Layout

| Path | What it is |
|---|---|
| `data/corpus.json` | The book — Gutenberg #30155, 37 sections, 408 paragraphs |
| `data/pack.seed.json` | Hand-written concept explainers, misconceptions, arcs |
| `data/pack.sections.json` | One explainer per section of the book |
| `tools/build-app.mjs` | Inlines all of the above into `web/index.html` |
| `tools/ingest.mjs` | Parses the epub into `corpus.json` (run once) |
| `tools/make-icon.mjs` | Draws the light-cone icon as a PNG, no libraries |
| `api/ask.js` | The live tutor. Free providers only |
| `stubs/anthropic-sdk/` | A stub that throws — see `api/PROVENANCE.md` |
| `PACK-SPEC.md` | What belongs in the pack and why |

## Build and test

```sh
npm install
npm run build          # → web/index.html, web/artifact.html, manifest, service worker
npm test               # structural checks on the built page, and the endpoint
npm run test:browser   # drives the real interactions in Chromium at iPhone size
```

`test:browser` needs Playwright, which is deliberately not a dependency of this repo — install
it wherever and point `NODE_PATH` at it:

```sh
NODE_PATH=/path/to/node_modules node tools/test-browser.mjs
```

Two build-time knobs, both addresses rather than secrets:

| Variable | Default | For |
|---|---|---|
| `TUTOR_ENDPOINT` | `/api/ask` | Baked into `web/index.html`. Relative, so it follows the domain |
| `TUTOR_ARTIFACT_ENDPOINT` | empty | Baked into `web/artifact.html`, which runs as a guest on another origin and needs the absolute URL |

## Deploying

The Vercel project builds from this directory. `npm run build` regenerates the page, `web/` is
served statically, and `api/ask.js` becomes the function — so the endpoint is same-origin and
needs no configuration in the app.

### The five provider keys

The endpoint answers nothing until at least one is set in the Vercel project's environment
variables. They are read by the vendored router, never by anything shipped to the browser.

| Variable | Provider |
|---|---|
| `GROQ_API_KEY` | Groq — Llama 3.3 70B |
| `MISTRAL_API_KEY` | Mistral |
| `OPENROUTER_API_KEY` | OpenRouter |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Workers AI |
| `GEMINI_API_KEY` | Gemini — first in the rotation, but see below |

Any subset works; an unset key means that provider is skipped. With none set, every request
returns 503 and the app falls back to its written answers, which is the intended failure mode
rather than an outage.

Do **not** set `ANTHROPIC_API_KEY`. It would do nothing here — the SDK is stubbed and the paid
branch throws — but setting it signals an intent this repository does not permit.

As of the provider report in `taxwise-backend/logs/PROVIDER-REPORT.md` (2026-08-14) Gemini
leads the rotation and answers 0% of probes, so Groq is effectively first. Check that report
before assuming a provider works.

## How the online path decides to run

The written pack covers 47 topics well. The book has thirty thousand words, so there will
always be questions it has nothing for, and that gap is what the endpoint is for.

- Typing never calls out. A request per keystroke would empty a free tier in one sentence.
- Pressing Enter, or tapping **Ask the tutor**, does.
- In `gaps only` — the default — a question the pack answers is answered from the pack. Those
  explainers were written for this reader and checked; a small free model is not an upgrade.
- Every answer is stored on the device, so a question asked in the lounge is answerable in the
  air.
- When the rotation is exhausted the app says so, shows what each provider replied, and saves
  the question. It never escalates to a paid model.

The section the reader is in travels with the question. That is what makes a small model
useful here: it is answering about the page in front of them rather than from memory.
