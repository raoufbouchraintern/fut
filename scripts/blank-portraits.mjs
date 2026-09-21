/**
 * Enlève portraits (tête + buste/mains) → zone PHOTO opaque.
 * Réapplique le logo Yakeey à la place du drapeau (sans restaurer les faces).
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pushPullFill, distanceInside } from "./lib/inpaint.mjs";
import { frostPatch, textHalo } from "./lib/frost.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");

/**
 * Fenêtre d’effacement du portrait d’origine (ovale + buste).
 * Le cadre PHOTO affiché / composé est le panneau plein bouclier
 * (PORTRAIT_REGIONS + panelHint, via scripts/build-player-photo-masks.mjs).
 */
const ovals = {
  "ben-ali": { cx: 0.5, cy: 0.3717, rx: 0.2826, ry: 0.2388 },
  dupont: { cx: 0.5, cy: 0.3657, rx: 0.3073, ry: 0.2505 },
  martins: { cx: 0.5, cy: 0.3653, rx: 0.2617, ry: 0.216 },
};

/** Bandeau nom sous le portrait */
const nameRegions = {
  "ben-ali": { x: 0.16, y: 0.615, w: 0.68, h: 0.07, fill: "#e8e4de", color: "#5a3d28" },
  dupont: { x: 0.14, y: 0.62, w: 0.72, h: 0.075, fill: "#c9a24a", color: "#12100a" },
  martins: { x: 0.14, y: 0.585, w: 0.72, h: 0.07, fill: "#132039", color: "#f4f6fb" },
};

const ovrRegions = {
  "ben-ali": { x: 0.165, y: 0.108, w: 0.145, h: 0.098, fill: "#e8e4de", color: "#5a3d28" },
  dupont: { x: 0.155, y: 0.098, w: 0.145, h: 0.098, fill: "#c9a24a", color: "#12100a" },
  martins: { x: 0.165, y: 0.098, w: 0.145, h: 0.094, fill: "#132039", color: "#f4f6fb" },
};

/**
 * Emprise des épaules et des mains, qui débordent de la fenêtre photo et
 * doivent disparaître avec elle. Le décor est préservé partout ailleurs, d'où
 * un rectangle serré plutôt qu'une bande pleine largeur.
 */
const busts = {
  "ben-ali": { x: 0.17, w: 0.66, top: 0.42, bottom: 0.617 },
  dupont: { x: 0.16, w: 0.68, top: 0.4, bottom: 0.622 },
  martins: { x: 0.18, w: 0.64, top: 0.4, bottom: 0.587 },
};

/** Étiquette de poste sous le badge OVR (« MST », « CON »…), à effacer aussi. */
const labels = {
  "ben-ali": { x: 0.14, w: 0.2, top: 0.2, bottom: 0.3 },
  dupont: { x: 0.13, w: 0.2, top: 0.195, bottom: 0.29 },
  martins: { x: 0.15, w: 0.21, top: 0.19, bottom: 0.3 },
};

/**
 * Sous-libellés gravés sous les notes (carte Martins : COM, COM, POT)
 * et rangée d’étoiles / barres jaunes sous le nom.
 */
const extraCovers = {
  martins: {
    dests: [
      { x: 0.18, w: 0.64, top: 0.652, bottom: 0.698 },
      // Ancienne rangée AGI / TECH / CREA — remplacée par EXP STR COM RES NEG FID.
      { x: 0.10, w: 0.80, top: 0.698, bottom: 0.778, sampleTop: 0.668 },
      { x: 0.28, w: 0.42, top: 0.762, bottom: 0.800, sampleTop: 0.668 },
    ],
  },
};

const PLAYER_STATS = [
  { code: "EXP", value: 85 },
  { code: "STR", value: 88 },
  { code: "COM", value: 87 },
  { code: "RES", value: 82 },
  { code: "NEG", value: 90 },
  { code: "FID", value: 84 },
];

