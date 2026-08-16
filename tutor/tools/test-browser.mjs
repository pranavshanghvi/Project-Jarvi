// Drives the built page in a real browser at iPhone size, because the interactions that
// matter — tap a line, ask about it, hear it read back — cannot be checked by reading source.
//
// Playwright is not a dependency of this repo; point NODE_PATH at wherever it is installed:
//   NODE_PATH=/path/to/node_modules node tutor/tools/test-browser.mjs

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

let failed = 0, passed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ok    ' + name); return; }
  failed++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : ''));
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },       // iPhone 14/15
  deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// Script errors only. A failed request is not one — the exhaustion path below deliberately
// serves a 503, and the app is supposed to handle that rather than avoid it.
page.on('console', m => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource/.test(m.text())) return;
  errors.push(m.text());
});

await page.goto(pathToFileURL(join(WEB, 'index.html')).href);
await page.waitForLoadState('domcontentloaded');

console.log('\nboot');
ok('page loads with no script errors', errors.length === 0, errors.join(' | '));
ok('the book index rendered', await page.locator('#toc button').count() === 37,
   String(await page.locator('#toc button').count()));
ok('the app claimed the apple-touch-icon',
   await page.locator('head link[rel="apple-touch-icon"]').count() > 0);
ok('the icon is inline, not a broken path',
   (await page.getAttribute('head link[rel="apple-touch-icon"]', 'href') || '')
     .startsWith('data:image/png;base64,'));

console.log('\nreading');
await page.locator('#toc button').nth(8).click();       // §IX, on simultaneity
await page.waitForSelector('#read-section .sent');
const sents = page.locator('#read-section .sent');
ok('the section split into tappable sentences', await sents.count() > 10,
   String(await sents.count()));
const heading = await page.locator('#read-section h2').textContent();
ok('the section heading shows', /§/.test(heading), heading);

console.log('\ntap a line, ask about it');
const line = (await sents.nth(3).textContent()).trim();
await sents.nth(3).click();
ok('the ask bar rises', await page.locator('#askbar.up').count() === 1);
ok('it quotes the exact line you tapped',
   (await page.locator('#askquote').textContent()).trim() === line);
ok('the tapped line is highlighted in the text', await page.locator('.sent.sel').count() === 1);

await page.locator('#askexplain').click();
await page.waitForSelector('#v-ask.on');
ok('Explain jumps to the answer', await page.locator('#v-ask.on').count() === 1);
ok('the answer repeats the line back so you know what it answered',
   (await page.locator('#answers').textContent()).includes(line.slice(0, 40)));
ok('it answered with at least one explainer', await page.locator('#answers .ans').count() >= 2,
   String(await page.locator('#answers .ans').count()));
ok('the ask bar got out of the way', await page.locator('#askbar.up').count() === 0);

console.log('\nasking about the line in your own words');
await page.locator('nav.tabs button[data-v="read"]').click();
await sents.nth(2).click();
await page.locator('#askinput').fill('what does simultaneous mean here');
await page.locator('#askinput').press('Enter');
await page.waitForSelector('#v-ask.on');
ok('a typed question about the line is echoed',
   (await page.locator('#answers').textContent()).includes('what does simultaneous mean here'));
ok('and it still answered', await page.locator('#answers .ans').count() >= 2);

console.log('\nvoice');
ok('speech synthesis is available in this browser',
   await page.evaluate(() => !!window.speechSynthesis));
ok('answers offer a Listen button', await page.locator('#answers .speak').count() >= 1);
await page.locator('#answers .speak').first().click();
ok('Listen switches to Stop',
   (await page.locator('#answers .speak').first().textContent()).includes('Stop'));
await page.locator('#answers .speak').first().click();
ok('and back again',
   (await page.locator('#answers .speak').first().textContent()).includes('Listen'));

// Dictation is a network service. On a plane the button must say so rather than doing nothing.
await context.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
ok('offline is shown in the header',
   (await page.locator('#netpill').textContent()).trim() === 'offline');
ok('the mic disables itself with no signal',
   await page.locator('#qmic').isDisabled());
ok('and explains why',
   /needs a connection/.test(await page.getAttribute('#qmic', 'title') || ''));
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
ok('online again', (await page.locator('#netpill').textContent()).trim() === 'online');

