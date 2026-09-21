import sharp from "sharp";
import fs from "fs";
import path from "path";

const dir = "C:/Users/Raouf/Projects/yakeey-advisor-cards/public/assets";

function isBg(r, g, b, a) {
  if (a < 10) return true;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 78;
}

async function cutout(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const visited = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qs = 0;
  let qe = 0;

  const push = (x, y) => {
    const i = y * w + x;
    if (visited[i]) return;
    visited[i] = 1;
    q[qe++] = i;
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  let cleared = 0;
  while (qs < qe) {
    const i = q[qs++];
    const o = i * 4;
    if (!isBg(data[o], data[o + 1], data[o + 2], data[o + 3])) continue;
    data[o + 3] = 0;
    cleared++;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x + 1 < w) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < h) push(x, y + 1);
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      if (data[o + 3] === 0) continue;
      let near = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (data[((y + dy) * w + (x + dx)) * 4 + 3] === 0) near++;
      }
      if (near >= 2) {
        const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
        if (lum < 95) data[o + 3] = 0;
      }
    }
  }

  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
    .png()
    .toFile(outputPath);

  console.log(
    `${path.basename(outputPath)}: cleared=${cleared} -> ${maxX - minX + 1}x${maxY - minY + 1}`
  );
}

await cutout(path.join(dir, "_tmp-ben.jpg"), path.join(dir, "card-ben-ali.png"));
await cutout(path.join(dir, "_tmp-lef.png"), path.join(dir, "card-lefebvre.png"));

for (const f of ["_tmp-ben.jpg", "_tmp-lef.png"]) {
  const p = path.join(dir, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
