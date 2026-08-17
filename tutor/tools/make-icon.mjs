// Generate the home-screen icon as a PNG, with no image libraries.
//
// It has to be a real PNG data URI embedded in the page: iOS ignores SVG for apple-touch-icon,
// and a path like /icon.png does not resolve when the page is opened from Files or served from
// inside a host page. Without one, Safari falls back to the host's favicon.
//
// The image is Einstein, drawn rather than photographed. The obvious choice would be the 1951
// tongue photograph, but that is Arthur Sasse's copyright and the likeness is administered by
// the Hebrew University of Jerusalem. Drawing it is also simply better here: at 60 points on a
// home screen a photograph turns to mud, whereas the hair and the moustache are so distinctive
// that a high-contrast graphic mark of just those two things reads instantly.
//
// Run:  node tutor/tools/make-icon.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 512;
const BG    = [10, 14, 21];      // --bg dark
const FACE  = [66, 78, 98];      // light enough to read as a face, not a hole
const HAIR  = [235, 240, 248];   // near-white; the whole icon hangs off this
const SHADE = [150, 165, 188];   // the far side of the hair, so it is not a flat blob
const DARK  = [8, 11, 17];

const px = new Float64Array(S * S * 3);
for (let i = 0; i < S * S; i++) { px[i*3] = BG[0]; px[i*3+1] = BG[1]; px[i*3+2] = BG[2]; }

// iOS masks the icon to a rounded square and the corners bite in a long way. Everything is
// drawn at full size and then pulled in about the composition's own centre, so the hair keeps
// its reach without the outer strands being sliced off.
const K = 0.87, PIVOT_Y = 246, DROP = 16;
const tx = x => 256 + (x - 256) * K;
const ty = y => PIVOT_Y + (y - PIVOT_Y) * K + DROP;

function blend(x, y, c, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= S || y >= S) return;
  if (a > 1) a = 1;
  const i = (y * S + x) * 3;
  for (let k = 0; k < 3; k++) px[i + k] = px[i + k] * (1 - a) + c[k] * a;
}

// Soft-edged disc. Everything here is built from these, which keeps the whole image
// anti-aliased without a rasteriser.
function dot(cx, cy, r, c, a = 1, feather = 1.2) {
  cx = tx(cx); cy = ty(cy); r *= K;
  const x0 = Math.floor(cx - r - feather), x1 = Math.ceil(cx + r + feather);
  const y0 = Math.floor(cy - r - feather), y1 = Math.ceil(cy + r + feather);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + feather) continue;
    blend(x, y, c, a * Math.min(1, (r + feather - d) / feather));
  }
}

function ellipse(cx, cy, rx, ry, c, a = 1, feather = 1.5) {
  cx = tx(cx); cy = ty(cy); rx *= K; ry *= K;
  const x0 = Math.floor(cx - rx - feather), x1 = Math.ceil(cx + rx + feather);
  const y0 = Math.floor(cy - ry - feather), y1 = Math.ceil(cy + ry + feather);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const d = Math.hypot(dx, dy);
    if (d > 1 + feather / Math.min(rx, ry)) continue;
    blend(x, y, c, a * Math.min(1, (1 - d) * Math.min(rx, ry) / feather + 1));
  }
}

// A tapered stroke along a quadratic curve — one hair.
function strand(x0, y0, x1, y1, bend, w0, w1, c, a = 1) {
  const mx = (x0 + x1) / 2 - (y1 - y0) * bend;
  const my = (y0 + y1) / 2 + (x1 - x0) * bend;
  const steps = Math.max(12, Math.hypot(x1 - x0, y1 - y0) | 0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const x = u*u*x0 + 2*u*t*mx + t*t*x1;
    const y = u*u*y0 + 2*u*t*my + t*t*y1;
    dot(x, y, w0 + (w1 - w0) * t, c, a, 1.1);
  }
}

// Seeded, so rebuilding the icon does not silently produce a different one.
let seed = 20260816;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const CX = 256, CY = 292;
// The hair sits on its own arc well above the eyes. Origin it on the face centre and it grows
// down over the forehead, which loses the one feature that makes a face read as a face.
const HX = 256, HY = 236, HRX = 92, HRY = 76;

// ── the head ──────────────────────────────────────────────────────────────
ellipse(CX, CY, 100, 117, FACE);

