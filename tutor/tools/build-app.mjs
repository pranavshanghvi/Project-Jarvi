// Assemble the offline tutor into a deployable PWA.
//
// Everything is inlined into one HTML file — book, pack, search index, styles, logic. No
// fetches at runtime, because the whole point is a plane. The service worker then caches that
// single file plus the manifest, so "Add to Home Screen" gives a genuinely offline app.
//
// Run:  node tutor/tools/build-app.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = JSON.parse(readFileSync(join(root, 'data/corpus.json'), 'utf8'));
const pack = JSON.parse(readFileSync(join(root, 'data/pack.seed.json'), 'utf8'));
const sections = JSON.parse(readFileSync(join(root, 'data/pack.sections.json'), 'utf8'));

// Concept entries first: when both match a query, the concept ("what is classical mechanics")
// is a better answer than the section overview that merely mentions it.
pack.entries = [...pack.entries, ...sections.entries];

const ICON = readFileSync(join(root, 'web/icon.b64'), 'utf8').trim();

// Strip the fields the client never reads. The book is 30k words and every byte ships to a
// phone that may be caching it over hotel wifi.
const slimCorpus = {
  edition: corpus.edition,
  translator: corpus.translator,
  printing: corpus.printing,
  sections: corpus.sections.map((s) => ({
    id: s.id,
    part: s.part,
    numeral: s.numeral,
    number: s.number,
    title: s.title,
    blocks: s.blocks.map((b) => (b.type === 'text' ? { t: b.text } : { eq: b.src })),
  })),
};

const DATA = JSON.stringify({ corpus: slimCorpus, pack });

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Relativity</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Relativity">
<meta name="theme-color" content="#0A0E15">
<link rel="manifest" href="/manifest.json">
<!-- Embedded rather than linked: /icon.png does not resolve when this page is served from an
     artifact URL or opened straight out of Files, and Safari then falls back to the host's
     own favicon. A data URI works everywhere. iOS ignores SVG here, so it must be a PNG. -->
<link rel="apple-touch-icon" href="data:image/png;base64,__ICON__">
<link rel="icon" type="image/png" href="data:image/png;base64,__ICON__">
<style>
:root{
  --bg:#F6F8FB; --grid:rgba(31,95,217,.05); --surface:#fff; --surface2:#EEF2F8;
  --ink:#0E141C; --soft:#384355; --muted:#5E6B7E; --line:#D9E0EA; --line2:#E8EDF4;
  --accent:#1B54C9; --accentInk:#fff; --wash:rgba(27,84,201,.08);
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0A0E15; --grid:rgba(122,168,255,.05); --surface:#121926; --surface2:#18202F;
  --ink:#E8EDF5; --soft:#BAC5D4; --muted:#8593A6; --line:#26303F; --line2:#1C2533;
  --accent:#6EA4FF; --accentInk:#08111F; --wash:rgba(110,164,255,.11);
}}
:root[data-theme="dark"]{
  --bg:#0A0E15; --grid:rgba(122,168,255,.05); --surface:#121926; --surface2:#18202F;
  --ink:#E8EDF5; --soft:#BAC5D4; --muted:#8593A6; --line:#26303F; --line2:#1C2533;
  --accent:#6EA4FF; --accentInk:#08111F; --wash:rgba(110,164,255,.11);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0}
body{
  background-color:var(--bg);
  background-image:repeating-linear-gradient(to right,var(--grid) 0 1px,transparent 1px 44px),
                   repeating-linear-gradient(to bottom,var(--grid) 0 1px,transparent 1px 44px);
  color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.6;
  -webkit-font-smoothing:antialiased;
  /* Clear the tab bar plus its lift. Safari's own toolbar sits in this space when the page is
     open as a tab rather than from the home screen, so the reserve has to be generous. */
  padding-bottom:calc(104px + env(safe-area-inset-bottom,0px));
}
.wrap{max-width:46rem;margin:0 auto;padding:0 1.15rem}
header.top{
  position:sticky;top:0;z-index:20;background:var(--bg);
  border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top);
}
.topin{max-width:46rem;margin:0 auto;padding:.65rem 1.15rem;display:flex;align-items:center;gap:.7rem}
.brand{font-family:var(--mono);font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);flex:1}
.pill{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;
  padding:.16rem .45rem;border-radius:2px;border:1px solid var(--line);color:var(--muted);
  background:none;line-height:1.5}
.pill.on{border-color:var(--accent);color:var(--accent)}
button.pill{cursor:pointer}
/* Lifted clear of Safari's bottom toolbar. In a browser tab that toolbar overlaps anything
   pinned to bottom:0, which buried the tabs; from the home screen the safe-area inset does the
   same job for the home indicator. max() covers both without double-counting. */
nav.tabs{position:fixed;bottom:0;left:0;right:0;z-index:20;background:var(--surface);
  border-top:1px solid var(--line);display:flex;
  padding-bottom:max(env(safe-area-inset-bottom,0px), 26px)}
nav.tabs button{flex:1;background:none;border:none;color:var(--muted);font-family:var(--sans);
  font-size:.72rem;padding:.75rem 0 .5rem;cursor:pointer;letter-spacing:.02em}
nav.tabs button.on{color:var(--accent);font-weight:600;box-shadow:inset 0 2px 0 var(--accent)}
.view{display:none;padding-top:1.4rem}.view.on{display:block}
h1{font-size:1.5rem;letter-spacing:-.02em;margin:0 0 .3rem;line-height:1.2;text-wrap:balance}
h2{font-size:1.15rem;letter-spacing:-.015em;margin:0 0 .8rem;line-height:1.25;text-wrap:balance}
p{margin:0 0 .95rem}
.dim{color:var(--muted);font-size:.86rem}
.sec-list{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:3px;overflow:hidden;margin:1rem 0 2rem}
.sec-list button{background:var(--surface);border:none;text-align:left;padding:.75rem .9rem;
  cursor:pointer;color:var(--ink);font-family:var(--sans);font-size:.93rem;display:flex;gap:.7rem;align-items:baseline;width:100%}
.sec-list button:hover{background:var(--surface2)}
.sec-num{font-family:var(--mono);font-size:.7rem;color:var(--muted);min-width:2.9rem;flex-shrink:0}
.part-head{font-family:var(--mono);font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin:1.6rem 0 .5rem}
.read p.para{font-family:var(--serif);font-size:1.06rem;line-height:1.72;
  padding:.1rem 0;margin:0 0 .95rem}
.sent{cursor:pointer;border-radius:3px;padding:.08em .12em;margin:0 -.12em;
  transition:background .12s;-webkit-touch-callout:none}
.sent:hover{background:var(--wash)}
/* A highlighter pen over the line, not an inverted block — a selection can run to five lines
   and solid accent across all of them is hard to read back. */
.sent.sel{background:var(--wash);box-shadow:inset 0 -2px 0 var(--accent)}

/* Ask bar — rises above the tab bar when a line is selected. */
.askbar{position:fixed;left:0;right:0;z-index:30;background:var(--surface);
  border-top:1px solid var(--accent);
  bottom:calc(max(env(safe-area-inset-bottom,0px), 26px) + 44px);
  padding:.8rem 1.15rem;transform:translateY(140%);
  /* 140% of its own height still leaves the top border showing as a blue line above the tab
     bar, so hide it outright once the slide has finished. */
  visibility:hidden;transition:transform .18s ease-out, visibility 0s linear .18s;
  box-shadow:0 -8px 24px rgba(0,0,0,.18)}
