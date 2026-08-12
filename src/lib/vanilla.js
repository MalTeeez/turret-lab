/**
 * Vanilla turret roster — the 18 weapon types in `weapontype.lua`, modelled from
 * the base game's own `turretgenerator.lua` / `weapongenerator.lua`.
 *
 * Read from the Steam install at
 *   .../Avorion/data/scripts/lib/{turretgenerator,weapongenerator,weapontype}.lua
 *
 * Key structural difference from the HET mod: vanilla never gains DPS from barrel
 * count. Projectile types multiply `fireDelay` by the barrel count and beam types
 * divide `damage` by it, so total turret output is the sector DPS budget either way.
 * The barrel count shown here is therefore cosmetic — unlike the HET turrets, whose
 * assemblies genuinely stack (except the APCR Sniper and Flamethrower, whose heat pool
 * is created before the extra barrels are added — those alternate; see model.js).
 *
 * Rolled ranges (`rand:getFloat(a, b)`) are collapsed to their mean, matching how the
 * rest of this lab reports an average roll.
 */

import { budget, distOf, specMul } from './model.js';
import { RECIPE_KEY, investmentFor } from './factory.js';

/** Distinct from the HET palette so the two rosters read apart on a chart. */
const VC = {
  vChain: '#e57373', vBolter: '#f06292', vPdc: '#9575cd', vPdl: '#7986cb',
  vLaser: '#64b5f6', vMining: '#4db6ac', vSalv: '#81c784', vRMining: '#aed581',
  vRSalv: '#dce775', vPlasma: '#ffd54f', vRocket: '#ffb74d', vCannon: '#ff8a65',
  vRail: '#a1887f', vRepair: '#90a4ae', vLightning: '#4fc3f7', vTesla: '#ba68c8',
  vForce: '#78909c', vPulse: '#f48fb1', vAF: '#bcaaa4',
};

export const VANILLA_DT = {
  'Chaingun': 'Physical', 'Bolter': 'AntiMatter', 'Point Defense Cannon': 'Fragments',
  'Point Defense Laser': 'Fragments', 'Laser': 'Energy', 'Mining Laser': 'Energy',
  'Salvaging Laser': 'Energy', 'R-Mining Laser': 'Energy', 'R-Salvaging Laser': 'Energy',
  'Plasma Gun': 'Plasma', 'Rocket Launcher': 'Physical', 'Cannon': 'Physical',
  'Railgun': 'Physical', 'Repair Beam': '—', 'Lightning Gun': 'Electric',
  'Tesla Gun': 'Electric', 'Force Gun': '—', 'Pulse Cannon': 'Physical',
  'Anti-Fighter Cannon': 'Fragments',
};

/** The rarity term shared by addSpecialties — lerp(rar,-1,5,0.01,0.9) plus the ~0.05 roll. */
const rarityFactor = (rar) => 0.01 + ((rar + 1) / 6) * 0.89 + 0.05;

/** Mean of a `rand:getFloat(a, b)` roll. */
const m = (a, b) => (a + b) / 2;

/**
 * Build the vanilla roster for a parameter set. Returns entries in exactly the shape
 * `build()` produces, so every chart, table and card works on them unchanged.
 *
 * @param {{tech:number, rarity:number, mat:number, spec:number}} p
 */
