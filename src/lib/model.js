/**
 * Turret model — a direct port of the balance math in `turretgenerator.lua`
 * (mod + vanilla), with every barrel assembly counted.
 *
 * Nothing here touches the DOM: `build()` takes the global sim parameters and
 * returns the full weapon list, so the UI layer is free to be a pure function
 * of state.
 */

export const NAMES = ['Iron', 'Titanium', 'Naonite', 'Trinium', 'Xanion', 'Ogonite', 'Avorion'];

export const C = {
  oph: '#c774e8', flame: '#ff4d5e', apcr: '#4fc3f7', icept: '#ffb74d', triad: '#7cb342',
  salv: '#26a69a', pred: '#5c6bc0', clan: '#42a5f5', gat: '#ab47bc', proton: '#8d6e63',
  drill: '#00e5a0', thunder: '#ec407a', swarm: '#ffa726', shot: '#ef5350', crawl: '#9ccc65',
  adst: '#ffd54f', af: '#78909c', torp: '#90a4ae', rsalv: '#4db6ac', rmine: '#a1887f',
  clusters: '#bcaaa4', mine: '#8d99ae', vlaser: '#ffffff', vrail: '#cfd8dc',
};

export const RARITIES = [
  [-1, 'Petty'], [0, 'Common'], [1, 'Uncommon'], [2, 'Rare'],
  [3, 'Exceptional'], [4, 'Exotic'], [5, 'Legendary'],
];
export const RARITY_NAME = Object.fromEntries(RARITIES);

export const CLSNAME = { armed: 'Armed', def: 'Defense', una: 'Unarmed' };
export const CREW = { 1: '1 Gunner', 2: '2 Gunners' };

/** Heat rolls: [shootMin, shootMax, coolMin, coolMax] per turret. */
export const HEAT = {
  'Flamethrower': [10, 45, 17.5, 43.75], 'Ophidian': [0.7, 0.7, 2.0, 2.0],
  'APCR Sniper': [0.5, 0.5, 0.5, 0.5], 'Predator Cannon': [1, 1, 11, 11],
  'Swarm Missiles': [0.5, 0.5, 6, 6], 'Thunder Hook': [2.3, 2.3, 100, 100],
  'Neutron Drill': [15, 15, 5, 5], 'Pulse Shotgun': [11, 11, 8.5, 8.5],
};

export const DT = {
  'Ophidian': 'Electric', 'APCR Sniper': 'AntiMatter', 'Salvaging Laser': 'Energy',
  'Flamethrower': 'Physical', 'Interceptor': 'Fragments', 'A.D.S.T.': 'AntiMatter',
  'Triad Chaingun': 'Physical', 'Proton Laser': 'Energy', 'Clandatoh Cannon': 'Plasma',
  'Gatling Plasma': 'Plasma', 'Predator Cannon': 'ALL', 'Pulse Shotgun': 'AntiMatter',
  'Swarm Missiles': 'Physical', 'Crawlers': 'Fragments', 'Thunder Hook': 'Electric',
  'Neutron Drill': 'AntiMatter', 'Homing Anti-Fighter': 'Fragments',
  'Torpedo Countermeasure': 'Fragments', 'R-Salv Hammer Head': 'Fragments',
  'R-Mining Hammer Head': 'Fragments', 'Mining Laser': 'Energy',
  'VANILLA Laser': 'Energy', 'VANILLA Railgun': 'Physical',
};

/** Only these four exist in SpawnUtility.resistanceKinds — Energy & Fragments can never be resisted. */
export const RESISTABLE = ['Physical', 'Plasma', 'Electric', 'AntiMatter'];

/**
 * Distances every band set contains, in km. A superset of the four original preset
 * point-sets, so presets always land on exact band values and reproduce the original
 * objective exactly.
 */
export const BAND_ANCHORS = [0.5, 1.5, 3, 5, 7, 8, 10, 12, 14, 17, 21];

/** How many extra bands to add past the anchors when weapons out-range them. */
const TAIL_BANDS = 5;

