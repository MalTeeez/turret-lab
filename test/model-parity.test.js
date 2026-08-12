/**
 * The ported HET math must stay a literal transcription of the original single-file app:
 * same constants, same operation order, same floating-point results — except the
 * game-verified divergences pinned in GAME_FIX below.
 */
import { expect, test } from 'bun:test';
import { HEAT, build, cardStats, curves, fitCalibration, specMul } from '../src/lib/model.js';
import { assertReferenceIntact, originalModel } from './reference.js';

const RARITIES = [-1, 0, 1, 2, 3, 4, 5];
const MATERIALS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Deliberate divergences from the reference app, verified against the mod's own Lua and an
 * in-game card: the APCR Sniper and Flamethrower assemblies create their heat pool while
 * only ONE weapon is attached, so the extra barrels alternate inside the single-barrel heat
 * budget and add no sustained DPS. The original summed them (x2 / x3). The APCR's fire rate
 * and volley cycle now carry the heat-limited whole-assembly figures (0.5/s, 2 s).
 */
const GAME_FIX = {
  'APCR Sniper': { barrels: 2, fireRate: [1.0, 0.5], cycle: [1.0, 2.0] },
  'Flamethrower': { barrels: 3 },
  // The original capped its range at "projectile lifetime" (15 km x velocity factor). In the
  // game, reach stays authoritative through scaling and investment — a real 4-slot Exotic card
  // reads 54.38 km, the full uncapped figure — so the port dropped the cap.
  'Clandatoh Cannon': { uncapped: true },
};
/** DPS fields the original inflated by the barrel count. */
const SCALED_BY_BARRELS = new Set(['hull', 'shield', 'tot', 'raw']);

/**
 * Fields the port carries that the original never had — the card's scale roll re-walks the
 * real slot table and re-derives range/velocity from the rolled slot count, which needs the
 * table (`slotsAt`), the slot-factor marker (`kmSlots`) and the alternating-barrel marker
 * (`alt`). Their behaviour is pinned by the scale-roll and in-game-card tests below.
 */
const PORT_ONLY = new Set(['alt', 'slotsAt', 'kmSlots']);

/** Exact where possible; a 1e-12 relative window absorbs nothing that matters. */
function same(a, b, path) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return;
    const rel = Math.abs(a - b) / Math.max(1e-12, Math.abs(a));
    if (rel < 1e-12) return;
    throw new Error(`${path}: original=${a} port=${b}`);
  }
  if (a !== b) throw new Error(`${path}: original=${JSON.stringify(a)} port=${JSON.stringify(b)}`);
}

test('reference file still has the line ranges the harness lifts', () => {
  expect(() => assertReferenceIntact()).not.toThrow();
});

test('build() matches the original across every tech / rarity / material / specialty', () => {
  let checks = 0;
  for (let T = 0; T <= 52; T++) {
    for (const R of RARITIES) {
      for (const M of MATERIALS) {
        for (const SP of [0, 1]) {
          const tag = `T${T}R${R}M${M}S${SP}`;
          const A = originalModel({ tech: T, rarity: R, mat: M, spec: SP }).build();
          const B = build({ tech: T, rarity: R, mat: M, spec: SP });

          for (const k of ['D', 'dist', 'ad', 'HR']) same(A[k], B[k], `${tag}.${k}`);
          same(A.L.length, B.L.length, `${tag}.length`);

          for (let i = 0; i < A.L.length; i++) {
            const [x, y] = [A.L[i], B.L[i]];
            const fix = GAME_FIX[x.name];
            for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
              if (PORT_ONLY.has(k)) continue;
              if (k === 'shSh') {
                if (!x[k] && !y[k]) continue;
                for (const t of Object.keys(x[k] ?? y[k])) {
                  same(x[k]?.[t], y[k]?.[t], `${tag}.${x.name}.shSh.${t}`);
                  checks++;
                }
                continue;
              }
              if (fix) {
                if (fix.barrels && SCALED_BY_BARRELS.has(k)) {
                  same(x[k], y[k] * fix.barrels, `${tag}.${x.name}.${k} (x${fix.barrels} barrels)`);
                  checks++;
                  continue;
                }
                if (fix.uncapped && (k === 'km' || k === 'capped')) {
                  // port never caps; km equals the original except where the original capped it
                  same(false, y.capped, `${tag}.${x.name}.capped`);
                  if (k === 'km' && !x.capped) same(x.km, y.km, `${tag}.${x.name}.km`);
                  if (k === 'km' && x.capped && y.km < x.km) {
                    throw new Error(`${tag}.${x.name}.km: uncapped port ${y.km} below original cap ${x.km}`);
                  }
                  checks++;
                  continue;
                }
                if (Array.isArray(fix[k])) {
                  same(fix[k][0], x[k], `${tag}.${x.name}.${k} original`);
                  same(fix[k][1], y[k], `${tag}.${x.name}.${k} port`);
                  checks++;
                  continue;
                }
              }
              same(x[k], y[k], `${tag}.${x.name}.${k}`);
              checks++;
            }
          }
        }
      }
    }
  }
  // guards against the loops silently collapsing to nothing
  expect(checks).toBeGreaterThan(2_000_000);
});

