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
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

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

await browser.close();
console.log('\n' + (failed ? 'FAILED  ' : 'passed  ') + passed + ' checks' +
            (failed ? ', ' + failed + ' failures' : '') + '\n');
process.exit(failed ? 1 : 0);
