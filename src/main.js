import anime from "animejs";
import {
  FORMATIONS,
  getAllAdvisors,
  squadRating,
  avgStats,
} from "./data.js";
import { createCardPreview } from "./preview3d.js";
import { createCardDataUrl, clearCardCache } from "./cardTexture.js";
import {
  composeAdvisorCard,
  paintAdvisorCard,
  loadImage,
  getStoredCustoms,
  saveStoredCustom,
  defaultAdvisorName,
  parseOvr,
  readFileAsDataUrl,
  DEFAULT_PHOTO_FIT,
  normalizePhotoFit,
  portraitBox,
  ensurePortraitMask,
} from "./composePortrait.js";
import { cutOutPhoto, shrinkPhoto } from "./removeBackground.js";

clearCardCache();

const BENCH_SIZE = 7;
const XI_SIZE = 11;
const SQUAD_SIZE = XI_SIZE + BENCH_SIZE; // 18 cartes indépendantes

/** Habillages visuels (le style se répète, l’identité non) */
const BASE_CARDS = {
  "ben-ali": "/assets/card-ben-ali.base.png?v=23",
  dupont: "/assets/card-dupont.base.png?v=27",
  martins: "/assets/card-martins.base.png?v=27",
  acc: "/assets/card-coach-acc.base.png?v=16",
};

/**
 * Mêmes habillages sans le repère photo du gabarit. Ils servent de fond dès
 * qu’une photo est posée : une photo détourée laisse voir le décor derrière
 * la personne, et le pointillé y réapparaîtrait.
 */
const CLEAN_CARDS = {
  "ben-ali": "/assets/card-ben-ali.clean.png?v=11",
  dupont: "/assets/card-dupont.clean.png?v=15",
  martins: "/assets/card-martins.clean.png?v=15",
  acc: "/assets/card-coach-acc.clean.png?v=7",
};

function cardArt(templateId, hasPhoto) {
  return (hasPhoto && CLEAN_CARDS[templateId]) || BASE_CARDS[templateId];
}
const TEMPLATE_IDS = ["ben-ali", "dupont", "martins"];
const TEMPLATES = getAllAdvisors();

/** Overrides carte (data URL) par id d’instance */
const portraitOverrides = new Map();
/** Customs photo/nom par id d’instance (player-0 … player-17) */
const advisorCustoms = new Map();

let formationKey = "433";
let starters = [];
let bench = [];
/** Entraîneur ACC (haut gauche) */
let coach = null;
let selectedSlot = null;
/** "manual" = choisir chaque carte / poste · "auto" = Auto XI */
let placeMode = "manual";
/** { kind: "slot"|"bench"|"coach", index?: number } */
let pickTarget = null;
/** @type {Map<string, string>} */
const cardUrls = new Map();

const slotsEl = document.getElementById("slots");
const benchEl = document.getElementById("bench");
const coachSlotEl = document.getElementById("coach-slot");
const formationSelect = document.getElementById("formation-select");
const formationLabel = document.getElementById("formation-label");
const squadRatingEl = document.getElementById("squad-rating");
const squadStatsEl = document.getElementById("squad-stats");
const lineAvgsEl = document.getElementById("line-avgs");
const selectedInfo = document.getElementById("selected-info");
const cardModal = document.getElementById("card-modal");
const pickModal = document.getElementById("pick-modal");
const pickGrid = document.getElementById("pick-grid");
const pickTitle = document.getElementById("pick-title");
const footHint = document.querySelector(".builder__foot");
const btnPlace = document.getElementById("btn-place");
const btnAutofill = document.getElementById("btn-autofill");
const photoUploadsGrid = document.getElementById("photo-uploads-grid");
const photoFitModal = document.getElementById("photo-fit-modal");
const photoFitCanvas = document.getElementById("photo-fit-canvas");
const photoFitZoom = document.getElementById("photo-fit-zoom");
const photoFitName = document.getElementById("photo-fit-name");

const preview = createCardPreview(document.getElementById("preview-3d"), {
  cameraZ: 3.35,
  enableDrag: true,
});
const modalPreview = createCardPreview(
  document.getElementById("modal-preview-3d"),
  {
    fov: 32,
    cameraZ: 2.85,
    autoRotate: true,
    enableDrag: true,
  }
);

/** Drag & drop state */
const drag = {
  active: false,
  lifted: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  from: null, // { kind: 'slot'|'bench', index, advisor, el }
  ghost: null,
  hoverSlot: null,
};

const DRAG_THRESHOLD = 7;

function instanceId(advisorOrId) {
  return typeof advisorOrId === "string" ? advisorOrId : advisorOrId?.id || "";
}

function templateIdOf(advisorOrId) {
  if (advisorOrId && typeof advisorOrId === "object") {
    if (advisorOrId.templateId && BASE_CARDS[advisorOrId.templateId]) {
      return advisorOrId.templateId;
    }
    return templateIdOf(advisorOrId.id);
  }
  const id = String(advisorOrId || "");
  if (BASE_CARDS[id]) return id;
  const stored = advisorCustoms.get(id);
  if (stored?.templateId && BASE_CARDS[stored.templateId]) return stored.templateId;
  const player = /^player-(\d+)$/.exec(id);
  if (player) return TEMPLATE_IDS[Number(player[1]) % TEMPLATE_IDS.length];
  if (id === "acc-coach" || id === "rajae-benabel-coach" || id.startsWith("acc")) return "acc";
  return TEMPLATE_IDS.find((t) => id === t || id.startsWith(`${t}-`)) || "";
}

function isCoachCard(advisorOrId) {
  const id = instanceId(advisorOrId);
  if (id === "acc-coach" || id === "rajae-benabel-coach") return true;
  if (advisorOrId && typeof advisorOrId === "object") {
    return advisorOrId.formation?.line === "coach" || advisorOrId.templateId === "acc";
  }
  return templateIdOf(id) === "acc";
}

function canEditCard(advisorOrId) {
  const id = instanceId(advisorOrId);
  return Boolean(id) && Boolean(templateIdOf(advisorOrId));
}

function findSquadAdvisor(id) {
  if (coach?.id === id) return coach;
  return starters.find((a) => a?.id === id) || bench.find((a) => a?.id === id) || null;
}

function cardLocationLabel(id) {
  if (coach?.id === id) return "ACC";
  const si = starters.findIndex((s) => s?.id === id);
  if (si >= 0) return FORMATIONS[formationKey].slots[si].role;
  const bi = bench.findIndex((b) => b?.id === id);
  if (bi >= 0) return `SUB${bi + 1}`;
  return "Libre";
}

function poolCard(id) {
  const placed = findSquadAdvisor(id);
  if (placed) return applyPortraitOverride(placed);
  if (id === "acc-coach") return applyPortraitOverride(makeCoach());
  const player = /^player-(\d+)$/.exec(id);
  if (!player) return null;
  return applyPortraitOverride(createSquadCard(Number(player[1])));
}

function poolAdvisors() {
  const players = Array.from({ length: SQUAD_SIZE }, (_, i) =>
    poolCard(`player-${i}`)
  );
  return [poolCard("acc-coach"), ...players].filter(Boolean);
}

