/* =============================================================================
 * generate-icons.js — produces icons/icon-192.png and icon-512.png with no
 * external dependencies (hand-rolled PNG encoder). Run: node icons/generate-icons.js
 * Design: dark-green felt field, gold ring, light-green center disc (a chip).
 * ===========================================================================*/
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function makePng(size) {
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.46;   // chip radius
  const rRing = size * 0.40;    // inner edge of gold ring
  const rDisc = size * 0.30;    // center disc
  const felt = [20, 55, 32];
  const feltLo = [16, 42, 26];
  const gold = [232, 193, 75];
  const disc = [46, 122, 71];
  const discLo = [34, 92, 56];

  const bytesPerPixel = 4;
  const raw = Buffer.alloc(size * (1 + size * bytesPerPixel));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let col, a = 255;
      const vy = y / size; // subtle vertical shade
      if (d > rOuter) {
        col = [lerp(felt[0], feltLo[0], vy), lerp(felt[1], feltLo[1], vy), lerp(felt[2], feltLo[2], vy)];
      } else if (d > rRing) {
        col = gold;
      } else if (d > rDisc) {
        col = [lerp(felt[0], feltLo[0], vy), lerp(felt[1], feltLo[1], vy), lerp(felt[2], feltLo[2], vy)];
      } else {
        col = [lerp(disc[0], discLo[0], vy), lerp(disc[1], discLo[1], vy), lerp(disc[2], discLo[2], vy)];
      }
      // soft edge antialias on the chip rim
      if (d > rOuter && d < rOuter + 1.5) a = 255;
      raw[p++] = col[0]; raw[p++] = col[1]; raw[p++] = col[2]; raw[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

[192, 512].forEach((size) => {
  const out = path.join(__dirname, 'icon-' + size + '.png');
  fs.writeFileSync(out, makePng(size));
  console.log('wrote', out);
});
