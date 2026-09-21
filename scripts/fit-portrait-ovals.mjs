/**
 * Calcule, pour chaque carte, le plus grand ovale photo qui tient à
 * l'intérieur du bouclier sans mordre sur le cadre, et qui s'arrête au-dessus
 * du bandeau nom.
 *
 * Les valeurs affichées sont à reporter dans PORTRAIT_REGIONS
 * (src/composePortrait.js) et dans `regions` de scripts/blank-portraits.mjs.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");

/** Haut du bandeau nom : l'ovale doit rester au-dessus. */
const nameTop = { "ben-ali": 0.615, dupont: 0.62, martins: 0.585 };
/**
 * Retrait depuis la silhouette externe, en fraction de la largeur.
 * Propre à chaque carte : la silhouette inclut les ailerons décoratifs, qui
 * débordent largement du panneau intérieur sur Ben Ali et Martins.
 */
const inset = { "ben-ali": 0.09, dupont: 0.04, martins: 0.072 };
/** Marge respirable entre l'ovale et le cadre. */
const GAP = 0.012;

function erodeLine(read, write, count, r) {
  const holes = new Int32Array(count + 1);
  for (let i = 0; i < count; i += 1) holes[i + 1] = holes[i] + (read(i) ? 0 : 1);
  for (let i = 0; i < count; i += 1) {
    const inside = i - r >= 0 && i + r <= count - 1;
    write(i, inside && holes[i + r + 1] - holes[i - r] === 0 ? 1 : 0);
  }
}

for (const [id, nTop] of Object.entries(nameTop)) {
  const file = path.join(assets, `card-${id}.base.png`);
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;

  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) solid[i] = data[i] > 128 ? 1 : 0;

  const r = Math.round((inset[id] + GAP) * W);
  const passX = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const row = y * W;
    erodeLine((x) => solid[row + x], (x, v) => { passX[row + x] = v; }, W, r);
  }
  const inner = new Uint8Array(W * H);
  for (let x = 0; x < W; x += 1) {
    erodeLine((y) => passX[y * W + x], (y, v) => { inner[y * W + x] = v; }, H, r);
  }

  // demi-largeur disponible à chaque hauteur, mesurée autour de l'axe central
  const cxPx = W / 2;
  const half = new Float64Array(H);
  for (let y = 0; y < H; y += 1) {
    let k = 0;
    while (
      cxPx - k >= 0 &&
      cxPx + k < W &&
      inner[y * W + Math.floor(cxPx - k)] &&
      inner[y * W + Math.ceil(cxPx + k)]
    ) {
      k += 1;
    }
    half[y] = k;
  }

  const yBot = Math.round((nTop - 0.004) * H);
  let best = null;
  for (let yTop = 0; yTop < yBot - 40; yTop += 1) {
    if (half[yTop] < W * 0.12) continue;
    const cy = (yTop + yBot) / 2;
    const ry = (yBot - yTop) / 2;
    let rx = Infinity;
    for (let y = yTop; y <= yBot; y += 1) {
      const t = (y - cy) / ry;
      const k = Math.sqrt(Math.max(0, 1 - t * t));
      if (k < 1e-3) continue;
      rx = Math.min(rx, half[y] / k);
    }
    if (!Number.isFinite(rx)) continue;
    const area = rx * ry;
    if (!best || area > best.area) best = { area, cy, ry, rx, yTop };
  }

  const f = (n) => Number(n.toFixed(4));
  console.log(
    `${id}: { shape: "ellipse", cx: 0.5, cy: ${f(best.cy / H)}, rx: ${f(best.rx / W)}, ry: ${f(best.ry / H)} },`
  );
}