console.log('\nfollow-ups');
await page.locator('nav.tabs button[data-v="ask"]').click();
await page.locator('#qbox').fill('what is simultaneity');
await page.waitForSelector('#answers .chip', { timeout: 4000 });
ok('an answer offers somewhere to go next', await page.locator('#answers .chip').count() >= 1);

const arcChip = page.locator('#answers .chip[data-go^="arc."]').first();
if (await arcChip.count()) {
  await arcChip.click();
  await page.waitForSelector('#v-ideas.on');
  ok('an arc follow-up lands on that arc, not a search',
     await page.locator('#v-ideas.on .ans.hi').count() === 1);
} else {
  // Not every answer has an arc chip; find one from Ideas instead so the path is still covered.
  await page.locator('nav.tabs button[data-v="ideas"]').click();
  ok('arcs render', await page.locator('#arcs .ans').count() === 3);
}
await page.locator('nav.tabs button[data-v="ideas"]').click();
ok('arcs are walkable through the book',
   await page.locator('#arcs .chip[data-read]').count() >= 3,
   String(await page.locator('#arcs .chip[data-read]').count()));
await page.locator('#arcs .chip[data-read]').first().click();
await page.waitForSelector('#read-section .sent');
ok('an arc chip opens that section in the reader',
   await page.locator('#v-read.on').count() === 1);

// The questions this reader actually asked, and the entry each one has to reach. Raw keyword
// counts got "does motion affect ageing" wrong — it answered with classical mechanics — so
// ranking is pinned here rather than left to drift.
console.log('\nretrieval');
{
  const cases = [
    ['does motion affect ageing',        'Does travelling fast affect your body?'],
    ['if we go fast do we live longer',  'Does travelling fast affect your body?'],
    ['what is classical mechanics',      'Classical mechanics'],
    ['what is euclidean geometry',       'Euclidean geometry'],
    ['how do we know any of this is real', 'How do we know any of this is real?'],
    ['can I travel in time',             'Does this mean time travel is possible?'],
    ['what is the ether',                'The ether, and why light was a problem'],
    // The reported bug: the index holds "gaussian", the question says "gauss", and the book
    // has a chapter named after him. It used to reach nothing and show the generic miss card.
    ['who is Gauss',                     '§XXV · Gaussian Co-ordinates'],
  ];
  await page.locator('nav.tabs button[data-v="ask"]').click();
  // Answers are gated on how far you have read, so ask as someone near the end of the book.
  await page.evaluate(() => { prof.readingPosition = 32; save(); });
  for (const [q, want] of cases) {
    // Clearing empties the answers, so the next wait cannot be satisfied by the previous
    // question's results still sitting on screen.
    await page.locator('#qbox').fill('');
    await page.waitForFunction(() => document.querySelectorAll('#answers .ans').length === 0);
    await page.locator('#qbox').fill(q);
    await page.waitForFunction(() => document.querySelectorAll('#answers .ans').length > 0);
    const titles = await page.locator('#answers .ans h3').allTextContents();
    ok('"' + q + '" → ' + want, titles[0] === want, 'got: ' + titles.join(' / '));
  }
  await page.evaluate(() => { prof.readingPosition = 1; save(); });
}