const statPaint = {
  martins: { x: 0.155, y: 0.658, w: 0.69, h: 0.088, color: "#f4f6fb" },
};

/**
 * Rangée de badges du bas (drapeau, FIFA ou Premier League, écusson de club) :
 * entièrement effacée, un seul logo Yakeey est reposé ensuite par applyLogo().
 */
const badgeRows = {
  "ben-ali": { x: 262, y: 783, w: 252, h: 70 },
  dupont: { x: 262, y: 819, w: 252, h: 70 },
  martins: { x: 272, y: 771, w: 216, h: 70 },
};

/**
 * Épaisseur du cadre, en fraction de la largeur : le remplissage ne doit ni le
 * recouvrir, ni s'en servir comme source de couleur. Contrairement à
 * scripts/fit-portrait-ovals.mjs, la carte de distance tient compte des ajours
 * entre les ailerons, donc c'est bien l'épaisseur réelle qui est attendue ici.
 */
const frameInset = { "ben-ali": 0.03, dupont: 0.026, martins: 0.032 };

/**
 * Efface le portrait et prolonge le décor de la carte à sa place.
 *
 * Pas de fondu vers le bord : le remplissage rejoint déjà exactement la couleur
 * du décor au contact, alors qu'un fondu ferait réapparaître les cheveux et le
 * nom d'origine juste sous la limite du trou.
 */
async function eraseBust(source, id, oval) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;

  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) solid[i] = data[i * 4 + 3] > 128 ? 1 : 0;
  const inset = frameInset[id] * W;
  const depth = distanceInside(solid, W, H, inset + 1);

  const b = busts[id];
  const cx = oval.cx * W;
  const cy = oval.cy * H;
  // Un peu plus large que le clip photo, pour ne pas laisser de liseré.
  const rx = oval.rx * W * 1.05;
  const ry = oval.ry * H * 1.05;
  const top = b.top * H;
  const bottom = b.bottom * H;
  const left = b.x * W;
  const right = (b.x + b.w) * W;
  const l = labels[id];
  const badges = badgeRows[id];

  const hole = new Uint8Array(W * H);
  const known = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      // Le cadre n'est ni reconstruit, ni utilisé comme source : sa dorure
      // déteindrait sur le remplissage.
      const interior = depth[i] >= inset;
      known[i] = interior ? 1 : 0;
      if (!interior) continue;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inOval = dx * dx + dy * dy <= 1;
      const inBust = y >= top && y <= bottom && x >= left && x <= right;
      const inLabel =
        y >= l.top * H && y <= l.bottom * H && x >= l.x * W && x <= (l.x + l.w) * W;
      if (inOval || inBust || inLabel) hole[i] = 1;
    }
  }

  const filled = eraseBadges(pushPullFill(data, W, H, hole, known, 0), W, H, badges);
  coverExtras(filled, W, H, extraCovers[id]);
  return { buffer: filled, W, H };
}

/**
 * Efface la rangée de badges. Pas d'inpainting ici : le décor du bas de carte
 * est un dégradé vertical, qu'un remplissage lisse aplatirait en un rectangle
 * bien visible. Une interpolation gauche-droite ligne à ligne le conserve.
 */
function eraseBadges(rgba, W, H, row) {
  if (!row) return rgba;
  const data = Buffer.from(rgba);
  blendAcross(data, W, H, row, 10);
  return data;
}

function coverExtras(data, W, H, spec) {
  if (!spec) return;
  for (const dest of spec.dests) {
    if (dest.sampleTop != null) {
      coverFromAbove(data, W, H, dest);
      continue;
    }
    blendAcross(
      data,
      W,
      H,
      {
        x: Math.round(dest.x * W),
        y: Math.round(dest.top * H),
        w: Math.round(dest.w * W),
        h: Math.round((dest.bottom - dest.top) * H),
      },
      2
    );
  }
}