function removeFromSquad(id) {
  starters = starters.map((s) => (s?.id === id ? null : s));
  bench = bench.map((b) => (b?.id === id ? null : b));
  if (coach?.id === id) coach = null;
}

function setPlaceMode(mode) {
  placeMode = mode;
  btnPlace?.classList.toggle("is-active", mode === "manual");
  btnAutofill?.classList.toggle("is-active", mode === "auto");
  if (footHint) {
    footHint.textContent =
      mode === "manual"
        ? "Clique un poste pour choisir une carte · glisse pour la déplacer · × pour retirer"
        : "Glisse pour échanger XI ↔ 7 changements · clic = 3D";
  }
}

function squadCards() {
  return [coach, ...starters, ...bench].filter(Boolean);
}

function createSquadCard(index) {
  const template = TEMPLATES[index % TEMPLATES.length];
  return {
    ...template,
    templateId: template.id,
    id: `player-${index}`,
    name: defaultAdvisorName(`player-${index}`),
    cardAsset: BASE_CARDS[template.id],
    portrait: BASE_CARDS[template.id],
  };
}

function hasCardCustom(custom) {
  return Boolean(custom?.photo || custom?.name || custom?.ovr != null);
}

function applyPortraitOverride(advisor) {
  if (!advisor) return advisor;
  const id = instanceId(advisor);
  const templateId = templateIdOf(advisor) || advisor.templateId;
  const custom = advisorCustoms.get(id);
  const override = portraitOverrides.get(id);
  const displayName = custom?.name || advisor.name || defaultAdvisorName(id);
  const displayOvr = custom?.ovr ?? advisor.rating;
  const baseArt = BASE_CARDS[templateId];
  if (!override) {
    if (baseArt && advisor.cardAsset?.startsWith("data:")) {
      return {
        ...advisor,
        templateId,
        name: displayName,
        rating: displayOvr,
        cardAsset: baseArt,
        portrait: baseArt,
      };
    }
    return { ...advisor, templateId, name: displayName, rating: displayOvr };
  }
  return {
    ...advisor,
    templateId,
    name: displayName,
    rating: displayOvr,
    cardAsset: override,
    portrait: override,
  };
}

function syncAdvisorPortraits() {
  starters = starters.map((s) => (s ? applyPortraitOverride(s) : null));
  bench = bench.map((b) => (b ? applyPortraitOverride(b) : null));
  if (coach) coach = applyPortraitOverride(coach);
  cardUrls.clear();
  clearCardCache();
}

async function rebuildAdvisorCard(advisorId) {
  const id = instanceId(advisorId);
  const templateId = templateIdOf(advisorId) || templateIdOf(findSquadAdvisor(id));
  if (!id || !BASE_CARDS[templateId]) return;
  const custom = advisorCustoms.get(id) || {};
  if (!hasCardCustom(custom)) {
    portraitOverrides.delete(id);
    saveStoredCustom(id, null);
  } else {
    const composed = await composeAdvisorCard(
      cardArt(templateId, Boolean(custom.photo)),
      {
        photo: custom.photo || null,
        name: custom.name || null,
        ovr: templateId === "acc" ? null : custom.ovr ?? null,
        fit: custom.fit || DEFAULT_PHOTO_FIT,
      },
      templateId
    );
    portraitOverrides.set(id, composed);
    saveStoredCustom(id, { ...custom, templateId });
  }
  syncAdvisorPortraits();
  await prefetchCards([
    ...starters.filter(Boolean),
    ...bench.filter(Boolean),
    coach,
  ]);
  render();
  renderPhotoUploads();
}

/** Cartes dont la photo est en cours de détourage. */
const cutoutBusy = new Set();

async function applyAdvisorPhoto(advisorId, fileOrDataUrl) {
  const id = instanceId(advisorId);
  if (!canEditCard(id) && !canEditCard(findSquadAdvisor(id))) return;
  const source =
    typeof fileOrDataUrl === "string"
      ? fileOrDataUrl
      : await readFileAsDataUrl(fileOrDataUrl);
  const photoRaw = await shrinkPhoto(source);
  const prev = advisorCustoms.get(id) || {};
  // La photo brute s'affiche tout de suite : le détourage prend quelques
  // secondes et la carte ne doit pas rester vide pendant ce temps.
  advisorCustoms.set(id, {
    ...prev,
    photoRaw,
    photoCut: null,
    cutout: true,
    photo: photoRaw,
    fit: { ...DEFAULT_PHOTO_FIT },
    templateId: templateIdOf(id) || prev.templateId,
  });
  await rebuildAdvisorCard(id);
  await runCutout(id);
  await openPhotoFitEditor(id);
}

/** Détoure la photo d'une carte et l'applique si l'option est active. */
async function runCutout(id) {
  const before = advisorCustoms.get(id);
  if (!before?.photoRaw || before.photoCut || cutoutBusy.has(id)) return;
  cutoutBusy.add(id);
  paintCutoutState(id);
  const photoCut = await cutOutPhoto(before.photoRaw);
  cutoutBusy.delete(id);

  const current = advisorCustoms.get(id);
  // La carte a pu être réinitialisée, ou recevoir une autre photo, entre-temps.
  if (!current || current.photoRaw !== before.photoRaw) {
    paintCutoutState(id);
    return;
  }
  if (!photoCut) {
    advisorCustoms.set(id, { ...current, cutout: false });
    paintCutoutState(id);
    return;
  }
  advisorCustoms.set(id, {
    ...current,
    photoCut,
    photo: current.cutout ? photoCut : current.photoRaw,
  });
  await rebuildAdvisorCard(id);
  paintCutoutState(id);
}

async function setAdvisorCutout(advisorId, on) {
  const id = instanceId(advisorId);
  const custom = advisorCustoms.get(id);
  if (!custom?.photoRaw) return;
  advisorCustoms.set(id, {
    ...custom,
    cutout: on,
    photo: on ? custom.photoCut || custom.photoRaw : custom.photoRaw,
  });
  await rebuildAdvisorCard(id);
  paintCutoutState(id);
  if (on && !custom.photoCut) await runCutout(id);
}

async function applyAdvisorName(advisorId, name) {
  const id = instanceId(advisorId);
  if (!canEditCard(id) && !canEditCard(findSquadAdvisor(id))) return;
  const cleaned = String(name || "").trim();
  const prev = advisorCustoms.get(id) || {};
  const next = { ...prev, templateId: templateIdOf(id) || prev.templateId };
  if (!cleaned) delete next.name;
  else next.name = cleaned;
  if (!hasCardCustom(next)) advisorCustoms.delete(id);
  else advisorCustoms.set(id, next);
  await rebuildAdvisorCard(id);
}

async function applyAdvisorOvr(advisorId, value) {
  const id = instanceId(advisorId);
  if (isCoachCard(id) || templateIdOf(id) === "acc") return;
  if (!canEditCard(id) && !canEditCard(findSquadAdvisor(id))) return;
  const prev = advisorCustoms.get(id) || {};
  const next = { ...prev, templateId: templateIdOf(id) || prev.templateId };
  const n = parseOvr(value);
  if (n == null) delete next.ovr;
  else next.ovr = n;
  if (!hasCardCustom(next)) advisorCustoms.delete(id);
  else advisorCustoms.set(id, next);
  await rebuildAdvisorCard(id);
}