// The endpoint is stubbed at the network layer so the client's real fetch, real caching and
// real error handling all run — only the free provider on the far side is faked.
console.log('\nthe live tutor');
{
  const ENDPOINT = 'https://tutor.test/api/ask';
  let calls = 0, lastBody = null, mode = 'ok';
  await context.route(ENDPOINT, async route => {
    calls++;
    lastBody = JSON.parse(route.request().postData() || '{}');
    if (mode === 'exhausted') return route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: 'no_free_provider',
        message: 'The free models are all out for now.',
        declined: ['groq: 429, quota exceeded', 'mistral: 429'] }),
    });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        answer: 'Gauss worked out how to describe a curved surface from inside it.',
        analogy: 'Like mapping a hilly field with only a tape measure.',
        breaks: 'A field has an outside to stand in. Spacetime does not.',
        means: 'Curvature is measurable without ever leaving.',
        next: 'What would you measure to tell a flat field from a curved one?',
        source: 'live', model: null, askedAt: '2026-08-16T00:00:00.000Z',
      }),
    });
  });

  await page.locator('nav.tabs button[data-v="set"]').click();
  ok('the tutor is set to answer anything by default, not just gaps',
     await page.evaluate(() => liveMode()) === 'always');
  // This page is on file://, as it is when opened from Files on a Mac. A relative address is
  // meaningless there and must not be attempted — set explicitly rather than relying on what
  // this particular build happened to bake in.
  await page.evaluate(() => { prof.endpoint = '/api/ask'; save(); renderSettings(); });
  ok('a relative address is inert when there is no server to be relative to',
     await page.evaluate(() => usableEndpoint() === ''));
  ok('and settings says so rather than claiming it is on',
     /full https/.test(await page.locator('#livesum').textContent()),
     await page.locator('#livesum').textContent());
  await page.locator('#endpoint').fill(ENDPOINT);
  await page.locator('#endpoint').blur();
  ok('setting an address turns the live tutor on',
     /anything/.test(await page.locator('#livesum').textContent()),
     await page.locator('#livesum').textContent());

  // Typing must never spend a call — a free tier does not survive one request per keystroke.
  await page.locator('nav.tabs button[data-v="ask"]').click();
  const before = calls;
  await page.locator('#qbox').fill('what is a tensor bundle anyway');
  await page.waitForTimeout(600);
  ok('typing does not call the endpoint', calls === before, calls - before + ' calls');
  ok('but it offers to ask', await page.locator('#answers [data-live]').count() === 1);

  await page.locator('#answers [data-live]').click();
  await page.waitForSelector('#answers .ans.live');
  ok('the button asks the live tutor', calls === before + 1);
  ok('the answer renders', /curved surface from inside/
     .test(await page.locator('#answers .ans.live').textContent()));
  ok('so does the analogy and its limits',
     /tape measure/.test(await page.locator('#answers .ans.live').textContent()) &&
     /has an outside to stand in/.test(await page.locator('#answers .ans.live').textContent()));
  ok('it ends with a question to follow',
     await page.locator('#answers .ans.live .chip[data-ask]').count() === 1);
  ok('it is labelled as live, not as a written answer',
     /Live tutor/.test(await page.locator('#answers .ans.live').textContent()));
  ok('a live answer can be read aloud too',
     await page.locator('#answers .ans.live .speak').count() === 1);

  // Enter is the deliberate act, so it may fire; and the whole point of caching is the plane.
  const afterFirst = calls;
  await page.locator('#qbox').fill('');
  await page.locator('#qbox').fill('what is a tensor bundle anyway');
  await page.locator('#qbox').press('Enter');
  await page.waitForSelector('#answers .ans.live');
  ok('asking the same question again is served from the device', calls === afterFirst,
     calls - afterFirst + ' extra calls');

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.locator('#qbox').fill('');
  await page.locator('#qbox').fill('what is a tensor bundle anyway');
  await page.locator('#qbox').press('Enter');
  await page.waitForSelector('#answers .ans.live');
  ok('and it still answers with no signal at all', calls === afterFirst);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // The complaint this replaces: these are answerable, the book has a chapter next to each of
  // them, and a gate that fires only on "nothing matched" would decide they were already
  // answered — handing back a passage that never mentions the person asked about.
  for (const q of ['who was Lorentz',
                   'why did Einstein name that chapter after him',
                   'who is Gauss']) {
    const before2 = calls;
    await page.locator('nav.tabs button[data-v="ask"]').click();
    await page.locator('#qbox').fill('');
    await page.locator('#qbox').fill(q);
    await page.locator('#qbox').press('Enter');
    await page.waitForSelector('#answers .ans.live');
    ok('"' + q + '" reaches the tutor', calls === before2 + 1, calls - before2 + ' calls');
  }
  // And the written material is still there, below rather than instead.
  ok('written explainers still appear under a live answer',
     /Also written for you/.test(await page.locator('#answers').textContent()));

  // "only the gaps" stays available for someone who wants to conserve a free tier.
  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('[data-setlive="gaps"]').click();
  await page.locator('nav.tabs button[data-v="read"]').click();
  if (await page.locator('#backidx').isVisible()) await page.locator('#backidx').click();
  await page.locator('#toc button').nth(25).click();          // §XXV, Gaussian co-ordinates
  await page.waitForSelector('#read-section .sent');
  await page.locator('#read-section .sent').nth(1).click();
  const covered = calls;
  await page.locator('#askinput').fill('what are Gaussian co-ordinates');
  await page.locator('#askinput').press('Enter');
  await page.waitForSelector('#v-ask.on');
  ok('in "only the gaps" a covered question stays offline', calls === covered,
     calls - covered + ' calls');

  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('[data-setlive="always"]').click();
  await page.locator('nav.tabs button[data-v="read"]').click();
  await page.locator('#read-section .sent').nth(1).click();
  const beforeLine = calls;
  await page.locator('#askinput').fill('why does he need co-ordinates at all here');
  await page.locator('#askinput').press('Enter');
  await page.waitForSelector('#answers .ans.live');
  ok('a question about a line goes live', calls === beforeLine + 1);
  ok('and carries the section text, so the model is not answering from memory',
     !!(lastBody.section && lastBody.section.text && lastBody.section.text.length > 200),
     JSON.stringify(lastBody.section && lastBody.section.title));
  ok('and the exact line that was tapped', (lastBody.line || '').length > 10,
     JSON.stringify(lastBody.line));
  ok('and the depth the reader chose', !!lastBody.level);
  ok('the quoted line stays above the answer',
     (await page.locator('#answers').textContent()).includes('why does he need co-ordinates'));
  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('[data-setlive="gaps"]').click();

  // Exhaustion is the expected end state of a free tier, so it has to read as a state.
  mode = 'exhausted';
  await page.locator('nav.tabs button[data-v="ask"]').click();
  await page.locator('#qbox').fill('');
  await page.locator('#qbox').fill('what did Riemann contribute to all this');
  await page.locator('#qbox').press('Enter');
  await page.waitForSelector('#answers .miss');
  const missText = await page.locator('#answers .miss').first().textContent();
  ok('exhaustion says so plainly', /free models are all out/i.test(missText), missText.slice(0, 120));
  ok('and does not pretend it will retry forever', /try again later/i.test(missText));
  ok('the question is saved rather than lost',
     await page.evaluate(() => prof.queued.some(x => /Riemann/.test(x.q))));
  ok('why each provider declined is available but not shouted',
     await page.locator('#answers .miss details').count() === 1);

  // A wrong address is the likeliest thing to go wrong on first use, and it is indistinguishable
  // from an exhausted rotation unless the app says which one it is.
  // Aborted at the network layer rather than pointed at a real bad host — an unroutable name
  // would sit in DNS until the client's own 40s timeout, which is the behaviour under test but
  // not something to wait for on every run.
  await context.route('https://wrong.invalid/**', route => route.abort('addressunreachable'));
  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('#endpoint').fill('https://wrong.invalid/api/ask');
  await page.locator('#endpoint').blur();
  // "always", so this exercises the unreachable path itself rather than depending on the
  // question happening to be one the written pack cannot answer.
  await page.locator('[data-setlive="always"]').click();
  await page.locator('nav.tabs button[data-v="ask"]').click();
  await page.locator('#qbox').fill('');
  await page.locator('#qbox').fill('what is a Cartan connection');
  await page.locator('#qbox').press('Enter');
  await page.waitForSelector('#answers .miss');
  ok('an unreachable address names itself so it can be fixed',
     /wrong\.invalid/.test(await page.locator('#answers .miss').first().textContent()));
  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('#endpoint').fill(ENDPOINT);
  await page.locator('#endpoint').blur();

  // Switching it off must actually stop it.
  mode = 'ok';
  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('[data-setlive="off"]').click();
  const afterOff = calls;
  await page.locator('nav.tabs button[data-v="ask"]').click();
  await page.locator('#qbox').fill('');
  await page.locator('#qbox').fill('what is a Killing vector');
  await page.locator('#qbox').press('Enter');
  await page.waitForTimeout(400);
  ok('switching the live tutor off stops it calling out', calls === afterOff);
  ok('and the app says why rather than failing silently',
     /switched off/i.test(await page.locator('#answers .miss').first().textContent()));
  await page.locator('nav.tabs button[data-v="set"]').click();
  await page.locator('[data-setlive="always"]').click();

  ok('saved answers are counted in settings',
     /kept on this device/.test(await page.locator('#cachecount').textContent()));
  await page.locator('#clearcache').click();
  ok('and can be cleared', /None yet/.test(await page.locator('#cachecount').textContent()));
  await context.unroute(ENDPOINT);
  await page.evaluate(() => { prof.endpoint = ''; prof.queued = []; save(); });
}