/** Preset weight profiles: which bands carry full importance. */
export const BAND_PRESETS = {
  brawl: { label: 'Brawl 0.5–3 km', kms: [0.5, 1.5, 3] },
  mid: { label: 'Mid 3–12 km', kms: [3, 7, 12] },
  long: { label: 'Long 8–21 km', kms: [8, 14, 21] },
  everything: { label: 'Everything 0.5–21 km', kms: [0.5, 3, 8, 14, 21] },
  flat: { label: 'Flat sweep (all bands)', kms: null },  // null = every band in the set
};

/**
 * Normalised x position of a distance on the band axis, 0–1.
 *
 * Square-root rather than linear so close quarters — where turret curves actually
 * separate — get most of the width, and long-range bands compress toward the end.
 */
export const bandPos = (km, maxKm) => Math.sqrt(Math.max(0, km) / Math.max(1e-9, maxKm));

/**
 * The band distances for a roster whose longest weapon reaches `maxKm`.
 * Always contains every anchor, then extends in evenly-spaced *screen* steps (so the
 * tail is progressively coarser in km) up to the longest weapon range.
 */
export function bandSet(maxKm) {
  const kms = BAND_ANCHORS.slice();
  const last = kms[kms.length - 1];
  if (!isFinite(maxKm) || maxKm <= last + 1) return kms;

  const start = bandPos(last, maxKm);
  for (let j = 1; j <= TAIL_BANDS; j++) {
    const p = start + ((1 - start) * j) / TAIL_BANDS;
    const km = Math.round(maxKm * p * p * 2) / 2;   // snap to the nearest 0.5 km
    if (km > kms[kms.length - 1]) kms.push(km);
  }
  return kms;
}

/** Weight vector (0–100 per band) for a preset key, over a given band set. */
export const presetWeights = (key, kms = BAND_ANCHORS) => {
  const preset = BAND_PRESETS[key];
  if (!preset) return kms.map(() => 0);
  if (!preset.kms) return kms.map(() => 100);
  return kms.map((km) => (preset.kms.includes(km) ? 100 : 0));
};

/**
 * Move a weight curve onto a new band set, sampling the old curve in km space.
 * Keeps a hand-tuned shape intact when the roster's maximum range changes.
 */
export function resampleWeights(oldKms, oldWeights, newKms) {
  if (!oldKms?.length || !oldWeights?.length) return newKms.map(() => 0);
  return newKms.map((km) => {
    if (km <= oldKms[0]) return oldWeights[0];
    if (km >= oldKms[oldKms.length - 1]) return oldWeights[oldWeights.length - 1];
    let i = 0;
    while (i < oldKms.length - 2 && oldKms[i + 1] < km) i++;
    const span = oldKms[i + 1] - oldKms[i];
    const t = span > 0 ? (km - oldKms[i]) / span : 0;
    return Math.round(oldWeights[i] + (oldWeights[i + 1] - oldWeights[i]) * t);
  });
}

/** Sector DPS budget, calibrated (0.4439) against in-game cards at tech 36. */
export function budget(dist) {
  const l = [
    95 * (1 - dist / 800), 190 * (1 - dist / 560), 310 * (1 - dist / 470),
    370 * (1 - dist / 430), 470 * (1 - dist / 360), 550 * (1 - dist / 310),
    650 * Math.max(0, 1 - dist / 220),
  ];
  const lg = Math.max(0, 1 - dist / 220);
  return Math.min(Math.max(...l), 100 * lg + 500) * 0.4439;
}

export const distOf = (t) => ((52 - t) / 51) * 500;

