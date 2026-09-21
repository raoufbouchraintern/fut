/**
 * Note générale = moyenne pondérée des 6 stats carte
 *   Offre 35% (PUB%, CLU%) · Demande 15% (TRF, SAT) · Transactions 50% (TXN, CA)
 *
 * Thème (rating) :
 *   75–84 → Gold Rare
 *   85–89 → Neon Special   (palier 86–90 demandé, 85 inclus)
 *   90–94 → Emerald Rare
 *   95–99 → Icon Legacy
 */

const STYLES = {
  gold: { label: "Gold Rare", bg: "assets/style-gold.png", band: "75–84" },
  neon: { label: "Neon Special", bg: "assets/style-neon.png", band: "85–89" },
  emerald: { label: "Emerald Rare", bg: "assets/style-emerald.png", band: "90–94" },
  icon: { label: "Icon Legacy", bg: "assets/style-icon.png", band: "95–99" },
};

const AXIS_WEIGHT = { offre: 0.35, demande: 0.15, txn: 0.5 };

const OFFRE_KPI = {
  PUB: { label: "PUB", name: "Publications (L30D)", targetScore5: 8 },
  CLU: { label: "CLU", name: "Publications clusters (L3M)", targetScore5: 12 },
};

function offrePercent(rawValue, targetScore5) {
  return Math.min(100, Math.round((rawValue / targetScore5) * 100));
}

/** Note 75–99 à partir des 6 stats */
function computeRating(advisor) {
  const pub = offrePercent(
    advisor.offreRaw.publicationsL30d,
    OFFRE_KPI.PUB.targetScore5
  );
  const clu = offrePercent(
    advisor.offreRaw.publicationsClustersL3m,
    OFFRE_KPI.CLU.targetScore5
  );
  const offAvg = (pub + clu) / 2;
  const demAvg = (advisor.demande.TRF + advisor.demande.SAT) / 2;
  const txnAvg = (advisor.txn.TXN + advisor.txn.CA) / 2;

  const raw =
    AXIS_WEIGHT.offre * offAvg +
    AXIS_WEIGHT.demande * demAvg +
    AXIS_WEIGHT.txn * txnAvg;

  return Math.min(99, Math.max(75, Math.round(raw)));
}

function styleFromRating(rating) {
  if (rating >= 95) return "icon";
  if (rating >= 90) return "emerald";
  if (rating >= 85) return "neon";
  return "gold";
}

const FORMATION = [
  { role: "LW", line: "att", x: 22, y: 16 },
  { role: "ST", line: "att", x: 50, y: 12 },
  { role: "RW", line: "att", x: 78, y: 16 },
  { role: "LCM", line: "mid", x: 24, y: 38 },
  { role: "CM", line: "mid", x: 50, y: 42 },
  { role: "RCM", line: "mid", x: 76, y: 38 },
  { role: "LB", line: "def", x: 14, y: 64 },
  { role: "LCB", line: "def", x: 36, y: 68 },
  { role: "RCB", line: "def", x: 64, y: 68 },
  { role: "RB", line: "def", x: 86, y: 64 },
  { role: "GK", line: "gk", x: 50, y: 88 },
];

/** Stats calibrées pour couvrir les 4 paliers de thème */
const advisorsRaw = [
  {
    id: "karim",
    name: "Karim El Fassi",
    city: "Tanger",
    portrait:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 9, publicationsClustersL3m: 14 },
    demande: { TRF: 98, SAT: 97 },
    txn: { TXN: 99, CA: 99 },
  },
  {
    id: "salma",
    name: "Salma Kadiri",
    city: "Casablanca",
    portrait:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 8, publicationsClustersL3m: 12 },
    demande: { TRF: 96, SAT: 95 },
    txn: { TXN: 97, CA: 96 },
  },
  {
    id: "amina",
    name: "Amina Tazi",
    city: "Marrakech",
    portrait:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 7, publicationsClustersL3m: 11 },
    demande: { TRF: 93, SAT: 94 },
    txn: { TXN: 94, CA: 93 },
  },
  {
    id: "sara",
    name: "Sara Benali",
    city: "Casablanca",
    portrait:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 7, publicationsClustersL3m: 10 },
    demande: { TRF: 92, SAT: 91 },
    txn: { TXN: 93, CA: 92 },
  },
  {
    id: "leila",
    name: "Leila Mansouri",
    city: "Casablanca",
    portrait:
      "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 7, publicationsClustersL3m: 9 },
    demande: { TRF: 90, SAT: 91 },
    txn: { TXN: 91, CA: 90 },
  },
  {
    id: "nadia",
    name: "Nadia Cherkaoui",
    city: "Fès",
    portrait:
      "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 6, publicationsClustersL3m: 9 },
    demande: { TRF: 88, SAT: 89 },
    txn: { TXN: 89, CA: 88 },
  },
  {
    id: "hassan",
    name: "Hassan Idrissi",
    city: "Meknès",
    portrait:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 6, publicationsClustersL3m: 8 },
    demande: { TRF: 87, SAT: 86 },
    txn: { TXN: 88, CA: 87 },
  },
  {
    id: "youssef",
    name: "Youssef Amrani",
    city: "Rabat",
    portrait:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 5, publicationsClustersL3m: 8 },
    demande: { TRF: 86, SAT: 85 },
    txn: { TXN: 87, CA: 86 },
  },
  {
    id: "imane",
    name: "Imane Saadi",
    city: "Rabat",
    portrait:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 5, publicationsClustersL3m: 7 },
    demande: { TRF: 82, SAT: 84 },
    txn: { TXN: 83, CA: 82 },
  },
  {
    id: "omar",
    name: "Omar Bennis",
    city: "Agadir",
    portrait:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 4, publicationsClustersL3m: 6 },
    demande: { TRF: 80, SAT: 81 },
    txn: { TXN: 81, CA: 80 },
  },
  {
    id: "mehdi",
    name: "Mehdi Alaoui",
    city: "Oujda",
    portrait:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=500&fit=crop&crop=faces",
    offreRaw: { publicationsL30d: 4, publicationsClustersL3m: 5 },
    demande: { TRF: 78, SAT: 79 },
    txn: { TXN: 79, CA: 78 },
  },
];