console.log('\nlevels and theme');
await page.locator('nav.tabs button[data-v="ask"]').click();
await page.locator('#qbox').fill('what is classical mechanics');
await page.waitForSelector('#answers .lvlbar button');
const bodyBefore = await page.locator('#answers .lvlbody').first().textContent();
await page.locator('#answers .lvlbar button').nth(2).click();
ok('switching level rewrites the explanation',
   (await page.locator('#answers .lvlbody').first().textContent()) !== bodyBefore);

await page.locator('nav.tabs button[data-v="set"]').click();
await page.locator('[data-settheme="light"]').click();
const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.locator('[data-settheme="dark"]').click();
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok('light and dark are actually different', lightBg !== darkBg, lightBg + ' vs ' + darkBg);
ok('dark is dark', /rgb\((\d+), (\d+), (\d+)\)/.test(darkBg) &&
   darkBg.match(/\d+/g).slice(0, 3).every(n => +n < 60), darkBg);

console.log('\nlayout');
await page.locator('nav.tabs button[data-v="read"]').click();
// The reader is still inside a section from the arc walk — go back to the index first.
if (await page.locator('#backidx').isVisible()) await page.locator('#backidx').click();
await page.locator('#toc button').first().click();
await page.waitForSelector('#read-section .sent');
await page.locator('#read-section .sent').nth(1).click();
// The bar slides up over 180ms — measure where it lands, not where it is mid-flight.
await page.waitForFunction(() => {
  const t = getComputedStyle(document.getElementById('askbar')).transform;
  return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
});
const box = await page.locator('#askbar').boundingBox();
const tabs = await page.locator('nav.tabs').boundingBox();
ok('the ask bar sits clear above the tab bar',
   box && tabs && box.y + box.height <= tabs.y + 1,
   box && tabs ? `askbar ends ${Math.round(box.y + box.height)}, tabs start ${Math.round(tabs.y)}` : 'no box');
