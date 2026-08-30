// Generate every raster icon from the same vector mark used in the app.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, "public");
const source = await fs.readFile(path.join(out, "ourpool-mark.svg"));

async function icon(size, fullBleed = false) {
  let image = sharp(source, { density: 768 }).resize(size, size);
  // Apple supplies its own corner mask. Android maskable icons need an opaque
  // background; all monogram strokes fit inside the central safe circle.
  if (fullBleed) image = image.flatten({ background: "#0d1210" });
  return image.png().toBuffer();
}

for (const [name, size, fullBleed] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
]) {
  await fs.writeFile(path.join(out, name), await icon(size, fullBleed));
}

// ICO supports PNG frames. Ship small frames, not just a scaled 512px icon.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((size) => icon(size)));
const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2); // icon, not cursor
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4); // color planes
  directory.writeUInt16LE(32, entry + 6); // bits per pixel
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await fs.writeFile(path.join(root, "app/favicon.ico"), Buffer.concat([directory, ...frames]));
console.log("OurPool icons and favicon generated from public/ourpool-mark.svg");
