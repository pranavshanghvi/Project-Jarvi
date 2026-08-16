// Checks the built page before it goes anywhere near a phone.
//
// There is no browser here, so these are structural tests: does the script parse, does every
// element the script reaches for actually exist, does every follow-up chip point at something
// real, does the sentence splitter lose text. Those are the failures that would show up as a
// dead button on a plane with no way to fix it.
//
// Run:  node tutor/tools/test-app.mjs

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const html = readFileSync(join(WEB, 'index.html'), 'utf8');

let failed = 0, passed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; return; }
  failed++;
  console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
};
const group = n => console.log('\n' + n);

// ── the page itself ───────────────────────────────────────────────────────
group('page');
ok('no build placeholders left', !/__[A-Z]+__/.test(html),
   (html.match(/__[A-Z]+__/g) || []).join(', '));
ok('single self-contained file — no external fetches',
   !/<(script|link|img)[^>]+(src|href)=["']https?:/i.test(html));
ok('viewport-fit=cover for the safe-area insets', /viewport-fit=cover/.test(html));
ok('apple-mobile-web-app-capable', /apple-mobile-web-app-capable/.test(html));

// ── the script parses ─────────────────────────────────────────────────────
group('script');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok('has an inline script', scripts.length > 0);
scripts.forEach((s, i) => {
  try { new vm.Script(s); ok('script #' + i + ' parses', true); }
  catch (e) { ok('script #' + i + ' parses', false, e.message); }
});
const js = scripts.join('\n');

// ── every element the script reaches for exists ───────────────────────────
// A typo here is invisible until the button is tapped, which is exactly the wrong time.
group('wiring');
const declared = new Set([...html.matchAll(/\bid=["']([A-Za-z0-9_-]+)["']/g)].map(m => m[1]));
const wanted = new Set([...js.matchAll(/getElementById\(["']([A-Za-z0-9_-]+)["']\)/g)].map(m => m[1]));
for (const id of wanted) ok('#' + id + ' exists', declared.has(id));

// Same for the classes the handlers delegate on: if renderEntry stops emitting .speak, the
// listen button quietly disappears rather than erroring.
for (const cls of ['sent', 'speak', 'ans', 'lvlbody', 'chip', 'askbar'])
  ok('.' + cls + ' is emitted somewhere', new RegExp('["\'\\s.]' + cls + '["\'\\s]').test(html));

// ── the new reading interaction ───────────────────────────────────────────
group('tap a line, ask about it');
ok('reader renders sentence spans', /class="sent"/.test(js));
ok('tapping a sentence opens the ask bar', /closest\(["']\.sent["']\)/.test(js) && /openAsk\(/.test(js));
ok('ask bar knows which section you are in', /currentSection\s*=\s*s\b/.test(js));
ok('changing section closes a stale ask bar', /currentSection = s; closeAsk\(\)/.test(js));
ok('Explain works with no typed question', /askexplain[\s\S]{0,80}answerLine\(""\)/.test(js));

group('voice');
ok('speech synthesis is feature-detected', /window\.speechSynthesis \|\| null/.test(js));
ok('recognition is feature-detected incl. webkit prefix',
   /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/.test(js));
// The asymmetry that matters on a plane: synthesis is on-device, recognition is not.
ok('mic requires BOTH an API and a connection',
   /function micAvailable\(\)\{ return !!SR && navigator\.onLine; \}/.test(js));
ok('listen button only offered when synthesis exists', /if\(TTS\) h \+= '<button class="speak"/.test(js));
ok('mic state refreshes when the connection changes', /qmic[\s\S]{0,200}micAvailable\(\)/.test(js));
ok('recognition failure tells you what to do',
   /Microphone blocked/.test(js) && /Didn't catch that|Didn\\?'t catch that/.test(js));
ok('speaking a question reads the answer back', /lastWasVoice/.test(js));

// ── the sentence splitter must not lose text ──────────────────────────────
group('sentence splitter');
{
  const src = js.match(/function sentences\(t\)\{[\s\S]*?\n\}/);
  ok('sentences() found in the bundle', !!src);
  if (src) {
    const sentences = vm.runInNewContext(src[0] + '\nsentences');
    const norm = s => s.replace(/\s+/g, ' ').trim();
    const corpus = JSON.parse(readFileSync(join(WEB, '..', 'data', 'corpus.json'), 'utf8'));
    let checked = 0, lost = null, empty = null;
    for (const s of corpus.sections) for (const b of s.blocks) {
      if (!b.t) continue;
      const parts = sentences(b.t);
      if (!parts.length || parts.some(p => !p.trim())) empty ||= s.id;
      if (norm(parts.join(' ')) !== norm(b.t)) lost ||= s.id + ': ' + b.t.slice(0, 90);
      checked++;
    }
    ok('every paragraph splits without losing a character (' + checked + ' paragraphs)', !lost, lost || '');
    ok('no empty sentence spans', !empty, empty || '');
    ok('a one-clause paragraph still yields one sentence', sentences('No full stop here').length === 1);
    ok('quotes stay attached to their sentence',
       sentences('He said "stop." Then he left.').length === 2);
  }
}

// ── the content ───────────────────────────────────────────────────────────
group('content');
const dataMatch = js.match(/const DATA = (\{[\s\S]*?\});\nconst C = DATA/);
ok('DATA is present and delimited', !!dataMatch);
if (dataMatch) {
  let DATA;
  try { DATA = JSON.parse(dataMatch[1]); ok('DATA is valid JSON', true); }
  catch (e) { ok('DATA is valid JSON', false, e.message); }
  if (DATA) {
    const { corpus, pack } = DATA;
    ok('all 37 sections shipped', corpus.sections.length === 37, 'got ' + corpus.sections.length);
    ok('every section has readable text', corpus.sections.every(s => s.blocks.some(b => b.t)));
    ok('pack has entries', pack.entries.length >= 45, 'got ' + pack.entries.length);

    const secIds = new Set(corpus.sections.map(s => s.id));
    const entryIds = new Set(pack.entries.map(e => e.id));
    const misIds = new Set(Object.keys(pack.misconceptions || {}));

    // A follow-up chip that goes nowhere is worse than no chip: it reads as the tutor
    // promising an answer it does not have.
    const dead = [];
    for (const e of pack.entries) {
      for (const n of (e.edges?.next || [])) {
        const t = n.target;
        const live = entryIds.has(t) || secIds.has(t) || t.startsWith('arc.') ||
          (t.startsWith('misconception.') && misIds.has(t.slice(14)));
        if (!live) dead.push(e.id + ' → ' + t);
      }
      for (const m of (e.misconceptions || [])) if (!misIds.has(m)) dead.push(e.id + ' ✗ ' + m);
      for (const a of (e.anchors || [])) if (!secIds.has(a)) dead.push(e.id + ' ⚓ ' + a);
    }
    ok('every follow-up, misconception and anchor resolves', !dead.length, dead.join('\n        '));

    ok('every entry has a plain-English level', pack.entries.every(e => e.levels?.plain));
    ok('every analogy states where it breaks',
       pack.entries.every(e => (e.analogies || []).every(a => a.text && a.breaks)),
       pack.entries.filter(e => (e.analogies || []).some(a => !a.breaks)).map(e => e.id).join(', '));
    // The pedagogy the user asked for: never end flat.
    const noFollowup = pack.entries.filter(e => !(e.edges?.next || []).length).map(e => e.id);
    ok('every entry ends with somewhere to go next', !noFollowup.length, noFollowup.join(', '));
    const secNums = new Set(corpus.sections.map(s => s.number).filter(Boolean));
    ok('every arc names sections that exist',
       (pack.arcs || []).every(a => (a.sections || []).length &&
                                    a.sections.every(n => secNums.has(n))),
       (pack.arcs || []).filter(a => !(a.sections || []).every(n => secNums.has(n)))
         .map(a => a.id).join(', '));
    // A chip pointing at an arc has to land somewhere, so arcs are addressable too.
    const arcIds = new Set((pack.arcs || []).map(a => a.id));
    const deadArcs = pack.entries.flatMap(e => (e.edges?.next || [])
      .filter(n => n.target.startsWith('arc.') && !arcIds.has(n.target))
      .map(n => e.id + ' → ' + n.target));
    ok('every arc follow-up resolves', !deadArcs.length, deadArcs.join(', '));
    ok('arc chips are routed to the Ideas view', /go0\.startsWith\("arc\."\)/.test(js));
  }
}

// ── styling ───────────────────────────────────────────────────────────────
group('theme');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
// 3-, 4-, 6- and 8-digit are all legal; anything else is a hex split across a line break,
// which is how --soft once shipped as "#38435\n5" and silently disabled a colour.
const badHex = css.match(/#(?:[0-9a-fA-F]{1,2}|[0-9a-fA-F]{5}|[0-9a-fA-F]{7})(?![0-9a-fA-F])/g);
ok('no truncated hex colours', !badHex, (badHex || []).join(' '));
const rootTokens = new Set([...(css.match(/^:root\{[\s\S]*?\}/m) || [''])[0]
  .matchAll(/--([a-zA-Z0-9]+):/g)].map(m => m[1]));
const usedTokens = new Set([...css.matchAll(/var\(--([a-zA-Z0-9]+)/g)].map(m => m[1]));
for (const t of usedTokens) ok('--' + t + ' has a light-mode value', rootTokens.has(t));
ok('dark mode is guarded so the toggle can override it',
   /:root:not\(\[data-theme="light"\]\)/.test(css));
ok('explicit dark theme exists', /:root\[data-theme="dark"\]/.test(css));
ok('tab bar clears the home indicator',
   /padding-bottom:max\(env\(safe-area-inset-bottom,0px\), 26px\)/.test(css));
ok('ask bar sits above the tab bar', /\.askbar\{[\s\S]*?bottom:calc\(max\(env/.test(css));

// ── install ───────────────────────────────────────────────────────────────
group('install');
ok('icon is an inline data URI, not a path',
   /apple-touch-icon[\s\S]{0,200}data:image\/png;base64,/.test(html) ||
   /"apple-touch-icon"[\s\S]{0,300}data:image\/png;base64,/.test(js));
ok('icon links are claimed at runtime from inside a host page',
   /document\.head\.appendChild/.test(js) && /apple-touch-icon/.test(js));
for (const f of ['manifest.json', 'sw.js', 'icon.png'])
  ok(f + ' written', existsSync(join(WEB, f)));
{
  const man = JSON.parse(readFileSync(join(WEB, 'manifest.json'), 'utf8'));
  ok('manifest is standalone', man.display === 'standalone');
  ok('manifest icon is inlined too', /^data:image\/png/.test(man.icons?.[0]?.src || ''));
}

console.log('\n' + (failed ? 'FAILED  ' : 'passed  ') + passed + ' checks' +
            (failed ? ', ' + failed + ' failures' : '') + '\n');
process.exit(failed ? 1 : 0);
