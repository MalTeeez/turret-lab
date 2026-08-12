/**
 * The loadout solver was generalised from a fixed list of sample distances to a weighted
 * curve. With every active point at full weight that must reduce to exactly what it
 * replaced — same turret picks, same quantities, same objective.
 *
 * `Math.random` is pinned to the same seeded sequence for both implementations so the
 * ruin-and-recreate pass takes an identical path.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
  BAND_ANCHORS, BAND_PRESETS, RESISTABLE, build, distOf, presetWeights, targetHP,
} from '../src/lib/model.js';
import { solveLoadout } from '../src/lib/solver.js';
import { originalSolve } from './reference.js';

const realRandom = Math.random;
let seed = 1;

beforeAll(() => {
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
});
afterAll(() => {
  Math.random = realRandom;
});

const reseed = () => (seed = 12345);

/** [tech, rarity, mat, budget, band, profile, overkill, lockName, lockN, pres] */
const CASES = [
  [36, 5, 4, 30, '3,7,12', 'ship', true, 'Flamethrower', 0, 50],           // the app's defaults
  [36, 5, 4, 30, '3,7,12', 'ship', true, 'Flamethrower', 3, 50],           // reserve honoured
  [36, 5, 4, 8, '0.5,1.5,3', 'fighter', true, 'Predator Cannon', 40, 50],  // reserve overflows budget
  [36, 5, 4, 30, '3,7,12', 'ship', false, '', 0, 50],                      // overkill off
  [52, 5, 6, 40, '8,14,21', 'station', true, '', 0, 100],                  // endgame, full resist risk
  [8, -1, 0, 12, '0.5,3,8,14,21', 'flagship', true, 'Ophidian', 2, 0],     // low tech, no resist risk
  [24, 2, 2, 20, '3,7,12', 'custom', true, '', 0, 25],                     // custom target HP
  [4, 0, 0, 4, '3,7,12', 'ship', true, '', 0, 50],                         // budget fits almost nothing
];

/** The preset whose sample points are exactly this band string. */
function presetFor(band) {
  const want = band.split(',').map(Number);
  const key = Object.keys(BAND_PRESETS).find((k) => {
    const w = presetWeights(k, BAND_ANCHORS);
    const kms = BAND_ANCHORS.filter((_, i) => w[i] > 0);
    return kms.length === want.length && kms.every((v, i) => v === want[i]);
  });
  if (!key) throw new Error(`no preset reproduces the band string "${band}"`);
  return key;
}

test('every preset still lands on the original band strings', () => {
  expect(presetFor('0.5,1.5,3')).toBe('brawl');
  expect(presetFor('3,7,12')).toBe('mid');
  expect(presetFor('8,14,21')).toBe('long');
  expect(presetFor('0.5,3,8,14,21')).toBe('everything');
  // full-weight sweep covers every anchor
  expect(presetWeights('flat', BAND_ANCHORS).every((w) => w === 100)).toBe(true);
});

test.each(CASES)(
  'solve T%i R%i M%i budget %i band %s profile %s overkill %p lock %s x%i',
  (T, R, M, B, band, profile, overkill, lockName, lockN, pres) => {
    const srat = 4, cHull = 20000, cShield = 80000;
    const mk = () => build({ tech: T, rarity: R, mat: M, spec: 1 });

    reseed();
    const A = originalSolve({
      build: mk, budget: B, band, srat, profile, cHull, cShield, pres,
      overkill, lockName, lockN, tech: T, mat: M, distOf, targetHP, RESISTABLE,
    });

    reseed();
    const [hull, shield] = profile === 'custom'
      ? [cHull, cShield]
      : targetHP(distOf(T), M, profile, srat);

    // drive the port the way the UI does: preset weights, divided by 100
    const w = presetWeights(presetFor(band), BAND_ANCHORS);
    const bands = BAND_ANCHORS.map((km, i) => ({ km, w: w[i] / 100 })).filter((b) => b.w > 0);

    // The single lock type generalised to a reserved map; one entry must behave identically.
    const Bres = solveLoadout(mk().L, {
      budget: B, bands, pres, hull, shield, overkill,
      reserved: lockName && lockN ? { [lockName]: lockN } : {},
    });

    expect(Bres.rows.map((r) => r.n)).toEqual(A.rows.map((r) => r.n));
    expect(Bres.rows.map((r) => r.q)).toEqual(A.rows.map((r) => r.q));
    expect(Bres.rows.map((r) => r.res)).toEqual(A.rows.map((r) => r.res));
    expect(Bres.used).toBe(A.used2);
    expect(Bres.objective).toBe(A.bv);   // exact: full-weight points weigh exactly 1
    expect(Bres.H).toBe(A.H);
    expect(Bres.S).toBe(A.S);
    expect(Bres.types).toEqual(A.types);
  },
);