.askbar.up{transform:translateY(0);visibility:visible;transition-delay:0s}
.askbar .quote{font-family:var(--serif);font-size:.9rem;color:var(--soft);
  border-left:2px solid var(--accent);padding-left:.6rem;margin:0 0 .6rem;
  max-height:3.4em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.askrow{display:flex;gap:.45rem;align-items:stretch}
.askrow input{flex:1;min-width:0;padding:.6rem .7rem;font-size:.95rem;font-family:var(--sans);
  background:var(--surface2);color:var(--ink);border:1px solid var(--line);border-radius:3px}
.askrow input:focus{outline:none;border-color:var(--accent)}
.iconbtn{background:var(--surface2);border:1px solid var(--line);color:var(--soft);
  border-radius:3px;padding:.5rem .7rem;cursor:pointer;font-size:1.05rem;line-height:1;flex-shrink:0}
.iconbtn.go{background:var(--accent);border-color:var(--accent);color:var(--accentInk);font-size:.85rem;font-family:var(--sans)}
.iconbtn.rec{background:#C0392B;border-color:#C0392B;color:#fff;animation:pulse 1.1s infinite}
.iconbtn[disabled]{opacity:.35;cursor:default}
@keyframes pulse{50%{opacity:.55}}
.heard{font-size:.85rem;color:var(--accent);margin:.5rem 0 0;min-height:1.2em}
.speak{background:none;border:1px solid var(--line);color:var(--muted);border-radius:3px;
  padding:.25rem .5rem;font-size:.7rem;font-family:var(--mono);letter-spacing:.06em;
  text-transform:uppercase;cursor:pointer;margin-bottom:.9rem}
.speak.on{border-color:var(--accent);color:var(--accent)}
.read .eq{font-family:var(--mono);font-size:.8rem;color:var(--muted);padding:.5rem .6rem;
  background:var(--surface2);border:1px solid var(--line2);border-radius:3px;margin:0 0 .9rem}
.tap-hint{font-size:.78rem;color:var(--muted);font-family:var(--mono);margin-bottom:1.1rem}
input.q{width:100%;padding:.8rem .9rem;font-size:1rem;font-family:var(--sans);
  background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:3px}
input.q:focus{outline:none;border-color:var(--accent)}
.ans{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:1.15rem 1.15rem .3rem;margin:1.2rem 0}
.ans.hi{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
/* A live answer is marked, because it came from a small free model rather than something
   written and checked for this reader — that difference is worth being able to see. */
.ans.live{border-left:3px solid var(--accent)}
.live-tag{color:var(--accent)}
.chip.go{background:var(--accent);border-color:var(--accent);color:var(--accentInk)}
.sent:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.ans h3{font-size:1.12rem;margin:0 0 .2rem;letter-spacing:-.01em}
.lbl{font-family:var(--mono);font-size:.63rem;letter-spacing:.13em;text-transform:uppercase;
  color:var(--accent);margin:1.25rem 0 .35rem}
.lbl:first-of-type{margin-top:.9rem}
.breaks{border-left:2px solid var(--line);padding-left:.8rem;margin:.5rem 0 .95rem;color:var(--muted);font-size:.9rem}
details.more{margin:.6rem 0 1rem}
details.more summary{cursor:pointer;font-family:var(--mono);font-size:.68rem;letter-spacing:.1em;
  text-transform:uppercase;color:var(--accent);list-style:none}
details.more summary::-webkit-details-marker{display:none}
details.more summary::before{content:"▸ ";}
details.more[open] summary::before{content:"▾ ";}
.chips{display:flex;flex-direction:column;gap:.45rem;margin:.4rem 0 1.1rem}
.chip{background:var(--wash);border:1px solid transparent;color:var(--accent);text-align:left;
  padding:.55rem .7rem;border-radius:3px;cursor:pointer;font-size:.9rem;font-family:var(--sans);line-height:1.4}
.chip:hover{border-color:var(--accent)}
.src{font-family:var(--mono);font-size:.68rem;color:var(--muted);border-top:1px solid var(--line2);
  padding:.7rem 0;margin-top:.7rem}
.miss{background:var(--surface2);border:1px dashed var(--line);border-radius:3px;padding:1rem;margin:1.2rem 0;color:var(--soft);font-size:.93rem}
/* Waiting is not the same state as having nothing, and they must not look alike — a slow free
   tier would otherwise read as a failure for the twenty seconds before the answer lands. */
.thinking{background:var(--surface2);border:1px solid var(--accent);border-radius:3px;
  padding:1rem;margin:1.2rem 0;color:var(--soft);font-size:.93rem;animation:pulse 1.6s infinite}
.lvlbar{display:flex;gap:.3rem;margin:.9rem 0 0}
.lvlbar button{flex:1;font-family:var(--mono);font-size:.63rem;letter-spacing:.06em;text-transform:uppercase;
  padding:.4rem .2rem;background:var(--surface2);border:1px solid var(--line);color:var(--muted);border-radius:2px;cursor:pointer}
.lvlbar button.on{background:var(--accent);border-color:var(--accent);color:var(--accentInk)}
.setrow{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.8rem 0;border-bottom:1px solid var(--line2)}
.setrow:last-child{border-bottom:none}
button.ghost{background:none;border:1px solid var(--line);color:var(--soft);padding:.35rem .7rem;
  border-radius:3px;font-size:.82rem;cursor:pointer;font-family:var(--sans)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>

<header class="top">
  <div class="topin">
    <span class="brand">Relativity</span>
    <button class="pill" id="themebtn" title="Light / dark">Auto</button>
    <span class="pill" id="netpill">offline</span>
    <span class="pill" id="pospill">§—</span>
  </div>
</header>

<div class="wrap">

  <section class="view on" id="v-read">
    <div id="read-index">
      <h1>Relativity</h1>
      <p class="dim">The Special and General Theory · Einstein, trans. Lawson · 1924 Methuen edition</p>
      <p class="tap-hint">Tap any paragraph while reading to ask about it.</p>
      <div id="toc"></div>
    </div>
    <div id="read-section" style="display:none"></div>
  </section>

  <section class="view" id="v-ask">
    <h1>Ask</h1>
    <p class="dim" style="margin-bottom:1rem">Plain English, with analogies. Works with no signal.</p>
    <div class="askrow"><input class="q" id="qbox" placeholder="e.g. what is classical mechanics?" autocomplete="off" enterkeyhint="search">
      <button class="iconbtn" id="qmic" title="Ask out loud">🎤</button></div>
    <p class="heard" id="heard2"></p>
    <div id="answers"></div>
  </section>

  <section class="view" id="v-screen">
    <h1>From your screen</h1>
    <p class="dim" style="margin-bottom:.4rem">Reading in Books, Kindle or a PDF? Paste the passage here and I'll find it in the text and explain it.</p>
    <details class="more" style="margin-bottom:.9rem"><summary>How to copy from a screenshot</summary>
      <p class="dim" style="margin-top:.5rem"><strong>iPhone / iPad:</strong> open the screenshot in Photos, press and hold on the text, drag to select, tap Copy. (That's Live Text — your phone does the reading.)<br>
      <strong>Mac:</strong> open the screenshot in Preview or Quick Look, select the text with the cursor, ⌘C.<br>
      <strong>Or skip the screenshot</strong> — select the text directly in Books or your PDF reader and copy it.</p>
    </details>
    <textarea class="q" id="paste" rows="5" placeholder="Paste the sentence or paragraph you're stuck on…" style="resize:vertical;font-family:var(--serif)"></textarea>
    <div style="display:flex;gap:.5rem;margin-top:.6rem">
      <button class="ghost" id="pastego" style="flex:1;padding:.6rem">Find it and explain</button>
      <button class="ghost" id="pasteclear">Clear</button>
    </div>
    <div id="screenout"></div>
  </section>

  <section class="view" id="v-ideas">
    <h1>The big picture</h1>
    <p class="dim" style="margin-bottom:1.2rem">What the theory <em>means</em> — the through-lines you would remember in a year.</p>
    <div id="arcs"></div>
  </section>

  <section class="view" id="v-set">
    <h1>Settings</h1>
    <div style="margin-top:1rem">
      <div class="setrow"><span>Reading position<br><span class="dim">Answers avoid spoilers past here</span></span><span id="posval" class="dim"></span></div>
      <div class="setrow"><span>Appearance<br><span class="dim">Auto follows your device</span></span>
        <span style="display:flex;gap:.3rem" id="themeset"></span></div>
      <div class="setrow"><span>Default depth<br><span class="dim">Which level you get first</span></span></div>
    </div>
    <div class="lvlbar" id="lvlset"></div>
    <div style="margin-top:1.6rem">
      <div class="setrow"><span>What I think you know<br><span class="dim" id="profsum"></span></span><button class="ghost" id="resetprof">Reset</button></div>
      <div class="setrow"><span>Questions saved for later<br><span class="dim" id="qcount"></span></span><button class="ghost" id="runqueued">Ask now</button></div>
    </div>

    <div style="margin-top:1.6rem">
      <div class="setrow"><span>Live tutor<br><span class="dim" id="livesum"></span></span>
        <span style="display:flex;gap:.3rem" id="liveset"></span></div>
      <input class="q" id="endpoint" style="margin-top:.7rem;font-family:var(--mono);font-size:.8rem"
             placeholder="https://…/api/ask" spellcheck="false" autocapitalize="off">
      <p class="dim" style="margin-top:.5rem;font-size:.78rem">
        Used only when the written answers do not cover a question, and only when you have a
        signal. It runs on free models — Groq, Mistral, OpenRouter, Cloudflare. When they are
        exhausted it says so and saves the question rather than falling back to anything paid.
        Answers are kept on this device, so once asked they work offline.
      </p>
      <div class="setrow" style="margin-top:.7rem"><span>Answers saved from the live tutor<br>
        <span class="dim" id="cachecount"></span></span><button class="ghost" id="clearcache">Clear</button></div>
    </div>
    <p class="dim" style="margin-top:2rem;font-size:.78rem">
      Text: Project Gutenberg #30155, public domain in the US. Appendix V is still in copyright and is not included.
    </p>
  </section>

</div>

<div class="askbar" id="askbar">
  <p class="quote" id="askquote"></p>
  <div class="askrow">
    <button class="iconbtn go" id="askexplain">Explain</button>
    <input id="askinput" placeholder="ask about this line…" enterkeyhint="send">
    <button class="iconbtn" id="askmic" title="Ask out loud">🎤</button>
    <button class="iconbtn" id="askclose" title="Close">✕</button>
  </div>
  <p class="heard" id="heard"></p>
</div>

<nav class="tabs">
  <button data-v="read" class="on">Read</button>
  <button data-v="screen">Screen</button>
  <button data-v="ask">Ask</button>
  <button data-v="ideas">Ideas</button>
  <button data-v="set">More</button>
</nav>

<script>
const DATA = __DATA__;
const C = DATA.corpus, P = DATA.pack;

// ── home-screen icon ──────────────────────────────────────────────────────
// Safari reads apple-touch-icon out of document.head at the moment you tap "Add to Home
// Screen". When this page is served inside a host page, our <link> tags sit in the body and
// are ignored, so the host's own icon wins — which is why it kept showing Claude's mark.
// Rewriting head at runtime is the only way to claim it from inside a hosted page.
(function(){
  const ICON = "data:image/png;base64,__ICON__";
  document.querySelectorAll(
    'link[rel~="apple-touch-icon"],link[rel~="apple-touch-icon-precomposed"],link[rel~="icon"],link[rel~="shortcut"],link[rel~="mask-icon"]'
  ).forEach(l => l.remove());
  for(const rel of ["apple-touch-icon","apple-touch-icon-precomposed","icon"]){
    const l = document.createElement("link");
    l.setAttribute("rel", rel);
    l.setAttribute("href", ICON);
    l.setAttribute("sizes", "512x512");
    if(rel === "icon") l.setAttribute("type", "image/png");
    document.head.appendChild(l);
  }
  const meta = (name, content) => {
    let m = document.querySelector('meta[name="'+name+'"]');
    if(!m){ m = document.createElement("meta"); m.setAttribute("name", name); document.head.appendChild(m); }
    m.setAttribute("content", content);
  };
  meta("apple-mobile-web-app-title","Relativity");
  meta("apple-mobile-web-app-capable","yes");
  meta("apple-mobile-web-app-status-bar-style","black-translucent");
  document.title = "Relativity";
})();
const LEVELS = ["plain","intuition","careful"];
const LEVEL_LABEL = {plain:"Plain",intuition:"Intuition",careful:"Careful"};

// ── profile ───────────────────────────────────────────────────────────────
const KEY = "jarvi.relativity.progress";
const defaults = {learner:{defaultLevel:"plain",needsSupport:[]},readingPosition:1,concepts:{},
  queued:[],theme:"auto",endpoint:__ENDPOINT__,live:"auto"};
let prof;
try { prof = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); }
catch { prof = structuredClone(defaults); }
prof.learner = Object.assign({}, defaults.learner, prof.learner || {});
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prof)); } catch {} };

