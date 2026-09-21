/**
 * Fond dépoli des bandeaux (nom, note générale) : le décor de la carte, flouté
 * et légèrement voilé, à la place d'un aplat opaque.
 *
 * Les mêmes valeurs sont reprises au rendu dans src/composePortrait.js, pour
 * que les gabarits et les cartes composées aient exactement le même aspect.
 */
import sharp from "sharp";

const BLUR = 0.035;
const TINT = 0.28;

/** Halo opposé à la couleur du texte, pour le détacher du fond flouté. */
export function textHalo(color) {
  const hex = String(color).replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
  const luma = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return luma > 140 ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.7)";
}

/**
 * @param {Buffer} source  carte encodée (PNG)
 * @param {{x:number,y:number,w:number,h:number}} r  zone, en fractions
 * @param {string} fill    teinte du voile
 * @param {number} radius  rayon des coins, en pixels
 * @returns {Promise<{input: Buffer, left: number, top: number}>} pour composite()
 */
export async function frostPatch(source, W, H, r, fill, radius = 0, tint = TINT) {
  const x = Math.round(r.x * W);
  const y = Math.round(r.y * H);
  const w = Math.round(r.w * W);
  const h = Math.round(r.h * H);
  const blur = Math.max(1, Math.round(W * BLUR));

  // Marge autour de la zone : sans elle le flou n'aurait que le bandeau à
  // échantillonner, et ne prendrait pas la couleur du décor voisin.
  const pad = blur * 2;
  const px = Math.max(0, x - pad);
  const py = Math.max(0, y - pad);
  const pw = Math.min(W - px, w + (x - px) + pad);
  const ph = Math.min(H - py, h + (y - py) + pad);

  const blurred = await sharp(source)
    .extract({ left: px, top: py, width: pw, height: ph })
    .blur(blur)
    .png()
    .toBuffer();

  const veil = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${fill}" fill-opacity="${tint}"/>
</svg>`);

  let patch = await sharp(blurred)
    .extract({ left: x - px, top: y - py, width: w, height: h })
    .composite([{ input: veil }])
    .png()
    .toBuffer();

  if (radius > 0) {
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" rx="${radius}" fill="#fff"/>
</svg>`);
    patch = await sharp(patch)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  return { input: patch, left: x, top: y };
}