async function resetAdvisorPhoto(advisorId) {
  const id = instanceId(advisorId);
  advisorCustoms.delete(id);
  await rebuildAdvisorCard(id);
}

const photoFit = {
  id: null,
  templateId: null,
  cardImg: null,
  photoImg: null,
  fit: { ...DEFAULT_PHOTO_FIT },
  name: null,
  ovr: null,
  cssW: 300,
  cssH: 450,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

function currentPhotoSize() {
  const img = photoFit.photoImg;
  return {
    w: img?.naturalWidth || img?.width || 1,
    h: img?.naturalHeight || img?.height || 1,
  };
}

function clampPhotoFit(next) {
  const box = portraitBox(photoFit.templateId, photoFit.cssW, photoFit.cssH);
  const { w, h } = currentPhotoSize();
  return normalizePhotoFit(next, w, h, box.w, box.h);
}

function paintFitPreview() {
  if (!photoFitCanvas || !photoFit.cardImg) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  photoFitCanvas.width = Math.round(photoFit.cssW * dpr);
  photoFitCanvas.height = Math.round(photoFit.cssH * dpr);
  photoFitCanvas.style.width = `${photoFit.cssW}px`;
  photoFitCanvas.style.height = `${photoFit.cssH}px`;
  const ctx = photoFitCanvas.getContext("2d", { alpha: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, photoFit.cssW, photoFit.cssH);
  paintAdvisorCard(
    ctx,
    photoFit.cardImg,
    photoFit.photoImg,
    { name: photoFit.name, ovr: photoFit.ovr, fit: photoFit.fit },
    photoFit.templateId,
    photoFit.cssW,
    photoFit.cssH
  );
}

async function openPhotoFitEditor(advisorId) {
  const id = instanceId(advisorId);
  const templateId = templateIdOf(id) || templateIdOf(findSquadAdvisor(id));
  const custom = advisorCustoms.get(id) || {};
  if (!custom.photo || !BASE_CARDS[templateId] || !photoFitModal) return;
  photoFit.id = id;
  photoFit.templateId = templateId;
  photoFit.name = custom.name || null;
  photoFit.ovr = templateId === "acc" ? null : custom.ovr ?? null;
  photoFit.cardImg = await loadImage(cardArt(templateId, true));
  photoFit.photoImg = await loadImage(custom.photo);
  await ensurePortraitMask(templateId);
  const cardW = photoFit.cardImg.naturalWidth || photoFit.cardImg.width;
  const cardH = photoFit.cardImg.naturalHeight || photoFit.cardImg.height;
  photoFit.cssW = 300;
  photoFit.cssH = Math.round((photoFit.cssW * cardH) / cardW);
  photoFit.fit = clampPhotoFit(custom.fit || DEFAULT_PHOTO_FIT);
  if (photoFitZoom) photoFitZoom.value = String(Math.round(photoFit.fit.zoom * 100));
  if (photoFitName) {
    photoFitName.textContent = custom.name || defaultAdvisorName(id);
  }
  photoFitModal.hidden = false;
  document.body.style.overflow = "hidden";
  paintFitPreview();
}

function closePhotoFitEditor() {
  if (!photoFitModal || photoFitModal.hidden) return;
  photoFitModal.hidden = true;
  photoFit.id = null;
  photoFit.dragging = false;
  if (cardModal?.hidden) document.body.style.overflow = "";
}

async function commitPhotoFit() {
  if (!photoFit.id) return;
  const id = photoFit.id;
  const prev = advisorCustoms.get(id) || {};
  advisorCustoms.set(id, { ...prev, fit: { ...photoFit.fit } });
  closePhotoFitEditor();
  await rebuildAdvisorCard(id);
}

function recenterPhotoFit() {
  photoFit.fit = clampPhotoFit(DEFAULT_PHOTO_FIT);
  if (photoFitZoom) photoFitZoom.value = String(Math.round(photoFit.fit.zoom * 100));
  paintFitPreview();
}

function panPhotoFit(dx, dy) {
  if (!photoFit.photoImg) return;
  const box = portraitBox(photoFit.templateId, photoFit.cssW, photoFit.cssH);
  const { w, h } = currentPhotoSize();
  const scale = Math.max(box.w / w, box.h / h) * photoFit.fit.zoom;
  photoFit.fit = clampPhotoFit({
    zoom: photoFit.fit.zoom,
    fx: photoFit.fit.fx - dx / (w * scale),
    fy: photoFit.fit.fy - dy / (h * scale),
  });
  paintFitPreview();
}

async function ensureCardUrl(advisor) {
  const key = `${advisor.id}-${advisor.formation?.role || "X"}-${advisor.rating}`;
  if (cardUrls.has(key)) return cardUrls.get(key);
  const withPhoto = applyPortraitOverride(advisor);
  const url = withPhoto.cardAsset?.startsWith("data:")
    ? withPhoto.cardAsset
    : await createCardDataUrl(withPhoto);
  cardUrls.set(key, url);
  return url;
}

function cardSrc(advisor) {
  if (!advisor) return "";
  const withPhoto = applyPortraitOverride(advisor);
  if (withPhoto.cardAsset) return withPhoto.cardAsset;
  const key = `${advisor.id}-${advisor.formation?.role || "X"}-${advisor.rating}`;
  return cardUrls.get(key) || advisor.style?.bg || "";
}

/**
 * Rafraîchit l'état « détourage en cours » d'une seule carte. Un re-rendu
 * complet du panneau ferait perdre le focus du champ en cours de saisie.
 */
function paintCutoutState(id) {
  const row = photoUploadsGrid?.querySelector(`.photo-upload[data-advisor="${id}"]`);
  if (!row) return;
  const busy = cutoutBusy.has(id);
  const custom = advisorCustoms.get(id) || {};
  row.classList.toggle("is-busy", busy);
  const box = row.querySelector(`[data-cutout="${id}"]`);
  if (box) {
    box.disabled = busy || !custom.photoRaw;
    box.checked = Boolean(custom.cutout);
  }
  const label = row.querySelector(`[data-cutout-label="${id}"]`);
  if (label) label.textContent = busy ? "Détourage…" : "Fond détouré";
  const preview = row.querySelector(".photo-upload__preview");
  const composed = portraitOverrides.get(id);
  if (preview && composed) preview.src = composed;
}

function renderPhotoUploads() {
  if (!photoUploadsGrid) return;
  if (photoUploadsGrid.contains(document.activeElement)) return;
  const advisors = poolAdvisors();

  photoUploadsGrid.innerHTML = advisors
    .map((a) => {
      const id = a.id;
      const custom = advisorCustoms.get(id) || {};
      const hasPhoto = Boolean(custom.photo);
      const hasName = Boolean(custom.name);
      const isCoach = isCoachCard(a);
      const hasOvr = !isCoach && custom.ovr != null;
      const hasCustom = hasCardCustom(custom);
      const previewSrc = cardSrc(a);
      const nameValue = custom.name || a.name || defaultAdvisorName(id);
      const ovrValue = custom.ovr ?? a.rating ?? "";
      const slotLabel = cardLocationLabel(id);
      const busy = cutoutBusy.has(id);
      const extras = [
        hasPhoto ? (custom.cutout && custom.photoCut ? "photo détourée" : "photo") : null,
        hasName ? "nom" : null,
        hasOvr ? "ovr" : null,
      ].filter(Boolean);
      const ovrFields = isCoach
        ? ""
        : `
          <label class="photo-upload__name">
            Note générale (OVR)
            <input type="number" min="1" max="99" inputmode="numeric" value="${ovrValue}"
              data-ovr-advisor="${id}" placeholder="Ex. 90" />
          </label>`;
      const ovrBtn = isCoach
        ? ""
        : `
          <button type="button" class="photo-upload__btn" data-apply-ovr="${id}">
            Note
          </button>`;
      return `
      <div class="photo-upload${busy ? " is-busy" : ""}" data-advisor="${id}">
        <img class="photo-upload__preview" src="${previewSrc}" alt="${nameValue}" />
        <div class="photo-upload__meta">
          <strong>${nameValue}</strong>
          <span>${slotLabel} · carte unique${extras.length ? " · " + extras.join(" + ") : ""}</span>
          <label class="photo-upload__name">
            Nom sur la carte
            <input type="text" maxlength="22" value="${String(nameValue).replace(/"/g, "&quot;")}"
              data-name-advisor="${id}" placeholder="Nom du conseiller" />
          </label>
          ${ovrFields}
          <label class="photo-upload__toggle">
            <input type="checkbox" data-cutout="${id}"
              ${custom.cutout ? "checked" : ""} ${hasPhoto && !busy ? "" : "disabled"} />
            <span data-cutout-label="${id}">${busy ? "Détourage…" : "Fond détouré"}</span>
          </label>
        </div>
        <div class="photo-upload__actions">
          <label class="photo-upload__btn">
            Photo
            <input type="file" accept="image/*" data-advisor="${id}" />
          </label>
          <button type="button" class="photo-upload__btn" data-adjust="${id}" ${hasPhoto ? "" : "disabled"}>
            Ajuster
          </button>
          <button type="button" class="photo-upload__btn" data-apply-name="${id}">
            Nom
          </button>
          ${ovrBtn}
          <button type="button" class="photo-upload__btn photo-upload__btn--ghost" data-reset="${id}" ${hasCustom ? "" : "disabled"}>
            Reset
          </button>
        </div>
      </div>`;
    })
    .join("");

  photoUploadsGrid.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      const id = e.target.dataset.advisor;
      if (!file || !id) return;
      try {
        await applyAdvisorPhoto(id, file);
      } catch (err) {
        console.error(err);
        alert("Impossible d’ajouter cette photo.");
      }
      e.target.value = "";
    });
  });

  photoUploadsGrid.querySelectorAll("[data-cutout]").forEach((box) => {
    box.addEventListener("change", async (e) => {
      try {
        await setAdvisorCutout(e.target.dataset.cutout, e.target.checked);
      } catch (err) {
        console.error(err);
        alert("Impossible de détourer cette photo.");
      }
    });
  });

  photoUploadsGrid.querySelectorAll("[data-adjust]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await openPhotoFitEditor(btn.dataset.adjust);
      } catch (err) {
        console.error(err);
      }
    });
  });

  photoUploadsGrid.querySelectorAll("[data-apply-name]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.applyName;
      const input = photoUploadsGrid.querySelector(`input[data-name-advisor="${id}"]`);
      try {
        await applyAdvisorName(id, input?.value || "");
      } catch (err) {
        console.error(err);
        alert("Impossible d’ajouter ce nom.");
      }
    });
  });

  photoUploadsGrid.querySelectorAll("input[data-name-advisor]").forEach((input) => {
    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      try {
        await applyAdvisorName(input.dataset.nameAdvisor, input.value);
      } catch (err) {
        console.error(err);
        alert("Impossible d’ajouter ce nom.");
      }
    });
  });

  photoUploadsGrid.querySelectorAll("[data-apply-ovr]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.applyOvr;
      const input = photoUploadsGrid.querySelector(`input[data-ovr-advisor="${id}"]`);
      try {
        await applyAdvisorOvr(id, input?.value || "");
      } catch (err) {
        console.error(err);
        alert("Impossible d’ajouter cette note.");
      }
    });
  });

  photoUploadsGrid.querySelectorAll("input[data-ovr-advisor]").forEach((input) => {
    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      try {
        await applyAdvisorOvr(input.dataset.ovrAdvisor, input.value);
      } catch (err) {
        console.error(err);
        alert("Impossible d’ajouter cette note.");
      }
    });
  });

  photoUploadsGrid.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await resetAdvisorPhoto(btn.dataset.reset);
    });
  });
}

