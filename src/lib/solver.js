/**
 * Loadout solver — greedy fill followed by a randomised ruin-and-recreate pass.
 *
 * Only 'armed' turrets compete here: Unarmed (Salvaging, Mining, Hammer Heads) and
 * Defense (A.D.S.T., Anti-Fighter, Torpedo) mount on their own slot pools.
 */

import { RESISTABLE } from './model.js';

const ITERATIONS = 6000;

/**
 * @param {Array} L         full weapon list from build()
 * @param {object} o        solver settings
 * @returns {object}        rows + diagnostics for the readout
 */
export function solveLoadout(L, o) {
  const B = +o.budget;
  // Bands carry an importance weight; zero-weight bands are dropped so they cost nothing.
  // With every active weight at exactly 1 this reduces to the plain mean it replaced.
  const bands = o.bands.filter((b) => b.w > 0);
  const totalW = bands.reduce((a, b) => a + b.w, 0);
  const pres = +o.pres / 100;
  const H = Math.max(1, +o.hull), S = Math.max(0, +o.shield);
  const OVERKILL = !!o.overkill;

  if (!bands.length) {
    return {
      rows: [], used: 0, budget: B, objective: 0, H, S, types: [], immune: false,
      bands, bandSpan: null, lockNote: '',
    };
  }

  const P = L.filter(
    (w) => w.cls === 'armed' && !/^VANILLA/.test(w.name) && w.slots <= B && (w.hull > 0 || w.shield > 0),
  );
  const idx = P.map((w) => ({
    id: w.id ?? w.name, n: w.name, sl: w.slots, h: w.hull, s: w.shield, p: w.pierce,
    km: w.km, v: w.vel, cycle: w.cycle, dt: w.dt, shSh: w.shSh, c: w.c, src: w.src,
  }));

  if (!idx.length) {
    return {
      rows: [], used: 0, budget: B, objective: 0, H, S, types: [], immune: false,
      bands, bandSpan: null, lockNote: '',
    };
  }

  // Resistance: shield-only, 95%, one of the four resistable types. Hull + pierce damage never reduced.
  const at = (w, km, res) => {
    if (km > w.km) return [0, 0, 0];
    const f = w.v == null ? 1 : 1 / (1 + (km * 100) / w.v);
    let sr = 1;
    if (res) {
      if (w.dt === res) sr = 0.05;
      else if (w.shSh && w.shSh[res]) sr = 1 - w.shSh[res] * 0.95;
    }
    return [w.h * f, w.s * f * sr, w.p];
  };

  // Overkill: a volley bigger than the remaining pool wastes the excess.
  const okEff = (dps, cycle, pool) => {
    if (cycle <= 0.5 || dps <= 0) return 1;
    const burst = dps * cycle;
    if (burst <= 0) return 1;
    return pool / (Math.ceil(pool / burst) * burst);
  };

  const ttk = (c, km, res) => {
    let sh = 0, pi = 0, fu = 0;
    for (let i = 0; i < idx.length; i++) {
      const q = c[i];
      if (!q) continue;
      const [a, b, p] = at(idx[i], km, res);
      const sl = idx[i].sl * q, cy = idx[i].cycle;
      const eH = OVERKILL ? okEff(a * sl, cy, H) : 1;
      const eS = OVERKILL ? okEff(b * sl, cy, S) : 1;
      sh += b * sl * eS;
      pi += a * p * sl * eH;
      fu += a * sl * eH;
    }
    if (sh <= 0 && pi <= 0) return 1e9;
    if (sh <= 0) return H / pi;
    const t1 = S / sh;
    if (pi * t1 >= H) return H / pi;
    return t1 + (H - pi * t1) / fu;
  };

  const obj = (c) => {
    let t = 0;
    for (const { km, w } of bands) {
      const base = ttk(c, km, null);
      let worst = 0;
      for (const r of RESISTABLE) {
        const v = ttk(c, km, r);
        if (v > worst) worst = v;
      }
      t += w * ((1 - pres) * base + pres * Math.min(worst, 1e9));
    }
    return t / totalW;
  };

  // Reserved turrets are seeded first and never removed by the ruin pass.
  const lockQty = Math.max(0, parseInt(o.lockN, 10) || 0);
  const lockI = idx.findIndex((w) => w.id === o.lockId);
  const reserved = new Array(idx.length).fill(0);
  let rUsed = 0, lockNote = '';
  if (lockI >= 0 && lockQty > 0) {
    const fits = Math.min(lockQty, Math.floor(B / idx[lockI].sl));
    reserved[lockI] = fits;
    rUsed = fits * idx[lockI].sl;
    if (fits < lockQty) {
      lockNote = `only ${fits} × ${idx[lockI].n} fit in ${B} slots (${idx[lockI].sl} each)`;
    }
  }

  // Greedy: add whichever turret improves the objective most, until slots run out.
  const cur = reserved.slice();
  let used = rUsed;
  for (;;) {
    let bi = -1, bv = Infinity;
    for (let i = 0; i < idx.length; i++) {
      if (used + idx[i].sl > B) continue;
      cur[i]++;
      const v = obj(cur);
      cur[i]--;
      if (v < bv) { bv = v; bi = i; }
    }
    if (bi < 0) break;
    cur[bi]++;
    used += idx[bi].sl;
  }

  // Ruin & recreate: drop 1–3 non-reserved turrets, refill randomly, keep improvements.
  let bc = cur.slice(), bv = obj(bc);
  for (let it = 0; it < ITERATIONS; it++) {
    const c = bc.slice();
    let u = c.reduce((a, q, i) => a + q * idx[i].sl, 0);
    for (let k = 0; k < 1 + (it % 3); k++) {
      const nz = c.map((q, i) => (q > reserved[i] ? i : -1)).filter((i) => i >= 0);
      if (!nz.length) break;
      const d = nz[(Math.random() * nz.length) | 0];
      c[d]--;
      u -= idx[d].sl;
    }
    for (;;) {
      const open = idx.map((w, i) => (u + w.sl <= B ? i : -1)).filter((i) => i >= 0);
      if (!open.length) break;
      const i = open[(Math.random() * open.length) | 0];
      c[i]++;
      u += idx[i].sl;
    }
    const v = obj(c);
    if (v < bv) { bv = v; bc = c; }
  }

  const rows = idx
    .map((w, i) => ({ ...w, q: bc[i], res: reserved[i] }))
    .filter((w) => w.q > 0)
    .sort((a, b) => b.q * b.sl - a.q * a.sl);

  const types = [...new Set(rows.map((w) => w.dt))];
  const immune = rows.length > 0 && rows.every((w) => w.dt === 'Energy' || w.dt === 'Fragments');

  return {
    rows,
    used: rows.reduce((a, w) => a + w.q * w.sl, 0),
    budget: B,
    objective: bv,
    H, S, types, immune, lockNote,
    bands,
    bandSpan: [bands[0].km, bands[bands.length - 1].km],
  };
}
