/**
 * Compose photo + nom sur une carte conseiller (base sans portrait).
 *
 * Cadre = buste plein bouclier (joueurs + ACC), détouré par un masque.
 * La photo se recadre en cover à l’intérieur, avec zoom / décalage.
 */

/**
 * Cadre PHOTO de chaque template (fractions de la carte).
 * Boîtes affichées par scripts/build-player-photo-masks.mjs (joueurs)
 * et scripts/build-photo-mask.mjs (ACC).
 */
export const PORTRAIT_REGIONS = {
  "ben-ali": {
    shape: "panel",
    x: 0.1536,
    y: 0.0467,
    w: 0.7109,
    h: 0.5639,
    rr: 0.08,
    fade: 0.1,
    mask: "/assets/card-ben-ali.photo-mask.png?v=1",
  },
  dupont: {
    shape: "panel",
    x: 0.168,
    y: 0.0859,
    w: 0.6576,
    h: 0.5303,
    rr: 0.08,
    fade: 0.1,
    mask: "/assets/card-dupont.photo-mask.png?v=1",
  },
  martins: {
    shape: "panel",
    x: 0.1966,
    y: 0.0803,
    w: 0.6133,
    h: 0.501,
    rr: 0.08,
    fade: 0.1,
    mask: "/assets/card-martins.photo-mask.png?v=1",
  },
  acc: {
    shape: "panel",
    x: 0.1114,
    y: 0.0723,
    w: 0.7771,
    h: 0.5596,
    rr: 0.1,
    fade: 0.12,
    mask: "/assets/card-coach-acc.photo-mask.png?v=2",
  },
};

/** Masques de détourage déjà chargés, par template. */
const portraitMasks = new Map();

/** Précharge le masque d’un template ; à appeler avant paintAdvisorCard. */
export async function ensurePortraitMask(templateId) {
  const src = PORTRAIT_REGIONS[templateId]?.mask;
  if (!src) return null;
  if (portraitMasks.has(src)) return portraitMasks.get(src);
  try {
    const img = await loadImage(src);
    portraitMasks.set(src, img);
    return img;
  } catch {
    portraitMasks.set(src, null);
    return null;
  }
}

export const DEFAULT_PHOTO_FIT = { zoom: 1, fx: 0.5, fy: 0.44 };

/** Zone nom (bandeau sous le portrait) */
export const NAME_REGIONS = {
  "ben-ali": { x: 0.16, y: 0.615, w: 0.68, h: 0.07, fill: "#e8e4de", color: "#5a3d28", maxPx: 52 },
  dupont: { x: 0.14, y: 0.62, w: 0.72, h: 0.075, fill: "#c9a24a", color: "#12100a", maxPx: 54 },
  martins: { x: 0.14, y: 0.585, w: 0.72, h: 0.07, fill: "#132039", color: "#f4f6fb", maxPx: 52 },
  acc: { x: 0.1, y: 0.615, w: 0.8, h: 0.085, fill: "#0a0a0a", color: "#d4af37", maxPx: 44 },
};

/** Note générale — haut gauche, style FUT */
export const OVR_REGIONS = {
  "ben-ali": { x: 0.165, y: 0.108, w: 0.145, h: 0.098, fill: "#e8e4de", color: "#5a3d28", maxPx: 52 },
  dupont: { x: 0.155, y: 0.098, w: 0.145, h: 0.098, fill: "#c9a24a", color: "#12100a", maxPx: 52 },
  martins: { x: 0.165, y: 0.098, w: 0.145, h: 0.094, fill: "#132039", color: "#f4f6fb", maxPx: 50 },
};

const STORAGE_KEY = "yakeey-advisor-customs-v5";
const DEFAULT_NAMES = {
  "ben-ali": "Ben Ali",
  dupont: "Dupont",
  martins: "Martins",
  acc: "ACC",
  "acc-coach": "ACC",
};

const GPU_MAX = 4096;

function sourceSize(img) {
  return {
    w: img.naturalWidth || img.width || 1,
    h: img.naturalHeight || img.height || 1,
  };
}

/** Réduit seulement au-delà des limites GPU, par demis, pour ne pas double-rééchantillonner. */
function capForGpu(photo) {
  const { w: nw, h: nh } = sourceSize(photo);
  if (Math.max(nw, nh) <= GPU_MAX) return photo;
  let w = nw;
  let h = nh;
  let src = photo;
  while (Math.max(w, h) > GPU_MAX) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    src = canvas;
  }
  return src;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function portraitBox(templateId, W = 1, H = 1) {
  const r = PORTRAIT_REGIONS[templateId] || PORTRAIT_REGIONS.dupont;
  const box =
    r.shape === "panel"
      ? { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H }
      : {
          x: (r.cx - r.rx) * W,
          y: (r.cy - r.ry) * H,
          w: r.rx * 2 * W,
          h: r.ry * 2 * H,
        };
  return {
    ...box,
    shape: r.shape || "ellipse",
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    rx: box.w / 2,
    ry: box.h / 2,
    rr: r.rr ?? 0,
    fade: r.fade ?? 0,
    mask: r.mask || null,
  };
}

