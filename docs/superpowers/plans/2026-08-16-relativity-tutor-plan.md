# Jarvi Tutor — Relativity: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline-capable MIT-PhD-level tutor for Einstein's *Relativity: The Special and General Theory*, on iPhone, iPad, and Mac. Ask about any sentence on screen, or any question about the book, with or without a network.

**Design:** `docs/superpowers/specs/2026-08-16-relativity-tutor-design.md`. Read it first — the four-tier offline model and the build-time Knowledge Pack are the load-bearing ideas, and every task below assumes them.

**Architecture:** Reuses the existing stack. Expo/TypeScript app in `app/`, one stateless Vercel function in `server/` holding `ANTHROPIC_API_KEY`, `expo-sqlite` on-device. New: a build-time pack generator in `tools/pack/`, native modules for OCR and on-device embeddings, and a Tauri wrapper for Mac.

**Tech additions:** `@react-native-ai/apple` (on-device embeddings + Tier-C generation, iOS 26+), `expo-share-extension`, Apple Vision OCR via a native module, SQLite FTS5, Tauri 2 for the Mac shell, `@anthropic-ai/sdk` Batch API for pack generation.

## Global constraints

- **Model is `claude-opus-5`** everywhere — pack generation and live queries. Adaptive thinking is on by default; do not send `budget_tokens` or `temperature` (both 400).
- `ANTHROPIC_API_KEY` lives only in `server/` and in the local environment of the pack generator. Never in the app bundle, never committed.
- The app must give a useful answer with the network cable pulled. Every feature is designed offline-first and enhanced online, never the reverse.
- Only public-domain source text (Gutenberg #5001) ships in the app. User-imported PDFs stay on-device and are never uploaded except as a single page image on an explicit online question.
- Every answer cites its book section. The tutor states plainly when it goes beyond the text.
- Automated tests for pure logic (`app/src/tutor/**`, `app/src/retrieval/**`, `server/lib/**`, `tools/pack/lib/**`); UI, SQLite wiring, share extension, and native modules verified manually.

---

## Phase 0 — Useful this weekend

Goal: the user can ask questions about the book and get excellent answers, online. Ships value before any of the hard offline work starts.

### Task 1: Ingest and segment the corpus

**Files:** create `tools/pack/`, `tools/pack/ingest.ts`, `tools/pack/lib/segment.ts`, `tools/pack/lib/segment.test.ts`

- [ ] Fetch Gutenberg #5001 (`https://www.gutenberg.org/files/5001/5001-h/5001-h.htm`), strip the Gutenberg header/footer, keep the attribution.
- [ ] Segment into Part I §1–17, Part II §18–29, Part III §30–32, and the appendices — paragraph-addressable, each with a stable ID (`p1.s09.par3`).
- [ ] Extract equations into their own records, linked to the paragraph they appear in.
- [ ] Emit `corpus.json`. Tests cover segmentation boundaries and equation extraction.

### Task 2: Extend the server proxy for tutor queries

**Files:** create `server/api/tutor.ts`, `server/lib/tutorPrompt.ts`, `server/lib/tutorPrompt.test.ts`; modify `server/lib/claudeClient.ts`

- [ ] New endpoint accepting `{ question, retrievedContext[], readingPosition, depth, image? }`.
- [ ] Build the tutor system prompt: MIT-PhD persona teaching a smart non-physicist; the five-part answer contract; no-spoiler rule keyed to `readingPosition`; distinguish the book's 1920 framing from modern physics; always cite the section.
- [ ] Prompt-cache the system prompt and pack prefix (`cache_control: {type: "ephemeral"}` on the last stable block). Verify `usage.cache_read_input_tokens` is non-zero on the second call.
- [ ] Reuse the existing shared-secret gate from `47628f7`. Store nothing.
- [ ] Tests: prompt assembly, spoiler filtering, response parsing.

### Task 3: Minimal ask-the-book screen

**Files:** create `app/src/screens/AskScreen.tsx`, `app/src/api/askTutor.ts`, `app/src/tutor/answerContract.ts`; modify `app/src/navigation/RootNavigator.tsx`

- [ ] Question input, streamed answer, expandable "show me the math" section, section citation as a tappable chip.
- [ ] Reading-position control persisted locally.
- [ ] Ship it. Use it while reading. The rest of the plan is informed by what actually gets asked.

---

## Phase 1 — Genuine offline

Goal: the four-tier router works and the app is useful with no network.

### Task 4: Build the Knowledge Pack generator

**Files:** create `tools/pack/generate.ts`, `tools/pack/lib/prompts.ts`, `tools/pack/lib/prompts.test.ts`, `tools/pack/lib/batch.ts`

- [ ] Per section, generate: the four-layer explainer, ~60–90 anticipated Q&A pairs, equation cards, misconception cards, modernity notes.
- [ ] Generate the prerequisite lesson set and the glossary as separate passes.
- [ ] Use the **Batch API** (50% discount) with the corpus prompt-cached. Key results by `custom_id`; results arrive out of order.
- [ ] Expected: ~700k output tokens, roughly $15 per full pass on Opus 5. Log actual spend.
- [ ] Tests: prompt construction, batch result reassembly, schema validation of generated records.

### Task 5: Embed and package

**Files:** create `tools/pack/embed.ts`, `tools/pack/build-db.ts`

- [ ] Embed every pack record at build time. Store float16.
- [ ] Emit a prebuilt SQLite database: corpus, pack records, FTS5 index, embedding blobs, a `pack_version` row.
- [ ] Host the pack for first-launch download (versioned); the app checks for a newer version on each launch.

### Task 6: On-device retrieval

**Files:** create `app/src/retrieval/fts.ts`, `app/src/retrieval/vector.ts`, `app/src/retrieval/fuse.ts`, `app/src/retrieval/fuse.test.ts`, `app/src/db/packSchema.ts`

- [ ] FTS5 keyword search. Always available.
- [ ] Query embedding via `@react-native-ai/apple`; cosine similarity against pack embeddings. Detect capability at runtime and degrade to FTS5-only.
- [ ] Reciprocal rank fusion. Emit a confidence score (top score plus margin over second) — this drives tier routing.
- [ ] Tests: fusion ordering, confidence scoring, degradation path.

### Task 7: Tier router and the offline queue

**Files:** create `app/src/tutor/router.ts`, `app/src/tutor/router.test.ts`, `app/src/tutor/queue.ts`, `app/src/tutor/backfill.ts`

- [ ] Route on connectivity + retrieval confidence: A (live) / B (pack hit) / C (grounded local synthesis) / D (queue).
- [ ] Tier C: pass top-k passages to the Apple on-device model with a strict "answer only from these passages; say so if they're insufficient" prompt. Badge the answer **"offline draft"** in the UI — non-negotiable.
- [ ] Tier D: queue the question; on reconnect, answer via Claude, **write the answer into the local pack and embed it**. The pack personalizes over time.
- [ ] After each online session, background-generate likely follow-ups into the pack.
- [ ] Tests: routing decisions across the connectivity × confidence matrix, queue persistence and drain, pack-write idempotency.

### Task 8: Verify offline for real

- [ ] Airplane mode. Ask 30 questions spanning §1–§32. Record which tier answered each and whether the answer was correct.
- [ ] Build the **pack quality eval**: ~100 held-out questions with expected section citations, run after every pack regeneration, scoring retrieval hit rate. Without this, generator prompt changes silently degrade offline quality.

---

## Phase 2 — Ask about what's on screen

### Task 9: In-app reader with tap-to-ask

**Files:** create `app/src/screens/ReaderScreen.tsx`, `app/src/reader/pdfImport.ts`, `app/src/reader/selection.ts`

- [ ] Render the bundled Lawson text; import the user's own PDF as an alternative.
- [ ] Tap or select a sentence → ask sheet, pre-anchored to that exact paragraph. No OCR needed here, so this is the highest-fidelity path — build it first.

### Task 10: OCR and text anchoring

**Files:** create `app/modules/vision-ocr/` (native module), `app/src/reader/anchor.ts`, `app/src/reader/anchor.test.ts`

- [ ] Native module wrapping Apple Vision text recognition. On-device, offline, free.
- [ ] Anchoring: normalized trigram similarity between OCR output and the corpus → section + paragraph, with a confidence score.
- [ ] When anchored, the tutor opens with location context ("You're in §9, the train-and-embankment thought experiment…").
- [ ] Tests: anchoring against deliberately noisy OCR output, and correct low-confidence behaviour when the text isn't from this book.

### Task 11: Share extension

**Files:** create `app/share-extension/`, modify `app/app.json`

- [ ] `expo-share-extension` config plugin. Requires a dev build — Expo Go will not work.
- [ ] Screenshot → Share → "Ask Jarvi" → compose sheet → answer inline, without leaving the reading app.
- [ ] Online: send the image to Claude vision directly (better on diagrams and equations). Offline: Vision OCR → retrieval.
- [ ] Also register a Shortcuts action and accept pasted images in-app.

---

## Phase 3 — Mac

### Task 12: Tauri shell around the web build

**Files:** create `mac/` (Tauri project), modify `app/package.json`

- [ ] Wrap the existing `react-native-web` export. Menu-bar presence, not a dock app.
- [ ] Global hotkey (⌘⇧Space) → region capture → answer overlay.
- [ ] Reuse the same SQLite pack file; call Apple Vision for OCR through a small Rust shim.

---

## Phase 4 — Actually a tutor

### Task 13: Notebook and prerequisite drill-down

**Files:** create `app/src/screens/NotebookScreen.tsx`, `app/src/tutor/prereq.ts`

- [ ] Every Q&A saved, tagged by section. Per-section "my questions" view.
- [ ] Tappable unfamiliar terms → prereq mini-lesson from the pack → recursive.

### Task 14: Spaced repetition

**Files:** create `app/src/tutor/srs.ts`, `app/src/tutor/srs.test.ts`, `app/src/screens/ReviewScreen.tsx`

- [ ] Auto-generate a flashcard from each question the user asks.
- [ ] Five cards a day, SM-2-style scheduling. Tests cover the scheduler.

### Task 15: Depth dial and spoiler mode polish

- [ ] Session-level depth setting, overridable per question.
- [ ] Reading-position tracking advances automatically from the reader; spoiler filtering applied to retrieval as well as generation.

---

## Phase 5 — Sync

### Task 16: CloudKit private database

- [ ] Sync notebook, questions, reading position, and SRS state across the three devices. No accounts, no server. Last-write-wins on notes.
- [ ] Until this lands, JSON export/import via Files is the workaround (ship that in Phase 0 if it's cheap).

---

## Sequencing note

Phases 0 and 1 are the whole product. Phase 0 is a weekend and makes the reading immediately better. Phase 1 is the real engineering and is where the offline promise is either kept or isn't — do not start Phase 2 until Task 8 has passed in airplane mode. Phases 2–5 each add a distinct surface and can be reordered freely based on what the user actually misses while reading.