// Explicit signals only. Nothing is inferred from dwell time or scrolling — a wrong guess
// silently degrades every later answer and the reader can never see why.
function noteSupport(topic){
  if(!topic) return;
  if(!prof.learner.needsSupport.includes(topic)) prof.learner.needsSupport.push(topic);
  save(); renderSettings();
}

// ── index ─────────────────────────────────────────────────────────────────
const byId = {};
for(const s of C.sections) byId[s.id] = s;
for(const e of P.entries) byId[e.id] = e;

const norm = t => (t||"").toLowerCase().replace(/[^a-z0-9\\s]/g," ").split(/\\s+/).filter(w=>w.length>2);
const STOP = new Set(["the","and","for","that","this","with","what","how","why","does","are","was","you","your","its","from","have","has","can","who","when","where","would","could","about","then","than","some","into","out","not","but","all","any","get","got","them","they","their","there","here","just","like","make","means","mean","meaning","much","more","only","over","said","same","see","should","tell","things","think","thing"]);

// Weighted keyword index. Aliases carry the most weight because they are deliberately written
// in the reader's vocabulary ("live longer", "body") rather than Einstein's ("elapsed time").
const IDX = P.entries.map(e => {
  const f = {};
  const add = (txt,w) => { for(const t of norm(txt)) if(!STOP.has(t)) f[t]=(f[t]||0)+w; };
  add(e.title,6); (e.aliases||[]).forEach(a=>add(a,6));
  add(e.levels.plain,2); add(e.levels.intuition,1); add(e.meaning,1);
  (e.analogies||[]).forEach(a=>add(a.text,1));
  return {e,f};
});
// The whole section, not just its opening. Indexing the first four paragraphs meant a name or
// a term introduced halfway down a section was simply not findable — and this book introduces
// most of its ideas in the middle of the argument, not in the first line.
const SECIDX = C.sections.map(s => {
  const f = {};
  for(const t of norm(s.title)) if(!STOP.has(t)) f[t]=(f[t]||0)+5;
  s.blocks.filter(b=>b.t).forEach((b,i)=>{
    const w = i < 4 ? 0.4 : 0.15;   // the opening still says what a section is about
    for(const t of norm(b.t)) if(!STOP.has(t)) f[t]=(f[t]||0)+w;
  });
  return {s,f};
});

// Summing raw counts lets a long entry win on a common word: "does motion affect ageing" was
// answering with classical mechanics, because "motion" is everywhere in this book and "ageing"
// is in exactly one place. Weight each term by how rare it is, and saturate repeats, so the one
// distinctive word in a question is the word that decides.
const DF = {};
for(const {f} of IDX)    for(const t in f) DF[t] = (DF[t]||0)+1;
for(const {f} of SECIDX) for(const t in f) DF[t] = (DF[t]||0)+1;
const NDOC = IDX.length + SECIDX.length;
const idf = t => Math.log(1 + NDOC/(1 + (DF[t]||0)));

// "Who is Gauss" found nothing, because the index holds "gaussian" and no amount of exact
// matching gets from one to the other — while the book has a whole chapter named after him.
// Each query term is expanded to vocabulary words that extend it, or that it extends, at a
// discount so an exact hit still wins.
const VOCAB = Object.keys(DF);
const EXPCACHE = {};
function expand(t){
  if(EXPCACHE[t]) return EXPCACHE[t];
  const out = [[t, 1]];
  if(t.length >= 4) for(const v of VOCAB){
    if(v === t) continue;
    const long = v.length > t.length ? v : t, short = v.length > t.length ? t : v;
    if(long.startsWith(short) && long.length - short.length <= 4) out.push([v, 0.75]);
  }
  return (EXPCACHE[t] = out);
}