export function normalizePhotoFit(fit, imgW, imgH, boxW, boxH) {
  const zoom = clamp(Number(fit?.zoom) || 1, 1, 3.5);
  const scale = Math.max(boxW / imgW, boxH / imgH) * zoom;
  const pw = imgW * scale;
  const ph = imgH * scale;
  const minFx = Math.min(0.5, boxW / (2 * pw));
  const maxFx = 1 - minFx;
  const minFy = Math.min(0.5, boxH / (2 * ph));
  const maxFy = 1 - minFy;
  return {
    zoom,
    fx: clamp(fit?.fx ?? DEFAULT_PHOTO_FIT.fx, minFx, maxFx),
    fy: clamp(fit?.fy ?? DEFAULT_PHOTO_FIT.fy, minFy, maxFy),
  };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {
        /* decode optional */
      }
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export function getStoredCustoms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getStoredCustom(advisorId) {
  const all = getStoredCustoms();
  return all[advisorId] || null;
}

export function saveStoredCustom(advisorId, custom) {
  const all = getStoredCustoms();
  if (!custom || (!custom.photo && !custom.name && custom.ovr == null)) {
    delete all[advisorId];
  } else {
    // Ni `photo` ni `card` ne sont stockés : la première se déduit de `cutout`,
    // la seconde est recomposée au chargement. Garder une carte PNG complète
    // par conseiller ferait sauter le quota localStorage.
    all[advisorId] = {
      photoRaw: custom.photoRaw || custom.photo || null,
      photoCut: custom.photoCut || null,
      cutout: Boolean(custom.cutout),
      name: custom.name || null,
      ovr: custom.ovr ?? null,
      templateId: custom.templateId || null,
      fit: custom.fit || null,
    };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    // Quota dépassé : les cartes restent correctes pour la session en cours.
    console.warn("Personnalisations non sauvegardées", err);
  }
}

export function defaultAdvisorName(advisorId) {
  const m = /^player-(\d+)$/.exec(advisorId);
  if (m) return `Conseiller ${Number(m[1]) + 1}`;
  return DEFAULT_NAMES[advisorId] || advisorId;
}

function fitNameFont(ctx, text, maxWidth, maxPx) {
  let size = maxPx;
  ctx.font = `800 ${size}px Arial Black, Arial, sans-serif`;
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `800 ${size}px Arial Black, Arial, sans-serif`;
  }
  return size;
}

export function parseOvr(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(99, n));
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPhotoInWindow(ctx, photo, advisorId, W, H, fit) {
  const box = portraitBox(advisorId, W, H);
  const src = capForGpu(photo);
  const { w: sw, h: sh } = sourceSize(src);
  const n = normalizePhotoFit(fit, sw, sh, box.w, box.h);
  const scale = Math.max(box.w / sw, box.h / sh) * n.zoom;
  const pw = sw * scale;
  const ph = sh * scale;
  const px = box.cx - pw * n.fx;
  const py = box.cy - ph * n.fy;

  if (box.shape !== "panel") {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(box.cx, box.cy, box.rx, box.ry, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, px, py, pw, ph);
    ctx.restore();
    return;
  }

  // Buste plein cadre (ACC) : détouré par le masque du bouclier
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext("2d", { alpha: true });
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = "high";

  const mask = box.mask ? portraitMasks.get(box.mask) : null;
  if (mask) {
    lctx.drawImage(src, px, py, pw, ph);
    lctx.globalCompositeOperation = "destination-in";
    lctx.drawImage(mask, 0, 0, W, H);
    ctx.drawImage(layer, 0, 0);
    return;
  }

  // Repli sans masque : rectangle arrondi + fondu bas vers le bandeau nom
  lctx.save();
  roundRect(lctx, box.x, box.y, box.w, box.h, Math.min(box.w, box.h) * box.rr);
  lctx.clip();
  lctx.drawImage(src, px, py, pw, ph);

  const fadeH = box.h * box.fade;
  if (fadeH > 0) {
    const fade = lctx.createLinearGradient(0, box.y + box.h - fadeH, 0, box.y + box.h);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    lctx.globalCompositeOperation = "destination-out";
    lctx.fillStyle = fade;
    lctx.fillRect(box.x, box.y + box.h - fadeH, box.w, fadeH);
  }
  lctx.restore();

  ctx.drawImage(layer, 0, 0);
}

/**
 * Fond dépoli des bandeaux : rayon du flou, en fraction de la largeur de carte,
 * et opacité du voile teinté. Le voile reste léger pour qu'on voie nettement le
 * décor flouté ; c'est le halo derrière le texte qui assure le contraste.
 */
const FROST_BLUR = 0.035;
const FROST_TINT = 0.28;