export function buildVanilla(p) {
  const T = +p.tech, rar = +p.rarity, useSpec = +p.spec;
  const D = budget(distOf(T));
  const ad = 1 + rar * 0.4;                        // adaptWeapon
  const adMine = 1 + Math.max(0, rar) * 0.05;      // adaptMiningLaser
  const HR = useSpec ? specMul(rar) : 1;
  const rf = rarityFactor(rar);

  /**
   * Pick the slot count for this tech from a vanilla `scales` table. The rows are remembered
   * so add() can attach a re-walker for the card's scale roll — see the HET model.
   */
  let sRows = null;
  const S = (rows) => {
    sRows = rows;
    for (const [to, slots] of rows) if (T <= to) return slots;
    return rows[rows.length - 1][1];
  };

  const L = [];

  /**
   * @param raw   total turret DPS before the rarity factor (vanilla does not stack barrels)
   * @param o.mine    use adaptMiningLaser instead of adaptWeapon
   * @param o.noAdapt weapon takes no rarity damage factor at all
   * @param o.miningReach vanilla scales mining/salvaging reach by (size + 0.5), not (slots-1)*0.15
   */
  const add = (n, key, cls, nb, raw, hm, sm, pierce, slots, size, reach, vel, duty, fireRate, o) => {
    o = o || {};
    const factor = o.noAdapt ? 1 : o.mine ? adMine : ad;

    // Max turret-factory investment, from the recipe's own investFactor sums — the same
    // basis the HET numbers use, so the two rosters are finally comparable.
    const recipe = RECIPE_KEY.vanilla[n];
    const inv = investmentFor(recipe, 'damage');
    const rinv = investmentFor(recipe, 'reach');

    const b = raw * factor * inv;
    const reachMul = o.miningReach ? size + 0.5 : 1 + (slots - 1) * 0.15;
    const km = (reach * rinv * HR * reachMul) / 100;
    // Scale-roll re-walker; guarded like the HET one. Mining/salvaging reach follows the
    // size term rather than the slot factor, so those keep their full-tech range on a roll.
    const rows = sRows;
    const slotsAt = rows
      ? (t) => { for (const [to, sl] of rows) if (t <= to) return sl; return rows[rows.length - 1][1]; }
      : null;
    L.push({
      name: n, c: VC[key], cls, nb, src: 'vanilla',
      hull: b * hm * duty, shield: b * sm * duty, tot: b * hm * duty * slots,
      pierce, slots, hullMult: hm, shMult: sm,
      cycle: o.cycle || 0.2, hasHR: true, HRv: HR,
      dt: VANILLA_DT[n] || '—', acc: o.acc ?? null, fireRate,
      km, capped: false, vel: vel == null ? null : vel * (1 + (slots - 1) * 0.25),
      duty, inv, rinv, raw: b, shSh: null,
      slotsAt: slotsAt && slotsAt(T) === slots ? slotsAt : null,
      kmSlots: !o.miningReach,
    });
  };

  // ---- armed --------------------------------------------------------------
  // Chaingun: damage = dps * fireDelay, no cooling. Small proc chances for
  // AntiMatter / Plasma / Electric are not modelled — this is the base roll.
  add('Chaingun', 'vChain', 'armed', 2, D, 1, 1, 0,
    S([[15, 1], [31, 2], [52, 3]]), 1.5, m(300, 450), m(500, 700), 1, 1 / m(0.08, 0.12),
    { acc: 0.99 - 0.015 });

  // Bolter: damage is pre-compensated for cooling, so sustained output is the full
  // budget; the duty cycle here only shapes the burst.
  {
    const shoot = 7 * m(0.9, 1.3), cool = 5 * m(0.8, 1.2);
    const duty = shoot / (shoot + cool);
    add('Bolter', 'vBolter', 'armed', 2, D / duty, 2.5 + m(0, 0.15) + rar * 0.2, 1, 0,
      S([[18, 1], [33, 2], [45, 3], [52, 4]]), 2.0, m(650, 700), m(800, 1000), duty,
      1 / m(0.1, 0.3), { acc: 0.99 - 0.015, cycle: shoot + cool });
  }

  // Laser: battery charge, 20 s firing / 30 s recharge.
  add('Laser', 'vLaser', 'armed', 1, D * 1.5, 1, 1, 0,
    S([[24, 1], [35, 2], [46, 3], [49, 4], [52, 6]]), 3.5, m(450, 750), null,
    20 / (20 + 30), 1 / 0.2, { cycle: 50 });

  // Plasma: 100% plasma damage, so the shield multiplier is the payload.
  add('Plasma Gun', 'vPlasma', 'armed', 2, D, 1, 2.5 + m(0, 0.15) + rar * 0.2, 0,
    S([[30, 1], [39, 2], [48, 3], [52, 4]]), 2.0, m(550, 800), m(500, 700),
    15 / (15 + 20), 1 / m(0.15, 0.2), { acc: 0.99 - 0.015, cycle: 35 });

  // Rocket Launcher: 1-in-8 rolls a seeker (no flight penalty); modelled unguided.
  add('Rocket Launcher', 'vRocket', 'armed', 1, D, 1, 1, 0,
    S([[32, 2], [40, 3], [48, 4], [52, 5]]), 3.0, m(1300, 1800), m(150, 200),
    20 / (20 + 15), 1 / m(0.5, 1.5), { acc: 0.99 - 0.01, cycle: 35 });

  add('Cannon', 'vCannon', 'armed', 2, D, 1, 1, 0,
    S([[28, 3], [38, 4], [49, 5], [52, 6]]), 3.5, m(1100, 1500), m(600, 800),
    25 / (25 + 15), 1 / m(1.5, 2.5), { acc: 0.99 - 0.005, cycle: 40 });

  // Railgun: a beam, so no flight time; blockPenetration is hull-side, not shield pierce.
  add('Railgun', 'vRail', 'armed', 2, D, 1, 1, 0,
    S([[28, 2], [35, 3], [42, 4], [49, 5], [52, 6]]), 3.5, m(950, 1400), null,
    27.5 / (27.5 + 10), 1 / m(1, 2.5), { acc: 0.999 - 0.005, cycle: 37.5 });

  add('Lightning Gun', 'vLightning', 'armed', 1, D * 1.15, 1, 1, 0,
    S([[36, 2], [42, 3], [46, 4], [50, 5], [52, 6]]), 3.5, m(950, 1400), null,
    15 / (15 + 20), 1 / m(1, 2.5), { acc: 0.99 - 0.015, cycle: 35 });

  add('Tesla Gun', 'vTesla', 'armed', 1, D * 2.0, 1, 1, 0,
    S([[25, 1], [36, 2], [49, 3], [52, 6]]), 3.5, m(250, 350), null,
    15 / (15 + 20), 1 / 0.2, { acc: 0.99 - 0.03, cycle: 35 });

  // Pulse Cannon: budget is cut 25% to pay for shield penetration, which it always
  // rolls (0.7–0.8 raised toward 1 by rarity). Damage is pre-compensated for cooling.
  {
    const shoot = 15 * m(1, 1.5), cool = 5 * m(1, 1.5);
    const duty = shoot / (shoot + cool);
    const chance = m(0.7, 0.8);
    add('Pulse Cannon', 'vPulse', 'armed', 2, (D * 0.75) / duty, 1, 1,
      chance + rf * (1 - chance),
      S([[25, 1], [36, 2], [47, 3], [52, 4]]), 2.0, m(450, 750), m(700, 800), duty,
      1 / m(0.05, 0.2), { acc: 0.99 - 0.02, cycle: shoot + cool });
  }

  // ---- defensive (PointDefense slots) -------------------------------------
  // Point defense damage is flat, not budget-derived: it does not scale with distance.
  {
    const fd = m(0.075, 0.1);
    const dmg = (1.5 + Math.max(0, rar) * 0.25) * 0.1 + T * 0.05;
    add('Point Defense Cannon', 'vPdc', 'def', 2, dmg / fd, 1, 1, 0,
      S([[52, 1]]), 0.5, m(700, 750), m(1000, 1100), 1, 1 / fd, { acc: 0.995 });
  }
  {
    const dmg = (5 + Math.max(0, rar) * 0.25) * 0.1 + T * 0.05;
    add('Point Defense Laser', 'vPdl', 'def', 1, dmg / 0.2, 1, 1, 0,
      S([[52, 1]]), 0.5, m(500, 600), null, 1, 1 / 0.2);
  }
  {
    const fd = m(2, 2.5);
    const dmg = D * 0.1 * fd + T * 0.05;
    add('Anti-Fighter Cannon', 'vAF', 'def', 2, dmg / fd, 1, 1, 0,
      S([[52, 1]]), 0.5, m(300, 350), m(300, 400), 1, 1 / fd, { acc: 0.99 - 0.015 });
  }

  // ---- unarmed ------------------------------------------------------------
  const MINING_SLOTS = [[12, 1], [25, 2], [35, 3], [45, 4], [52, 5]];
  const miningSize = S([[12, 0.5], [25, 1.0], [35, 1.5], [45, 2.5], [52, 3.0]]);

  add('Mining Laser', 'vMining', 'una', 1, D, 1, 0, 0, S(MINING_SLOTS), miningSize,
    75, null, 1, 1 / 0.2, { mine: true, miningReach: true });
  add('Salvaging Laser', 'vSalv', 'una', 1, D, 1, 0, 0, S(MINING_SLOTS), miningSize,
    75, null, 1, 1 / 0.2, { miningReach: true });
  add('R-Mining Laser', 'vRMining', 'una', 1, D, 1, 0, 0, S(MINING_SLOTS), miningSize,
    150, null, 1, 1 / 0.2, { mine: true, miningReach: true });
  add('R-Salvaging Laser', 'vRSalv', 'una', 1, D, 1, 0, 0, S(MINING_SLOTS), miningSize,
    150, null, 1, 1 / 0.2, { miningReach: true });

  // Repair and Force do no damage at all — they occupy unarmed slots and are listed
  // for completeness, not for comparison.
  add('Repair Beam', 'vRepair', 'una', 1, 0, 0, 0, 0,
    S([[28, 1], [40, 2], [52, 3]]), 1.5, m(200, 300), null, 10 / (10 + 15), 1 / 0.2,
    { noAdapt: true, cycle: 25 });
  add('Force Gun', 'vForce', 'una', 1, 0, 0, 0, 0,
    S([[15, 2], [30, 3], [44, 4], [52, 6]]), 4.0, 500, null, 1, 1 / 0.5,
    { noAdapt: true });

  return L;
}
