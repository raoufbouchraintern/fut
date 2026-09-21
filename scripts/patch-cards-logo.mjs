/**
 * Remplace les drapeaux par le vrai logo Yakeey (brandbook), teinté par carte.
 * Adoucit aussi le contour blanc du stade.
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Prépare l'icône brandbook : fond crème → transparent, puis teinte optionnelle */
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

    // crème / blanc autour → transparent
    if (r > 210 && g > 200 && b > 185) {
      data[i + 3] = 0;
      continue;
    }

    const lum = (r + g + b) / 3;
    // Y mint (clair) → fg
    if (g > 120 && lum > 110 && g >= r - 10) {
      data[i] = fgRgb.r;
      data[i + 1] = fgRgb.g;
      data[i + 2] = fgRgb.b;
      continue;
    }
    // fond sombre de l'icône → bg
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

async function replaceFlag(cardFile, flag, theme) {
  const bak = path.join(assets, cardFile.replace(".png", ".pre-logo.png"));
  const srcPath = path.join(assets, cardFile);
  fs.copyFileSync(bak, srcPath);

  const meta = await sharp(srcPath).metadata();
  const { width, height } = meta;

  const iconSize = Math.round(Math.max(flag.w, flag.h) * 1.08);
  const icon = await prepareIcon({
    size: Math.max(96, iconSize * 2),
    bg: theme.bg,
    fg: theme.fg,
  });
  const iconResized = await sharp(icon)
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const pad = 3;
  const coverX = Math.max(0, flag.x - pad);
  const coverY = Math.max(0, flag.y - pad);
  const coverW = Math.min(width - coverX, flag.w + pad * 2);
  const coverH = Math.min(height - coverY, flag.h + pad * 2);

  const sampleY = Math.max(0, flag.y - Math.round(flag.h * 0.85));
  const sampleH = Math.max(4, flag.y - sampleY);
  const sample = await sharp(srcPath)
    .extract({ left: coverX, top: sampleY, width: coverW, height: sampleH })
    .resize(coverW, coverH, { fit: "fill" })
    .blur(1.5)
    .png()
    .toBuffer();

  const left = Math.round(flag.x + (flag.w - iconSize) / 2);
  const top = Math.round(flag.y + (flag.h - iconSize) / 2);
  const tmpPath = srcPath.replace(/\.png$/, ".tmp.png");

  await sharp(srcPath)
    .composite([
      { input: sample, left: coverX, top: coverY },
      { input: iconResized, left, top },
    ])
    .png()
    .toFile(tmpPath);
  fs.renameSync(tmpPath, srcPath);
  console.log("patched", cardFile);
}

async function softenStadium() {
  const src = path.join(assets, "stadium-pitch.png");
  const bak = path.join(assets, "stadium-pitch.pre-soft.png");
  if (!fs.existsSync(bak)) {
    // already softened once — restore from original if we have it
    // first run created bak from white version
  }
  if (fs.existsSync(bak)) fs.copyFileSync(bak, src);

  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const fill = { r: 18, g: 52, b: 40 }; // cadre extérieur
  const lineSoft = { r: 150, g: 190, b: 160 }; // lignes terrain adoucies

  const w = info.width;
  const h = info.height;
  const iat = (x, y) => (y * w + x) * 4;

  const isNearGreen = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = iat(nx, ny);
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (g > r + 25 && g > b + 15 && g > 80) return true;
      }
    }
    return false;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = iat(x, y);
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // fond blanc / quasi-blanc hors terrain
      if (r > 230 && g > 230 && b > 230) {
        data[i] = fill.r;
        data[i + 1] = fill.g;
        data[i + 2] = fill.b;
        continue;
      }
      if (r > 200 && g > 200 && b > 200) {
        const t = (r - 200) / 55;
        data[i] = Math.round(r * (1 - t) + fill.r * t);
        data[i + 1] = Math.round(g * (1 - t) + fill.g * t);
        data[i + 2] = Math.round(b * (1 - t) + fill.b * t);
        continue;
      }

      // contour blanc du trapèze (lourd) → vert menthe doux
      if (r > 210 && g > 210 && b > 210 && isNearGreen(x, y)) {
        data[i] = lineSoft.r;
        data[i + 1] = lineSoft.g;
        data[i + 2] = lineSoft.b;
      } else if (r > 185 && g > 185 && b > 185 && isNearGreen(x, y)) {
        // anti-alias lignes
        data[i] = Math.round(r * 0.35 + lineSoft.r * 0.65);
        data[i + 1] = Math.round(g * 0.35 + lineSoft.g * 0.65);
        data[i + 2] = Math.round(b * 0.35 + lineSoft.b * 0.65);
      }
    }
  }

  // masquer watermark alamy en bas
  for (let y = h - 18; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = iat(x, y);
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = 255;
    }
  }

  const tmp = path.join(assets, "stadium-pitch.tmp.png");
  await sharp(data, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toFile(tmp);
  fs.renameSync(tmp, src);
  console.log("stadium softened");
}

const themes = {
  "card-ben-ali.png": {
    flag: { x: 268, y: 798, w: 72, h: 48 },
    theme: { bg: "#2C2218", fg: "#E2C9A0" },
  },
  "card-dupont.png": {
    flag: { x: 268, y: 834, w: 72, h: 48 },
    theme: { bg: "#1F1A0C", fg: "#D4AF37" },
  },
  "card-martins.png": {
    flag: { x: 278, y: 788, w: 58, h: 40 },
    theme: { bg: "#0F2A28", fg: "#98DBC6" },
  },
};

for (const file of Object.keys(themes)) {
  const bak = path.join(assets, file.replace(".png", ".pre-logo.png"));
  if (!fs.existsSync(bak)) {
    console.error("missing backup", bak);
    process.exit(1);
  }
}

for (const [file, cfg] of Object.entries(themes)) {
  await replaceFlag(file, cfg.flag, cfg.theme);
}

// icône UI brand
const brand = await prepareIcon({ size: 256, bg: "#1A2E2C", fg: "#98DBC6" });
await sharp(brand).toFile(path.join(assets, "yakeey-icon.png"));
console.log("wrote yakeey-icon.png");

await softenStadium();