/**
 * Pinned to a real in-game card: Double (HET) APCR Sniper Cannon, tech 37, Exotic, Xanion,
 * +9% damage variation, +42% range (HighRange), reduced scale roll (3 slots / size 1 — the
 * x0.5 band of the HETBolter scale table).
 * The remaining ~4% drift is the budget constant's fit at the quantized turret-seed sector.
 */
test('APCR Sniper reproduces a real in-game card within 5%', () => {
  const w = build({ tech: 37, rarity: 4, mat: 4, spec: 1 }).L.find((x) => x.name === 'APCR Sniper');
  const s = cardStats(w, {
    rarity: 4, tech: 37, aScale: 0.5, aVar: 1.09, aInv: true, aHR: true, aHD: false,
    aHeat: 'mean', cal: 1,
  });

  const close = (got, want, label, tol = 0.05) => {
    if (Math.abs(got - want) / want > tol) {
      throw new Error(`${label}: card=${want} model=${got.toFixed(1)}`);
    }
  };
  expect(s.slots).toBe(3);
  expect(s.fireRate).toBe(0.5);
  expect(w.hullMult).toBeCloseTo(7.04, 9);              // +603% damage to hull (rounded)
  close(s.hullPS, 5600.3, 'hull eDPS /slot');
  close(s.shPS, 159.1, 'shield eDPS /slot');
  close(s.rawPS * s.slots, 2386.5, 'raw DPS');
  close(s.perShot * w.hullMult, 33601.9, 'hull damage per volley');
  close(s.km, 36.86, 'range km', 0.01);                 // reach 800 x rinv 2.5 x HR x 3-slot factor
  close(s.vel * 10, 15000, 'velocity m/s', 0.01);       // 1000 x 3-slot velocity factor x 10 m/unit
});

/**
 * Pinned to a real in-game card: Quad (HET) Clandatoh Cannon, tech 37, Exotic, Xanion —
 * 4 slots / size 2 (the reduced band; round(6 x 0.75) = 5 slots does not exist in the
 * HETCannon table 4/6/8/10), raw DPS 4996.9, range 54.38 km (NO HighRange rolled, and no
 * projectile-lifetime cap: 54.38 = 1500 x rinv 2.5 x 4-slot factor 1.45), velocity 8750 m/s,
 * hull 87.4 / shield 3747.7 per slot, per-projectile hull damage 4 x 30.6.
 */