ok('the tab bar is lifted off the very bottom',
   tabs && (tabs.y + tabs.height) >= 844 && tabs.height >= 60,
   tabs ? 'height ' + Math.round(tabs.height) : 'no box');
const scrollsSideways = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
ok('nothing overflows the phone width', !scrollsSideways);

await page.screenshot({ path: join(WEB, 'shot-reader.png') });
await page.locator('#askclose').click();
await page.locator('nav.tabs button[data-v="ask"]').click();
await page.locator('#qbox').fill('does motion affect ageing');
await page.waitForSelector('#answers .ans');
await page.screenshot({ path: join(WEB, 'shot-answer.png'), fullPage: false });

ok('still no script errors after all that', errors.length === 0, errors.slice(0, 3).join(' | '));

// The hosted copy is what actually gets added to the home screen, and it is a different file.
// Wrap it the way the host does and check it comes up — and that it takes the icon back from
// whatever the host had already put in head.
console.log('\nhosted copy');
{
  const { readFileSync } = await import('node:fs');
  const body = readFileSync(join(WEB, 'artifact.html'), 'utf8');
  const p2 = await context.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  await p2.setContent(
    '<!doctype html><html><head><link rel="apple-touch-icon" href="/host-icon.png">' +
    '<title>Host</title></head><body>' + body + '</body></html>');
  ok('the hosted copy boots', await p2.locator('#toc button').count() === 37);
  ok('no doctype/html/head/body left to nest', !/<(!doctype|html|body)[\s>]/i.test(body));
  const icons = await p2.$$eval('head link[rel~="apple-touch-icon"]', ls => ls.map(l => l.href));
  ok('exactly one apple-touch-icon in head', icons.length === 1, JSON.stringify(icons));
  ok("and it is ours, not the host's",
     (icons[0] || '').startsWith('data:image/png;base64,'), (icons[0] || '').slice(0, 40));
  ok('the tab title is the app, not the host',
     (await p2.title()) === 'Relativity', await p2.title());
  await p2.locator('#toc button').nth(8).click();
  await p2.waitForSelector('#read-section .sent');
  await p2.locator('#read-section .sent').nth(2).click();
  ok('tap-a-line works in the hosted copy too', await p2.locator('#askbar.up').count() === 1);
  ok('hosted copy runs clean', errs2.length === 0, errs2.join(' | '));
}