const advisors = advisorsRaw.map((a) => {
  const rating = computeRating(a);
  return { ...a, rating, style: styleFromRating(rating) };
});

const startingXI = [...advisors]
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 11)
  .map((advisor, i) => ({
    ...advisor,
    formation: FORMATION[i],
  }));

function offreStats(advisor) {
  const pub = offrePercent(
    advisor.offreRaw.publicationsL30d,
    OFFRE_KPI.PUB.targetScore5
  );
  const clu = offrePercent(
    advisor.offreRaw.publicationsClustersL3m,
    OFFRE_KPI.CLU.targetScore5
  );
  return [
    { axis: "OFF", label: "PUB", value: pub, format: `${pub}%` },
    { axis: "OFF", label: "CLU", value: clu, format: `${clu}%` },
  ];
}

function flatStats(advisor) {
  return [
    ...offreStats(advisor),
    { axis: "DEM", label: "TRF", value: advisor.demande.TRF, format: String(advisor.demande.TRF) },
    { axis: "DEM", label: "SAT", value: advisor.demande.SAT, format: String(advisor.demande.SAT) },
    { axis: "TXN", label: "TXN", value: advisor.txn.TXN, format: String(advisor.txn.TXN) },
    { axis: "TXN", label: "CA", value: advisor.txn.CA, format: String(advisor.txn.CA) },
  ];
}

function ratingBreakdown(advisor) {
  const [pub, clu] = offreStats(advisor);
  const offAvg = ((pub.value + clu.value) / 2).toFixed(1);
  const demAvg = ((advisor.demande.TRF + advisor.demande.SAT) / 2).toFixed(1);
  const txnAvg = ((advisor.txn.TXN + advisor.txn.CA) / 2).toFixed(1);
  return { offAvg, demAvg, txnAvg };
}

function renderMini(advisor) {
  const style = STYLES[advisor.style];
  const role = advisor.formation.role;
  const [pub, clu] = offreStats(advisor);

  return `
    <div
      class="slot theme-${advisor.style}"
      data-line="${advisor.formation.line}"
      style="left:${advisor.formation.x}%;top:${advisor.formation.y}%"
      title="${advisor.name} · OVR ${advisor.rating} · ${style.label}"
    >
      <span class="slot__role">${role}</span>
      <div class="mini">
        <img class="mini__bg" src="${style.bg}" alt="" draggable="false" />
        <div class="mini__content">
          <span class="mini__rating">${advisor.rating}</span>
          <span class="mini__pos">${role}</span>
          <img class="mini__face" src="${advisor.portrait}" alt="" loading="lazy" />
          <p class="mini__name">${advisor.name.split(" ")[0]}</p>
          <div class="mini__stats">
            <span>PUB${pub.format}</span>
            <span>CLU${clu.format}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCard(advisor) {
  const style = STYLES[advisor.style];
  const role = advisor.formation?.role || "ADV";
  const stats = flatStats(advisor);
  const br = ratingBreakdown(advisor);

  const statsHtml = `
    <div class="stat-group">Offre · en %</div>
    <div class="stat"><span class="stat__label">PUB</span><span class="stat__value">${stats[0].format}</span></div>
    <div class="stat"><span class="stat__label">CLU</span><span class="stat__value">${stats[1].format}</span></div>
    <div class="stat-group">Demande</div>
    <div class="stat"><span class="stat__label">TRF</span><span class="stat__value">${stats[2].format}</span></div>
    <div class="stat"><span class="stat__label">SAT</span><span class="stat__value">${stats[3].format}</span></div>
    <div class="stat-group">Transactions</div>
    <div class="stat"><span class="stat__label">TXN</span><span class="stat__value">${stats[4].format}</span></div>
    <div class="stat"><span class="stat__label">CA</span><span class="stat__value">${stats[5].format}</span></div>
  `;

  return `
    <article class="card-wrap">
      <p class="style-label">${style.label} · ${style.band} · ${role}</p>
      <div class="axes">
        <span>OFF ${br.offAvg} ×35%</span>
        <span>DEM ${br.demAvg} ×15%</span>
        <span>TXN ${br.txnAvg} ×50%</span>
        <span class="axes__ovr">OVR ${advisor.rating}</span>
      </div>
      <div class="card theme-${advisor.style}" data-id="${advisor.id}">
        <img class="card__bg" src="${style.bg}" alt="" draggable="false" />
        <div class="card__content">
          <div class="rating">
            <span class="rating__score">${advisor.rating}</span>
            <span class="rating__pos">${role}</span>
            <span class="rating__city">${advisor.city}</span>
          </div>
          <div class="portrait">
            <img src="${advisor.portrait}" alt="${advisor.name}" loading="lazy" />
          </div>
          <p class="name">${advisor.name}</p>
          ${
            advisor.style === "icon"
              ? '<div class="stats-cover" aria-hidden="true"></div>'
              : ""
          }
          <div class="stats">${statsHtml}</div>
          <p class="logo">Yakeey</p>
        </div>
      </div>
    </article>
  `;
}

document.getElementById("slots").innerHTML = startingXI.map(renderMini).join("");
document.getElementById("gallery").innerHTML = startingXI.map(renderCard).join("");