test('scale roll and range reproduce a real 4-slot Clandatoh card (tech 37, Exotic, Xanion)', () => {
  const w = build({ tech: 37, rarity: 4, mat: 4, spec: 1 }).L.find((x) => x.name === 'Clandatoh Cannon');
  const a = { rarity: 4, tech: 37, aVar: 1.0, aInv: true, aHR: false, aHD: false, aHeat: 'mean', cal: 1 };

  const full = cardStats(w, { ...a, aScale: 1 });
  expect(full.slots).toBe(6);

  const s = cardStats(w, { ...a, aScale: 0.75 });        // scaleTech 27 -> the 4-slot band
  const close = (got, want, label, tol = 0.02) => {
    if (Math.abs(got - want) / want > tol) {
      throw new Error(`${label}: card=${want} model=${got.toFixed(1)}`);
    }
  };
  expect(s.slots).toBe(4);
  close(s.rawPS * s.slots, 4996.9, 'raw DPS');
  close(s.hullPS, 87.4, 'hull DPS /slot');
  close(s.shPS, 3747.7, 'shield DPS /slot');
  close(s.perShot * w.hullMult, 30.6, 'hull damage per projectile');
  close(s.km, 54.38, 'range km', 0.001);
  close(s.vel * 10, 8750, 'velocity m/s', 0.001);

  // the card dropdown's representative factor (t + 0.5) / tech must survive the floor()
  // round-trip exactly onto scale tech t — here the 4-slot band's upper edge, tech 35
  const viaBandEdge = cardStats(w, { ...a, aScale: 35.5 / 37 });
  expect(viaBandEdge.slots).toBe(4);
  // Clandatoh's lowest band runs down to tech 1, so tech 37 has exactly two variants
  expect(cardStats(w, { ...a, aScale: 1.5 / 37 }).slots).toBe(4);
});

test('calibration fit lands Raw DPS on the entered value and never compounds', () => {
  const L = build({ tech: 37, rarity: 4, mat: 4, spec: 1 }).L;
  const w = L.find((x) => x.name === 'APCR Sniper');
  // non-default toggles on purpose: the old fit only honoured aVar
  const a = { rarity: 4, tech: 37, aScale: 0.5, aVar: 1.09, aInv: true, aHR: true, aHD: false, aHeat: 'mean' };

  const cal = fitCalibration(w, 2386.5, a);
  const s = cardStats(w, { ...a, cal });
  expect(s.rawPS * s.slots).toBeCloseTo(2386.5, 6);

  // re-fitting the same card value returns the same multiplier — no compounding,
  // regardless of any calibration already in force
  expect(fitCalibration(w, 2386.5, { ...a, cal })).toBeCloseTo(cal, 12);

  // the fit follows the toggles: a different scale roll needs a different multiplier
  const calFull = fitCalibration(w, 2386.5, { ...a, aScale: 1 });
  expect(calFull).not.toBeCloseTo(cal, 6);
  const sFull = cardStats(w, { ...a, aScale: 1, cal: calFull });
  expect(sFull.rawPS * sFull.slots).toBeCloseTo(2386.5, 6);

  // garbage in, null out
  expect(fitCalibration(w, 0, a)).toBeNull();
  expect(fitCalibration(null, 100, a)).toBeNull();
});

test('curves() matches the original for both axes, hit models and metrics', () => {
  for (const T of [0, 12, 36, 52]) {
    for (const R of [-1, 2, 5]) {
      for (const M of [0, 4, 6]) {
        for (const mode of ['hull', 'shield']) {
          for (const useHit of [0, 1]) {
            for (const metric of ['slot', 'total']) {
              const o = originalModel({ tech: T, rarity: R, mat: M, hitm: useHit, metric });
              const A = o.curves(o.build().L, mode, useHit);
              const B = curves(build({ tech: T, rarity: R, mat: M, spec: 1 }).L, mode, useHit, metric);
              same(A.length, B.length, 'curves.length');
              for (let i = 0; i < A.length; i++) {
                same(A[i].label, B[i].label, `curves[${i}].label`);
                const fix = GAME_FIX[A[i].label];
                // uncapped range moves the x sampling itself — pinned by the in-game card test
                if (fix?.uncapped) continue;
                for (let j = 0; j < A[i].data.length; j++) {
                  same(A[i].data[j].x, B[i].data[j].x, `curves[${i}][${j}].x`);
                  if (fix) {
                    // both sides round to 0.1 after scaling, so allow that much slack
                    const want = B[i].data[j].y * fix.barrels;
                    if (Math.abs(A[i].data[j].y - want) > 0.051 * (1 + fix.barrels)) {
                      throw new Error(
                        `curves[${i}][${j}].y (${A[i].label}): original=${A[i].data[j].y} port x${fix.barrels}=${want}`,
                      );
                    }
                    continue;
                  }
                  same(A[i].data[j].y, B[i].data[j].y, `curves[${i}][${j}].y`);
                }
              }
            }
          }
        }
      }
    }
  }
});

