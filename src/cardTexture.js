/**
 * Affiche les cartes finales telles quelles (déjà composées + fond transparent)
 */

const cache = new Map();

export const STYLES = {
  gold: { label: "Gold Rare", band: "75–84", glow: 0xc8a45a },
  neon: { label: "Neon Elite", band: "85–89", glow: 0xff4fd8 },
  emerald: { label: "Blue Star", band: "90–94", glow: 0x4db6ff },
  icon: { label: "Icon Marble", band: "95–99", glow: 0xd4af37 },
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Retourne un canvas = image carte fournie (pas de recomposition)
 */
export async function createCardTexture(advisor) {
  const src = advisor.cardAsset || advisor.portrait;
  const key = `final|${advisor.id}|${src}`;
  if (cache.has(key)) {
    const cached = cache.get(key);
    const c = document.createElement("canvas");
    c.width = cached.width;
    c.height = cached.height;
    c.getContext("2d").drawImage(cached, 0, 0);
    c._dataUrl = cached._dataUrl;
    return c;
  }

  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const dataUrl = canvas.toDataURL("image/png");
  canvas._dataUrl = dataUrl;

  const store = document.createElement("canvas");
  store.width = canvas.width;
  store.height = canvas.height;
  store.getContext("2d").drawImage(canvas, 0, 0);
  store._dataUrl = dataUrl;
  cache.set(key, store);
  return canvas;
}

export async function createCardDataUrl(advisor) {
  // Pour les cartes finales, URL directe = meilleure qualité (pas de re-encode)
  if (advisor.cardAsset) return advisor.cardAsset;
  const canvas = await createCardTexture(advisor);
  return canvas._dataUrl || canvas.toDataURL("image/png");
}

export function clearCardCache() {
  cache.clear();
}