async function loadStoredPortraits() {
  const stored = getStoredCustoms();
  for (const [id, raw] of Object.entries(stored)) {
    if (!raw) continue;
    if (typeof raw === "string") {
      portraitOverrides.set(id, raw);
      advisorCustoms.set(id, {
        photo: raw,
        photoRaw: raw,
        card: raw,
        templateId: templateIdOf(id),
      });
      continue;
    }
    const templateId = raw.templateId || templateIdOf(id);
    if (!BASE_CARDS[templateId]) continue;
    // `photo` est l'ancien format : une seule photo, jamais détourée.
    const photoRaw = raw.photoRaw || raw.photo || null;
    const photoCut = raw.photoCut || null;
    const cutout = Boolean(raw.cutout && photoCut);
    const custom = {
      photo: cutout ? photoCut : photoRaw,
      photoRaw,
      photoCut,
      cutout,
      name: raw.name || null,
      ovr: templateId === "acc" ? null : parseOvr(raw.ovr),
      card: raw.card || null,
      templateId,
      fit: raw.fit || DEFAULT_PHOTO_FIT,
    };
    if (templateId === "acc") delete custom.ovr;
    advisorCustoms.set(id, custom);
    if (hasCardCustom(custom)) {
      const composed = await composeAdvisorCard(
        cardArt(templateId, Boolean(custom.photo)),
        {
          photo: custom.photo,
          name: custom.name,
          ovr: templateId === "acc" ? null : custom.ovr,
          fit: custom.fit,
        },
        templateId
      );
      portraitOverrides.set(id, composed);
      saveStoredCustom(id, custom);
    } else if (custom.card) {
      portraitOverrides.set(id, custom.card);
    }
  }
}

function placeOnSlot(advisor, slotIndex) {
  const slot = FORMATIONS[formationKey].slots[slotIndex];
  return {
    ...advisor,
    formation: slot,
  };
}

function toBenchCard(advisor, index) {
  if (!advisor) return null;
  return {
    ...advisor,
    formation: { role: `SUB${index + 1}`, line: "bench" },
  };
}

function ensureSquadCards() {
  const byId = new Map(squadCards().map((a) => [a.id, a]));
  return Array.from({ length: SQUAD_SIZE }, (_, i) => {
    const id = `player-${i}`;
    if (byId.has(id)) return applyPortraitOverride(byId.get(id));
    return applyPortraitOverride(createSquadCard(i));
  });
}