// Below this, a "match" is one common word glancing off an unrelated entry. Answering anyway is
// worse than saying nothing: it reads as the tutor having misunderstood the question.
const FLOOR = 1.6;

function search(q, limit=3){
  const terms = norm(q).filter(t=>!STOP.has(t));
  if(!terms.length) return [];
  const exp = terms.map(expand);
  // Max across a term's variants rather than sum — "gauss" and "gaussian" are one term matched
  // once, not two.
  const score = f => exp.reduce((n, vars) =>
    n + Math.max(...vars.map(([t,w]) => f[t] ? Math.sqrt(f[t]) * idf(t) * w : 0)), 0);
  const covered = f => exp.filter(vars => vars.some(([t]) => f[t])).length;
  const hits = [];
  for(const {e,f} of IDX){ const sc = score(f); if(sc>0) hits.push({kind:"entry",item:e,score:sc,covered:covered(f)}); }
  for(const {s,f} of SECIDX){ const sc = score(f)*0.7; if(sc>0) hits.push({kind:"section",item:s,score:sc,covered:covered(f)}); }
  hits.sort((a,b)=>b.score-a.score);
  // Spoiler gate: never lead with something from beyond where the reader has reached.
  const ok = hits.filter(h => (h.kind==="entry" ? (h.item.firstNeededAt||0) : (h.item.number||0)) <= prof.readingPosition + 2);
  return (ok.length ? ok : hits).slice(0, limit);
}

// A question the pack genuinely does not cover — the trigger for asking the live tutor.
function tooWeak(hits, q){
  if(!hits.length) return true;
  const need = Math.ceil(norm(q).filter(t=>!STOP.has(t)).length / 2);
  return hits[0].score < FLOOR || hits[0].covered < need;
}

// ── the live tutor ────────────────────────────────────────────────────────
// The written pack is 47 explainers over a book with 30,000 words in it, so there will always
// be a question it has nothing for. When there is a signal, the endpoint answers it — on free
// models only, and never on a paid one; see CLAUDE.md and api/PROVENANCE.md.
//
// Every answer is kept on the device, which is the part that matters on a plane: a question
// asked in the airport lounge is still answerable at 35,000 feet.
const LIVEKEY = "jarvi.relativity.live";
const LIVE_MAX = 200;
let live = {};
try { live = JSON.parse(localStorage.getItem(LIVEKEY) || "{}"); } catch { live = {}; }
function liveSave(){
  try { localStorage.setItem(LIVEKEY, JSON.stringify(live)); }
  catch {
    // Out of room. Drop the oldest half rather than losing the lot — and rather than letting
    // a full localStorage silently stop the tutor from remembering anything.
    const keys = Object.keys(live).sort((a,b)=>(live[a].askedAt||"").localeCompare(live[b].askedAt||""));
    for(const k of keys.slice(0, Math.ceil(keys.length/2))) delete live[k];
    try { localStorage.setItem(LIVEKEY, JSON.stringify(live)); } catch {}
  }
}
const liveKey = (q, sec) => (sec ? sec+"|" : "|") + norm(q).filter(t=>!STOP.has(t)).sort().join(" ");
function liveGet(q, sec){ return live[liveKey(q, sec)] || live[liveKey(q, null)] || null; }
function livePut(q, sec, a){
  const keys = Object.keys(live);
  if(keys.length >= LIVE_MAX){
    keys.sort((x,y)=>(live[x].askedAt||"").localeCompare(live[y].askedAt||""));
    delete live[keys[0]];
  }
  live[liveKey(q, sec)] = a; liveSave();
}

const endpoint = () => (prof.endpoint || "").trim();
// "gaps" is the default: the written answers are better than a small model when they exist,
// because they were written for this reader and checked. Live fills what they do not cover.
const liveMode = () => prof.live || "gaps";
function canLive(){ return !!endpoint() && navigator.onLine && liveMode() !== "off"; }

