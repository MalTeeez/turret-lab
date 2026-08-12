/**
 * The ported HET math must stay a literal transcription of the original single-file app:
 * same constants, same operation order, same floating-point results.
 */
import { expect, test } from 'bun:test';
import { HEAT, build, cardStats, curves, specMul } from '../src/lib/model.js';
import { assertReferenceIntact, originalModel } from './reference.js';

const RARITIES = [-1, 0, 1, 2, 3, 4, 5];
const MATERIALS = [0, 1, 2, 3, 4, 5, 6];

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
            for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
              if (k === 'shSh') {
                if (!x[k] && !y[k]) continue;
                for (const t of Object.keys(x[k] ?? y[k])) {
                  same(x[k]?.[t], y[k]?.[t], `${tag}.${x.name}.shSh.${t}`);
                  checks++;
                }
                continue;
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
                for (let j = 0; j < A[i].data.length; j++) {
                  same(A[i].data[j].x, B[i].data[j].x, `curves[${i}][${j}].x`);
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

                    // --- the original drawCard body, verbatim ---
                    const slots = Math.max(1, Math.round(w.slots * aScale));
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
                    if (!aInv) km /= w.rinv;
                    if (!aHR && w.hasHR) km /= w.HRv;
                    const nb = w.nb || 1;
                    const fireRate = (w.fireRate || 0) * (nb > 1 && w.name !== 'Pulse Shotgun' ? nb : 1);
                    const perShot = fireRate > 0 ? rawPS * slots / fireRate : 0;

                    const s = cardStats(w, { rarity: R, aScale, aVar, aInv, aHR, aHD, aHeat, cal: CAL });
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