/** Which material belt a distance-from-core lands in. */
export function beltMat(dist) {
  const f = dist / 500, N = 7, belt = (m) => (N - m) / N - 0.1, size = (belt(0) - belt(1)) / 2, thr = 0.5;
  let best = 0, bv = -1;
  for (let i = 0; i < N; i++) {
    const b = belt(i), d = Math.abs(f - b), s = b + size * (1 + thr), h = b - size * (1 + thr);
    let t = h === s ? 0 : (f - s) / (h - s);
    t = Math.max(0, Math.min(1, t));
    let v = t * (1 + i * i);
    const t2 = Math.max(0, Math.min(1, (d - size) / (0 - size)));
    v += t2 * (i * i * 0.5);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

/**
 * Specialty increase (HighRange / HighDamage share the same shape in addSpecialties):
 * increase = 0.1 + rarityFactor*0.4, rarityFactor = lerp(rar,-1,5,0.01,0.9) + ~0.05
 */
export const specMul = (rar) => 1 + 0.1 + (0.01 + ((rar + 1) / 6) * 0.89 + 0.05) * 0.4;

/**
 * Build the full turret list for a parameter set.
 * @param {{tech:number, rarity:number, mat:number, spec:number}} p
 */
export function build(p) {
  const T = +p.tech, rar = +p.rarity, mat = +p.mat, useSpec = +p.spec;
  const dist = distOf(T), D = budget(dist), ad = 1 + rar * 0.4;   // adaptWeapon
  const adMine = 1 + Math.max(0, rar) * 0.05;                     // adaptMiningLaser (HET Mining only)
  const HR = useSpec ? specMul(rar) : 1;

  const ACC = {
    'Triad Chaingun': 0.97, 'Ophidian': 0.99, 'APCR Sniper': 1.0, 'Flamethrower': 0.97,
    'Interceptor': 0.997, 'Clandatoh Cannon': 0.998, 'Gatling Plasma': 0.995,
    'Pulse Shotgun': 0.835, 'Predator Cannon': 1.0, 'A.D.S.T.': 1.0, 'Swarm Missiles': 0.3,
  };
  const FR = {
    'Triad Chaingun': 8.547, 'Ophidian': 1.429, 'APCR Sniper': 1.0, 'Flamethrower': 200,
    'Interceptor': 2.105, 'Clandatoh Cannon': 2.857, 'Gatling Plasma': 10, 'Pulse Shotgun': 1.429,
    'Predator Cannon': 0.5, 'A.D.S.T.': 2.5, 'Salvaging Laser': 50, 'Proton Laser': 11.1,
    'Swarm Missiles': 10, 'Neutron Drill': 200, 'Thunder Hook': 20, 'Crawlers': 0.05,
  };
  const RTAB = { '-1': 0.7, 0: 0.14, 1: 0.21, 2: 0.28, 3: 0.36, 4: 0.42, 5: 0.49 };
  const MTAB = { 0: 0.5, 1: 2.8, 2: 4.5, 3: 6.9, 4: 8.4, 5: 10.8, 6: 12.4 };

  /** Walk a tech-level scaling table, returning the slot count for this tech. */
  const S = (a) => {
    for (const [lim, , sl] of a) if (T <= lim) return sl;
    return a[a.length - 1][2];
  };

  /** Volley cycle in seconds — long-cycle weapons waste damage on small targets. */
  const CYCLE = {
    'Predator Cannon': 12, 'Ophidian': 2.7, 'Flamethrower': 40.38, 'Swarm Missiles': 6.5,
    'Thunder Hook': 102.3, 'Neutron Drill': 21, 'Pulse Shotgun': 19.5, 'Crawlers': 20,
    'APCR Sniper': 1.0,
  };

  const L = [];
  /**
   * cls: 'armed' | 'def' | 'una' — only 'armed' competes for armed slots.
   * nb: real barrel count from the assembly; raw is PER-BARREL continuous DPS before adaptWeapon.
   */
  const add = (n, key, cls, nb, raw, hm, sm, pierce, slots, inv, reach, vel, duty, hasHR, rinv, o) => {
    o = o || {};
    rinv = rinv || 1;
    const b = raw * nb * (o.mine ? adMine : ad) * inv;
    let km = (reach * rinv * (hasHR ? HR : 1) * (1 + (slots - 1) * 0.15)) / 100, capped = false;
    if (o.capKm != null) {
      const cap = o.capKm * (1 + (slots - 1) * 0.25);
      if (km > cap) { km = cap; capped = true; }
    }
    L.push({
      name: n, c: C[key], cls, nb, hull: b * hm * duty, shield: b * sm * duty,
      tot: b * hm * duty * slots, pierce, slots, hullMult: hm, shMult: sm,
      cycle: CYCLE[n] || 0.2, hasHR, HRv: HR, dt: DT[n] || '—', acc: ACC[n] || null,
      fireRate: FR[n] || null, km, capped, vel: vel == null ? null : vel * (1 + (slots - 1) * 0.25),
      duty, inv, rinv, raw: b, shSh: o.shSh || null,
    });
  };

  // ---- armed --------------------------------------------------------------
  let sl1 = S([[49, 0.5, 1], [52, 1, 2]]);
  // Ophidian: 3 side weapons (shield x5) + 1 central (hull x15); one shot per barrel per 2.7s cycle
  const odmg = (8 + T * 0.2 * (RTAB[rar] * MTAB[mat])) / 0.7;
  add('Ophidian', 'oph', 'armed', 4, odmg, (3 * 1 + 15) / 4, (3 * 5 + 1 * 1) / 4, 0, sl1, 1.07,
    (1000 + Math.max(0, rar) * 10) * 1, 1500, 0.7 / 2.7, false, 2.0);

  sl1 = S([[15, 2.5, 4], [31, 3, 6], [52, 3.5, 8]]);
  // Flamethrower: 3 barrels; shooting 10–45s / cooling 17.5–43.75s rolled per turret (mean shown)
  add('Flamethrower', 'flame', 'armed', 3, ((rar >= 5 ? 9.5 : 8.5) + rar * 0.1) / 0.005,
    (4.5 + (0.2 + (0.1 + Math.max(0, rar) * 0.1))) * (rar >= 5 ? 1.5 : 1), 0,
    rar < 0 ? 0.4 : Math.min(1, 0.5 + rar * 0.1), sl1, 1.45, 100, 400, 27.5 / 58.125, false, 1.0);

  sl1 = S([[18, 1, 3], [25, 1.5, 3], [32, 2, 4], [39, 3, 4], [52, 3.5, 6]]);
  // APCR: multiplicative material branch; assembly re-adds the weapon -> 2 barrels; heat-limited ~0.5 duty
  const apcrDmg = mat > 0 ? D * (mat / 10 + 1) * 2.5 : D + Math.max(0, rar) + 25;
  const apcrHM = rar <= 1 ? (rar < 0 ? 2 : 3) : (4 + (rar * 0.6 + mat * 0.6)) * (rar > 2 ? rar * 0.2 : 1);
  add('APCR Sniper', 'apcr', 'armed', 2, apcrDmg, apcrHM, 0.2, 0, sl1, 1.3, 800, 1000, 0.5, true, 2.5);

  sl1 = S([[15, 0.5, 1], [31, 1, 2], [52, 1.5, 3]]);
  // Interceptor: 4 barrels; d-table is indexed by MATERIAL
  const iD = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75][mat];
  add('Interceptor', 'icept', 'armed', 4, (5 + iD * ((rar + 2) * (mat + 1))) / 0.475, 4 + mat, 1.0, 0,
    sl1, 2.1, 750, 1100, 1.0, false, 1.5);

  // Triad: 3 barrels, IonizedProjectile always (pen rand 0.10–0.25, mean shown)
  const triHM = rar < 0 ? 0 : (0.1 + (rar * 0.1 + mat * 0.1)) * (rar <= 0 ? 1 : rar);
  add('Triad Chaingun', 'triad', 'armed', 3, (D * 0.15) / 0.117, triHM,
    rar <= 0 ? 0.1 : 0.1 + rar * 0.1, 0.175, sl1, 1.7, 450, 1100, 1.0, false, 2.0);

  sl1 = S([[35, 2, 4], [42, 2.5, 6], [49, 3, 8], [52, 3.5, 10]]);
  // Clandatoh: 4 barrels, simultaneousShooting always on, no cooling; range capped by projectile lifetime
  const cHM = { '-1': 0.02, 0: 0.03, 1: 0.04, 2: 0.05, 3: 0.06, 4: 0.07, 5: 0.08 }[rar];
  const cSM = { '-1': 0.1, 0: 0.2, 1: 0.3, 2: 0.4, 3: 0.5, 4: 0.6, 5: 0.7 }[rar] * (mat + 1);
  add('Clandatoh Cannon', 'clan', 'armed', 4, (D * 0.1887) / 0.35, cHM, cSM, 0, sl1, 1.75, 1500, 500,
    1.0, true, 2.5, { capKm: 15 });

  add('Swarm Missiles', 'swarm', 'armed', 2, 700, 1.3 + Math.max(0, rar) * 0.3, 0.025, 0, sl1, 2.25,
    1300, null, 0.5 / (0.5 + 15 - Math.max(0, Math.max(0, rar) + mat)), true, 2.5);

  sl1 = S([[35, 0.5, 1], [42, 0.5, 2], [49, 1, 3], [52, 1, 4]]);
  // Gatling Plasma: 5 barrels (4 corners + centre)
  add('Gatling Plasma', 'gat', 'armed', 5, (D * 0.1 * 0.1) / 0.1, 1.0, 3.2 + Math.max(0, rar) * 0.4, 0,
    sl1, 1.07, 650, 400, 1.0, true, 2.0);

  sl1 = S([[31, 0.5, 2], [42, 1, 4], [52, 1.5, 6]]);
  // Proton Laser: 7 beams (1 centre + 6 ring); damage tables by rarity AND material; no damage investment
  const pN = { '-1': 0.056, 0: 0.056, 1: 0.059, 2: 0.063, 3: 0.066, 4: 0.07, 5: 0.078 }[rar];
  const pRV = { '-1': 0.2, 0: 0.3, 1: 0.4, 2: 0.4, 3: 0.5, 4: 0.6, 5: 0.8 }[rar];
  const pMV = [0.2, 0.3, 0.3, 0.3, 0.4, 0.4, 0.5][mat];
  const protonSM = rar < 0 ? 1.1 : rar === 0 ? 2.2 : 1.1 + (2.2 + mat * 0.1) * (mat + rar);
  add('Proton Laser', 'proton', 'armed', 7, (pN * ((rar * pRV + 3) + (mat * pMV + 3))) / 0.09,
    rar < 0 ? 2.2 : 1.1 + rar * 1.1, protonSM, 0, sl1, 1.0, 750, null, 1.0, true, 1.3);

  sl1 = S([[15, 1.5, 3], [31, 2.5, 6], [52, 3.5, 9]]);
  // Predator: 6 asymmetric barrels, 1s shoot / 11s cool.
  // raw below already sums the volley over the 12s cycle -> nb=1 for the math, 6 for display.
  const PT = T * (mat * 1.3 + rar * 1.3), pb1 = 600 + PT, pb2 = 20 + PT;
  const pm = { '-1': 1.3, 0: 1.4, 1: 1.5, 2: 1.6, 3: 1.7, 4: 1.8, 5: 1.9 }[rar];
  const pRaw = (pb1 + 5 * pb2) / 12;
  const pHull = (pb1 * pm + 2 * pb2 * pm + 3 * pb2) / 12 / pRaw;   // barrels 1,2,5 carry hull mult
  const pShld = (pb1 + 2 * pb2 + 3 * pb2 * pm) / 12 / pRaw;        // barrels 3,4,6 carry shield mult
  const shS = pb1 + 2 * pb2 + 3 * pb2 * pm;                        // shield-dps shares by type (resistance)
  const predSh = { AntiMatter: pb1 / shS, Physical: pb2 / shS, Electric: (pb2 * pm) / shS, Plasma: (pb2 * pm) / shS };
  add('Predator Cannon', 'pred', 'armed', 1, pRaw, pHull, pShld, 0, sl1, 1.9, 1500, 500, 1.0, false, 1.0,
    { shSh: predSh });
  L[L.length - 1].nb = 6; // display: six real barrels, already summed in raw

  sl1 = S([[31, 2.5, 4], [42, 3, 6], [52, 3.5, 8]]);
  // Pulse Shotgun: 1 weapon, 16 pellets; material>2 branch multiplies damage x(mat*2); duty pre-compensated
  const shotDmg = (D * 0.56 * (mat > 2 ? mat * 2 : 1) * 1.5) / 0.7;
  add('Pulse Shotgun', 'shot', 'armed', 1, shotDmg, 2.4 + Math.max(0, rar) * 0.6, 0.2,
    rar < 0 ? 0.01 : 0.015 + rar * 0.005, sl1, 1.7, 270, 400, 1.0, true, 1.05);
  L[L.length - 1].nb = 16;

  sl1 = S([[10, 1.5, 4], [20, 2, 6], [30, 2.5, 8], [40, 3, 10], [52, 3.5, 12]]);
  add('Thunder Hook', 'thunder', 'armed', 1, (D * 0.05 * 0.001 * (mat + 2) * (rar + 3) * T) / 0.05,
    0.025, (mat + 1 + Math.max(0, rar) * 0.4) / 6, 0, sl1, 1.4, 850, null, 2.3 / 102.3, true, 1.0);

  sl1 = S([[12, 2, 4], [24, 2.5, 6], [32, 3, 8], [52, 3.5, 10]]);
  add('Crawlers', 'crawl', 'armed', 1, ((40 + mat) * (mat + 1)) / 20, 2 + mat * 1.2, 2 + mat * 1.2, 0,
    sl1, 1.45, 450, null, 1.0, true, 1.0);

  if (dist <= 70) {
    sl1 = S([[28, 3.5, 6], [35, 3.5, 8], [42, 3.5, 10], [49, 3.5, 12], [52, 3.5, 14]]);
    add('Neutron Drill', 'drill', 'armed', 1, 0.04 * D, 50 + Math.max(0, rar) * 10,
      2 * (50 + Math.max(0, rar) * 10), 0, sl1, 1.14, 1200, null,
      15 / (15 + 10 - Math.max(0, rar)), false, 1.2);
  }

  // ---- defensive (PointDefense slots — excluded from the armed solver) ----
  sl1 = S([[49, 0.5, 1], [52, 1, 2]]);
  add('A.D.S.T.', 'adst', 'def', 4, (2 + 2.7 * 4.7) / 0.4, 1.5, 1.0, 0, sl1, 1.9,
    600 + Math.max(0, rar) * 10, 2430, 1.0, false, 1.25);
  add('Homing Anti-Fighter', 'af', 'def', 2, (1.5 + 1.1 * Math.max(0, rar)) / 6, 1.0, 1.0, 0, 1, 3.75,
    2000, null, 1.0, true, 2.5);
  add('Torpedo Countermeasure', 'torp', 'def', 2, (1.2 - mat * 0.1) / 0.26, 1.0, 1.0, 0, 1, 1.0,
    350 + mat * 50, 2000, 1.0, true, 1.55);

  // ---- unarmed (own slot pool — free hull DPS on top of any armed loadout) ----
  sl1 = S([[12, 0.5, 1], [30, 1, 2], [49, 1.5, 3], [52, 3.5, 6]]);
  const DIVT = { '-1': 2, 0: 5, 1: 1.3, 2: 0.7, 3: 0.7, 4: 0.7, 5: 0.7 }, div = DIVT[rar];
  const RSALV = { '-1': 150, 0: 200, 1: 250, 2: 300, 3: 350, 4: 400, 5: 450 };
  // HET Salvaging calls adaptWeapon (full x2.2 at Exceptional) — NOT the mining x1.05 path
  add('Salvaging Laser', 'salv', 'una', 1, (10 + mat * 0.1 + (D * 0.02) / div) / 0.02, 1.0, 0, 0, sl1,
    2.0, RSALV[rar], null, 1.0, false, 3.0);
  add('Mining Laser', 'mine', 'una', 1, (0.2 + (D * 0.002) / div) / 0.1, 1.0, 0, 0, sl1, 2.0,
    160 + Math.max(0, rar) * 40, null, 1.0, false, 3.0, { mine: true });

  sl1 = S([[35, 0.5, 1], [42, 1, 2], [49, 1.5, 3], [52, 2, 6]]);
  add('R-Salv Hammer Head', 'rsalv', 'una', 1, (D * 0.09) / 0.1,
    2.0 + mat * 0.4 + Math.max(0, rar) * 0.6, 0, 0, sl1, 1.07, 200, 250, 1.0, true, 2.0);
  add('R-Mining Hammer Head', 'rmine', 'una', 1, (((D * 0.07) / 2) * 0.1) / 0.1, 0.1, 0, 0, sl1, 1.07,
    200, 250, 1.0, true, 2.0);

  // ---- vanilla baselines (reference only) ----
  sl1 = S([[31, 0.5, 2], [42, 1, 4], [52, 1.5, 6]]);
  add('VANILLA Laser', 'vlaser', 'armed', 1, D * 1.5, 1.0, 1.0, 0, sl1, 1.0, 750, null, 1.0, false, 1.0);

  sl1 = S([[15, 1, 3], [31, 1.5, 4], [52, 2, 5]]);
  add('VANILLA Railgun', 'vrail', 'armed', 1, D, 1.0, 1.0, 0, sl1, 1.0, 1000, 1500, 1.0, false, 1.0);

  return { L, D, dist, ad, HR };
}

/** Flight-time penalty — beams and seekers (vel == null) take none. */
export const hitF = (km, vel, use) => (!use || vel == null ? 1 : 1 / (1 + (km * 100) / vel));

/** Chart.js datasets for one axis, sampled across each weapon's range envelope. */
export function curves(L, mode, useHit, metric) {
  return L
    .map((w) => {
      let m = mode === 'hull' ? w.hull : w.shield;
      if (metric === 'total') m *= w.slots;
      if (m <= 0 || !isFinite(m)) return null;
      const pts = [];
      const N = 26;
      for (let i = 0; i <= N; i++) {
        const km = Math.max(0.2, (w.km * i) / N);
        pts.push({ x: +km.toFixed(2), y: +(m * hitF(km, w.vel, useHit)).toFixed(1) });
      }
      return {
        id: w.id ?? w.name, label: w.name, borderColor: w.c, backgroundColor: w.c, data: pts,
        borderWidth: 1.8, pointRadius: 0, tension: 0.15,
      };
    })
    .filter(Boolean);
}

/** The mod's Balancing_GetSectorShipVolume override (bigger ships than vanilla). */
export function shipVolume(dist) {
  const maxd = 500, d = Math.min(dist, maxd), lin = 1 - d / maxd;
  const lout = Math.min(1, Math.max(0, 1 - d / 400)), lmid = Math.min(1, Math.max(0, 1 - d / 350));
  const q = 2000, lo = 3000, louter = 4500, lmidC = 8200, b = 500, center = 2750;
  const df = Math.pow(lin * 3 + 1, 4) - 1;
  const v = df * (q / 255) + lin * lo + lout * louter + lmid * lmidC;
  return v * (center / (q + lo + louter + lmidC)) + b;
}

/** Engine-side block durability isn't in the Lua; strengthFactor rises ~1.5x per tier. */
export const MATSTR = [1, 1.5, 2.25, 3.375, 5.0625, 7.59, 11.39];

export function targetHP(dist, mat, kind, ratio) {
  const v = shipVolume(dist);
  const mult = { fighter: 0.15, ship: 1, flagship: 4, station: 100 }[kind] || 1;
  let volume = v * mult;
  if (kind === 'station') volume = Math.min(150000, v * 100);
  // HP proxy: volume x material strength x calibration constant
  const hull = volume * MATSTR[mat] * 3.0;
  return [hull, hull * ratio];
}

/**
 * Resolve a single turret's card figures under the card panel's assumption toggles.
 * @returns {null | object} null when the turret isn't in the current list
 */
export function cardStats(w, a) {
  if (!w) return null;

  const slots = Math.max(1, Math.round(w.slots * a.aScale));
  let mult = a.cal * a.aVar;
  if (!a.aInv) mult /= w.inv;
  if (a.aHD) mult *= specMul(a.rarity);

  let duty = w.duty;
  const h = HEAT[w.name];
  if (h) {
    const [lo, hi, cLo, cHi] = h;
    duty = a.aHeat === 'best' ? hi / (hi + cLo)
      : a.aHeat === 'worst' ? lo / (lo + cHi)
        : ((lo + hi) / 2) / ((lo + hi) / 2 + (cLo + cHi) / 2);
  }
  const k = w.duty > 0 ? duty / w.duty : 1;

  const hullPS = w.hull * mult * k, shPS = w.shield * mult * k;
  const rawPS = w.hullMult > 0 ? hullPS / w.hullMult : shPS / (w.shMult || 1);

  let km = w.km;
  if (!a.aInv) km /= w.rinv;
  if (!a.aHR && w.hasHR) km /= w.HRv;

  const nb = w.nb || 1;
  const fireRate = (w.fireRate || 0) * (nb > 1 && w.name !== 'Pulse Shotgun' ? nb : 1);
  const perShot = fireRate > 0 ? (rawPS * slots) / fireRate : 0;

  return { w, slots, duty, hullPS, shPS, rawPS, km, nb, fireRate, perShot, hasHeatRoll: !!h };
}

/** Solve for the calibration multiplier that makes Raw DPS match an in-game card. */
export function fitCalibration(w, real, aVar, cal) {
  if (!w || !real || real <= 0) return null;
  const rawNow = (w.hullMult > 0 ? w.hull / w.hullMult : w.shield / (w.shMult || 1)) * w.slots * aVar;
  return real / (rawNow / cal || real);
}