function emptyBench() {
  return Array.from({ length: BENCH_SIZE }, () => null);
}

function makeCoach() {
  return {
    id: "acc-coach",
    templateId: "acc",
    name: defaultAdvisorName("acc-coach"),
    city: "Yakeey",
    rating: 92,
    styleKey: "gold",
    title: "ACC",
    cardAsset: BASE_CARDS.acc,
    displayStats: [
      { code: "LEAD", value: 90 },
      { code: "TAC", value: 88 },
      { code: "MOT", value: 91 },
      { code: "VIS", value: 87 },
      { code: "ORG", value: 89 },
      { code: "FID", value: 93 },
    ],
    style: {
      label: "",
      band: "ACC",
      glow: 0xc8a45a,
      bg: BASE_CARDS.acc,
    },
    formation: { role: "ACC", line: "coach" },
    portrait: BASE_CARDS.acc,
  };
}

function emptyStarters() {
  const n = FORMATIONS[formationKey].slots.length;
  starters = Array.from({ length: n }, () => null);
  bench = emptyBench();
  coach = null;
}

async function autofill() {
  setPlaceMode("auto");
  closePicker();
  const slots = FORMATIONS[formationKey].slots;
  const cards = ensureSquadCards();
  starters = cards.slice(0, slots.length).map((a, i) => placeOnSlot(a, i));
  bench = cards.slice(slots.length, slots.length + BENCH_SIZE).map((a, i) =>
    toBenchCard(a, i)
  );
  coach = applyPortraitOverride(makeCoach());
  selectedSlot = null;
  await prefetchCards([...starters, ...bench.filter(Boolean), coach]);
  render();
  renderPhotoUploads();
  animateSlotsIn();
}

function remapFormation() {
  const n = FORMATIONS[formationKey].slots.length;
  const kept = starters.filter(Boolean);
  starters = Array.from({ length: n }, (_, i) => {
    const a = kept[i];
    return a ? placeOnSlot(a, i) : null;
  });
  kept.slice(n).forEach((a) => {
    const empty = bench.findIndex((b) => !b);
    if (empty >= 0) bench[empty] = toBenchCard(a, empty);
  });
  render();
}

function clearSquad() {
  setPlaceMode("manual");
  emptyStarters();
  selectedSlot = null;
  closeCardModal();
  closePicker();
  endDrag(true);
  render();
  anime({
    targets: ".slot.empty .empty-card, .coach-slot .empty-card",
    scale: [0.85, 1],
    opacity: [0.4, 1],
    delay: anime.stagger(40),
    duration: 420,
    easing: "easeOutBack(1.4)",
  });
  selectedInfo.hidden = true;
  preview.clear();
}

async function prefetchCards(list) {
  await Promise.all(list.filter(Boolean).map((a) => ensureCardUrl(a)));
}

function emptyCardHtml() {
  return `
    <span class="empty-card">
      <span class="empty-card__plus" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="26" height="26">
          <polygon points="20,2 36,11 36,29 20,38 4,29 4,11"
            fill="none" stroke="#2ecc71" stroke-width="2.2"/>
          <path d="M20 12v16M12 20h16" stroke="#2ecc71"
            stroke-width="2.6" stroke-linecap="round"/>
        </svg>
      </span>
    </span>`;
}

function depthScale(y) {
  return (0.72 + (y / 100) * 0.34).toFixed(3);
}

function renderSlotCard(advisor, slot, index) {
  const pos = `left:${slot.x}%;top:${slot.y}%;--depth-scale:${depthScale(slot.y)}`;

  if (!advisor) {
    return `
      <button type="button" class="slot empty" data-slot="${index}"
        data-line="${slot.line}"
        style="${pos}" title="Ajouter une carte au poste ${slot.role}">
        ${emptyCardHtml()}
        <span class="slot__role">${slot.role}</span>
      </button>`;
  }

  const src = cardSrc(advisor);
  const selected = selectedSlot === index ? " is-selected" : "";

  return `
    <button type="button" class="slot filled${selected}" data-slot="${index}"
      data-line="${slot.line}" data-id="${advisor.id}"
      style="${pos}" title="Glisser · clic = 3D">
      <span class="slot__card-wrap">
        <img class="card-art" src="${src}" alt="${advisor.name}" draggable="false" />
        <span class="slot__remove" data-unplace="${advisor.id}" title="Retirer du poste">×</span>
      </span>
      <span class="slot__role">${slot.role}</span>
    </button>`;
}

function render() {
  const formation = FORMATIONS[formationKey];
  formationLabel.textContent = formation.label;

  slotsEl.innerHTML = formation.slots
    .map((slot, i) => renderSlotCard(starters[i], slot, i))
    .join("");

  // Carte entraîneur ACC
  if (coach) {
    coachSlotEl.className = "slot coach-slot filled";
    coachSlotEl.innerHTML = `
      <span class="slot__card-wrap">
        <img class="card-art" src="${cardSrc(coach)}" alt="${coach.name}" draggable="false" />
        <span class="slot__remove" data-unplace="${coach.id}" title="Retirer l'entraîneur">×</span>
      </span>
      <span class="slot__role">ACC</span>`;
    coachSlotEl.title = `Entraîneur ACC · ${coach.name} · clic = 3D`;
  } else {
    coachSlotEl.className = "slot coach-slot empty";
    coachSlotEl.innerHTML = `
      ${emptyCardHtml()}
      <span class="slot__role">ACC</span>`;
    coachSlotEl.title = "Entraîneur ACC";
  }

  const filled = starters.filter(Boolean);
  const benchFilled = bench.filter(Boolean).length;
  const benchCountEl = document.getElementById("bench-count");
  if (benchCountEl) benchCountEl.textContent = `${benchFilled} / ${BENCH_SIZE}`;

  // Toujours 7 slots de changements (vides ou remplis)
  while (bench.length < BENCH_SIZE) bench.push(null);
  if (bench.length > BENCH_SIZE) bench = bench.slice(0, BENCH_SIZE);

  benchEl.innerHTML = bench
    .map((a, i) => {
      if (!a) {
        return `
      <button type="button" class="bench__card bench__card--empty" data-bench="${i}"
        title="Ajouter une carte au changement ${i + 1}">
        <span class="bench__empty">
          <span class="bench__num">${i + 1}</span>
          <span class="bench__plus">+</span>
        </span>
      </button>`;
      }
      return `
      <button type="button" class="bench__card" data-bench="${i}" data-id="${a.id}"
        title="Changement ${i + 1} · ${a.name}">
        <span class="bench__num bench__num--on">${i + 1}</span>
        <span class="slot__card-wrap">
          <img class="card-art" src="${cardSrc(a)}" alt="${a.name}" draggable="false" />
          <span class="slot__remove" data-unplace="${a.id}" title="Retirer du banc">×</span>
        </span>
      </button>`;
    })
    .join("");

  const rating = squadRating(filled);
  squadRatingEl.textContent = String(rating);
  anime({
    targets: squadRatingEl,
    scale: [1.12, 1],
    duration: 380,
    easing: "easeOutElastic(1, .85)",
  });

  const avg = avgStats(filled);
  const panelKeys = ["PUB", "CLU", "TRF", "SAT", "TXN", "CA"];
  squadStatsEl.innerHTML = panelKeys
    .map((k) => {
      const val = filled.length ? avg[k] || "—" : "—";
      return `<div><span>${k}</span><b>${val}</b></div>`;
    })
    .join("");

  const groups = [
    { label: "Attack", lines: ["att"] },
    { label: "Midfield", lines: ["mid"] },
    { label: "Defense", lines: ["def"] },
    { label: "Goalkeeper", lines: ["gk"] },
  ];
  lineAvgsEl.innerHTML = groups
    .map((g) => {
      const players = starters.filter(
        (s, i) => s && g.lines.includes(formation.slots[i].line)
      );
      const a = avgStats(players);
      const ovr = players.length
        ? Math.round(players.reduce((s, p) => s + p.rating, 0) / players.length)
        : 0;
      return `
      <div class="line-avgs__row">
        <div>
          <strong>${g.label}</strong>
          <span>${players.length} · OVR ${ovr || "—"}</span>
        </div>
        <div class="line-avgs__stats">
          <span>PUB ${players.length ? a.PUB + "%" : "—"}</span>
          <span>TXN ${players.length ? a.TXN : "—"}</span>
        </div>
      </div>`;
    })
    .join("");

  bindSlotEvents(formation);
  renderPhotoUploads();
}