// ── the flight test ───────────────────────────────────────────────────────
// The requirement this whole app exists for is a plane, and "it is one self-contained file" is
// not the same as "the phone will open it with no signal". Served over HTTP the service worker
// caches the shell; from a host that cannot serve /sw.js there is no worker and therefore no
// cache. Both cases are checked here rather than left to be discovered at 35,000 feet.
console.log('\nofflineable install');
{
  const { createServer } = await import('node:http');
  const { readFileSync, existsSync } = await import('node:fs');
  const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript',
                  '.png': 'image/png' };
  const server = createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const file = join(WEB, p.replace(/^\/+/, ''));
    if (!existsSync(file) || !file.startsWith(WEB)) { res.writeHead(404); return res.end('no'); }
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'service-worker-allowed': '/',
      'cache-control': 'no-cache',
    });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));

  await p.goto(origin + '/');
  ok('the app serves over HTTP', await p.locator('#toc button').count() === 37);

  const reg = await p.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const r = await navigator.serviceWorker.ready.catch(() => null);
    return r ? (r.active ? 'active' : 'registered') : 'none';
  });
  ok('the service worker installs and activates', reg === 'active', reg);

  // Everything the shell needs must be in the cache before the signal goes, not fetched later.
  const cached = await p.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    return (await c.keys()).map(r => new URL(r.url).pathname).sort();
  });
  ok('the page itself is cached', cached.includes('/index.html') || cached.includes('/'));
  ok('the manifest is cached', cached.includes('/manifest.json'), JSON.stringify(cached));

  // The actual test: kill the network and cold-load the app the way a relaunch does.
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e)));
  const resp = await p2.goto(origin + '/').catch(e => ({ err: String(e) }));
  ok('a cold launch with no network still loads', !resp.err, resp.err || '');
  ok('and the whole book is there', await p2.locator('#toc button').count() === 37);
  await p2.locator('#toc button').nth(8).click();
  await p2.waitForSelector('#read-section .sent');
  ok('sections open with no signal', await p2.locator('#read-section .sent').count() > 10);
  await p2.locator('#read-section .sent').nth(2).click();
  await p2.locator('#askexplain').click();
  await p2.waitForSelector('#v-ask.on');
  ok('and questions still get answered', await p2.locator('#answers .ans').count() >= 1);
  ok('no errors offline', errs2.length === 0, errs2.join(' | '));
  await ctx.setOffline(false);

  // The artifact host cannot serve our /sw.js. Confirm what that actually costs, rather than
  // assuming: the app must still work, but there is no cache behind it.
  // serviceWorkers:'block' is the condition itself, not an approximation of it: a page that
  // cannot get a worker registered. Routing /sw.js to a 404 does not work here — worker script
  // fetches do not pass through page routes.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 },
                                          serviceWorkers: 'block' });
  const p3 = await ctx2.newPage();
  await p3.goto(origin + '/');
  ok('the app still boots where /sw.js is missing', await p3.locator('#toc button').count() === 37);
  const names = await p3.evaluate(async () => await caches.keys());
  const regs = await p3.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).length);
  ok('no service worker is registered', regs === 0, 'registrations: ' + regs);
  ok('so nothing is cached and a cold offline launch would fail',
     names.length === 0, 'caches: ' + JSON.stringify(names));
  await ctx2.close();

  await ctx.close();
  await new Promise(r => server.close(r));
}

await browser.close();
console.log('\n' + (failed ? 'FAILED  ' : 'passed  ') + passed + ' checks' +
            (failed ? ', ' + failed + ' failures' : '') + '\n');
process.exit(failed ? 1 : 0);