async function askLive(q, ctx){
  const sec = ctx && ctx.section;
  const body = {
    question: q,
    line: (ctx && ctx.line) || "",
    level: prof.learner.defaultLevel,
    needsSupport: prof.learner.needsSupport,
    section: sec ? {
      numeral: sec.numeral, title: sec.title,
      text: sec.blocks.filter(b=>b.t).map(b=>b.t).join("\\n\\n"),
    } : null,
  };
  // 40s: a free tier under load is slow, and the alternative to waiting is no answer at all.
  const ctl = new AbortController();
  const timer = setTimeout(()=>ctl.abort(), 40000);
  try {
    const res = await fetch(endpoint(), {
      method: "POST", headers: {"content-type":"application/json"},
      body: JSON.stringify(body), signal: ctl.signal,
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      const e = new Error(data.message || ("The tutor returned " + res.status));
      e.declined = data.declined; e.kind = data.error; throw e;
    }
    livePut(q, sec ? sec.id : null, data);
    return data;
  } finally { clearTimeout(timer); }
}

function renderLive(a, q){
  let h = '<div class="ans live"><div class="lbl live-tag">Live tutor</div>'
        + '<h3>'+esc(q)+'</h3><div class="lvlbody">'+para(a.answer||"")+'</div>';
  if(TTS) h += '<button class="speak">▶ Listen</button>';
  if(a.analogy){
    h += '<div class="lbl">Analogy</div>'+para(a.analogy);
    if(a.breaks) h += '<div class="breaks"><strong>Where it breaks:</strong> '+esc(a.breaks)+'</div>';
  }
  if(a.means) h += '<details class="more"><summary>What it means</summary>'+para(a.means)+'</details>';
  if(a.next) h += '<div class="lbl">Does that land? Where to go next</div>'
                + '<div class="chips"><button class="chip" data-ask="'+esc(a.next)+'">'+esc(a.next)+'</button></div>';
  h += '<div class="src">Answered live on a free model'
     + (a.askedAt ? ", "+esc(a.askedAt.slice(0,10)) : "")
     + ". Saved on this device, so it works offline now.</div></div>";
  return h + '</div>';
}

// Shown while waiting, because a free tier can take twenty seconds and a blank screen reads as
// a broken app.
const THINKING = '<div class="thinking" id="thinking"><strong>Asking the tutor…</strong>'
  + '<p style="margin:.6rem 0 0" class="dim">Free models can be slow. This gets saved to the '
  + 'device once it arrives.</p></div>';

function liveError(e, q){
  const exhausted = e.kind === "no_free_provider";
  return '<div class="miss"><strong>'
    + (exhausted ? "The free models are all out for now."
                 : esc(e.message || "Could not reach the tutor."))
    + '</strong><p style="margin:.6rem 0 0">Saved your question — try again later.</p>'
    + (e.declined ? '<details class="more"><summary>What each provider said</summary><p class="dim" '
        + 'style="font-family:var(--mono);font-size:.72rem">'+esc(e.declined.join(" · "))+'</p></details>' : '')
    + '</div>';
}

// One place that runs a live question, so the thinking state, the caching, the queue and the
// error card cannot drift apart between the three callers.
async function runLive(q, ctx, box, above, below){
  above = above || ""; below = below || "";
  box.innerHTML = above + THINKING + below;
  let card;
  try {
    card = renderLive(await askLive(q, ctx), q);
  } catch(e) {
    queueQuestion(q);
    card = liveError(e, q);
  }
  box.innerHTML = above + card + below;
  window.scrollTo(0,0);
  return box.querySelector(".ans.live");
}

function queueQuestion(q){
  if(prof.queued.some(x=>x.q === q)) return;
  prof.queued.push({q, at: new Date().toISOString().slice(0,10)});
  save(); renderSettings();
}

// ── rendering ─────────────────────────────────────────────────────────────
const esc = s => (s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const para = s => esc(s).split("\\n\\n").map(p=>"<p>"+p.replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>")+"</p>").join("");

function renderEntry(e){
  const lvl = prof.learner.defaultLevel;
  let h = '<div class="ans"><h3>'+esc(e.title)+'</h3>';
  h += '<div class="lvlbar">'+LEVELS.map(l=>'<button data-lvl="'+l+'"'+(l===lvl?' class="on"':'')+'>'+LEVEL_LABEL[l]+'</button>').join("")+'</div>';
  h += '<div class="lvlbody">'+para(e.levels[lvl] || e.levels.plain)+'</div>';
  if(TTS) h += '<button class="speak">▶ Listen</button>';

  for(const a of (e.analogies||[])){
    h += '<div class="lbl">Analogy</div>'+para(a.text);
    h += '<div class="breaks"><strong>Where it breaks:</strong> '+esc(a.breaks)+'</div>';
  }
  if(e.meaning){
    h += '<details class="more"><summary>What it means</summary>'+para(e.meaning)+'</details>';
  }
  for(const mid of (e.misconceptions||[])){
    const m = P.misconceptions[mid]; if(!m) continue;
    h += '<div class="lbl">Common trap</div><p><em>'+esc(m.claim)+'</em></p><p>'+esc(m.correction)+'</p>';
  }
  const nx = (e.edges&&e.edges.next)||[];
  if(nx.length){
    h += '<div class="lbl">Does that land? Where to go next</div><div class="chips">';
    h += nx.map(n=>'<button class="chip" data-go="'+esc(n.target)+'" data-q="'+esc(n.q)+'">'+esc(n.q)+'</button>').join("");
    h += '</div>';
  }
  if((e.sources||[]).length){
    const secs = [...new Set(e.sources.map(s=>s.replace("book:","").split(".")[0]))]
      .map(id=>byId[id]).filter(Boolean).map(s=>"§"+s.numeral);
    if(secs.length) h += '<div class="src">In the book: '+secs.join(", ")+'</div>';
  }
  h += '</div>';
  return h;
}

// A follow-up may point straight at a misconception — the twin paradox is the case that
// matters, since "why is the traveller the younger one" is the first thing anyone asks.
function renderMisconception(id){
  const m = P.misconceptions[id]; if(!m) return "";
  return '<div class="ans"><h3>The common trap</h3>'
    + '<p><em>'+esc(m.claim)+'</em></p>'
    + '<div class="lbl">What is actually true</div>'+para(m.correction)
    + '<div class="lbl">Test it yourself</div>'+para(m.surface)+'</div>';
}

function renderSectionAnswer(s){
  const first = s.blocks.find(b=>b.t);
  let h = '<div class="ans"><h3>§'+esc(s.numeral||"")+' &middot; '+esc(s.title)+'</h3>';
  h += '<p class="dim">From the book itself — no explainer written for this section yet.</p>';
  if(first) h += '<p style="font-family:var(--serif)">'+esc(first.t.slice(0,420))+(first.t.length>420?"…":"")+'</p>';
  h += '<div class="chips"><button class="chip" data-read="'+s.id+'">Read §'+esc(s.numeral||"")+' in full</button></div></div>';
  return h;
}

// The live flag is false while the reader is still typing — this runs on every keystroke, and firing
// a request per keystroke would empty a free tier in a sentence. Asking live is always the
// result of a deliberate act: Enter, or the button on the card below.
function answer(q, live){
  const box = document.getElementById("answers");
  const hits = search(q);
  const weak = tooWeak(hits, q);
  const written = hits.map(h => h.kind==="entry" ? renderEntry(h.item) : renderSectionAnswer(h.item)).join("");

  // Already asked this once — the saved answer is as good offline as on, so it comes first and
  // costs nothing.
  const cached = liveGet(q, null);
  if(cached && (weak || liveMode() === "always")){
    box.innerHTML = renderLive(cached, q) + written;
    box.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  if(live && canLive() && (weak || liveMode() === "always")){
    runLive(q, {}, box, "", written);
    return;
  }
  if(!weak){
    box.innerHTML = written;
    box.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  box.innerHTML = missCard(q) + written;
}

// The honest state: nothing written covers this. What it offers depends on what is actually
// available — an unreachable button is worse than no button.
function missCard(q){
  const has = !!endpoint(), on = liveMode() !== "off";
  let h = '<div class="miss"><strong>I don\\u2019t have a written answer for that one.</strong>';
  if(has && on && navigator.onLine){
    h += '<p style="margin:.6rem 0 0">The live tutor can take it — free models, no cost.</p>'
       + '<div class="chips" style="margin-top:.7rem"><button class="chip go" data-live="'+esc(q)+'">Ask the tutor</button></div>';
  } else if(has && on){
    h += '<p style="margin:.6rem 0 0">No signal. Saved it — it will be waiting under Settings when you are back online.</p>';
    queueQuestion(q);
  } else if(has){
    h += '<p style="margin:.6rem 0 0">The live tutor is switched off in Settings.</p>';
  } else {
    h += '<p style="margin:.6rem 0 0">Set the live tutor\\u2019s address in Settings and it can answer questions the pack does not cover.</p>';
  }
  h += '<p style="margin:.6rem 0 0" class="dim">Or try naming a concept directly (&ldquo;simultaneity&rdquo;, &ldquo;the ether&rdquo;), or tap a line while reading.</p></div>';
  return h;
}

// ── anchoring pasted text to the book ─────────────────────────────────────
// The whole point of the screen feature. Given text copied off a screenshot, find where in
// the book it came from. Word-shingle overlap rather than exact matching, because OCR and
// hyphenated line breaks mangle a few characters and an exact search would return nothing.
const deHyphen = s => s.replace(/(\\w)-\\s*\\n\\s*(\\w)/g,"$1$2").replace(/\\s+/g," ");
const shingles = (s,n=3) => {
  const w = norm(deHyphen(s));
  const out = new Set();
  for(let i=0;i+n<=w.length;i++) out.add(w.slice(i,i+n).join(" "));
  return out;
};

const PARA_INDEX = [];
for(const s of C.sections){
  let n = 0;
  for(const b of s.blocks){
    if(!b.t) continue;
    n++;
    PARA_INDEX.push({ sec: s, idx: n, text: b.t, sh: shingles(b.t) });
  }
}

function anchor(pasted){
  const q = shingles(pasted);
  if(q.size === 0) return null;
  let best = null;
  for(const p of PARA_INDEX){
    let hit = 0;
    for(const g of q) if(p.sh.has(g)) hit++;
    if(hit === 0) continue;
    // Normalise by the shorter side so a short quote from a long paragraph still scores high.
    const score = hit / Math.min(q.size, p.sh.size || 1);
    if(!best || score > best.score) best = { p, score, hit };
  }
  return best && best.score > 0.18 ? best : null;
}

function explainPasted(text){
  const out = document.getElementById("screenout");
  if(!text.trim()){ out.innerHTML = ""; return; }

  const a = anchor(text);
  let h = "";

  if(a){
    const s = a.p.sec;
    if(s.number){ prof.readingPosition = s.number; save(); renderPos(); }
    const conf = a.score > 0.5 ? "" : ' <span class="dim">(best match — check it looks right)</span>';
    h += '<div class="ans"><h3>You\\u2019re in '+(s.numeral?"§"+esc(s.numeral):"")+' &middot; '+esc(s.title)+'</h3>'
       + '<p class="dim">Paragraph '+a.idx+conf+'</p>'
       + '<div class="chips"><button class="chip" data-read="'+s.id+'">Open this section</button></div></div>';

    // Anything the pack has anchored to this section, plus anything the pasted words retrieve.
    const here = P.entries.filter(e => (e.anchors||[]).includes(s.id));
    const extra = search(text, 2).filter(x => x.kind==="entry" && !here.includes(x.item)).map(x=>x.item);
    const show = [...here, ...extra].slice(0,3);
    if(show.length) h += show.map(renderEntry).join("");
    else h += '<div class="miss"><strong>No explainer written for this section yet.</strong>'
            + '<p style="margin:.6rem 0 0">The book text is there — open the section above. Ask a question in the Ask tab and I\\u2019ll do my best from the concepts I do have.</p></div>';
  } else {
    h += '<div class="miss"><strong>I couldn\\u2019t place that in the book.</strong>'
       + '<p style="margin:.6rem 0 0">It may be from a different edition, or the copy picked up too little text. Try selecting a longer stretch — a full sentence or two works best.</p></div>';
    const hits = search(text, 2);
    if(hits.length) h += '<p class="dim" style="margin-top:1rem">Closest things I know about:</p>'
       + hits.map(x => x.kind==="entry" ? renderEntry(x.item) : renderSectionAnswer(x.item)).join("");
  }
  out.innerHTML = h;
  out.scrollIntoView({behavior:"smooth",block:"start"});
}

// ── speech ────────────────────────────────────────────────────────────────
// Two different capabilities with different offline stories, so they are tested separately.
// Synthesis runs on-device and works on a plane. Recognition on iOS goes to Apple's servers,
// so the mic is hidden when there is no signal rather than failing silently on tap.
const TTS = window.speechSynthesis || null;
const SR  = window.SpeechRecognition || window.webkitSpeechRecognition || null;

function speak(text){
  if(!TTS) return;
  TTS.cancel();
  // Strip markdown emphasis so it isn't read out as "asterisk".
  const u = new SpeechSynthesisUtterance(String(text).replace(/\\*\\*/g,"").slice(0, 4000));
  u.rate = 1.0; u.pitch = 1.0; u.lang = "en-GB";
  TTS.speak(u);
}
function stopSpeaking(){ if(TTS) TTS.cancel(); }

// Read out the plain-English answer only — not the analogy, the caveats and the follow-ups,
// which are for reading rather than listening.
function speakAnswer(el){
  if(!el) return;
  const title = el.querySelector("h3");
  const body = el.querySelector(".lvlbody");
  // Arc cards and section cards have no level body — read their paragraphs instead, rather
  // than having the Listen button do nothing at all.
  const text = body ? body.textContent
    : [...el.querySelectorAll(":scope > p")].map(p=>p.textContent).join(" ");
  if(text.trim()) speak((title ? title.textContent + ". " : "") + text);
}

let recog = null, listening = false;
function micAvailable(){ return !!SR && navigator.onLine; }

function startListening(onText){
  if(!SR) return;
  if(listening){ try{ recog.stop(); }catch{} return; }
  recog = new SR();
  recog.lang = "en-GB"; recog.interimResults = true; recog.continuous = false;
  const heard = document.getElementById("askbar").classList.contains("up")
    ? document.getElementById("heard") : document.getElementById("heard2");
  const btn = document.getElementById("askbar").classList.contains("up")
    ? document.getElementById("askmic") : document.getElementById("qmic");
  listening = true; btn.classList.add("rec"); heard.textContent = "Listening…";
  recog.onresult = e => {
    let txt = "";
    for(const r of e.results) txt += r[0].transcript;
    heard.textContent = txt;
    if(e.results[e.results.length-1].isFinal){ onText(txt.trim()); }
  };
  recog.onerror = e => {
    heard.textContent = e.error === "not-allowed"
      ? "Microphone blocked — allow it in Safari settings."
      : "Didn't catch that. Try again, or type it.";
  };
  recog.onend = () => { listening = false; btn.classList.remove("rec"); };
  try { recog.start(); } catch { listening = false; btn.classList.remove("rec"); }
}

// ── the ask bar ───────────────────────────────────────────────────────────
// Splitting on sentence enders, keeping the punctuation. Abbreviations like "e.g." will
// occasionally split early; a wrong split costs a slightly short quote, which is harmless,
// whereas merging sentences would defeat the point of line-level selection.
function sentences(t){
  const m = String(t).match(/[^.!?]+[.!?]+["'”’)\\]]*\\s*/g);
  return (m && m.length) ? m.map(s=>s.trim()).filter(Boolean) : [String(t)];
}

let selectedLine = "", selectedSection = null, currentSection = null;

function openAsk(line, section){
  selectedLine = line; selectedSection = section;
  document.getElementById("askquote").textContent = line;
  document.getElementById("heard").textContent = "";
  document.getElementById("askinput").value = "";
  const mic = document.getElementById("askmic");
  mic.disabled = !micAvailable();
  mic.title = micAvailable() ? "Ask out loud" : "Voice needs a connection";
  document.getElementById("askbar").classList.add("up");
}
function closeAsk(){
  document.getElementById("askbar").classList.remove("up");
  document.querySelectorAll(".sent.sel").forEach(s=>s.classList.remove("sel"));
  selectedLine = "";
  stopSpeaking();
}

// Answer about the selected line: the section anchor is exact, so retrieval barely matters.
function answerLine(question){
  const q = (question || "").trim();
  const box = document.getElementById("answers");
  const s = selectedSection;
  // Held onto now, because closeAsk() below clears the selection — and the line is the whole
  // reason this path exists, so losing it would silently turn a question about one sentence
  // into a question about nothing.
  const line = selectedLine;
  let picks = [];

  if(q){
    picks = search(q, 2).map(x => x.item);
  }
  if(s){
    const here = P.entries.filter(e => (e.anchors||[]).includes(s.id) && !picks.includes(e));
    picks = [...picks, ...here];
  }
  if(!picks.length) picks = search(line, 2).map(x => x.item);

  let h = '<div class="ans"><h3>'+(s && s.numeral ? "§"+esc(s.numeral)+" · " : "")+esc(s ? s.title : "This line")+'</h3>'
        + '<p class="quote" style="font-family:var(--serif);color:var(--soft);border-left:2px solid var(--accent);padding-left:.6rem;margin:.4rem 0 0">'+esc(line)+'</p>'
        + (q ? '<div class="lbl">You asked</div><p>'+esc(q)+'</p>' : '') + '</div>';

  const header = h;
  h += picks.slice(0,3).map(p => p.levels ? renderEntry(p) : renderSectionAnswer(p)).join("");

  // Asking about a specific line is the strongest case for going live: the section text goes
  // with the question, so even a small model is answering about the page rather than from
  // memory. A typed question here is always deliberate, so it may fire straight away.
  // "always" means every typed question goes live, here as much as in the Ask box. Explain with
  // no question typed stays offline either way — that is a lookup, not a conversation.
  const weak = q ? (tooWeak(search(q, 2), q) || liveMode() === "always") : !picks.length;
  const cached = q ? liveGet(q, s ? s.id : null) : null;
  if(cached && weak) h = header + renderLive(cached, q) + h.slice(header.length);
  else if(!picks.length && !q) h += '<div class="miss"><strong>Nothing written for that line yet.</strong>'
     + '<p style="margin:.6rem 0 0">Try asking about it in your own words.</p></div>';

  closeAsk();
  showView("ask");
  window.scrollTo(0,0);

  if(!cached && q && weak && canLive()){
    // The quoted line stays above while it thinks — it is the context for the answer.
    const spoke = lastWasVoice; lastWasVoice = false;
    runLive(q, {line: line, section: s}, box, header, h.slice(header.length))
      .then(el => { if(spoke && el) speakAnswer(el); });
    return;
  }
  if(q && weak && !canLive()) h += missCard(q);

  box.innerHTML = h;
  // Read it out automatically when the question was spoken — you asked with your voice, so
  // you probably are not looking at the screen.
  if(q && lastWasVoice){ const first = box.querySelector(".ans + .ans") || box.querySelector(".ans"); if(first) speakAnswer(first); }
  lastWasVoice = false;
}
let lastWasVoice = false;

// ── the book ──────────────────────────────────────────────────────────────
function renderTOC(){
  const parts = {I:"Part I — The Special Theory",II:"Part II — The General Theory",III:"Part III — The Universe as a Whole",APPENDIX:"Appendices"};
  let h = "", cur = null;
  for(const s of C.sections){
    if(s.part !== cur){ cur = s.part; h += '<div class="part-head">'+(parts[cur]||"")+'</div><div class="sec-list">'; }
    else if(!h.endsWith('</button>')) {}
    h += '<button data-read="'+s.id+'"><span class="sec-num">'+(s.numeral?"§"+s.numeral:"—")+'</span><span>'+esc(s.title.replace(/^APPENDIX [IV]+ /,""))+'</span></button>';
    const next = C.sections[C.sections.indexOf(s)+1];
    if(!next || next.part !== cur) h += '</div>';
  }
  document.getElementById("toc").innerHTML = h;
}

function openSection(id){
  const s = byId[id]; if(!s) return;
  currentSection = s; closeAsk();
  if(s.number){ prof.readingPosition = s.number; save(); renderPos(); }
  let h = '<button class="ghost" id="backidx" style="margin-bottom:1.1rem">← All sections</button>';
  h += '<h2>'+(s.numeral?"§"+esc(s.numeral)+" · ":"")+esc(s.title)+'</h2>';
  h += '<p class="tap-hint">Tap any sentence to ask about it.</p><div class="read">';
  for(const b of s.blocks){
    if(b.t){
      // Sentence-level, not paragraph-level: the question is almost always about one line.
      h += '<p class="para">' + sentences(b.t).map(x =>
        '<span class="sent" tabindex="0">'+esc(x)+'</span>').join(" ") + '</p>';
    }
    else h += '<div class="eq">[ equation — '+esc(b.eq)+' ]</div>';
  }
  h += '</div>';
  document.getElementById("read-index").style.display="none";
  const rs = document.getElementById("read-section");
  rs.style.display="block"; rs.innerHTML = h; window.scrollTo(0,0);
}

function showView(v){
  document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="v-"+v));
  if(v !== "read") closeAsk();
}

// An arc is a thread running through several sections, so it is worth being able to walk it:
// the chips are the sections in the order the argument is actually made.
function renderArcs(){
  document.getElementById("arcs").innerHTML = (P.arcs||[]).map(a => {
    const steps = (a.sections||[]).map(n=>C.sections.find(x=>x.number===n)).filter(Boolean);
    return '<div class="ans arc" id="'+esc(a.id)+'"><h3>'+esc(a.title)+'</h3>'+para(a.meaning)
      + (a.why ? '<div class="lbl">Why it matters</div>'+para(a.why) : '')
      + (TTS ? '<button class="speak">▶ Listen</button>' : '')
      + (steps.length ? '<div class="lbl">Follow it through the book</div><div class="chips">'
          + steps.map(s=>'<button class="chip" data-read="'+s.id+'">§'+esc(s.numeral)+' &middot; '
              + esc(s.title.length>38 ? s.title.slice(0,38)+"…" : s.title)+'</button>').join("")
          + '</div>' : '')
      + '</div>';
  }).join("");
}
function highlightArc(id){
  const card = document.getElementById(id); if(!card) return;
  document.querySelectorAll(".ans.hi").forEach(c=>c.classList.remove("hi"));
  card.classList.add("hi");
  card.scrollIntoView({block:"start", behavior:"smooth"});
}

function renderPos(){
  document.getElementById("pospill").textContent = "§"+prof.readingPosition;
  const pv = document.getElementById("posval"); if(pv) pv.textContent = "§"+prof.readingPosition;
}
const LIVE_MODES = [["gaps","gaps only"],["always","always"],["off","off"]];
function renderSettings(){
  document.getElementById("themeset").innerHTML = ["auto","light","dark"].map(t =>
    '<button class="pill'+((prof.theme||"auto")===t?' on':'')+'" data-settheme="'+t+'">'+t+'</button>').join("");
  document.getElementById("liveset").innerHTML = LIVE_MODES.map(([v,label]) =>
    '<button class="pill'+(liveMode()===v?' on':'')+'" data-setlive="'+v+'">'+label+'</button>').join("");
  const ep = document.getElementById("endpoint");
  if(document.activeElement !== ep) ep.value = prof.endpoint || "";
  document.getElementById("livesum").textContent =
    !endpoint()            ? "No address set — offline answers only"
    : liveMode() === "off" ? "Switched off"
    : navigator.onLine     ? (liveMode()==="always" ? "On for every question" : "Fills gaps in the written answers")
    : "Waiting for a signal";
  const n = Object.keys(live).length;
  document.getElementById("cachecount").textContent = n ? n + " kept on this device" : "None yet";
  document.getElementById("lvlset").innerHTML = LEVELS.map(l =>
    '<button data-setlvl="'+l+'"'+(l===prof.learner.defaultLevel?' class="on"':'')+'>'+LEVEL_LABEL[l]+'</button>').join("");
  const ns = prof.learner.needsSupport;
  document.getElementById("profsum").textContent = ns.length ? "Going slower on: "+ns.join(", ") : "Nothing flagged yet";
  document.getElementById("qcount").textContent = prof.queued.length ? prof.queued.length+" waiting for a signal" : "None";
  renderPos();
}

// ── events ────────────────────────────────────────────────────────────────
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-v],[data-read],[data-go],[data-lvl],[data-setlvl],[data-settheme],[data-setlive],[data-live],[data-ask],#backidx,#resetprof,#clearcache,#runqueued");
  if(!t) return;

  if(t.dataset.v){
    document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b===t));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("on",v.id==="v-"+t.dataset.v));
    if(t.dataset.v !== "read") closeAsk();
    window.scrollTo(0,0); return;
  }
  if(t.id==="backidx"){
    document.getElementById("read-section").style.display="none";
    document.getElementById("read-index").style.display="block"; window.scrollTo(0,0); return;
  }
  if(t.dataset.read){
    document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v==="read"));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("on",v.id==="v-read"));
    openSection(t.dataset.read); return;
  }
  if(t.dataset.go){
    const go0 = t.dataset.go;
    // Several follow-ups point at a whole arc rather than a single explainer — those live in
    // Ideas, so send the reader there instead of running a text search that half-matches.
    if(go0.startsWith("arc.")){ showView("ideas"); highlightArc(go0); return; }
    const target = byId[go0];
    document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v==="ask"));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("on",v.id==="v-ask"));
    document.getElementById("qbox").value = t.dataset.q || "";
    const go = t.dataset.go;
    if(go.startsWith("misconception.")) document.getElementById("answers").innerHTML = renderMisconception(go.slice(14));
    else if(target && target.levels) document.getElementById("answers").innerHTML = renderEntry(target);
    else if(target && target.blocks) document.getElementById("answers").innerHTML = renderSectionAnswer(target);
    else answer(t.dataset.q||"");
    window.scrollTo(0,0); return;
  }
  if(t.dataset.lvl){
    // Asking for a simpler level is an explicit signal — the only kind we act on.
    if(t.dataset.lvl==="plain") noteSupport("this topic");
    const ans = t.closest(".ans");
    ans.querySelectorAll("[data-lvl]").forEach(b=>b.classList.toggle("on",b===t));
    const title = ans.querySelector("h3").textContent;
    const e = P.entries.find(x=>x.title===title);
    if(e) ans.querySelector(".lvlbody").innerHTML = para(e.levels[t.dataset.lvl] || e.levels.plain);
    return;
  }
  if(t.dataset.setlvl){ prof.learner.defaultLevel = t.dataset.setlvl; save(); renderSettings(); return; }
  if(t.dataset.settheme){ prof.theme = t.dataset.settheme; save(); applyTheme(); renderSettings(); return; }
  if(t.id==="resetprof"){ prof.learner.needsSupport=[]; prof.queued=[]; save(); renderSettings(); return; }
  if(t.dataset.setlive){ prof.live = t.dataset.setlive; save(); renderSettings(); return; }
  if(t.id==="clearcache"){ live = {}; liveSave(); renderSettings(); return; }

  // "Ask the tutor" on the miss card, and the follow-up question a live answer ends with.
  if(t.dataset.live || t.dataset.ask){
    const q = t.dataset.live || t.dataset.ask;
    showView("ask");
    document.getElementById("qbox").value = q;
    if(canLive()) runLive(q, {}, document.getElementById("answers"), "", "");
    else answer(q, false);
    return;
  }

  // Everything asked with no signal, run in one go now that there is one.
  if(t.id==="runqueued"){
    if(!canLive() || !prof.queued.length) return;
    const pending = prof.queued.slice(0, 5);
    showView("ask");
    const box = document.getElementById("answers");
    box.innerHTML = THINKING;
    (async () => {
      let out = "";
      for(const item of pending){
        try { out += renderLive(await askLive(item.q, {}), item.q);
              prof.queued = prof.queued.filter(x=>x.q !== item.q); save(); }
        catch(e){ out += liveError(e, item.q); break; }   // stop on the first refusal, don't hammer
        box.innerHTML = out + (prof.queued.length ? THINKING : "");
      }
      box.innerHTML = out || '<div class="miss">Nothing waiting.</div>';
      renderSettings();
    })();
    return;
  }
});

