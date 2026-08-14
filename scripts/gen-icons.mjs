// Generates the PWA icon set: two overlapping circles (each partner's color)
// whose intersection renders in ivory — shared money. Pure Node, no deps.
import zlib from "zlib";
import fs from "fs";
import path from "path";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#0d1210");
const MINT = hex("#7fe0b2");
const AMBER = hex("#f0b860");
const IVORY = hex("#f1eee4");

function drawIcon(size, { fullBleed }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cornerR = fullBleed ? 0 : size * 0.22;
  const cA = { x: size * 0.385, y: size * 0.5, r: size * 0.205 };
  const cB = { x: size * 0.615, y: size * 0.5, r: size * 0.205 };
  const SS = 3; // supersampling grid

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // Rounded-rect mask
          let inside = true;
          if (cornerR > 0) {
            const dx = Math.max(cornerR - px, px - (size - cornerR), 0);
            const dy = Math.max(cornerR - py, py - (size - cornerR), 0);
            inside = dx * dx + dy * dy <= cornerR * cornerR;
          }
          if (!inside) continue;

          const inA = (px - cA.x) ** 2 + (py - cA.y) ** 2 <= cA.r ** 2;
          const inB = (px - cB.x) ** 2 + (py - cB.y) ** 2 <= cB.r ** 2;
          const col = inA && inB ? IVORY : inA ? MINT : inB ? AMBER : BG;
          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / (a / 255));
        rgba[i + 1] = Math.round(g / (a / 255));
        rgba[i + 2] = Math.round(b / (a / 255));
        rgba[i + 3] = Math.round(a / n);
      }
    }
  }
  return encodePNG(size, size, rgba);
}

const out = path.join(process.cwd(), "public");
fs.writeFileSync(path.join(out, "icon-192.png"), drawIcon(192, { fullBleed: false }));
fs.writeFileSync(path.join(out, "icon-512.png"), drawIcon(512, { fullBleed: false }));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), drawIcon(512, { fullBleed: true }));
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), drawIcon(180, { fullBleed: true }));
console.log("icons written");
