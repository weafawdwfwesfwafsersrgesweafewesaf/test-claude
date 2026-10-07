// Génère les icônes PNG de l'application (sans dépendance) : build/icon.png et assets/tray.png
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4; // super-échantillonnage
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          // carré arrondi
          const rad = 0.22, m = 0.04;
          const qx = Math.max(Math.abs(x - 0.5) - (0.5 - m - rad), 0);
          const qy = Math.max(Math.abs(y - 0.5) - (0.5 - m - rad), 0);
          if (Math.hypot(qx, qy) > rad) continue;
          // dégradé bleu -> violet
          const t = clamp((x + y) / 2);
          let cr = mix(40, 140, t), cg = mix(150, 70, t), cb = mix(255, 240, t);
          // vagues blanches
          const w1 = 0.62 + 0.06 * Math.sin(x * 9.5 + 0.6);
          const w2 = 0.74 + 0.05 * Math.sin(x * 8 + 2.4);
          if (y > w1 && y < w1 + 0.07) { cr = mix(cr, 255, 0.95); cg = mix(cg, 255, 0.95); cb = mix(cb, 255, 0.95); }
          else if (y > w2 && y < w2 + 0.05) { cr = mix(cr, 255, 0.6); cg = mix(cg, 255, 0.6); cb = mix(cb, 255, 0.6); }
          // soleil
          if (Math.hypot(x - 0.66, y - 0.36) < 0.13) { cr = 255; cg = mix(cg, 230, 0.9); cb = mix(cb, 140, 0.9); }
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = ss * ss, i = (py * size + px) * 4;
      const cov = a / n / 255;
      buf[i] = cov ? r / (n * cov) : 0;
      buf[i + 1] = cov ? g / (n * cov) : 0;
      buf[i + 2] = cov ? b / (n * cov) : 0;
      buf[i + 3] = a / n;
    }
  }
  return encodePNG(size, buf);
}

const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'build', 'icon.png'), render(512));
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), render(256));
fs.writeFileSync(path.join(root, 'assets', 'tray.png'), render(32));
console.log('Icônes générées.');
