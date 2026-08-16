# Knowledge Pack — build contract

**Pedagogy lives in `.claude/skills/relativity-tutor/SKILL.md`.** That file is the source of
truth for *how to teach*; this file is the contract for *what the generator emits and what the
app reads*. Where they disagree, SKILL.md wins on pedagogy and this file wins on structure.

The generator is not a tutor. It writes, once, at build time, everything a tutor would have
said — so that a web page with no network and no model can serve it on a plane.

---

## 1. What the tutor runs on

SKILL.md assumes Claude Code: a filesystem, Python, a network, a live model. The delivered
tutor is a PWA in Safari with the wifi off. Every capability it asks for still happens — just
earlier, at build time, by the generator.

| SKILL.md asks for | Not available at runtime | Build-time equivalent |
|---|---|---|
| read/write `progress.json` in the working directory | No filesystem | `localStorage`, same schema, key `jarvi.relativity.progress` |
| Run a Python/SymPy check on any nontrivial computation | No Python | Generator verifies at build time and stamps `verified`; anything unverifiable is **dropped, not shipped** |
| "Fetch or cite" the reference sources | No network | The book text is embedded in the pack. External sources are cited by fixed reference only, never fetched |
| Generate spacetime diagrams as HTML/canvas at runtime | No live model | Pre-render as inline SVG at build time and ship in the pack entry |
| Spaced retrieval at session start | — | Works as written; a scheduler over `localStorage` |
| Diagnostic, one question at a time | — | Works as written; four onboarding screens, skippable |

**Nothing in the pack may depend on a network call.** An entry that cites a source must carry
enough text to stand alone offline.

---

## 2. Two modes

SKILL.md now explains first and closes with an invitation. That is **Unblock** mode, and it is
the default. Study mode is opt-in and is where the Socratic moves belong.

| | Unblock (default) | Study (opt-in) |
|---|---|---|
| Entered by | Tapping a sentence, or asking a question while reading | Choosing "Study this section" |
| Opens with | The explanation, plain English first | A prediction question |
| Answer gate | None — answer immediately | Answer after the learner attempts |
| Closes with | "Want to go deeper on any of these?" + specific next questions | Teach-it-back |
| Spaced retrieval | Never interrupts | Runs at session start |

Rationale: being interrogated when you are stuck mid-page is maddening. Being handed answers
when you sat down to study is hollow. Same content, different serving policy.

---

## 3. The concept graph

### Spine: the book