// Tapping a sentence is the strongest signal there is — we know the exact line and the exact
// section, so retrieval barely has to work.
function selectSentence(sp){
  document.querySelectorAll(".sent.sel").forEach(s=>s.classList.remove("sel"));
  sp.classList.add("sel");
  openAsk(sp.textContent.trim(), currentSection);
}
document.addEventListener("click", ev => {
  const sp = ev.target.closest(".sent"); if(!sp) return;
  selectSentence(sp);
});
// On the Mac the book is read with a keyboard in reach, so tab-and-Enter has to work too.
document.addEventListener("keydown", ev => {
  if(ev.key !== "Enter" && ev.key !== " ") return;
  const sp = ev.target.closest && ev.target.closest(".sent"); if(!sp) return;
  ev.preventDefault(); selectSentence(sp);
});

document.getElementById("askclose").addEventListener("click", closeAsk);
document.getElementById("askexplain").addEventListener("click", () => answerLine(""));
document.getElementById("askinput").addEventListener("keydown", e => {
  if(e.key === "Enter") answerLine(e.target.value);
});
document.getElementById("askmic").addEventListener("click", () => {
  if(!micAvailable()) return;
  startListening(text => { lastWasVoice = true; answerLine(text); });
});

// Read-aloud on any answer. Synthesis is on-device, so this keeps working with no signal.
document.addEventListener("click", ev => {
  const b = ev.target.closest(".speak"); if(!b) return;
  const card = b.closest(".ans");
  if(b.classList.contains("on")){ stopSpeaking(); b.classList.remove("on"); b.textContent = "▶ Listen"; return; }
  document.querySelectorAll(".speak.on").forEach(x=>{x.classList.remove("on");x.textContent="▶ Listen";});
  b.classList.add("on"); b.textContent = "■ Stop";
  speakAnswer(card);
  if(TTS) setTimeout(function poll(){
    if(!TTS.speaking){ b.classList.remove("on"); b.textContent = "▶ Listen"; }
    else setTimeout(poll, 400);
  }, 500);
});

