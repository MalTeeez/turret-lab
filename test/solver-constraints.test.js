/**
 * Per-turret solver constraints: exclude a turret outright, or reserve a guaranteed count.
 */
import { expect, test } from 'bun:test';
import { BAND_ANCHORS, presetWeights, targetHP, distOf } from '../src/lib/model.js';
import { solveLoadout } from '../src/lib/solver.js';
import { buildRoster } from '../src/lib/roster.js';

const P = { tech: 36, rarity: 5, mat: 4, spec: 1, roster: 'all' };
const L = buildRoster(P).L;

const w = presetWeights('mid', BAND_ANCHORS);
const bands = BAND_ANCHORS.map((km, i) => ({ km, w: w[i] / 100 })).filter((b) => b.w > 0);
const [hull, shield] = targetHP(distOf(P.tech), P.mat, 'ship', 4);

const solve = (extra = {}) =>
  solveLoadout(L, { budget: 30, bands, pres: 50, hull, shield, overkill: true, ...extra });

/**
 * A weighted band that no candidate can reach reads "cannot kill" (1e9 s) for EVERY loadout:
 * it steers nothing, but averaged in it turns the reported time-to-kill into garbage (a 2%
 * stray weight beyond the pool once read ~28,000 minutes). Such bands are dropped from the
 * objective and reported instead.
 */
test('a weighted band beyond every candidate is excluded from the objective, not averaged in', () => {
  const base = solve();
  const poisoned = solve({ bands: [...bands, { km: 500, w: 0.02 }] });

  expect(poisoned.objective).toBeLessThan(1e6);            // not poisoned by the sentinel
  expect(poisoned.objective).toBeCloseTo(base.objective, 6); // identical solve without the band
  expect(poisoned.rows.map((r) => `${r.id}x${r.q}`)).toEqual(base.rows.map((r) => `${r.id}x${r.q}`));
  expect(poisoned.unreachable).toEqual([{ km: 500, w: 0.02 }]);
  expect(poisoned.unreachableW).toBeCloseTo(0.02 / (3 + 0.02), 9);
  expect(base.unreachable).toEqual([]);
});

test('a pool that cannot hurt the target anywhere reads "cannot kill", not a garbage average', () => {
  // hull-only candidates against a shielded target can never break the shield
  const donor = L.find((x) => x.cls === 'armed' && x.hull > 0);
  const hullOnly = [{ ...donor, shield: 0, pierce: 0 }];
  const r = solveLoadout(hullOnly, { budget: 30, bands, pres: 50, hull, shield, overkill: true });
  expect(r.objective).toBe(1e9);
  expect(r.rows).toEqual([]);
  expect(r.unreachableW).toBe(1);
});

/**
 * Against a shield-less target, the shield-side overkill term used to divide by an empty
 * pool (0/0 = NaN), which made every loadout containing a long-cycle, shield-capable turret
 * compare as "not better" — the solver could only ever suggest short-cycle turrets (a real
 * case: 7x Clandatoh at 87 hull DPS/slot picked over 10x APCR at 5600).
 */
test('a shield-less target does not NaN-poison long-cycle turrets under overkill', () => {
  const burst = { id: 'burst', name: 'Burst', cls: 'armed', slots: 3, hull: 5600, shield: 159,
    pierce: 0, km: 36, vel: 1500, cycle: 2, dt: 'AntiMatter', shSh: null, maxQty: Infinity };
  const trickle = { id: 'trickle', name: 'Trickle', cls: 'armed', slots: 4, hull: 87, shield: 3747,
    pierce: 0, km: 54, vel: 875, cycle: 0.2, dt: 'Plasma', shSh: null, maxQty: Infinity };

  const r = solveLoadout([burst, trickle], {
    budget: 30, bands, pres: 50, hull: 2278125, shield: 0, overkill: true,
  });
  expect(Number.isFinite(r.objective)).toBe(true);
  // vs a big hull pool the burst turret's 64x hull DPS must win, overkill or not
  expect(r.rows.find((x) => x.id === 'burst')?.q ?? 0).toBeGreaterThan(0);
  expect(r.objective).toBeLessThan(60);
});

test('an excluded turret never appears in the solution', () => {
  const base = solve();
  expect(base.rows.length).toBeGreaterThan(0);

  const victim = base.rows[0].id;
  const after = solve({ excluded: new Set([victim]) });

  expect(after.rows.some((r) => r.id === victim)).toBe(false);
  expect(after.candidates).toBe(base.candidates - 1);
  expect(after.excluded).toEqual([victim]);
  // the budget still gets spent on something else
  expect(after.used).toBeGreaterThan(0);
});