function coverFromAbove(data, W, H, dest) {
  const x0 = Math.round(dest.x * W);
  const y0 = Math.round(dest.top * H);
  const dw = Math.round(dest.w * W);
  const dh = Math.round((dest.bottom - dest.top) * H);
  const srcY = Math.max(0, Math.round(dest.sampleTop * H));
  for (let y = 0; y < dh; y += 1) {
    const dy = y0 + y;
    if (dy < 0 || dy >= H) continue;
    for (let x = 0; x < dw; x += 1) {
      const dx = x0 + x;
      if (dx < 0 || dx >= W) continue;
      const di = (dy * W + dx) * 4;
      const si = (srcY * W + dx) * 4;
      data[di] = data[si];
      data[di + 1] = data[si + 1];
      data[di + 2] = data[si + 2];
      data[di + 3] = data[si + 3];
    }
  }
}

/**
 * Remplace un rectangle par une interpolation du décor pris juste à sa gauche
 * et à sa droite, ligne par ligne.
 *
 * `box` est entièrement remplacé ; le fondu s'étale en dehors, sur `fade`
 * pixels. C'est ce qui évite de laisser un liseré du motif d'origine : si le
 * dégradé démarrait à l'intérieur, les bords de `box` resteraient visibles.
 */
function blendAcross(data, W, H, box, fade) {
  const x0 = box.x - fade;
  const x1 = box.x + box.w + fade;
  const y0 = box.y - fade;
  const y1 = box.y + box.h + fade;
  const lx = Math.max(0, x0 - 4);
  const rx = Math.min(W - 1, x1 + 4);
  const ramp = (v, lo, hi) => {
    if (v >= lo && v <= hi) return 1;
    const d = v < lo ? lo - v : v - hi;
    return Math.max(0, 1 - d / fade);
  };

  for (let sy = Math.max(0, y0); sy < Math.min(H, y1); sy += 1) {
    const li = (sy * W + lx) * 4;
    const ri = (sy * W + rx) * 4;
    const ay = ramp(sy, box.y, box.y + box.h);
    for (let dx = Math.max(0, x0); dx < Math.min(W, x1); dx += 1) {
      const a = ay * ramp(dx, box.x, box.x + box.w);
      if (a <= 0) continue;
      const t = (dx - lx) / Math.max(1, rx - lx);
      const di = (sy * W + dx) * 4;
      for (let c = 0; c < 3; c += 1) {
        const fill = data[li + c] * (1 - t) + data[ri + c] * t;
        data[di + c] = Math.round(data[di + c] * (1 - a) + fill * a);
      }
    }
  }
}

/** Pastille noire identique sur les 3 cartes : le Y gold, fond noir. */
const logoThemes = {
  "ben-ali": { size: 78, theme: { bg: "#0B0B0B", fg: "#D4AF37" } },
  dupont: { size: 78, theme: { bg: "#0B0B0B", fg: "#D4AF37" } },
  martins: { size: 78, theme: { bg: "#0B0B0B", fg: "#D4AF37" } },
};

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

