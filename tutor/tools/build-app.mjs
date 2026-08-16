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
.read p.para{font-family:var(--serif);font-size:1.06rem;line-height:1.62;cursor:pointer;
  border-radius:3px;padding:.25rem .4rem;margin:0 -.4rem .9rem;transition:background .12s}
.read p.para:hover,.read p.para:focus-visible{background:var(--wash)}
.read .eq{font-family:var(--mono);font-size:.8rem;color:var(--muted);padding:.5rem .6rem;
  background:var(--surface2);border:1px solid var(--line2);border-radius:3px;margin:0 0 .9rem}
.tap-hint{font-size:.78rem;color:var(--muted);font-family:var(--mono);margin-bottom:1.1rem}
input.q{width:100%;padding:.8rem .9rem;font-size:1rem;font-family:var(--sans);
  background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:3px}
input.q:focus{outline:none;border-color:var(--accent)}
.ans{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:1.15rem 1.15rem .3rem;margin:1.2rem 0}
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
    <input class="q" id="qbox" placeholder="e.g. what is classical mechanics?" autocomplete="off" enterkeyhint="search">
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
      <div class="setrow"><span>Questions saved for later<br><span class="dim" id="qcount"></span></span></div>
    </div>
    <p class="dim" style="margin-top:2rem;font-size:.78rem">
      Text: Project Gutenberg #30155, public domain in the US. Appendix V is still in copyright and is not included.
    </p>
  </section>

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
const LEVELS = ["plain","intuition","careful"];
const LEVEL_LABEL = {plain:"Plain",intuition:"Intuition",careful:"Careful"};

// ── profile ───────────────────────────────────────────────────────────────
const KEY = "jarvi.relativity.progress";
const defaults = {learner:{defaultLevel:"plain",needsSupport:[]},readingPosition:1,concepts:{},queued:[],theme:"auto"};
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
const SECIDX = C.sections.map(s => {
  const f = {};
  for(const t of norm(s.title)) if(!STOP.has(t)) f[t]=(f[t]||0)+5;
  s.blocks.filter(b=>b.t).slice(0,4).forEach(b=>{ for(const t of norm(b.t)) if(!STOP.has(t)) f[t]=(f[t]||0)+0.4; });
  return {s,f};
});

function search(q, limit=3){
  const terms = norm(q).filter(t=>!STOP.has(t));
  if(!terms.length) return [];
  const score = f => terms.reduce((n,t)=>n+(f[t]||0),0);
  const hits = [];
  for(const {e,f} of IDX){ const sc = score(f); if(sc>0) hits.push({kind:"entry",item:e,score:sc}); }
  for(const {s,f} of SECIDX){ const sc = score(f)*0.7; if(sc>0) hits.push({kind:"section",item:s,score:sc}); }
  hits.sort((a,b)=>b.score-a.score);
  // Spoiler gate: never lead with something from beyond where the reader has reached.
  const ok = hits.filter(h => (h.kind==="entry" ? (h.item.firstNeededAt||0) : (h.item.number||0)) <= prof.readingPosition + 2);
  return (ok.length ? ok : hits).slice(0, limit);
}

