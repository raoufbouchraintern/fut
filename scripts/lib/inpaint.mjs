/**
 * Remplissage « push-pull » : reconstruit une zone d'image à partir des
 * couleurs qui l'entourent.
 *
 * L'image connue est réduite en pyramide, puis remontée niveau par niveau ; les
 * pixels inconnus héritent du niveau au-dessus. Le résultat est un prolongement
 * lisse du décor, sans raccord ni motif cloné — c'est ce qu'il faut derrière une
 * photo détourée, où le fond doit passer inaperçu.
 */

/** Une passe de réduction : moyenne pondérée 2×2. */
function down(color, weight, w, h) {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const c = new Float32Array(nw * nh * 3);
  const a = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      let sw = 0;
      const acc = [0, 0, 0];
      for (let dy = 0; dy < 2; dy += 1) {
        const sy = Math.min(h - 1, y * 2 + dy);
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = Math.min(w - 1, x * 2 + dx);
          const si = sy * w + sx;
          const ww = weight[si];
          if (ww <= 0) continue;
          sw += ww;
          acc[0] += color[si * 3] * ww;
          acc[1] += color[si * 3 + 1] * ww;
          acc[2] += color[si * 3 + 2] * ww;
        }
      }
      const di = y * nw + x;
      if (sw > 0) {
        c[di * 3] = acc[0] / sw;
        c[di * 3 + 1] = acc[1] / sw;
        c[di * 3 + 2] = acc[2] / sw;
      }
      a[di] = Math.min(1, sw / 4);
    }
  }
  return { color: c, weight: a, w: nw, h: nh };
}

/** Échantillonnage bilinéaire du niveau grossier, pour éviter les marches. */
function sampleUp(color, w, h, x, y, out) {
  const fx = Math.min(w - 1, Math.max(0, (x - 0.5) / 2));
  const fy = Math.min(h - 1, Math.max(0, (y - 0.5) / 2));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  for (let k = 0; k < 3; k += 1) {
    const a = color[(y0 * w + x0) * 3 + k] * (1 - tx) + color[(y0 * w + x1) * 3 + k] * tx;
    const b = color[(y1 * w + x0) * 3 + k] * (1 - tx) + color[(y1 * w + x1) * 3 + k] * tx;
    out[k] = a * (1 - ty) + b * ty;
  }
}

/**
 * @param {Buffer} rgba   image source (W*H*4)
 * @param {Uint8Array} hole  1 = pixel à reconstruire
 * @param {Uint8Array} known 1 = pixel utilisable comme source
 * @param {number} feather   largeur du fondu vers le bord du trou, en pixels
 * @returns {Buffer} copie de `rgba` avec le trou rempli
 */
export function pushPullFill(rgba, W, H, hole, known, feather = 0) {
  const color = new Float32Array(W * H * 3);
  const weight = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const use = known[i] && !hole[i];
    weight[i] = use ? 1 : 0;
    if (!use) continue;
    color[i * 3] = rgba[i * 4];
    color[i * 3 + 1] = rgba[i * 4 + 1];
    color[i * 3 + 2] = rgba[i * 4 + 2];
  }

  const levels = [{ color, weight, w: W, h: H }];
  while (levels.at(-1).w > 1 || levels.at(-1).h > 1) {
    const l = levels.at(-1);
    levels.push(down(l.color, l.weight, l.w, l.h));
  }

  const px = [0, 0, 0];
  for (let i = levels.length - 2; i >= 0; i -= 1) {
    const fine = levels[i];
    const coarse = levels[i + 1];
    for (let y = 0; y < fine.h; y += 1) {
      for (let x = 0; x < fine.w; x += 1) {
        const fi = y * fine.w + x;
        const wgt = fine.weight[fi];
        if (wgt >= 1) continue;
        sampleUp(coarse.color, coarse.w, coarse.h, x, y, px);
        for (let k = 0; k < 3; k += 1) {
          fine.color[fi * 3 + k] = fine.color[fi * 3 + k] * wgt + px[k] * (1 - wgt);
        }
        fine.weight[fi] = 1;
      }
    }
  }

  // Fondu vers le bord : on garde le décor d'origine juste au contact du trou,
  // sinon la rupture entre texture nette et remplissage lisse se voit.
  const ramp = new Float32Array(W * H);
  if (feather > 0) {
    const d = distanceInside(hole, W, H, feather);
    for (let i = 0; i < W * H; i += 1) ramp[i] = hole[i] ? Math.min(1, d[i] / feather) : 0;
  } else {
    for (let i = 0; i < W * H; i += 1) ramp[i] = hole[i] ? 1 : 0;
  }

  const out = Buffer.from(rgba);
  for (let i = 0; i < W * H; i += 1) {
    const t = ramp[i];
    if (t <= 0) continue;
    for (let k = 0; k < 3; k += 1) {
      out[i * 4 + k] = Math.round(rgba[i * 4 + k] * (1 - t) + levels[0].color[i * 3 + k] * t);
    }
  }
  return out;
}

/** Distance de chaque pixel d'une zone à son bord, plafonnée à `max`. */
export function distanceInside(mask, W, H, max) {
  const hole = mask;
  const DIAG = Math.SQRT2;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) d[i] = hole[i] ? Infinity : 0;
  const relax = (i, from, cost) => {
    const v = d[from] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      if (y > 0) relax(i, i - W, 1);
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0 && x > 0) relax(i, i - W - 1, DIAG);
      if (y > 0 && x < W - 1) relax(i, i - W + 1, DIAG);
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      if (y < H - 1) relax(i, i + W, 1);
      if (x < W - 1) relax(i, i + 1, 1);
      if (y < H - 1 && x < W - 1) relax(i, i + W + 1, DIAG);
      if (y < H - 1 && x > 0) relax(i, i + W - 1, DIAG);
    }
  }
  for (let i = 0; i < W * H; i += 1) if (d[i] > max) d[i] = max;
  return d;
}
