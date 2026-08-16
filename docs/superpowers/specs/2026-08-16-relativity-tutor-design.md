# Jarvi Tutor — Relativity: design

## Goal

An offline-capable, MIT-PhD-level personal tutor for Einstein's *Relativity: The Special and General Theory*, running on iPhone, iPad, and Mac. The user is a non-physicist reading the book cover to cover. They must be able to:

1. **Point at a sentence on screen and ask about it** — screenshot from any reading app, or tap a sentence inside Jarvi's own reader.
2. **Ask any general question about the book** — concepts, math, history, "why does this follow from that".
3. **Get real answers with no network** — on a plane, on the subway, in a basement.

The hard constraint is (3). Everything below is shaped by it.

---

## The offline problem, stated honestly

A genuinely PhD-level physics tutor needs a frontier model. Nothing that fits on a phone reasons about relativity reliably — a 3B on-device model will confidently produce wrong statements about simultaneity and the equivalence principle, which is worse than no answer for a learner who can't detect the error.

The resolution is to **move the intelligence to build time instead of query time**. Claude Opus 5 writes the tutor's knowledge *before the app ships*; the device does retrieval, not reasoning. Offline answers are then genuinely frontier-quality — they were written by a frontier model, just not this second.

This gives four tiers, selected automatically:

| Tier | Condition | How it answers | Quality |
|---|---|---|---|
| **A — Live** | Online | Claude Opus 5 via the existing Vercel proxy, with vision + retrieved context | Full tutor |
| **B — Pack** | Offline, good retrieval match | Hybrid semantic + keyword search over the pre-built Knowledge Pack; returns the pre-written answer | Frontier-written, near-full |
| **C — Grounded** | Offline, weak match | Apple on-device model synthesizes **only** from the top-k retrieved passages, badged "offline draft" | Degraded, honest |
| **D — Queue** | Offline, no usable answer | Question queued; answered by Claude on reconnect, written into the local pack, embedded | Deferred |

Tier D is what makes this work over months rather than on day one: **the pack grows with the user's actual questions**. After each online session a background job also pre-generates likely follow-ups, so each offline session is stronger than the last.

---

## The Knowledge Pack

Generated once at build time by a script in `tools/pack/`, shipped in the app bundle (or downloaded on first launch), stored in SQLite.

**Source text.** Project Gutenberg ebook #5001 — the authorized Robert W. Lawson translation, published 1920, **public domain in the US**. Legal to ship verbatim. Segmented into §1–§32, Part III, and the appendices, addressable to the paragraph.

**Generated layers**, per section:

- **Four-layer explainer** — plain-English gist → physical intuition + analogy → the math worked step by step → misconceptions and "what Einstein assumed you already knew" (a 1920 university-matriculation reader, which is not a 2026 non-physicist).
- **Anticipated Q&A** — Claude is shown each paragraph and asked "what would a bright non-physicist stumble on here?", then answers. Target ~2,000–3,000 pairs. This is the bulk of the pack and the reason offline feels like a tutor rather than a search box.
- **Equation cards** — every equation in the book: derivation, symbol glossary, worked numeric example.
- **Prerequisite lessons** — the math the book assumes: coordinate systems, Pythagoras in 4D, partial derivatives, vectors, an on-ramp to tensors for Part II and the appendices.
- **Misconception cards** — the canonical relativity traps: twin paradox, "everything is relative", relativistic mass, ladder-and-barn, simultaneity, expanding space vs. motion through space.
- **Modernity notes** — where the 1920 framing differs from how physicists talk now (relativistic mass being the sharpest example). Valuable precisely because the user can't spot these unaided.

**Size estimate.** ~700k tokens of generated text ≈ 30–50 MB, plus ~15 MB of float16 embeddings. Fine for a bundle.

**Build cost.** One full pass on Claude Opus 5 via the Batch API (50% discount) with the book text prompt-cached: roughly **$15**. Budget **$50–100** for several regeneration passes as prompts are tuned. Sonnet 5 for the bulk with Opus 5 on the physics-dense sections cuts that further, but at this scale the saving isn't worth the quality risk — use Opus 5 throughout.

---

## Retrieval

SQLite, on-device, no server.

- **Keyword** — FTS5 over the corpus. Always available, zero dependencies.
- **Semantic** — embeddings precomputed at build time; query embeddings generated on-device by **Apple's Foundation Models framework** (`@react-native-ai/apple`), which ships text embeddings free on any Apple-Intelligence-capable device running iOS 26+. No model to bundle, no size cost.
- **Fusion** — reciprocal rank fusion over both lists. Falls back cleanly to FTS5-only on unsupported hardware.

Retrieval confidence (top score + margin over second place) is what routes between Tier B, C, and D.

---

## Screen questions

**Frame-on-demand, not continuous streaming.** The user says "share my screen", but continuous capture costs battery, raises real privacy exposure, and buys nothing — every question is about one frame. Capture on demand.

Four capture paths:

