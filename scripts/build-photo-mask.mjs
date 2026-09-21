/**
 * Masques de la carte ACC, dérivés de la silhouette intérieure du bouclier
 * (cadre doré exclu) :
 *  - photo-mask : zone visible de la photo, fondue au-dessus du bandeau nom
 *  - slot-mask  : même silhouette, bord net, descendue sous le bandeau nom,
 *                 utilisée pour effacer l'illustration d'origine
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");
const source = path.join(assets, "card-coach-acc.orig.png");
const photoMaskPath = path.join(assets, "card-coach-acc.photo-mask.png");
const slotMaskPath = path.join(assets, "card-coach-acc.slot-mask.png");

/** Retrait depuis le bord de la carte, en fraction de la largeur.
 *  Le slot mord un peu plus loin que la photo pour ne laisser aucun reste
 *  de l'illustration d'origine entre l'aplat et le cadre doré. */
const PHOTO_INSET = 0.034;
const SLOT_INSET = 0.026;
/** Bas de la photo (haut du bandeau nom) et hauteur du fondu */
const BOTTOM = 0.634;
const FADE = 0.075;
/** Bas de la zone à effacer (sous le bandeau nom) */
const SLOT_BOTTOM = 0.71;

const { data, info } = await sharp(source)
  .ensureAlpha()
  .extractChannel("alpha")
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;

const solid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i += 1) solid[i] = data[i] > 128 ? 1 : 0;

/**
 * Distance de chaque pixel intérieur au bord de la carte (chanfrein 3×3).
 * Un min-filter séparable éroderait avec un carré, ce qui coupe à plat dans
 * les arcs de la couronne ; la distance donne une marge d'épaisseur constante.
 */
const DIAG = Math.SQRT2;
const dist = new Float32Array(W * H);
for (let i = 0; i < W * H; i += 1) dist[i] = solid[i] ? Infinity : 0;

function relax(i, from, cost) {
  const d = dist[from] + cost;
  if (d < dist[i]) dist[i] = d;
}

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = y * W + x;
    if (dist[i] === 0) continue;
    if (y > 0) relax(i, i - W, 1);
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0 && x > 0) relax(i, i - W - 1, DIAG);
    if (y > 0 && x < W - 1) relax(i, i - W + 1, DIAG);
  }
}
for (let y = H - 1; y >= 0; y -= 1) {
  for (let x = W - 1; x >= 0; x -= 1) {
    const i = y * W + x;
    if (dist[i] === 0) continue;
    if (y < H - 1) relax(i, i + W, 1);
    if (x < W - 1) relax(i, i + 1, 1);
    if (y < H - 1 && x < W - 1) relax(i, i + W + 1, DIAG);
    if (y < H - 1 && x > 0) relax(i, i + W - 1, DIAG);
  }
}
// hors carte, la distance reste 0 : le bord de l'image compte comme extérieur
for (let x = 0; x < W; x += 1) {
  dist[x] = Math.min(dist[x], 0.5);
  dist[(H - 1) * W + x] = Math.min(dist[(H - 1) * W + x], 0.5);
}

function erode(inset) {
  const r = inset * W;
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) out[i] = dist[i] >= r ? 1 : 0;
  return out;
}

const cutY = Math.round(BOTTOM * H);
const fadeH = Math.round(FADE * H);
const slotY = Math.round(SLOT_BOTTOM * H);

async function writeMask(file, shape, alphaAt) {
  const rgba = Buffer.alloc(W * H * 4, 255);
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < H; y += 1) {
    const vertical = Math.max(0, alphaAt(y));
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const a = Math.round(shape[i] * vertical * 255);
      rgba[i * 4 + 3] = a;
      if (a > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(file);
  const f = (n, d) => Number((n / d).toFixed(4));
  return { x: f(x0, W), y: f(y0, H), w: f(x1 - x0 + 1, W), h: f(y1 - y0 + 1, H) };
}

const photoBox = await writeMask(photoMaskPath, erode(PHOTO_INSET), (y) => {
  if (y >= cutY) return 0;
  if (y > cutY - fadeH) return (cutY - y) / fadeH;
  return 1;
});
await writeMask(slotMaskPath, erode(SLOT_INSET), (y) => (y >= slotY ? 0 : 1));

// À reporter dans PORTRAIT_REGIONS.acc (src/composePortrait.js)
console.log("masks", { W, H }, "photo box", photoBox);
