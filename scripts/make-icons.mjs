// يولّد أيقونات التطبيق (PNG) بدون أي مكتبات خارجية.
// الأيقونة: مربّع بلون الهوية عليه حرف "ن" مرسوم هندسيًا (قوس + نقطة).
//
//   node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BRAND = [31, 65, 245]; // #1f41f5
const WHITE = [255, 255, 255];

// ── أدوات PNG ──

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // عمق البت
  header[9] = 6; // RGBA
  // 10..12 = ضغط/فلتر/تشابك = 0

  // كل سطر مسبوق ببايت الفلتر
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    pixels.copy(raw, offset, y * size * 4, (y + 1) * size * 4);
    offset += size * 4;
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── رسم الأيقونة ──

function drawIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;

  // نترك هامشًا أكبر في نسخة maskable لأن أندرويد يقصّ الحواف
  const inset = maskable ? size * 0.14 : size * 0.06;
  const radius = size * (maskable ? 0.5 : 0.22); // نصف قطر الزوايا الدائرية

  // القوس السفلي لحرف "ن"
  const bowlRadius = size * (maskable ? 0.2 : 0.24);
  const stroke = size * (maskable ? 0.062 : 0.075);
  const bowlCy = center + size * 0.04;

  // نقطة الحرف
  const dotR = size * (maskable ? 0.045 : 0.055);
  const dotCy = center - size * (maskable ? 0.17 : 0.2);

  const put = (x, y, [r, g, b], alpha) => {
    const i = (y * size + x) * 4;
    const a = Math.round(alpha * 255);
    if (a <= pixels[i + 3] && pixels[i + 3] > 0) {
      // مزج بسيط فوق ما هو موجود
      const prev = pixels[i + 3] / 255;
      const next = alpha;
      const out = next + prev * (1 - next);
      pixels[i] = Math.round((r * next + pixels[i] * prev * (1 - next)) / out);
      pixels[i + 1] = Math.round((g * next + pixels[i + 1] * prev * (1 - next)) / out);
      pixels[i + 2] = Math.round((b * next + pixels[i + 2] * prev * (1 - next)) / out);
      pixels[i + 3] = Math.round(out * 255);
      return;
    }
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = Math.max(pixels[i + 3], a);
  };

  // تنعيم الحواف بأخذ 3×3 عيّنات لكل بكسل
  const SAMPLES = 3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;

          // الخلفية: مربع بزوايا دائرية
          const left = inset;
          const right = size - inset;
          const qx = Math.max(left + radius - px, 0, px - (right - radius));
          const qy = Math.max(left + radius - py, 0, py - (right - radius));
          const inside =
            px >= left &&
            px <= right &&
            py >= left &&
            py <= right &&
            Math.hypot(qx, qy) <= radius;
          if (inside) bg++;

          // القوس السفلي
          const d = Math.hypot(px - center, py - bowlCy);
          const onBowl =
            py >= bowlCy &&
            d >= bowlRadius - stroke / 2 &&
            d <= bowlRadius + stroke / 2;

          // نهايتا القوس ترتفعان قليلًا
          const nearEnds =
            Math.abs(py - bowlCy) < stroke / 2 &&
            Math.abs(Math.abs(px - center) - bowlRadius) <= stroke / 2;

          // النقطة
          const onDot = Math.hypot(px - center, py - dotCy) <= dotR;

          if (onBowl || nearEnds || onDot) fg++;
        }
      }

      const total = SAMPLES * SAMPLES;
      if (bg > 0) put(x, y, BRAND, bg / total);
      if (fg > 0) put(x, y, WHITE, fg / total);
    }
  }

  return encodePng(size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const target of targets) {
  writeFileSync(join(OUT_DIR, target.name), drawIcon(target.size, { maskable: target.maskable }));
  console.log(`✅ ${target.name} (${target.size}×${target.size})`);
}