The spine is the **actual edition** (Gutenberg #30155, parsed to `tutor/data/corpus.json`):
32 numbered sections plus Appendices I–IV, 408 paragraphs, 62 equations. Every section gets
one `section` entry. Reading position is a section number, and it gates spoilers.

### Enrichment: what the book assumes but never explains

The largest gap for a non-physicist reader is not the mathematics — it is vocabulary Einstein
takes for granted. These get `concept` entries, each anchored to the section where the reader
first needs it. Generate this set by asking, per paragraph: *what does this assume the reader
already knows and never explains?*

Seed list, anchored to the sections that need them:

| Concept | First needed |
|---|---|
| Euclidean geometry; what "true" means for a geometrical proposition | §I |
| Coordinate system; rigid body; measuring rod | §II |
| Classical mechanics; Newton's laws; trajectory | §III |
| Law of inertia; inertial (Galileian) frame; the fixed stars | §IV |
| Principle of relativity | §V |
| Velocity addition, classically | §VI |
| The ether; Maxwell's electrodynamics; why light was a problem | §VII |
| What it means to *define* simultaneity | §VIII |
| Lorentz transformation; γ and where it "turns on" | §XI |
| Fizeau's experiment; why it mattered | §XIII |
| Minkowski's four-dimensional world, as Einstein frames it | §XVII |
| Gravitational field; inertial vs gravitational mass | §XIX–XX |
| Non-Euclidean geometry; the marble-slab picture | §XXIV |
| Gaussian co-ordinates | §XXV |
| Finite but unbounded; the surface of a sphere | §XXXI |

### The ladder in SKILL.md is enrichment, not spine

SKILL.md's 20-rung ladder is a modern relativity course. Four rungs are **not in this book**
and must be marked `beyondBook: true` — they surface only if the reader asks directly, never
as part of the reading path:

- Rung 11, four-vectors
- Rung 18, Schwarzschild solution, black holes, event horizons
- Rung 19, Einstein field equations
- Rung 20, gravitational waves (Mercury's perihelion, light bending and GPS are fine — the
  first two are in Appendix III)

Where a rung *does* map to the book, record the mapping so the ladder's dependency ordering
can be reused. SKILL.md's instruction to teach **relativity of simultaneity before time
dilation** is correct and matches Einstein's own ordering (§IX precedes §XII) — preserve it.

### Edges

Typed, and both directions are generated:

- `prereq` — what you'd need first if this didn't land
- `next` — the natural question from here, carrying **the question text**, not just a target
- `contrast` — the thing readers confuse this with
- `deeper` — the same idea one level down

"What should I ask next?" must be an edge traversal. No model call, no search.

---

## 4. Entry schema

```jsonc
{
  "id": "concept.classical-mechanics",      // or "section.s03"
  "kind": "concept" | "section",
  "title": "Classical mechanics",
  "aliases": ["Newtonian mechanics", "classical physics"],
  "anchors": ["s03"],                        // sections where this is needed
  "firstNeededAt": 3,                        // section number; drives spoiler gating
  "beyondBook": false,

  "levels": {
    "plain":     "…",   // a ten-year-old could follow it. Required.
    "intuition": "…",   // the everyday picture. Required.
    "careful":   "…",   // accurate, proper terms. Required.
    "math":      "…"    // null when the concept has no mathematics
  },

  "analogies": [
    { "text": "…", "breaks": "…" }           // `breaks` is REQUIRED — see §5
  ],

  "misconceptions": ["mass-increases-with-speed"],   // ids into the misconception bank

  "edges": {
    "prereq":   ["concept.coordinate-system"],
    "next":     [{ "q": "Does this break cause and effect?", "target": "section.s09" }],
    "contrast": ["concept.galilean-relativity"],
    "deeper":   ["section.s21"]
  },

  "diagram": { "svg": "<svg …>", "caption": "…" },   // optional, pre-rendered

  "sources": ["book:s03.p1", "book:s03.p2"],         // corpus paragraph ids
  "verified": { "method": "cross-check", "agreement": 2, "checkedAt": "2026-08-16" }
}
```

**`levels.plain` is the product.** It is what a reader stuck on a sentence at 35,000 feet
actually reads. If only one level is good, make it that one.

"Explain it again, differently" serves the next level, or another analogy. It is a button, not
a generation.

---

## 5. Analogies

Every analogy carries where it **breaks**. This is not optional and the generator must reject
entries missing it.

The rubber sheet is why. Everyone reaches for it to explain curved spacetime, and it is
circular — the ball rolls "down" *because of gravity*, which is the thing being explained. An
analogy shipped without its limits teaches something the reader will later have to unlearn,
and they will not know which part was the lie.

Analogies are also the hardest thing to buy from a cheap model. A mediocre explanation is
merely unhelpful; a mediocre analogy is actively wrong. Every analogy in the gold examples is
hand-written, and generated analogies are the highest-priority target for the cross-check.

---

## 6. Learner profile

Same shape as SKILL.md's `progress.json`, in `localStorage`, with three additions.

```jsonc
{
  "learner": {
    "algebra": "fluent" | "shaky",
    "calculus": "none" | "single-var" | "multivar",
    "linear_algebra": true,
    "goal": "conceptual" | "exam" | "mathematical",
    "defaultLevel": "plain" | "intuition" | "careful"    // added: which level to serve first
  },
  "readingPosition": 3,                                   // added: gates spoilers
  "concepts": { "time_dilation": { "status": "mastered", "last_seen": "2026-08-16", "attempts": 3 } },
  "open_misconceptions": ["relativistic mass"],
  "session_count": 1,
  "queued": []                                            // added: asked offline, answer on reconnect
}
```

**Adapting to the learner is choosing a level, not rewriting text.** Because every concept
already exists at four levels, this works offline with no model.

Two rules:

- **Explicit signals only.** Asking "what is Euclidean geometry" is unambiguous — mark geometry
  as needs-support. Tapping "simpler please" is unambiguous. Do **not** infer from dwell time,
  scroll speed, or whether the math section was expanded. Wrong inferences degrade every
  subsequent answer and are invisible to the reader.
- **The profile is visible and editable.** A settings line stating what it believes, that the
  reader can correct.

The calculus gate from SKILL.md maps directly onto `defaultLevel` and onto whether
`levels.math` is offered at all. "Never fake mathematical depth" holds.

---

## 7. What the generator must not do

Straight from SKILL.md's evidence protocol, and binding:

- Every numerical constant and experimental result names its source — "Hafele–Keating, 1971",
  never "experiments show".
- No compressed derivations. Each algebraic step.
- Uncertain about a sign, a factor, or an index? Say so in the entry, or drop it.
- **Verify or drop.** Any computation not verified at build time does not ship. The runtime has
  no way to check, and a reader learning from this cannot catch the error.
- Mark clearly where settled physics ends.

Additionally, for this build:

- **The book is the authority** for "what does Einstein say here". 30,132 words are embedded.
  Never paraphrase him from memory when the paragraph is right there — cite the paragraph id.
- External sources are for "what do we know now", and are cited, never fetched. Note that
  Carroll's *Lecture Notes on General Relativity* is graduate tensor calculus — appropriate
  only for the mathematical track, never for `levels.plain`.

---

## 8. Quality gates

1. **Cross-check.** Every entry generated by two models independently; disagreements flagged
   for review rather than silently resolved. Groq's free tier makes 3× redundancy affordable.
2. **Schema validation.** Reject entries missing a required level, an analogy without `breaks`,
   or an unverified computation.
3. **Coverage eval.** 100 held-out real questions with expected section citations, run after
   every regeneration. Score retrieval hit rate. Without this, generator prompt changes degrade
   the pack silently.
4. **Spoiler check.** No entry may reference a concept whose `firstNeededAt` exceeds its own.

---

## 9. Open items

- **Frontmatter drift.** SKILL.md's `description` still opens "Socratic tutor…", which is what
  a model reads first and no longer matches the explain-first body. Worth a one-line fix.
- **Gold examples.** Six to eight hand-written entries — background concepts and their
  analogies — used as few-shot exemplars. Highest-leverage token spend in the build.
- **Diagram set.** Which sections earn a pre-rendered SVG. §IX simultaneity and §XXIV the
  marble slab are the obvious two.