function swapSlots(fromIdx, toIdx) {
  const a = starters[fromIdx];
  const b = starters[toIdx];
  if (!a) return;
  starters[toIdx] = placeOnSlot(a, toIdx);
  starters[fromIdx] = b ? placeOnSlot(b, fromIdx) : null;
}

/* ——— Drag & drop ——— */

function createGhost(advisor, el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "card-drag-ghost";
  ghost.innerHTML = `<img src="${cardSrc(advisor)}" alt="" draggable="false" />`;
  const w = Math.max(rect.width, 72);
  ghost.style.width = `${w}px`;
  drag.offsetX = clientX - rect.left;
  drag.offsetY = clientY - rect.top;
  ghost.style.left = `${clientX - drag.offsetX}px`;
  ghost.style.top = `${clientY - drag.offsetY}px`;
  document.body.appendChild(ghost);
  anime({
    targets: ghost,
    scale: [0.92, 1.12],
    rotate: [0, -6],
    opacity: [0.7, 1],
    duration: 220,
    easing: "easeOutBack(1.4)",
  });
  return ghost;
}

function moveGhost(clientX, clientY) {
  if (!drag.ghost) return;
  drag.ghost.style.left = `${clientX - drag.offsetX}px`;
  drag.ghost.style.top = `${clientY - drag.offsetY}px`;
}

function clearDropHighlights() {
  document
    .querySelectorAll(
      ".slot.is-drop-target, .bench.is-drop-target, .bench__card.is-drop-target, .coach-slot.is-drop-target"
    )
    .forEach((el) => el.classList.remove("is-drop-target"));
  drag.hoverSlot = null;
}

function highlightDropTarget(clientX, clientY) {
  clearDropHighlights();
  if (drag.ghost) drag.ghost.style.visibility = "hidden";
  const under = document.elementFromPoint(clientX, clientY);
  if (drag.ghost) drag.ghost.style.visibility = "visible";
  if (!under) return null;

  const coachHit = under.closest?.(".coach-slot");
  if (coachHit) {
    // Manager fixe : pas de dépôt dessus
    return null;
  }

  const slot = under.closest?.(".slot:not(.coach-slot)");
  if (slot && slotsEl.contains(slot)) {
    const idx = Number(slot.dataset.slot);
    if (drag.from?.kind === "slot" && drag.from.index === idx) return null;
    slot.classList.add("is-drop-target");
    drag.hoverSlot = idx;
    return { kind: "slot", index: idx };
  }

  const benchCard = under.closest?.(".bench__card");
  if (benchCard && benchEl.contains(benchCard)) {
    const idx = Number(benchCard.dataset.bench);
    if (drag.from?.kind === "bench" && drag.from.index === idx) return null;
    benchCard.classList.add("is-drop-target");
    benchEl.classList.add("is-drop-target");
    return { kind: "bench", index: idx };
  }

  if (under.closest?.(".bench") && drag.from?.kind === "slot") {
    const emptyIdx = bench.findIndex((b) => !b);
    const idx = emptyIdx >= 0 ? emptyIdx : 0;
    const el = benchEl.querySelector(`[data-bench="${idx}"]`);
    el?.classList.add("is-drop-target");
    benchEl.classList.add("is-drop-target");
    return { kind: "bench", index: idx };
  }
  return null;
}

function liftDrag(clientX, clientY) {
  if (drag.lifted || !drag.from) return;
  drag.lifted = true;
  document.body.classList.add("is-dragging-card");
  drag.ghost = createGhost(drag.from.advisor, drag.from.el, clientX, clientY);
  drag.from.el.classList.add("is-dragging");
  anime({
    targets: drag.from.el.querySelector(".card-art, .empty-card"),
    opacity: 0.25,
    scale: 0.9,
    duration: 180,
    easing: "easeOutQuad",
  });
}

function endDrag(silent = false) {
  clearDropHighlights();
  document.body.classList.remove("is-dragging-card");
  if (drag.ghost) {
    drag.ghost.remove();
    drag.ghost = null;
  }
  if (drag.from?.el) drag.from.el.classList.remove("is-dragging");
  drag.active = false;
  drag.lifted = false;
  drag.pointerId = null;
  drag.from = null;
  if (!silent) {
    /* no-op */
  }
}

function settleCoachAnimation() {
  const el = coachSlotEl?.querySelector(".card-art");
  if (!el) return;
  anime({
    targets: el,
    scale: [1.18, 1],
    rotate: [-6, 0],
    duration: 460,
    easing: "easeOutElastic(1, .8)",
  });
}

function settleDropAnimation(slotIndex) {
  const el = document.querySelector(`.slot[data-slot="${slotIndex}"] .card-art`);
  if (!el) return;
  anime({
    targets: el,
    scale: [1.2, 1],
    rotate: [-8, 0],
    opacity: [0.5, 1],
    duration: 480,
    easing: "easeOutElastic(1, .75)",
  });
}

function settleBenchAnimation(benchIndex) {
  const el = document.querySelector(
    `.bench__card[data-bench="${benchIndex}"] .card-art`
  );
  if (!el) return;
  anime({
    targets: el,
    scale: [1.15, 1],
    rotate: [-6, 0],
    duration: 420,
    easing: "easeOutElastic(1, .8)",
  });
}