// ── the hair ──────────────────────────────────────────────────────────────
// Two passes. The back layer is darker and longer, so the silhouette has depth instead of
// reading as one white shape; the front layer is bright and sits on the scalp.
// 168°–372°: from just below the left ear, over the top, round to just below the right. 0° is
// +x and 90° is +y, so the sweep runs through the upper half.
const A0 = 168, A1 = 372;
for (const pass of [0, 1]) {
  const colour = pass === 0 ? SHADE : HAIR;
  const n = pass === 0 ? 140 : 165;
  for (let i = 0; i < n; i++) {
    const th = (A0 + (A1 - A0) * (i / n) + (rnd() - 0.5) * 5) * Math.PI / 180;
    const k = pass === 0 ? 1.04 : 0.96;
    const sx = HX + Math.cos(th) * HRX * k;
    const sy = HY + Math.sin(th) * HRY * k;
    // Longest at the sides, shortest over the crown — that is the shape of the real thing.
    const sideness = Math.abs(Math.cos(th));
    const len = (pass === 0 ? 58 : 44) + sideness * 62 + rnd() * 38;
    const spread = (rnd() - 0.5) * 0.5;
    const ex = HX + Math.cos(th + spread) * (HRX + len);
    const ey = HY + Math.sin(th + spread) * (HRY + len * 0.82);
    strand(sx, sy, ex, ey, (rnd() - 0.5) * 0.42,
           pass === 0 ? 4.6 : 4.0, 0.7, colour, pass === 0 ? 0.7 : 0.96);
  }
}

// Fill the crown so the strands read as one mass rather than a fringe of separate lines. Kept
// strictly above the hairline — this is what buried the forehead on the first attempt.
for (let i = 0; i < 420; i++) {
  const th = (180 + 180 * rnd()) * Math.PI / 180;
  const r = 20 + rnd() * 74;
  dot(HX + Math.cos(th) * r, HY - 12 + Math.sin(th) * r * 0.80, 13 + rnd() * 11, HAIR, 0.55);
}

// ── the face ──────────────────────────────────────────────────────────────
// Deep-set eyes under heavy brows. Kept small and dark: at icon size they are punctuation.
for (const s of [-1, 1]) {
  ellipse(CX + s * 40, CY + 4, 18, 12, DARK, 0.85);
  dot(CX + s * 40, CY + 4, 9, DARK);
  // The eyebrows are nearly as much of the likeness as the hair is, so they get their own
  // strands with clear forehead above them.
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const x = CX + s * (16 + t * 38);
    const y = CY - 20 - Math.sin(t * Math.PI) * 5 + (rnd() - 0.5) * 3;
    strand(x, y, x + s * (6 + rnd() * 7), y - 7 - rnd() * 7, 0.2, 2.8, 0.5, HAIR, 0.92);
  }
}

// Nose — one soft shadow, no outline. An outlined nose at this size looks like a beak.
ellipse(CX + 2, CY + 42, 15, 24, DARK, 0.26);
dot(CX - 10, CY + 56, 5, DARK, 0.42);
dot(CX + 13, CY + 56, 5, DARK, 0.42);

// ── the moustache ─────────────────────────────────────────────────────────
// The other half of the likeness. Heavy, drooping past the corners of the mouth.
for (const s of [-1, 1]) {
  for (let i = 0; i < 105; i++) {
    const t = i / 105;
    const x0 = CX + s * (2 + t * 13);
    const y0 = CY + 70 + (rnd() - 0.5) * 10;
    const x1 = CX + s * (34 + t * 50 + rnd() * 12);
    const y1 = CY + 76 + t * 30 + rnd() * 11;
    strand(x0, y0, x1, y1, s * 0.16, 5.6, 1.6, HAIR, 0.92);
  }
}
// A shadow along the jaw, so the moustache has something to sit in front of.
ellipse(CX, CY + 124, 62, 22, DARK, 0.18);

// ── PNG encode ────────────────────────────────────────────────────────────
const TBL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = b => { let c = ~0; for (const x of b) c = TBL[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// Each scanline needs a leading filter byte; 0 = none.
const raw = Buffer.alloc(S * (S * 3 + 1));
for (let y = 0; y < S; y++) {
  const row = y * (S * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < S * 3; x++) {
    const v = px[y * S * 3 + x];
    raw[row + 1 + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
writeFileSync(join(out, 'icon.png'), png);
writeFileSync(join(out, 'icon.b64'), png.toString('base64'));
console.log('icon.png ' + (png.length / 1024).toFixed(1) + ' KB  (' + S + '×' + S + ')');
