/**
 * Cartes finales fournies par l'utilisateur (fond transparent)
 */

export const STYLES = {
  gold: { label: "Gold Rare", band: "75–84", glow: 0xc8a45a },
  neon: { label: "Neon Elite", band: "85–89", glow: 0xff4fd8 },
  emerald: { label: "Blue Star", band: "90–94", glow: 0x4db6ff },
  icon: { label: "Icon Marble", band: "95–99", glow: 0xd4af37 },
};

export const FORMATIONS = {
  "433": {
    label: "4-3-3",
    slots: [
      { role: "LW", line: "att", x: 20, y: 12 },
      { role: "ST", line: "att", x: 50, y: 8 },
      { role: "RW", line: "att", x: 80, y: 12 },
      { role: "CM", line: "mid", x: 24, y: 36 },
      { role: "CM", line: "mid", x: 50, y: 40 },
      { role: "CM", line: "mid", x: 76, y: 36 },
      { role: "LB", line: "def", x: 14, y: 62 },
      { role: "CB", line: "def", x: 36, y: 66 },
      { role: "CB", line: "def", x: 64, y: 66 },
      { role: "RB", line: "def", x: 86, y: 62 },
      { role: "GK", line: "gk", x: 50, y: 86 },
    ],
  },
  "442": {
    label: "4-4-2",
    slots: [
      { role: "ST", line: "att", x: 35, y: 9 },
      { role: "ST", line: "att", x: 65, y: 9 },
      { role: "LM", line: "mid", x: 13, y: 34 },
      { role: "LCM", line: "mid", x: 36, y: 38 },
      { role: "RCM", line: "mid", x: 64, y: 38 },
      { role: "RM", line: "mid", x: 87, y: 34 },
      { role: "LB", line: "def", x: 14, y: 62 },
      { role: "LCB", line: "def", x: 36, y: 66 },
      { role: "RCB", line: "def", x: 64, y: 66 },
      { role: "RB", line: "def", x: 86, y: 62 },
      { role: "GK", line: "gk", x: 50, y: 86 },
    ],
  },
  "4231": {
    label: "4-2-3-1",
    slots: [
      { role: "ST", line: "att", x: 50, y: 7 },
      { role: "LAM", line: "att", x: 20, y: 24 },
      { role: "CAM", line: "att", x: 50, y: 26 },
      { role: "RAM", line: "att", x: 80, y: 24 },
      { role: "LCDM", line: "mid", x: 34, y: 46 },
      { role: "RCDM", line: "mid", x: 66, y: 46 },
      { role: "LB", line: "def", x: 14, y: 64 },
      { role: "LCB", line: "def", x: 36, y: 68 },
      { role: "RCB", line: "def", x: 64, y: 68 },
      { role: "RB", line: "def", x: 86, y: 64 },
      { role: "GK", line: "gk", x: 50, y: 86 },
    ],
  },
};

/** Les 3 cartes à utiliser sur tout le terrain */
const CARD_ADVISORS = [
  {
    id: "ben-ali",
    name: "Ben Ali",
    city: "Casablanca",
    rating: 90,
    styleKey: "icon",
    title: "MST",
    cardAsset: "/assets/card-ben-ali.base.png?v=23",
    displayStats: [
      { code: "EXP", value: 85 },
      { code: "STR", value: 88 },
      { code: "COM", value: 87 },
      { code: "RES", value: 82 },
      { code: "NEG", value: 90 },
      { code: "FID", value: 84 },
    ],
  },
  {
    id: "dupont",
    name: "Dupont",
    city: "Paris",
    rating: 88,
    styleKey: "gold",
    title: "CON",
    cardAsset: "/assets/card-dupont.base.png?v=27",
    displayStats: [
      { code: "EXP", value: 85 },
      { code: "STR", value: 88 },
      { code: "COM", value: 87 },
      { code: "RES", value: 82 },
      { code: "NEG", value: 90 },
      { code: "FID", value: 84 },
    ],
  },
  {
    id: "martins",
    name: "Martins",
    city: "Casablanca",
    rating: 86,
    styleKey: "emerald",
    title: "CON",
    cardAsset: "/assets/card-martins.base.png?v=27",
    displayStats: [
      { code: "EXP", value: 85 },
      { code: "STR", value: 88 },
      { code: "COM", value: 87 },
      { code: "RES", value: 82 },
      { code: "NEG", value: 90 },
      { code: "FID", value: 84 },
    ],
  },
];

export function enrichAdvisor(a) {
  return {
    ...a,
    style: STYLES[a.styleKey],
    stats: Object.fromEntries(
      (a.displayStats || []).map((s) => [s.code, s.value])
    ),
    offreRaw: { publicationsL30d: 6, publicationsClustersL3m: 8 },
    demande: { TRF: a.rating, SAT: a.rating },
    txn: { TXN: a.rating, CA: a.rating },
    portrait: a.cardAsset,
  };
}

export function getAllAdvisors() {
  // Trie par rating décroissant
  return CARD_ADVISORS.map(enrichAdvisor).sort((a, b) => b.rating - a.rating);
}

export function squadRating(starters) {
  if (!starters.length) return 0;
  const sorted = [...starters].map((a) => a.rating).sort((a, b) => b - a);
  const sum = sorted.reduce((s, r, i) => s + r * (sorted.length - i), 0);
  const weights = sorted.reduce((s, _, i) => s + (sorted.length - i), 0);
  return Math.round(sum / weights);
}

export function avgStats(list) {
  if (!list.length) return {};
  const keys = list[0].displayStats?.map((s) => s.code) || [];
  const out = {};
  for (const k of keys) {
    out[k] = Math.round(
      list.reduce((s, a) => {
        const hit = a.displayStats?.find((d) => d.code === k);
        return s + (hit?.value || 0);
      }, 0) / list.length
    );
  }
  out.PUB = out.EXP || out.ANA || out.AGI || 0;
  out.CLU = out.STR || out.MAI || out.TECH || 0;
  out.TRF = out.NEG || out.TEC || out.CREA || 0;
  out.SAT = out.SAT || out.FID || out.POT || 0;
  out.TXN = out.RES || out.RAP || out.COM || 0;
  out.CA = out.LEA || out.PRO || out.COM || 0;
  return out;
}
