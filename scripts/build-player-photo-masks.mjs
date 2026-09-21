/**
 * Masques photo des cartes joueurs : intérieur du bouclier, hors cadre,
 * jusqu’au bandeau nom — buste plein cadre comme la carte ACC / or.
 *
 * À reporter dans PORTRAIT_REGIONS (src/composePortrait.js)
 * et panelHint (scripts/blank-portraits.mjs).
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");

const CARDS = {
  "ben-ali": { inset: 0.038, bottom: 0.613, fade: 0.07 },
  dupont: { inset: 0.036, bottom: 0.618, fade: 0.07 },
  martins: { inset: 0.042, bottom: 0.583, fade: 0.07 },
};

const DIAG = Math.SQRT2;

function relax(dist, i, from, cost) {
  const d = dist[from] + cost;
  if (d < dist[i]) dist[i] = d;
}

async function buildMask(id, cfg) {
  const source = [
    path.join(assets, `card-${id}.pre-logo.png`),
    path.join(assets, `card-${id}.orig.png`),
    path.join(assets, `card-${id}.png`),
  ].find((f) => fs.existsSync(f));
  if (!source) throw new Error(`missing source for ${id}`);

  const { data, info } = await sharp(source)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) solid[i] = data[i] > 128 ? 1 : 0;

  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) dist[i] = solid[i] ? Infinity : 0;

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (dist[i] === 0) continue;
      if (y > 0) relax(dist, i, i - W, 1);
      if (x > 0) relax(dist, i, i - 1, 1);
      if (y > 0 && x > 0) relax(dist, i, i - W - 1, DIAG);
      if (y > 0 && x < W - 1) relax(dist, i, i - W + 1, DIAG);
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = y * W + x;
      if (dist[i] === 0) continue;
      if (y < H - 1) relax(dist, i, i + W, 1);
      if (x < W - 1) relax(dist, i, i + 1, 1);
      if (y < H - 1 && x < W - 1) relax(dist, i, i + W + 1, DIAG);
      if (y < H - 1 && x > 0) relax(dist, i, i + W - 1, DIAG);
    }
  }
  for (let x = 0; x < W; x += 1) {
    dist[x] = Math.min(dist[x], 0.5);
    dist[(H - 1) * W + x] = Math.min(dist[(H - 1) * W + x], 0.5);
  }

  const inset = cfg.inset * W;
  const cutY = Math.round(cfg.bottom * H);
  const fadeH = Math.round(cfg.fade * H);
  const rgba = Buffer.alloc(W * H * 4, 255);
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < H; y += 1) {
    let vertical = 1;
    if (y >= cutY) vertical = 0;
    else if (y > cutY - fadeH) vertical = (cutY - y) / fadeH;
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const a = dist[i] >= inset ? Math.round(vertical * 255) : 0;
      rgba[i * 4 + 3] = a;
      if (a > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  const out = path.join(assets, `card-${id}.photo-mask.png`);
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(out);

  const f = (n, d) => Number((n / d).toFixed(4));
  const box = { x: f(x0, W), y: f(y0, H), w: f(x1 - x0 + 1, W), h: f(y1 - y0 + 1, H) };
  console.log(`${id} photo mask`, { W, H, box });
  return box;
}

const boxes = {};
for (const [id, cfg] of Object.entries(CARDS)) {
  boxes[id] = await buildMask(id, cfg);
}
console.log("panelHint", JSON.stringify(boxes));