/** Halo opposé à la couleur du texte, pour le détacher du fond flouté. */
function textHalo(color) {
  const hex = String(color).replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
  const luma = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return luma > 140 ? "rgba(0, 0, 0, 0.65)" : "rgba(255, 255, 255, 0.7)";
}

/**
 * Plaque dépolie : le décor de la carte, flouté et voilé, découpé à la forme du
 * bandeau. Le flou échantillonne toute la carte, donc la plaque prend la
 * couleur de ce qui se trouve dessous, photo comprise.
 */
function drawFrosted(ctx, x, y, w, h, radius, fill, tint, W, H) {
  const glass = document.createElement("canvas");
  glass.width = W;
  glass.height = H;
  const gctx = glass.getContext("2d", { alpha: true });
  gctx.filter = `blur(${Math.round(W * FROST_BLUR)}px)`;
  gctx.drawImage(ctx.canvas, 0, 0);
  gctx.filter = "none";
  gctx.globalAlpha = tint;
  gctx.fillStyle = fill;
  gctx.fillRect(0, 0, W, H);
  gctx.globalAlpha = 1;

  ctx.save();
  if (radius > 0) {
    roundRect(ctx, x, y, w, h, radius);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  ctx.drawImage(glass, 0, 0);
  ctx.restore();
}

function drawOvr(ctx, advisorId, ovr, W, H) {
  const region = OVR_REGIONS[advisorId] || OVR_REGIONS.dupont;
  const n = parseOvr(ovr);
  if (n == null) return;
  const label = String(n);
  const rx = region.x * W;
  const ry = region.y * H;
  const rw = region.w * W;
  const rh = region.h * H;

  const radius = Math.min(rw, rh) * 0.18;
  drawFrosted(ctx, rx, ry, rw, rh, radius, region.fill, region.tint ?? FROST_TINT, W, H);

  ctx.save();
  ctx.fillStyle = region.color;
  ctx.shadowColor = textHalo(region.color);
  ctx.shadowBlur = Math.round(rh * 0.12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(rh * 0.22)}px Arial, sans-serif`;
  ctx.fillText("OVR", rx + rw / 2, ry + rh * 0.22);
  const size = fitNameFont(ctx, label, rw * 0.86, region.maxPx);
  ctx.font = `800 ${size}px Arial Black, Arial, sans-serif`;
  ctx.fillText(label, rx + rw / 2, ry + rh * 0.62);
  ctx.restore();
}

function drawName(ctx, advisorId, name, W, H) {
  const region = NAME_REGIONS[advisorId] || NAME_REGIONS.dupont;
  const rx = region.x * W;
  const ry = region.y * H;
  const rw = region.w * W;
  const rh = region.h * H;
  const label = String(name || "").trim().toUpperCase();
  if (!label) return;

  drawFrosted(ctx, rx, ry, rw, rh, 0, region.fill, region.tint ?? FROST_TINT, W, H);

  ctx.save();
  ctx.fillStyle = region.color;
  ctx.shadowColor = textHalo(region.color);
  ctx.shadowBlur = Math.round(rh * 0.22);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = fitNameFont(ctx, label, rw * 0.92, region.maxPx);
  ctx.font = `800 ${size}px Arial Black, Arial, sans-serif`;
  ctx.letterSpacing = "0.04em";
  ctx.fillText(label, rx + rw / 2, ry + rh / 2 + size * 0.04);
  ctx.restore();
}

export function paintAdvisorCard(ctx, card, photo, options, advisorId, W, H) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(card, 0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Le fond reçu est déjà la version sans repère photo (voir CLEAN_CARDS) :
  // rien à repeindre sous la photo, le décor de la carte reste visible autour.
  if (photo) drawPhotoInWindow(ctx, photo, advisorId, W, H, options?.fit);
  if (options?.name) {
    drawName(ctx, advisorId, options.name, W, H);
  }
  if (advisorId !== "acc" && options?.ovr != null && options.ovr !== "") {
    drawOvr(ctx, advisorId, options.ovr, W, H);
  }
}

/**
 * @param {string} baseCardUrl
 * @param {{ photo?: string|null, name?: string|null, ovr?: number|null, fit?: {zoom?:number, fx?:number, fy?:number} }} opts
 * @param {string} advisorId
 * @returns {Promise<string>} data URL PNG
 */
export async function composeAdvisorCard(baseCardUrl, opts, advisorId) {
  const options =
    typeof opts === "string" || opts instanceof HTMLImageElement
      ? { photo: opts, name: null }
      : opts || {};

  const card = await loadImage(baseCardUrl);
  const photo = options.photo ? await loadImage(options.photo) : null;
  if (photo) await ensurePortraitMask(advisorId);

  const W = card.naturalWidth || card.width;
  const H = card.naturalHeight || card.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: true });
  paintAdvisorCard(ctx, card, photo, options, advisorId, W, H);

  return canvas.toDataURL("image/png");
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