function commitDrop(target) {
  const from = drag.from;
  if (!from) {
    endDrag();
    return;
  }

  if (target?.kind === "slot") {
    const toIdx = target.index;
    if (from.kind === "slot") {
      if (from.index === toIdx) {
        snapGhostBack(() => {
          endDrag();
          render();
        });
        return;
      }
      swapSlots(from.index, toIdx);
      endDrag();
      render();
      settleDropAnimation(toIdx);
      if (starters[from.index]) settleDropAnimation(from.index);
      updateSelectedPanel(starters[toIdx]);
      preview.show(starters[toIdx]);
      return;
    }
    if (from.kind === "bench") {
      const adv = bench[from.index];
      if (!adv) {
        endDrag();
        render();
        return;
      }
      const displaced = starters[toIdx];
      // Échange XI ↔ changement (garde 7 slots)
      starters[toIdx] = placeOnSlot(adv, toIdx);
      bench[from.index] = displaced ? toBenchCard(displaced, from.index) : null;
      endDrag();
      render();
      settleDropAnimation(toIdx);
      if (bench[from.index]) settleBenchAnimation(from.index);
      return;
    }
  }

  if (target?.kind === "bench") {
    const toBench = target.index ?? 0;

    if (from.kind === "slot") {
      const adv = starters[from.index];
      if (!adv) {
        endDrag();
        render();
        return;
      }
      const displaced = bench[toBench];
      bench[toBench] = toBenchCard(adv, toBench);
      starters[from.index] = displaced ? placeOnSlot(displaced, from.index) : null;
      endDrag();
      render();
      settleBenchAnimation(toBench);
      if (starters[from.index]) settleDropAnimation(from.index);
      return;
    }

    if (from.kind === "bench") {
      if (from.index === toBench) {
        snapGhostBack(() => {
          endDrag();
          render();
        });
        return;
      }
      const a = bench[from.index];
      const b = bench[toBench];
      bench[toBench] = a ? toBenchCard(a, toBench) : null;
      bench[from.index] = b ? toBenchCard(b, from.index) : null;
      endDrag();
      render();
      if (bench[toBench]) settleBenchAnimation(toBench);
      if (bench[from.index]) settleBenchAnimation(from.index);
      return;
    }
  }

  // drop invalid → retour animé
  snapGhostBack(() => {
    endDrag();
    render();
  });
}

function snapGhostBack(done) {
  if (!drag.ghost || !drag.from?.el) {
    done?.();
    return;
  }
  const rect = drag.from.el.getBoundingClientRect();
  anime({
    targets: drag.ghost,
    left: rect.left,
    top: rect.top,
    scale: 1,
    rotate: 0,
    duration: 280,
    easing: "easeInOutQuad",
    complete: () => done?.(),
  });
}

function onPointerDown(e, from) {
  if (e.button != null && e.button !== 0) return;
  if (!cardModal.hidden) return;
  drag.active = true;
  drag.lifted = false;
  drag.pointerId = e.pointerId;
  drag.startX = e.clientX;
  drag.startY = e.clientY;
  drag.from = from;
  try {
    from.el.setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!drag.active || drag.pointerId !== e.pointerId) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.lifted) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    liftDrag(e.clientX, e.clientY);
  }
  moveGhost(e.clientX, e.clientY);
  highlightDropTarget(e.clientX, e.clientY);
}

function onPointerUp(e) {
  if (!drag.active || (drag.pointerId != null && drag.pointerId !== e.pointerId))
    return;

  const wasLifted = drag.lifted;
  const from = drag.from;

  if (!wasLifted) {
    // simple clic → 3D
    endDrag();
    if (from?.kind === "slot") {
      openCard3D(starters[from.index], from.index);
    } else if (from?.kind === "bench") {
      openCard3D(bench[from.index] || from.advisor, null);
    }
    return;
  }

  const target = highlightDropTarget(e.clientX, e.clientY);
  commitDrop(target);
}

function bindUnplace(root) {
  root?.querySelectorAll("[data-unplace]").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.unplace;
      if (!id) return;
      setPlaceMode("manual");
      removeFromSquad(id);
      selectedSlot = null;
      render();
    });
  });
}

function bindSlotEvents(formation) {
  slotsEl.querySelectorAll(".slot.empty").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (drag.lifted) return;
      openPicker({ kind: "slot", index: Number(btn.dataset.slot) });
    });
  });

  slotsEl.querySelectorAll(".slot.filled").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      if (e.target.closest("[data-unplace]")) return;
      const idx = Number(btn.dataset.slot);
      const advisor = starters[idx];
      if (!advisor) return;
      onPointerDown(e, { kind: "slot", index: idx, advisor, el: btn });
    });
  });

  benchEl.querySelectorAll(".bench__card").forEach((btn) => {
    const idx = Number(btn.dataset.bench);
    const advisor = bench[idx];
    if (!advisor) {
      btn.addEventListener("click", () => {
        if (drag.lifted) return;
        openPicker({ kind: "bench", index: idx });
      });
      return;
    }
    btn.addEventListener("pointerdown", (e) => {
      if (e.target.closest("[data-unplace]")) return;
      onPointerDown(e, { kind: "bench", index: idx, advisor, el: btn });
    });
  });

  if (coachSlotEl) {
    coachSlotEl.onclick = (e) => {
      e.preventDefault();
      if (e.target.closest("[data-unplace]")) return;
      if (drag.lifted) return;
      if (!coach) {
        openPicker({ kind: "coach" });
        return;
      }
      openCard3D(coach, null);
    };
  }

  bindUnplace(slotsEl);
  bindUnplace(benchEl);
  bindUnplace(coachSlotEl);
}

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", () => {
  if (!drag.active) return;
  snapGhostBack(() => {
    endDrag();
    render();
  });
});

function updateSelectedPanel(advisor) {
  if (!advisor) return;
  selectedInfo.hidden = false;
  const isCoach = isCoachCard(advisor);
  document.getElementById("sel-theme").textContent = isCoach
    ? "ACC"
    : `${advisor.style.label} · ${advisor.style.band}`;
  document.getElementById("sel-name").textContent = advisor.name;
  document.getElementById("sel-meta").textContent =
    `${advisor.formation?.role || "BANC"} · ${advisor.city}`;
  const ovrEl = document.getElementById("sel-ovr");
  if (ovrEl) {
    ovrEl.parentElement.hidden = isCoach;
    ovrEl.textContent = isCoach ? "" : advisor.rating;
  }
  document.getElementById("sel-formula").textContent = isCoach
    ? ""
    : advisor.displayStats?.map((s) => `${s.code} ${s.value}`).join(" · ") || "";

  anime({
    targets: selectedInfo,
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 360,
    easing: "easeOutCubic",
  });
}

function openCard3D(advisor, slotIndex = null) {
  if (!advisor) return;
  selectedSlot = slotIndex;
  document
    .querySelectorAll(".slot.filled.is-selected")
    .forEach((el) => el.classList.remove("is-selected"));
  if (slotIndex != null) {
    document
      .querySelector(`.slot.filled[data-slot="${slotIndex}"]`)
      ?.classList.add("is-selected");
  }

  updateSelectedPanel(advisor);

  const payload = {
    ...advisor,
    formation: advisor.formation || { role: "ADV" },
  };

  preview.show(payload);

  const isCoach = isCoachCard(advisor);

  const themeEl = document.getElementById("modal-card-theme");
  const ovrRow = document.querySelector(".card-modal__ovr");

  if (isCoach) {
    themeEl.textContent = "ACC";
    themeEl.hidden = false;
  } else {
    themeEl.hidden = false;
    themeEl.textContent = `${advisor.style.label} · ${advisor.style.band}`;
  }
  if (ovrRow) ovrRow.hidden = isCoach;
  const modalOvr = document.getElementById("modal-card-ovr");
  if (modalOvr) modalOvr.textContent = isCoach ? "" : advisor.rating;

  document.getElementById("modal-card-name").textContent = advisor.name;
  document.getElementById("modal-card-meta").textContent =
    `${advisor.formation?.role || "BANC"} · ${advisor.city}`;

  cardModal.hidden = false;
  document.body.style.overflow = "hidden";
  modalPreview.resize();
  modalPreview.show(payload);

  anime({
    targets: ".card-modal__dialog",
    opacity: [0, 1],
    scale: [0.92, 1],
    duration: 380,
    easing: "easeOutCubic",
  });
}