async function prepareIcon({ size, bg, fg }) {
  const rawPath = path.join(assets, "yakeey-icon-raw.png");
  const { data, info } = await sharp(rawPath)
    .ensureAlpha()
    .resize(size, size, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bgRgb = hexToRgb(bg);
  const fgRgb = hexToRgb(fg);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 20) continue;
    if (r > 210 && g > 200 && b > 185) {
      data[i + 3] = 0;
      continue;
    }
    const lum = (r + g + b) / 3;
    if (g > 120 && lum > 110 && g >= r - 10) {
      data[i] = fgRgb.r;
      data[i + 1] = fgRgb.g;
      data[i + 2] = fgRgb.b;
      continue;
    }
    if (lum < 110) {
      data[i] = bgRgb.r;
      data[i + 1] = bgRgb.g;
      data[i + 2] = bgRgb.b;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function applyLogo(cardPath, id) {
  const cfg = logoThemes[id];
  const row = badgeRows[id];
  if (!cfg || !row || !fs.existsSync(path.join(assets, "yakeey-icon-raw.png"))) return;

  const { size, theme } = cfg;
  const icon = await prepareIcon({
    size: Math.max(96, size * 2),
    bg: theme.bg,
    fg: theme.fg,
  });
  const iconResized = await sharp(icon)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const left = Math.round(row.x + (row.w - size) / 2);
  const top = Math.round(row.y + (row.h - size) / 2);
  const tmp = cardPath + ".logo.tmp.png";

  await sharp(cardPath)
    .composite([{ input: iconResized, left, top }])
    .png()
    .toFile(tmp);
  fs.renameSync(tmp, cardPath);
}

for (const [id, r] of Object.entries(ovals)) {
  const sourceWithFace = [
    path.join(assets, `card-${id}.pre-logo.png`),
    path.join(assets, `card-${id}.orig.png`),
    path.join(assets, `card-${id}.png`),
  ].find((f) => fs.existsSync(f));

  if (!sourceWithFace) {
    console.error("missing source", id);
    continue;
  }

  const { buffer: erased, W, H } = await eraseBust(sourceWithFace, id, r);
  const cx = r.cx * W;
  const cy = r.cy * H;
  const ex = r.rx * W;
  const ey = r.ry * H;
  const panelHint = {
    "ben-ali": { x: 0.1536, y: 0.0467, w: 0.7109, h: 0.5639 },
    dupont: { x: 0.168, y: 0.0859, w: 0.6576, h: 0.5303 },
    martins: { x: 0.1966, y: 0.0803, w: 0.6133, h: 0.501 },
  };
  let placeholder;
  if (panelHint[id]) {
    const p = panelHint[id];
    const px = p.x * W;
    const py = p.y * H;
    const pw = p.w * W;
    const ph = p.h * H;
    const pcx = px + pw / 2;
    const pcy = py + ph * 0.42;
    placeholder = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="${px + 8}" y="${py + 8}" width="${pw - 16}" height="${ph - 16}" rx="28"
    fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4" stroke-dasharray="14 10"/>
  <g transform="translate(${pcx}, ${pcy})" fill="rgba(255,255,255,0.65)">
    <circle cx="0" cy="-22" r="20"/>
    <path d="M-34 28 Q0 2 34 28 L34 48 L-34 48 Z"/>
  </g>
  <text x="${pcx}" y="${pcy + 62}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="22" font-weight="700"
    fill="rgba(255,255,255,0.82)" letter-spacing="2">PHOTO</text>
</svg>`);
  } else {
    const hintEx = ex * 0.93;
    const hintEy = ey * 0.93;
    placeholder = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <ellipse cx="${cx}" cy="${cy}" rx="${hintEx}" ry="${hintEy}"
    fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="4" stroke-dasharray="14 10"/>
  <g transform="translate(${cx}, ${cy - 10})" fill="rgba(255,255,255,0.65)">
    <circle cx="0" cy="-22" r="20"/>
    <path d="M-34 28 Q0 2 34 28 L34 48 L-34 48 Z"/>
  </g>
  <text x="${cx}" y="${cy + 62}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="22" font-weight="700"
    fill="rgba(255,255,255,0.82)" letter-spacing="2">PHOTO</text>
</svg>`);
  }

  const outBase = path.join(assets, `card-${id}.base.png`);
  const outClean = path.join(assets, `card-${id}.clean.png`);
  const outLive = path.join(assets, `card-${id}.png`);
  const tmp = outBase + ".tmp.png";

  const nr = nameRegions[id];
  const nx = Math.round(nr.x * W);
  const ny = Math.round(nr.y * H);
  const nw = Math.round(nr.w * W);
  const nh = Math.round(nr.h * H);
  // Le fond du bandeau est posé à part, en dépoli : ici, seulement le repère.
  const nameBlank = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${nw}" height="${nh}">
  <rect x="4" y="4" width="${nw - 8}" height="${nh - 8}" fill="none"
    stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-dasharray="8 6" rx="6"/>
  <text x="${nw / 2}" y="${nh / 2 + 6}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(nh * 0.42)}"
    font-weight="800" fill="${nr.color}" fill-opacity="0.75" letter-spacing="3"
    paint-order="stroke" stroke="${textHalo(nr.color)}" stroke-width="5"
    stroke-linejoin="round">NOM</text>
</svg>`);

  const ovrR = ovrRegions[id];
  const ox = Math.round(ovrR.x * W);
  const oy = Math.round(ovrR.y * H);
  const ow = Math.round(ovrR.w * W);
  const oh = Math.round(ovrR.h * H);
  const ovrBlank = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ow}" height="${oh}">
  <rect x="3" y="3" width="${ow - 6}" height="${oh - 6}" rx="${Math.round(oh * 0.14)}"
    fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2" stroke-dasharray="7 5"/>
  <g paint-order="stroke" stroke="${textHalo(ovrR.color)}" stroke-width="5"
    stroke-linejoin="round" fill="${ovrR.color}" fill-opacity="0.75" text-anchor="middle">
    <text x="${ow / 2}" y="${oh * 0.38}"
      font-family="Arial, sans-serif" font-size="${Math.round(oh * 0.2)}"
      font-weight="700">OVR</text>
    <text x="${ow / 2}" y="${oh * 0.78}"
      font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(oh * 0.42)}"
      font-weight="800">99</text>
  </g>
</svg>`);

  // Le dépoli se calcule sur la carte déjà nettoyée, pour flouter le décor
  // reconstruit et non le portrait d'origine.
  const erasedPng = await sharp(erased, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toBuffer();

  const layers = [
    await frostPatch(erasedPng, W, H, nr, nr.fill),
    { input: nameBlank, left: nx, top: ny },
    await frostPatch(erasedPng, W, H, ovrR, ovrR.fill, Math.round(oh * 0.18)),
    { input: ovrBlank, left: ox, top: oy },
  ];
  const sr = statPaint[id];
  if (sr) {
    const sx = Math.round(sr.x * W);
    const sy = Math.round(sr.y * H);
    const sw = Math.round(sr.w * W);
    const sh = Math.round(sr.h * H);
    const col = sw / PLAYER_STATS.length;
    const labelPx = Math.round(sh * 0.2);
    const valuePx = Math.round(sh * 0.5);
    const cells = PLAYER_STATS.map((stat, i) => {
      const cx = col * (i + 0.5);
      return `<text x="${cx}" y="${sh * 0.24}" font-family="Arial, sans-serif"
        font-size="${labelPx}" font-weight="700" letter-spacing="2.2">${stat.code}</text>
      <text x="${cx}" y="${sh * 0.78}" font-family="Arial, sans-serif"
        font-size="${valuePx}" font-weight="800">${stat.value}</text>`;
    }).join("");
    layers.push({
      input: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}">
  <g text-anchor="middle" fill="${sr.color}">${cells}</g>
</svg>`),
      left: sx,
      top: sy,
    });
  }

  // Version « propre » : aucun repère photo, c'est elle qui sert de fond dès
  // qu'une photo est posée, pour qu'une photo détourée ne révèle rien dessous.
  await sharp(erasedPng)
    .composite(layers)
    .png()
    .toFile(tmp);
  await applyLogo(tmp, id);
  fs.copyFileSync(tmp, outClean);

  // Version affichée tant qu'aucune photo n'est choisie.
  await sharp(outClean)
    .composite([{ input: placeholder, left: 0, top: 0 }])
    .png()
    .toFile(tmp);
  fs.copyFileSync(tmp, outBase);
  fs.copyFileSync(tmp, outLive);
  fs.unlinkSync(tmp);
  console.log("blanked photo+nom + logo", id);
}

console.log("done — ovales:", JSON.stringify(ovals));
