// ---------------------------------------------------------------------------
// Dependency-free icon generator: draws a yellow "O" on a dark-grey rounded
// square and writes PNGs (for the PWA / favicons) plus a macOS .icns (for the
// Outliner.app bundle). Pure Node — no native image libraries required.
// ---------------------------------------------------------------------------
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- palette ---------------------------------------------------------------
const BG = [0x2b, 0x2b, 0x30]; // dark grey
const BG2 = [0x36, 0x36, 0x3d]; // subtle top highlight
const YELLOW = [0xff, 0xcb, 0x3a]; // warm yellow

// --- tiny vector maths -----------------------------------------------------
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
// signed distance to a centred rounded rectangle
function sdRoundRect(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

/**
 * Render an RGBA icon at size N.
 * maskable = full-bleed square (no transparent margin) for PWA masking.
 */
function render(N, maskable) {
  const buf = Buffer.alloc(N * N * 4); // transparent
  const cx = N / 2;
  const cy = N / 2;
  const inset = maskable ? 0 : N * 0.075;
  const halfW = N / 2 - inset;
  const radius = maskable ? 0 : N * 0.223; // squircle-ish

  // Ring ("O") geometry
  const Ro = (maskable ? 0.255 : 0.3) * N;
  const thick = (maskable ? 0.08 : 0.088) * N;
  const Rmid = Ro - thick / 2;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;

      // background rounded square coverage
      const dBg = sdRoundRect(px, py, halfW, halfW, radius);
      const covBg = clamp(0.5 - dBg, 0, 1);

      // vertical highlight gradient on the background
      const t = clamp(y / N, 0, 1);
      const br = Math.round(BG2[0] + (BG[0] - BG2[0]) * t);
      const bg = Math.round(BG2[1] + (BG[1] - BG2[1]) * t);
      const bb = Math.round(BG2[2] + (BG[2] - BG2[2]) * t);

      // ring coverage
      const dist = Math.abs(Math.hypot(px, py) - Rmid) - thick / 2;
      const covRing = clamp(0.5 - dist, 0, 1);

      // composite: bg first, then yellow ring on top
      let r = br;
      let g = bg;
      let b = bb;
      let a = covBg;
      if (covRing > 0) {
        r = Math.round(r * (1 - covRing) + YELLOW[0] * covRing);
        g = Math.round(g * (1 - covRing) + YELLOW[1] * covRing);
        b = Math.round(b * (1 - covRing) + YELLOW[2] * covRing);
        a = Math.max(a, covRing);
      }
      const i = (y * N + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return buf;
}

// --- PNG encoder (RGBA, 8-bit) --------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(N, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression, filter, interlace = 0
  const stride = N * 4;
  const raw = Buffer.alloc((stride + 1) * N);
  for (let y = 0; y < N; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- ICNS packer (PNG-based, modern macOS) --------------------------------
function encodeIcns(pngsBySize) {
  const TYPES = { 32: 'ic11', 64: 'ic12', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
  const entries = [];
  for (const [size, type] of Object.entries(TYPES)) {
    const png = pngsBySize[size];
    if (!png) continue;
    const header = Buffer.alloc(8);
    Buffer.from(type, 'ascii').copy(header, 0);
    header.writeUInt32BE(8 + png.length, 4);
    entries.push(Buffer.concat([header, png]));
  }
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  Buffer.from('icns', 'ascii').copy(head, 0);
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

// --- write everything ------------------------------------------------------
mkdirSync(join(ROOT, 'public'), { recursive: true });
mkdirSync(join(ROOT, 'Outliner.app/Contents/Resources'), { recursive: true });

const png = (n, maskable = false) => encodePng(n, render(n, maskable));

// PWA + web icons
writeFileSync(join(ROOT, 'public/icon-192.png'), png(192));
writeFileSync(join(ROOT, 'public/icon-512.png'), png(512));
writeFileSync(join(ROOT, 'public/icon-maskable-192.png'), png(192, true));
writeFileSync(join(ROOT, 'public/icon-maskable-512.png'), png(512, true));
writeFileSync(join(ROOT, 'public/apple-touch-icon.png'), png(180, true));
writeFileSync(join(ROOT, 'public/favicon-32.png'), png(32));

// macOS .icns for the Outliner.app bundle
const icnsSizes = {};
for (const s of [32, 64, 128, 256, 512, 1024]) icnsSizes[s] = png(s);
writeFileSync(join(ROOT, 'Outliner.app/Contents/Resources/app.icns'), encodeIcns(icnsSizes));

console.log('Icons written to public/ and Outliner.app/Contents/Resources/app.icns');