function closeCardModal() {
  if (cardModal.hidden) return;
  cardModal.hidden = true;
  document.body.style.overflow = "";
  modalPreview.clear();
}

function pickTargetLabel() {
  if (!pickTarget) return "Poste";
  if (pickTarget.kind === "coach") return "Entraîneur ACC";
  if (pickTarget.kind === "bench") return `Changement ${pickTarget.index + 1}`;
  return FORMATIONS[formationKey].slots[pickTarget.index]?.role || "Poste";
}

function isOnPickTarget(id) {
  if (!pickTarget) return false;
  if (pickTarget.kind === "coach") return coach?.id === id;
  if (pickTarget.kind === "bench") return bench[pickTarget.index]?.id === id;
  return starters[pickTarget.index]?.id === id;
}

async function renderPicker() {
  if (!pickGrid) return;
  const cards =
    pickTarget?.kind === "coach"
      ? [poolCard("acc-coach")].filter(Boolean)
      : Array.from({ length: SQUAD_SIZE }, (_, i) => poolCard(`player-${i}`));
  await prefetchCards(cards);
  pickGrid.innerHTML = cards
    .map((a) => {
      const here = isOnPickTarget(a.id);
      const loc = cardLocationLabel(a.id);
      const placed = loc !== "Libre";
      return `
      <button type="button" class="pick-card${here ? " is-here" : ""}${placed ? " is-placed" : ""}"
        data-pick="${a.id}">
        <img src="${cardSrc(a)}" alt="${a.name}" draggable="false" />
        <strong>${a.name}</strong>
        <span>${here ? "Ici" : loc}</span>
      </button>`;
    })
    .join("");
  pickGrid.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      commitPick(btn.dataset.pick).catch(console.error);
    });
  });
}

async function openPicker(target) {
  setPlaceMode("manual");
  pickTarget = target;
  if (pickTitle) pickTitle.textContent = pickTargetLabel();
  await renderPicker();
  if (pickModal) {
    pickModal.hidden = false;
    document.body.style.overflow = "hidden";
  }
}

function closePicker() {
  if (!pickModal || pickModal.hidden) return;
  pickModal.hidden = true;
  pickTarget = null;
  if (cardModal.hidden) document.body.style.overflow = "";
}

async function commitPick(id) {
  if (!pickTarget || !id) return;
  const target = pickTarget;
  const card = poolCard(id);
  if (!card) return;

  if (target.kind === "coach") {
    if (!isCoachCard(card)) return;
    removeFromSquad(id);
    coach = applyPortraitOverride({
      ...card,
      formation: { role: "ACC", line: "coach" },
    });
    closePicker();
    await ensureCardUrl(coach);
    render();
    settleCoachAnimation();
    return;
  }

  const occupant =
    target.kind === "slot" ? starters[target.index] : bench[target.index];
  if (occupant?.id === id) {
    closePicker();
    return;
  }

  removeFromSquad(id);
  if (target.kind === "slot") {
    starters[target.index] = placeOnSlot(card, target.index);
    closePicker();
    await ensureCardUrl(starters[target.index]);
    render();
    settleDropAnimation(target.index);
    return;
  }

  bench[target.index] = toBenchCard(card, target.index);
  closePicker();
  await ensureCardUrl(bench[target.index]);
  render();
  settleBenchAnimation(target.index);
}

cardModal.querySelectorAll("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeCardModal);
});
pickModal?.querySelectorAll("[data-close-pick]").forEach((el) => {
  el.addEventListener("click", closePicker);
});

photoFitModal?.querySelectorAll("[data-close-fit]").forEach((el) => {
  el.addEventListener("click", closePhotoFitEditor);
});
document.getElementById("photo-fit-apply")?.addEventListener("click", () => {
  commitPhotoFit().catch(console.error);
});
document.getElementById("photo-fit-recenter")?.addEventListener("click", recenterPhotoFit);
photoFitZoom?.addEventListener("input", () => {
  photoFit.fit = clampPhotoFit({
    ...photoFit.fit,
    zoom: Number(photoFitZoom.value) / 100,
  });
  paintFitPreview();
});
photoFitCanvas?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  photoFit.dragging = true;
  photoFit.lastX = e.clientX;
  photoFit.lastY = e.clientY;
  photoFitCanvas.setPointerCapture(e.pointerId);
});
photoFitCanvas?.addEventListener("pointermove", (e) => {
  if (!photoFit.dragging) return;
  panPhotoFit(e.clientX - photoFit.lastX, e.clientY - photoFit.lastY);
  photoFit.lastX = e.clientX;
  photoFit.lastY = e.clientY;
});
photoFitCanvas?.addEventListener("pointerup", () => {
  photoFit.dragging = false;
});
photoFitCanvas?.addEventListener("pointercancel", () => {
  photoFit.dragging = false;
});
photoFitCanvas?.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const next = photoFit.fit.zoom + (e.deltaY > 0 ? -0.08 : 0.08);
    photoFit.fit = clampPhotoFit({ ...photoFit.fit, zoom: next });
    if (photoFitZoom) photoFitZoom.value = String(Math.round(photoFit.fit.zoom * 100));
    paintFitPreview();
  },
  { passive: false }
);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (photoFitModal && !photoFitModal.hidden) {
    closePhotoFitEditor();
    return;
  }
  if (pickModal && !pickModal.hidden) {
    closePicker();
    return;
  }
  closeCardModal();
});

function animateSlotsIn() {
  anime({
    targets:
      ".slot .card-art, .slot .empty-card, .bench__card .card-art, .coach-slot .card-art",
    opacity: [0, 1],
    translateY: [20, 0],
    scale: [0.9, 1],
    delay: anime.stagger(40, { start: 40 }),
    duration: 580,
    easing: "easeOutBack(1.15)",
  });
}

formationSelect.addEventListener("change", () => {
  formationKey = formationSelect.value;
  closeCardModal();
  closePicker();
  if (placeMode === "auto") autofill();
  else remapFormation();
});

btnAutofill?.addEventListener("click", () => {
  autofill();
});
btnPlace?.addEventListener("click", () => {
  setPlaceMode("manual");
  closePicker();
});
document.getElementById("btn-clear").addEventListener("click", clearSquad);

(async () => {
  await loadStoredPortraits();
  emptyStarters();
  setPlaceMode("manual");
  render();
  renderPhotoUploads();
})();