document.getElementById("pastego").addEventListener("click", () =>
  explainPasted(document.getElementById("paste").value));
document.getElementById("pasteclear").addEventListener("click", () => {
  document.getElementById("paste").value = "";
  document.getElementById("screenout").innerHTML = "";
});
// Pasting is the whole interaction — don't make them hunt for a button afterwards.
document.getElementById("paste").addEventListener("paste", () =>
  setTimeout(() => explainPasted(document.getElementById("paste").value), 60));

document.getElementById("qmic").addEventListener("click", () => {
  if(!micAvailable()){ document.getElementById("qmic").title = "Voice needs a connection"; return; }
  selectedLine = ""; selectedSection = null;
  startListening(text => { document.getElementById("qbox").value = text; answer(text); });
});

let timer;
document.getElementById("qbox").addEventListener("input", e => {
  clearTimeout(timer); const v = e.target.value;
  if(v.trim().length < 3){ document.getElementById("answers").innerHTML=""; return; }
  timer = setTimeout(()=>answer(v, false), 220);   // typing never spends a free-tier call
});
// Enter is the deliberate act, so this is where the live tutor is allowed to run.
document.getElementById("qbox").addEventListener("keydown", e => {
  if(e.key !== "Enter") return;
  clearTimeout(timer); e.target.blur();
  const v = e.target.value.trim();
  if(v.length >= 3) answer(v, true);
});

