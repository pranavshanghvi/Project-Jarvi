// Generate the home-screen icon as a PNG, with no image libraries.
//
// It has to be a real PNG data URI embedded in the page: iOS ignores SVG for apple-touch-icon,
// and a path like /icon.png does not resolve when the page is served from an artifact URL or
// opened from Files. Without one, Safari falls back to the host's favicon — which is why it
// was showing Claude's mark.
//
// The image is a light cone: the single most recognisable object in relativity, and the thing
// that defines what can affect what. Two triangles meeting at an event, on the app's own ground.
//
// Run:  node tutor/tools/make-icon.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 512;
const BG = [10, 14, 21];        // --bg dark
const CONE = [110, 164, 255];   // --accent dark
const GLOW = [232, 237, 245];   // --ink dark

const px = new Uint8Array(S * S * 3);
const set = (x, y, c, a = 1) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 3;
  for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a);
};

// ground
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, BG);

const cx = S / 2, cy = S / 2;
const HALF = 186;      // cone half-height
const SLOPE = 1.0;     // 45° — light travels one unit of space per unit of time

// Filled cones, faint, so the icon still reads at 60px.
for (let y = 0; y < S; y++) {
  const dy = y - cy;
  if (Math.abs(dy) > HALF) continue;
  const w = Math.abs(dy) / SLOPE;
  for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
    const edge = 1 - Math.abs(x - cx) / Math.max(w, 1);
    set(x, y, CONE, 0.05 + 0.10 * (1 - edge));
  }
}

// The four rays, drawn thick with a soft edge so they survive downscaling.
const TH = 9;
for (let t = 0; t <= HALF; t++) {
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
    const x0 = cx + sx * t / SLOPE, y0 = cy + sy * t;
    for (let o = -TH; o <= TH; o++) {
      const a = Math.max(0, 1 - Math.abs(o) / TH);
      set(Math.round(x0 + o * 0.7071), Math.round(y0 - sx * sy * o * 0.7071), CONE, a * 0.95);
    }
  }
}

// The event at the origin — bright, because everything in the picture is defined relative to it.
for (let y = -26; y <= 26; y++) for (let x = -26; x <= 26; x++) {
  const d = Math.hypot(x, y);
  if (d > 26) continue;
  set(Math.round(cx + x), Math.round(cy + y), GLOW, Math.max(0, 1 - (d / 26) ** 1.7));
}

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
  raw[y * (S * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * S * 3, S * 3).copy(raw, y * (S * 3 + 1) + 1);
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