test('excluding is not free — the objective can only get worse', () => {
  const base = solve();
  const after = solve({ excluded: new Set(base.rows.map((r) => r.id)) });
  expect(after.objective).toBeGreaterThanOrEqual(base.objective);
});

test('excluding every candidate yields an empty, honest result', () => {
  const all = new Set(L.map((x) => x.id));
  const r = solve({ excluded: all });
  expect(r.rows).toEqual([]);
  expect(r.used).toBe(0);
  expect(r.candidates).toBe(0);
  expect(r.bandSpan).toBeNull();
});

test('a reserved turret is guaranteed in the solution', () => {
  const base = solve();
  // pick something the solver did NOT choose, so the guarantee is doing real work
  const absent = L.find(
    (x) => x.cls === 'armed' && x.hull > 0 && x.slots <= 30 && !base.rows.some((r) => r.id === x.id),
  );
  expect(absent).toBeDefined();

  const r = solve({ reserved: { [absent.id]: 2 } });
  const row = r.rows.find((x) => x.id === absent.id);
  expect(row, `${absent.name} should be reserved into the solution`).toBeDefined();
  expect(row.q).toBeGreaterThanOrEqual(2);
  expect(row.res).toBe(2);
  expect(r.used).toBeLessThanOrEqual(30);
});

test('several turrets can be reserved at once', () => {
  const armed = L.filter((x) => x.cls === 'armed' && x.hull > 0 && x.slots <= 6);
  const [a, b] = armed;
  const r = solve({ reserved: { [a.id]: 1, [b.id]: 1 } });

  for (const t of [a, b]) {
    const row = r.rows.find((x) => x.id === t.id);
    expect(row, `${t.name} missing`).toBeDefined();
    expect(row.res).toBe(1);
  }
  expect(r.used).toBeLessThanOrEqual(30);
});

test('reservations that cannot fit are trimmed and reported', () => {
  const big = L.filter((x) => x.cls === 'armed' && x.hull > 0).sort((a, b) => b.slots - a.slots)[0];
  // budget for exactly two of them, then demand 99
  const budget = big.slots * 2;
  const r = solveLoadout(L, {
    budget, bands, pres: 50, hull, shield, overkill: true,
    reserved: { [big.id]: 99 },
  });
  const row = r.rows.find((x) => x.id === big.id);
  expect(row, `${big.name} (${big.slots} slots) should fit twice in ${budget}`).toBeDefined();
  expect(row.res).toBe(2);
  expect(r.used).toBeLessThanOrEqual(budget);
  expect(r.lockNote).toContain(big.name);
});

test('competing reservations share the budget instead of overrunning it', () => {
  const armed = L.filter((x) => x.cls === 'armed' && x.hull > 0 && x.slots <= 8).slice(0, 3);
  const r = solveLoadout(L, {
    budget: 12, bands, pres: 50, hull, shield, overkill: true,
    reserved: Object.fromEntries(armed.map((t) => [t.id, 9])),
  });
  expect(r.used).toBeLessThanOrEqual(12);
  const reservedSlots = r.rows.reduce((a, x) => a + x.res * x.sl, 0);
  expect(reservedSlots).toBeLessThanOrEqual(12);
});

test('excluding a turret overrides reserving it', () => {
  const t = L.find((x) => x.cls === 'armed' && x.hull > 0 && x.slots <= 30);
  const r = solve({ excluded: new Set([t.id]), reserved: { [t.id]: 3 } });
  expect(r.rows.some((x) => x.id === t.id)).toBe(false);
  expect(r.lockNote).toContain('not available');
});

test('reserving an unknown id is reported rather than ignored', () => {
  const r = solve({ reserved: { 'Not A Turret': 2 } });
  expect(r.lockNote).toContain('Not A Turret');
  expect(r.rows.length).toBeGreaterThan(0);
});

test('constraints do not let the solve exceed its slot budget', () => {
  for (const budget of [4, 12, 30, 77]) {
    const armed = L.filter((x) => x.cls === 'armed' && x.hull > 0).slice(0, 2);
    const r = solveLoadout(L, {
      budget, bands, pres: 50, hull, shield, overkill: true,
      excluded: new Set([L.find((x) => x.cls === 'armed').id]),
      reserved: { [armed[armed.length - 1].id]: 3 },
    });
    expect(r.used, `budget ${budget}`).toBeLessThanOrEqual(budget);
  }
});
