/**
 * Détourage de la photo d'un conseiller : ne garde que la personne, sur fond
 * transparent, pour qu'elle se pose directement sur l'habillage de la carte.
 *
 * Tout se passe dans le navigateur (aucune photo n'est envoyée ailleurs), au
 * prix d'un modèle d'une quarantaine de mégaoctets. D'où l'import dynamique :
 * il n'est téléchargé qu'au premier détourage, puis mis en cache par le
 * navigateur.
 */
import { loadImage } from "./composePortrait.js";

const MODEL = "isnet_fp16";

/**
 * La plus grande fenêtre photo (celle de la carte ACC) fait ~530 px de large.
 * Au-delà de cette taille on ne gagne rien à l'écran, et les data URL restent
 * assez légères pour tenir dans le quota localStorage.
 */
const MAX_SIDE = 1100;

let enginePromise = null;

function engine() {
  enginePromise ??= import("@imgly/background-removal");
  return enginePromise;
}

/** WebP pour le poids, PNG si le navigateur ne sait pas l'encoder. */
function encode(canvas) {
  const webp = canvas.toDataURL("image/webp", 0.9);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

/** Réduit et ré-encode une photo, en conservant la transparence. */
export async function shrinkPhoto(src) {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}

/**
 * Photo sans son fond, ou `null` si le détourage échoue — l'appelant garde
 * alors la photo d'origine plutôt que de perdre l'upload.
 */
export async function cutOutPhoto(src) {
  let url = null;
  try {
    const { removeBackground } = await engine();
    const blob = await removeBackground(src, {
      model: MODEL,
      output: { format: "image/png" },
    });
    url = URL.createObjectURL(blob);
    return await shrinkPhoto(url);
  } catch (err) {
    console.error("Détourage impossible", err);
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
