// Generates icons/{16,32,48,128}.png from a simple procedural design:
// dark navy background with three horizontal bars in tab-group colors
// (blue, green, orange). Pure Node — no dependencies.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'icons');

const BG = [0x0f, 0x17, 0x2a, 0xff];          // navy
const BARS = [
  [0x60, 0xa5, 0xfa, 0xff],                    // blue
  [0x34, 0xd3, 0x99, 0xff],                    // green
  [0xfb, 0x92, 0x3c, 0xff]                     // orange
];

// Bar layout in normalized coords [0..1]
const BAR_X0 = 0.18;
const BAR_X1 = 0.82;
const BAR_HEIGHT = 0.13;
const BAR_GAP = 0.08;
const TOTAL = BAR_HEIGHT * 3 + BAR_GAP * 2;
const BAR_Y0 = (1 - TOTAL) / 2;

function renderPixels(size) {
  const data = Buffer.alloc(size * size * 4);
  const x0 = Math.round(BAR_X0 * size);
  const x1 = Math.round(BAR_X1 * size);
  const ranges = BARS.map((color, i) => {
    const yStart = Math.round((BAR_Y0 + i * (BAR_HEIGHT + BAR_GAP)) * size);
    const yEnd = Math.round((BAR_Y0 + i * (BAR_HEIGHT + BAR_GAP) + BAR_HEIGHT) * size);
    return { yStart, yEnd, color };
  });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = BG;
      if (x >= x0 && x < x1) {
        for (const r of ranges) {
          if (y >= r.yStart && y < r.yEnd) { color = r.color; break; }
        }
      }
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3];
    }
  }
  return data;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter: standard
  ihdr[12] = 0;  // interlace: none

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeIcon(size) {
  const pixels = renderPixels(size);
  return encodePNG(size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const out = resolve(OUT_DIR, `${size}.png`);
  writeFileSync(out, makeIcon(size));
  console.log(`wrote ${out} (${size}x${size})`);
}
