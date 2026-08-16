// Ingest the Project Gutenberg #30155 epub (Lawson translation, 1924 Methuen revised
// edition) into a paragraph-addressable corpus.
//
// #30155 and not #5001: #30155 is the edition Pranav is actually reading, and the tutor
// anchors answers to specific paragraphs, so the text has to be the text on his screen.
//
// Two things about this epub drive the shape of the parser:
//
//   1. A Part divider shares its file with the first section of that Part — file 2 holds
//      both "PART I: THE SPECIAL THEORY OF RELATIVITY" and "I. PHYSICAL MEANING OF
//      GEOMETRICAL PROPOSITIONS". Taking only the first heading per file silently drops
//      §I, §XVIII, §XXX and Appendix I: the opening section of every Part.
//
//   2. Equations are JPGs, not text, and they sit BETWEEN paragraphs rather than inside
//      them, with useless alt text ("image006"). So blocks have to be collected in
//      document order — a paragraph list with the equations stripped out reads as
//      "...is given by" followed by nothing, which is worse than useless to a reader
//      asking about that equation.
//
// Run:  node tutor/tools/ingest.mjs <extracted-epub-dir> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROMAN = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
  XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18,
  XIX: 19, XX: 20, XXI: 21, XXII: 22, XXIII: 23, XXIV: 24, XXV: 25, XXVI: 26,
  XXVII: 27, XXVIII: 28, XXIX: 29, XXX: 30, XXXI: 31, XXXII: 32,
};

// Gutenberg's ebookmaker wraps everything in boilerplate; these files carry no book text.
const SKIP = /^(wrap|toc|.*-h-0\.|.*-h-38\.)/;
const PART_DIVIDER = /^(PART\s+(I|II|III)\b|APPENDICES$)/i;

const stripTags = (s) => s.replace(/<[^>]+>/g, '');

// Entities that actually occur in this text. Deliberately not a general-purpose decoder:
// a wrong expansion here becomes a wrong quotation in an answer.
function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘').replace(/&rsquo;/g, '’')
    .replace(/&hellip;/g, '…').replace(/&deg;/g, '°')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim();

// The spine is the only reliable reading order — filenames sort lexically, not
// numerically, and the epub's internal ids are opaque.
function spineOrder(dir) {
  const opf = readFileSync(join(dir, 'OEBPS', 'content.opf'), 'utf8');
  const hrefById = {};
  for (const m of opf.matchAll(/<item\b[^>]*id="([^"]+)"[^>]*href="([^"]+)"/g)) hrefById[m[1]] = m[2];
  for (const m of opf.matchAll(/<item\b[^>]*href="([^"]+)"[^>]*id="([^"]+)"/g)) hrefById[m[2]] = m[1];
  const order = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)) {
    const href = hrefById[m[1]];
    if (href && href.endsWith('.xhtml') && !SKIP.test(basename(href))) order.push(href);
  }
  return order;
}

// A heading looks like `<h3><a id="chap04"/>IV.<br/>THE GALILEIAN SYSTEM OF
// CO-ORDINATES</h3>` — number and title separated by a <br/>, so the split has to happen
// before tags are stripped.
function parseHeadings(html) {
  const out = [];
  for (const m of html.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const parts = m[2].split(/<br\s*\/?>/i).map(clean).filter(Boolean);
    const raw = parts.join(' ');
    if (!raw) continue;
    const num = raw.match(/^([IVXL]+)\s*\./);
    out.push({
      number: num ? (ROMAN[num[1]] ?? null) : null,
      numeral: num ? num[1] : null,
      title: num ? (parts.slice(1).join(' ') || clean(raw.replace(/^[IVXL]+\s*\./, ''))) : raw,
      raw,
      end: m.index + m[0].length,
    });
  }
  return out;
}

// Collect paragraphs and equation images in document order, starting after the section's
// own heading so the title isn't re-emitted as body text.
function parseBlocks(html, from = 0) {
  const body = html.slice(from);
  const blocks = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>|<img\b[^>]*src="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[2] !== undefined) {
      blocks.push({ type: 'equation', src: basename(m[2]) });
      continue;
    }
    const inner = m[1];
    // An image inside a <p> is still an equation; emit it in place rather than losing it.
    const inlineImgs = [...inner.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)].map((i) => basename(i[1]));
    const text = clean(inner);
    if (text) blocks.push({ type: 'text', text });
    for (const src of inlineImgs) blocks.push({ type: 'equation', src });
  }
  return blocks;
}

function main() {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) {
    console.error('usage: node ingest.mjs <extracted-epub-dir> <out.json>');
    process.exit(1);
  }

  const sections = [];
  let part = null;

  for (const href of spineOrder(dir)) {
    const html = readFileSync(join(dir, 'OEBPS', href), 'utf8');
    const headings = parseHeadings(html);

    // A Part divider sets the label for what follows and is not itself a section; the
    // real section heading is whatever comes after it in the same file.
    let heading = headings[0];
    if (heading && PART_DIVIDER.test(heading.raw)) {
      const m = heading.raw.match(/^PART\s+(I{1,3})\b/i);
      part = m ? m[1].toUpperCase() : 'APPENDIX';
      heading = headings[1];
    }

    const blocks = parseBlocks(html, heading?.end ?? 0);
    if (!heading && !blocks.length) continue;

    const id = heading?.number != null
      ? `s${String(heading.number).padStart(2, '0')}`
      : `x${sections.length}`;

    let n = 0;
    sections.push({
      id,
      part,
      number: heading?.number ?? null,
      numeral: heading?.numeral ?? null,
      title: heading?.title || '(untitled)',
      source: basename(href),
      blocks: blocks.map((b) => (b.type === 'text'
        ? { id: `${id}.p${++n}`, ...b }
        : { id: `${id}.eq${b.src.replace(/\D+/g, '')}`, ...b })),
    });
  }

  const corpus = {
    edition: 'Project Gutenberg #30155 — Relativity: The Special and General Theory',
    author: 'Albert Einstein',
    translator: 'Robert W. Lawson',
    printing: 'Methuen & Co Ltd, 1924 (revised)',
    note: 'Public domain in the US. Appendix V (added at the 15th reprinting) is still in copyright and absent from this edition.',
    sections,
  };

  writeFileSync(out, JSON.stringify(corpus, null, 2));

  const paras = sections.reduce((n, s) => n + s.blocks.filter((b) => b.type === 'text').length, 0);
  const eqs = sections.reduce((n, s) => n + s.blocks.filter((b) => b.type === 'equation').length, 0);
  const words = sections.reduce((n, s) => n + s.blocks.reduce((m, b) => m + (b.text ? b.text.split(/\s+/).length : 0), 0), 0);
  console.log(`${sections.length} sections · ${paras} paragraphs · ${eqs} equations · ${words.toLocaleString()} words → ${out}`);
  for (const s of sections) {
    const e = s.blocks.filter((b) => b.type === 'equation').length;
    console.log(`  ${(s.numeral || '·').padEnd(6)} ${s.id.padEnd(5)} ${String(s.blocks.filter(b => b.type === 'text').length).padStart(3)}p ${String(e).padStart(2)}eq  ${s.title.slice(0, 58)}`);
  }
}

main();
