/**
 * Carte entraîneur ACC (Imad Amhlal) — template manager + logo Yakeey, sans photo
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");
const srcPath = path.join(assets, "card-manager-blank.png");
const outPath = path.join(assets, "card-coach-acc.png");
const iconPath = path.join(assets, "yakeey-icon.png");

const W = 700;
const H = 978;

async function cutBlackBg(inputBuf) {
  const { data, info } = await sharp(inputBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 30 && data[i + 1] < 30 && data[i + 2] < 30) data[i + 3] = 0;
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

function goldRect(x, y, w, h, fill) {
  return {
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <rect width="${w}" height="${h}" rx="2" fill="${fill}"/>
      </svg>`
    ),
    left: x,
    top: y,
  };
}

let base = await sharp(srcPath).resize(W, H).png().toBuffer();
base = await cutBlackBg(base);

// Coords détectées sur le template (textes sombres)
base = await sharp(base)
  .composite([
    goldRect(148, 185, 115, 105, "#ebc978"), // MÁ
    goldRect(155, 450, 390, 40, "#e8c56a"), // bande nom
    goldRect(155, 585, 400, 140, "#e0be72"), // MÁNAGER
    goldRect(300, 810, 100, 75, "#d4af55"), // FUT CARDS
  ])
  .png()
  .toBuffer();

const logoSize = 175;
const logo = await sharp(iconPath)
  .resize(logoSize, logoSize, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const overlaySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="200" y="250" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="42" fill="#1a1408">ACC</text>
  <line x1="165" y1="264" x2="235" y2="264" stroke="#1a1408" stroke-width="2.2"/>
  <text x="350" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="24" fill="#1a1408">ACC (IMAD AMHLAL)</text>
  <text x="350" y="655" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="800" font-size="30" letter-spacing="4" fill="#1a1408">ENTRAÎNEUR</text>
  <text x="350" y="855" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="14" letter-spacing="4" fill="#1a1408">YAKEEY</text>
</svg>`;

const textPng = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
const tmp = outPath.replace(/\.png$/, ".tmp.png");
await sharp(base)
  .composite([
    { input: logo, left: Math.round((W - logoSize) / 2), top: 245 },
    { input: textPng, left: 0, top: 0 },
  ])
  .png({ compressionLevel: 6 })
  .toFile(tmp);
fs.renameSync(tmp, outPath);
console.log("wrote", outPath);