| Surface | Path |
|---|---|
| iPhone / iPad | **Share extension**: screenshot in Books/Kindle/a PDF → Share → "Ask Jarvi" → compose sheet → answer, without leaving the book (`expo-share-extension`; Expo SDK 55 also has experimental native support) |
| iPad | **Split View / Slide Over** — tutor beside the book, with a "grab last screenshot" button |
| Any | **In-app reader** — import the book (or the user's own PDF) and **tap a sentence to ask**. Best experience: we own the text layer, so there's no OCR guesswork |
| Mac | **Menu-bar app + global hotkey** (⌘⇧Space) → region capture → answer overlay |

**OCR.** Apple Vision framework on-device — free, offline, and accurate on screenshots. Online, we skip OCR and send the image straight to Claude vision, which is better for diagrams and equations. Offline, Vision OCR feeds retrieval.

**Anchoring — the feature that makes this feel magic.** After OCR, fuzzy-match the extracted text against the corpus by normalized trigram similarity. The tutor then answers *in situ*: "You're in §9, the train-and-embankment thought experiment, third paragraph. Einstein has just done X, and the sentence you're pointing at is doing Y." Cheap to build, and it's the difference between a chatbot and a tutor sitting next to you.

---

## The tutor itself

What separates this from "chatbot with a PDF":

**Answer contract.** Every answer has the same shape: **short answer** → **intuition/analogy** → **show me the math** (collapsed, expandable) → **where this is in the book** → **the common trap here**. Consistent structure is what lets a non-physicist skim at their level and drill when ready.

**Depth dial.** "Explain like I'm curious" / "undergrad" / "show the derivation". Applies to the whole session, overridable per question.

**Reading-position awareness.** The user sets where they are. The tutor then (a) **avoids spoilers** from later chapters and (b) phrases answers using only concepts already introduced. This is the single highest-value pedagogical feature and it costs almost nothing to implement — it's a filter on retrieval plus a line in the system prompt.

**Prerequisite drill-down.** Any unfamiliar term is tappable → mini-lesson → recursively. The pack already contains the prereq lessons.

**Notebook and recall.** Every Q&A saved and tagged by section. A per-section "my questions" view. Each question the user asks auto-generates a flashcard; five cards a day, spaced repetition. This is the difference between having read the book and understanding it.

**Honesty rails.** The system prompt requires the tutor to distinguish *what Einstein says in the book* from *how physicists frame it now*, and to say plainly when it's going beyond the text. Every answer cites its section.

---

## Architecture

Reuses the existing Project-Jarvi stack almost entirely:

- **App** — Expo / React Native / TypeScript, `expo-sqlite`, `react-native-svg`. Already in `app/`.
- **Backend** — one stateless Vercel function in `server/`, holding `ANTHROPIC_API_KEY` server-side, with the shared-secret gate already added in `47628f7`. Stores nothing.
- **Mac** — wrap the existing `react-native-web` build in **Tauri 2** (small binary, native global-shortcut and screen-capture plugins). Cheapest possible path to a real Mac app given a working web build already exists.
- **Native additions** — share extension (config plugin), Vision OCR module, `@react-native-ai/apple` for on-device embeddings and Tier-C generation. All require a dev build; Expo Go won't cut it.

**Sync.** v1: on-device only, with JSON export/import via Files. v2: CloudKit private database for notes and history — all three devices are Apple, so no server and no accounts.

---

## Privacy and cost

- Screenshots are never persisted server-side; the proxy is already stateless.
- The user's own imported PDF never leaves the device.
- API key stays in Vercel. Reuse the existing shared-secret gate.
- **Runtime cost**: a screenshot question on Opus 5 is roughly 10k input (image 1.5–4.8k + retrieved context + system) and ~1k output ≈ **$0.075**, dropping to ~**$0.03** with the system-and-pack prefix prompt-cached (cache reads are ~0.1× input price). At 200 questions/month that's **$6–15/month**.
- **Build cost**: ~$15 per full pack generation pass (see above).

---

## Content licensing

- Gutenberg #5001 is public domain in the US and ships with the app. Keep the Gutenberg attribution.
- If the user is reading a modern annotated edition, they import their own PDF. It stays on-device and is never redistributed. The pack's explainers are keyed to the Lawson section numbering, which every edition preserves.

---

## Open decisions

These don't block Phase 0 and can be answered while it's being built:

1. **Pack in bundle vs. first-launch download.** 50 MB is bundle-able but pushes the App Store size. Download-on-first-launch keeps the binary small and allows pack updates without a release. *Recommendation: download on first launch, versioned.*
2. **Whether Tier C ships at all.** If Tier B coverage after a few weeks of use is high enough, a local 3B model synthesizing physics may be more liability than benefit. *Recommendation: build it behind a flag, decide on real data.*
3. **Mac via Tauri vs. Catalyst.** Tauri reuses the web build and gives easy global hotkeys; Catalyst reuses the iOS build and gives Vision OCR for free. *Recommendation: Tauri, and call the Mac OCR through Apple's Vision via a small Rust shim.*
4. **How far beyond this one book to go.** The architecture generalizes to any public-domain text. Deliberately out of scope for v1.

---

## Testing approach

Matching the repo's existing convention: automated tests for pure logic — retrieval fusion and scoring, text anchoring, section segmentation, spaced-repetition scheduling, tier routing, server response parsing. UI, SQLite wiring, share extension, and native modules verified manually.

One addition specific to this project: a **pack quality eval**. A held-out set of ~100 real questions with expected section citations, run against the pack after every regeneration, scoring retrieval hit rate. Without it, prompt changes to the generator silently degrade offline quality.