test('cardStats() matches the original drawCard math under every assumption toggle', () => {
  const names = build({ tech: 52, rarity: 5, mat: 6, spec: 1 }).L.map((w) => w.name);

  for (const T of [8, 36, 52]) {
    for (const R of [-1, 3, 5]) {
      for (const M of [0, 4, 6]) {
        const L = build({ tech: T, rarity: R, mat: M, spec: 1 }).L;
        for (const name of names) {
          const w = L.find((x) => x.name === name);
          if (!w) continue;

          for (const aScale of [1, 0.75, 0.5, 0.25]) {
            for (const aInv of [true, false]) {
              for (const aHD of [true, false]) {
                for (const aHeat of ['best', 'mean', 'worst']) {
                  for (const aHR of [true, false]) {
                    const CAL = 1.0, aVar = 1.05;

                    // --- the original drawCard body, with the two documented divergences:
                    // the scale roll walks the real slot table (not rounded full-tech slots)
                    // and range follows the rolled slot count ---
                    const slots = aScale < 1 && w.slotsAt
                      ? Math.max(1, w.slotsAt(Math.max(1, Math.floor(T * aScale))))
                      : Math.max(1, Math.round(w.slots * aScale));
                    let mult = CAL * aVar;
                    if (!aInv) mult /= w.inv;
                    if (aHD) mult *= specMul(R);
                    let duty = w.duty;
                    const h = HEAT[w.name];
                    if (h) {
                      const [a, b, c, d] = h;
                      duty = aHeat === 'best' ? b / (b + c)
                        : aHeat === 'worst' ? a / (a + d)
                          : ((a + b) / 2) / (((a + b) / 2) + ((c + d) / 2));
                    }
                    const k = w.duty > 0 ? duty / w.duty : 1;
                    const hullPS = w.hull * mult * k, shPS = w.shield * mult * k;
                    const rawPS = (w.hullMult > 0 ? hullPS / w.hullMult : shPS / (w.shMult || 1));
                    let km = w.km;
                    if (slots !== w.slots && w.kmSlots) {
                      km = (w.km / (1 + (w.slots - 1) * 0.15)) * (1 + (slots - 1) * 0.15);
                    }
                    if (!aInv) km /= w.rinv;
                    if (!aHR && w.hasHR) km /= w.HRv;
                    const nb = w.nb || 1;
                    // diverges from the original: the APCR's rate is the whole assembly's
                    // heat-limited figure, so it is exempt from the barrel multiplier too
                    const fireRate = (w.fireRate || 0)
                      * (nb > 1 && w.name !== 'Pulse Shotgun' && w.name !== 'APCR Sniper' ? nb : 1);
                    const perShot = fireRate > 0 ? rawPS * slots / fireRate : 0;

                    const s = cardStats(w, { rarity: R, tech: T, aScale, aVar, aInv, aHR, aHD, aHeat, cal: CAL });
                    const tag = `${name} T${T}R${R}M${M} sc${aScale} inv${aInv} hd${aHD} ${aHeat} hr${aHR}`;
                    same(slots, s.slots, `${tag}.slots`);
                    same(duty, s.duty, `${tag}.duty`);
                    same(hullPS, s.hullPS, `${tag}.hullPS`);
                    same(shPS, s.shPS, `${tag}.shPS`);
                    same(rawPS, s.rawPS, `${tag}.rawPS`);
                    same(km, s.km, `${tag}.km`);
                    same(fireRate, s.fireRate, `${tag}.fireRate`);
                    same(perShot, s.perShot, `${tag}.perShot`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});