// The endpoint is typed in once and remembered. Trailing whitespace off a paste is the most
// likely way to get a URL that looks right and does not work.
document.getElementById("endpoint").addEventListener("input", e => {
  prof.endpoint = e.target.value.trim(); save();
});
document.getElementById("endpoint").addEventListener("change", () => renderSettings());

function net(){
  const p = document.getElementById("netpill");
  p.textContent = navigator.onLine ? "online" : "offline";
  p.classList.toggle("on", navigator.onLine);
  // Dictation goes to Apple's servers, so it comes and goes with the signal. Show that on the
  // button rather than letting a tap do nothing.
  for(const id of ["qmic","askmic"]){
    const m = document.getElementById(id); if(!m) continue;
    m.disabled = !micAvailable();
    m.title = micAvailable() ? "Ask out loud" : "Dictation needs a connection — type instead";
  }
}
addEventListener("online",net); addEventListener("offline",net);

// ── theme ─────────────────────────────────────────────────────────────────
// Three states, not two. "Auto" follows the device — but when this page is opened inside a
// host that stamps its own theme, auto follows the host rather than the phone, which is why
// an explicit choice has to be available.
const THEMES = ["auto","light","dark"];
function applyTheme(){
  const t = prof.theme || "auto";
  const r = document.documentElement;
  if(t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
  const b = document.getElementById("themebtn");
  b.textContent = t;
  b.classList.toggle("on", t !== "auto");
  const m = document.querySelector('meta[name="theme-color"]');
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme:dark)").matches);
  if(m) m.setAttribute("content", dark ? "#0A0E15" : "#F6F8FB");
}
document.getElementById("themebtn").addEventListener("click", () => {
  prof.theme = THEMES[(THEMES.indexOf(prof.theme || "auto") + 1) % 3];
  save(); applyTheme(); renderSettings();
});
applyTheme();

renderTOC(); renderArcs(); renderSettings(); net();
if("serviceWorker" in navigator) addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
</script>
</body>
</html>`;

const out = join(root, 'web');
mkdirSync(out, { recursive: true });
// Baked in at build time so the app works the moment it is installed, and overridable in
// Settings. It is an address, not a credential — there is no key here and there never can be.
//
// The two copies need different addresses. Served from its own domain the endpoint is a
// sibling, so a relative path is right and survives the project being renamed. Served from the
// artifact host the page is a guest on someone else's origin, so it needs the absolute URL.
const ENDPOINT = process.env.TUTOR_ENDPOINT || '/api/ask';
const ARTIFACT_ENDPOINT = process.env.TUTOR_ARTIFACT_ENDPOINT || '';
const fill = ep => HTML.replace('__DATA__', DATA)
  .replace('__ENDPOINT__', JSON.stringify(ep))
  .replaceAll('__ICON__', ICON);
const page = fill(ENDPOINT);
writeFileSync(join(out, 'index.html'), page);

// The artifact host supplies its own doctype/html/head/body, so ours have to come out or the
// page ends up nested inside itself. Everything else — styles, markup, script — is unchanged,
// and the runtime block above puts the icon and the web-app meta tags back into the real head.
// Generated here rather than by hand so the hosted copy cannot drift from the file.
const artifact = fill(ARTIFACT_ENDPOINT)
  .replace(/^[\s\S]*?<title>/, '<title>')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')      // /manifest.json does not resolve there
  .replace(/<link rel="(apple-touch-icon|icon)"[^>]*>\s*/g, '');
writeFileSync(join(out, 'artifact.html'), artifact);

writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  name: 'Relativity — Einstein tutor',
  short_name: 'Relativity',
  start_url: '/',
  display: 'standalone',
  background_color: '#0A0E15',
  theme_color: '#0A0E15',
  icons: [{ src: 'data:image/png;base64,' + ICON, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));

// Cache-first on the shell: on a plane the network is not slow, it is absent, and waiting for
// a fetch to time out before serving the cache would make the app feel broken.
writeFileSync(join(out, 'sw.js'), `const C='relativity-v1';const A=['/','/index.html','/manifest.json'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(A)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{
const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res}).catch(()=>caches.match('/index.html'))))});`);

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('built  web/index.html  ' + kb(HTML.length + DATA.length));
console.log('       ' + slimCorpus.sections.length + ' sections · ' + pack.entries.length + ' pack entries · ' + pack.arcs.length + ' arcs');
