import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import manifest from "../app/manifest";

const root = process.cwd();

test("installed app keeps its start URL while using OurPool branding and fresh icons", () => {
  const app = manifest();
  assert.equal(app.short_name, "OurPool");
  assert.equal(app.name, "OurPool — household expenses");
  assert.equal(app.start_url, "/");
  assert.equal(app.display, "standalone");
  for (const icon of app.icons ?? []) {
    assert.ok(icon.src.endsWith("?v=ourpool-1"));
    assert.ok(fs.existsSync(path.join(root, "public", icon.src.split("?")[0])));
  }
});

test("all generated icons have the correct dimensions and match the vector source", async () => {
  const source = fs.readFileSync(path.join(root, "public/ourpool-mark.svg"));
  for (const [file, size, opaque] of [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["icon-maskable-512.png", 512, true],
    ["apple-touch-icon.png", 180, true],
  ] as const) {
    const actual = fs.readFileSync(path.join(root, "public", file));
    const metadata = await sharp(actual).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    if (opaque) assert.equal(metadata.hasAlpha, false);
    let expected = sharp(source, { density: 768 }).resize(size, size);
    if (opaque) expected = expected.flatten({ background: "#0d1210" });
    assert.deepEqual(await sharp(actual).raw().toBuffer(), await expected.raw().toBuffer());
  }
});

test("maskable logo stays inside Android's central 80% safe circle", async () => {
  const size = 512;
  const { data, info } = await sharp(path.join(root, "public/icon-maskable-512.png"))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size * 0.4) continue;
      const index = (y * size + x) * info.channels;
      // Allow tiny rounding differences in the anti-aliased background.
      assert.ok(Math.abs(data[index] - 13) <= 2 && Math.abs(data[index + 1] - 18) <= 2 && Math.abs(data[index + 2] - 16) <= 2);
    }
  }
});

test("favicon contains 16, 32, and 48 pixel versions of the new mark", async () => {
  const ico = fs.readFileSync(path.join(root, "app/favicon.ico"));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const metadata = await sharp(ico.subarray(offset, offset + length)).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
  }
});

test("visible app copy has no old brand, except the compatible import header", () => {
  for (const directory of ["app", "components"]) {
    const base = path.join(root, directory);
    for (const name of fs.readdirSync(base, { recursive: true }) as string[]) {
      if (!/\.(tsx?|css)$/.test(name)) continue;
      const source = fs.readFileSync(path.join(base, name), "utf8")
        .replace(/x-twocents-confirmation/gi, "legacy-import-header");
      assert.doesNotMatch(source, /twocents|two<span/i, name);
    }
  }
});