// ── rendering ─────────────────────────────────────────────────────────────
const esc = s => (s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const para = s => esc(s).split("\\n\\n").map(p=>"<p>"+p.replace(/\\*\\*(.+?)\\*\\*/g,"<strong>$1</strong>")+"</p>").join("");

function renderEntry(e){
  const lvl = prof.learner.defaultLevel;
  let h = '<div class="ans"><h3>'+esc(e.title)+'</h3>';
  h += '<div class="lvlbar">'+LEVELS.map(l=>'<button data-lvl="'+l+'"'+(l===lvl?' class="on"':'')+'>'+LEVEL_LABEL[l]+'</button>').join("")+'</div>';
  h += '<div class="lvlbody">'+para(e.levels[lvl] || e.levels.plain)+'</div>';

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

function answer(q){
  const box = document.getElementById("answers");
  const hits = search(q);
  if(!hits.length){
    prof.queued.push({q, at: new Date().toISOString().slice(0,10)}); save(); renderSettings();
    box.innerHTML = '<div class="miss"><strong>I don\\u2019t have a written answer for that one.</strong>'
      + '<p style="margin:.6rem 0 0">Saved it — when you next have a signal, the online tutor will answer it and it gets added here permanently.</p>'
      + '<p style="margin:.6rem 0 0" class="dim">Try naming a concept directly (&ldquo;simultaneity&rdquo;, &ldquo;the ether&rdquo;), or tap a paragraph while reading.</p></div>';
    return;
  }
  box.innerHTML = hits.map(h => h.kind==="entry" ? renderEntry(h.item) : renderSectionAnswer(h.item)).join("");
  box.scrollIntoView({behavior:"smooth",block:"start"});
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
  if(s.number){ prof.readingPosition = s.number; save(); renderPos(); }
  let h = '<button class="ghost" id="backidx" style="margin-bottom:1.1rem">← All sections</button>';
  h += '<h2>'+(s.numeral?"§"+esc(s.numeral)+" · ":"")+esc(s.title)+'</h2>';
  h += '<p class="tap-hint">Tap a paragraph to ask about it.</p><div class="read">';
  for(const b of s.blocks){
    if(b.t) h += '<p class="para" tabindex="0" data-ask="'+esc(b.t.slice(0,140))+'">'+esc(b.t)+'</p>';
    else h += '<div class="eq">[ equation — '+esc(b.eq)+' ]</div>';
  }
  h += '</div>';
  document.getElementById("read-index").style.display="none";
  const rs = document.getElementById("read-section");
  rs.style.display="block"; rs.innerHTML = h; window.scrollTo(0,0);
}

function renderArcs(){
  document.getElementById("arcs").innerHTML = (P.arcs||[]).map(a =>
    '<div class="ans"><h3>'+esc(a.title)+'</h3>'+para(a.meaning)
    + (a.why ? '<div class="lbl">Why it matters</div>'+para(a.why) : '')
    + '</div>').join("");
}

function renderPos(){
  document.getElementById("pospill").textContent = "§"+prof.readingPosition;
  const pv = document.getElementById("posval"); if(pv) pv.textContent = "§"+prof.readingPosition;
}
function renderSettings(){
  document.getElementById("themeset").innerHTML = ["auto","light","dark"].map(t =>
    '<button class="pill'+((prof.theme||"auto")===t?' on':'')+'" data-settheme="'+t+'">'+t+'</button>').join("");
  document.getElementById("lvlset").innerHTML = LEVELS.map(l =>
    '<button data-setlvl="'+l+'"'+(l===prof.learner.defaultLevel?' class="on"':'')+'>'+LEVEL_LABEL[l]+'</button>').join("");
  const ns = prof.learner.needsSupport;
  document.getElementById("profsum").textContent = ns.length ? "Going slower on: "+ns.join(", ") : "Nothing flagged yet";
  document.getElementById("qcount").textContent = prof.queued.length ? prof.queued.length+" waiting for a signal" : "None";
  renderPos();
}

// ── events ────────────────────────────────────────────────────────────────
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-v],[data-read],[data-go],[data-lvl],[data-setlvl],[data-settheme],#backidx,#resetprof");
  if(!t) return;

  if(t.dataset.v){
    document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b===t));
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("on",v.id==="v-"+t.dataset.v));
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
    const target = byId[t.dataset.go];
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
});

// Tapping a paragraph is the strongest signal we get — the anchor is exact, so retrieval
// barely has to work.
document.addEventListener("click", ev => {
  const p = ev.target.closest("p.para"); if(!p) return;
  document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v==="ask"));
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("on",v.id==="v-ask"));
  document.getElementById("qbox").value = "";
  answer(p.dataset.ask);
  window.scrollTo(0,0);
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

let timer;
document.getElementById("qbox").addEventListener("input", e => {
  clearTimeout(timer); const v = e.target.value;
  if(v.trim().length < 3){ document.getElementById("answers").innerHTML=""; return; }
  timer = setTimeout(()=>answer(v), 220);
});

function net(){
  const p = document.getElementById("netpill");
  p.textContent = navigator.onLine ? "online" : "offline";
  p.classList.toggle("on", navigator.onLine);
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
writeFileSync(join(out, 'index.html'), HTML.replace('__DATA__', DATA).replaceAll('__ICON__', ICON));

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
