/**
 * Blank portrait + name on the ACC coach card, keep gold template.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { frostPatch, textHalo } from "./lib/frost.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "public", "assets");
const orig = path.join(assets, "card-coach-acc.orig.png");
const srcLive = path.join(assets, "card-coach-acc.png");
const raw = path.join(assets, "card-coach-acc-raw.png");

if (!fs.existsSync(orig)) {
  const source = fs.existsSync(srcLive) ? srcLive : raw;
  fs.copyFileSync(source, orig);
}

const source = orig;
const meta = await sharp(source).metadata();
const W = meta.width;
const H = meta.height;

const slotMask = path.join(assets, "card-coach-acc.slot-mask.png");
if (!fs.existsSync(slotMask)) {
  throw new Error("Lance d'abord scripts/build-photo-mask.mjs");
}

const name = { x: 0.1, y: 0.615, w: 0.8, h: 0.085, fill: "#0a0a0a", color: "#d4af37" };
const slotFill = "#16120c";

// Aplat sombre découpé exactement comme la zone photo : efface le portrait
// d'origine, le libellé ACC et la note, sans toucher au cadre doré.
const maskAlpha = await sharp(slotMask)
  .extractChannel("alpha")
  .raw()
  .toBuffer();
const solidCover = await sharp({
  create: { width: W, height: H, channels: 3, background: slotFill },
})
  .joinChannel(maskAlpha, { raw: { width: W, height: H, channels: 1 } })
  .png()
  .toBuffer();

const cx = Math.round(W / 2);
const cy = Math.round(H * 0.33);
const placeholder = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <g transform="translate(${cx}, ${cy})" fill="rgba(212,175,55,0.55)">
    <circle cx="0" cy="-22" r="20"/>
    <path d="M-34 30 Q0 4 34 30 L34 50 L-34 50 Z"/>
  </g>
  <text x="${cx}" y="${cy + 92}" text-anchor="middle"
    font-family="Arial, sans-serif" font-size="20" font-weight="700"
    fill="rgba(212,175,55,0.7)" letter-spacing="4">PHOTO</text>
</svg>`);

const nx = Math.round(name.x * W);
const ny = Math.round(name.y * H);
const nw = Math.round(name.w * W);
const nh = Math.round(name.h * H);
// Le fond du bandeau est posé à part, en dépoli : ici, seulement le repère.
const nameBlank = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${nw}" height="${nh}">
  <rect x="6" y="6" width="${nw - 12}" height="${nh - 12}" fill="none"
    stroke="rgba(212,175,55,0.45)" stroke-width="2" stroke-dasharray="8 6" rx="4"/>
  <text x="${nw / 2}" y="${nh / 2 + 7}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-size="${Math.round(nh * 0.38)}"
    font-weight="800" fill="${name.color}" fill-opacity="0.85" letter-spacing="4"
    paint-order="stroke" stroke="${textHalo(name.color)}" stroke-width="5"
    stroke-linejoin="round">NOM</text>
</svg>`);

const outBase = path.join(assets, "card-coach-acc.base.png");
const outClean = path.join(assets, "card-coach-acc.clean.png");
const tmp = outBase + ".tmp.png";

// Le dépoli se calcule sur la carte déjà nettoyée, pour flouter le fond du
// gabarit et non le portrait d'origine.
const covered = await sharp(source)
  .composite([{ input: solidCover, left: 0, top: 0 }])
  .png()
  .toBuffer();

// Version « propre » : aucun repère photo, c'est elle qui sert de fond dès
// qu'une photo est posée, pour qu'une photo détourée ne révèle rien dessous.
await sharp(covered)
  .composite([
    await frostPatch(covered, W, H, name, name.fill),
    { input: nameBlank, left: nx, top: ny },
  ])
  .png()
  .toFile(tmp);
fs.copyFileSync(tmp, outClean);

// Version affichée tant qu'aucune photo n'est choisie.
await sharp(outClean)
  .composite([{ input: placeholder, left: 0, top: 0 }])
  .png()
  .toFile(tmp);
fs.copyFileSync(tmp, outBase);
fs.copyFileSync(tmp, srcLive);
fs.unlinkSync(tmp);
console.log("blanked ACC", { W, H, name: { nx, ny, nw, nh } });
