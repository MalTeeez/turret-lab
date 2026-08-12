/**
 * Registered turrets: stat overrides, and the solver drawing only from what you own.
 */
import { expect, test } from 'bun:test';
import { BAND_ANCHORS, cardStats, distOf, presetWeights, targetHP } from '../src/lib/model.js';
import {
  OVERRIDABLE, isBlueprint, loadInventory, materialise, materialiseAll, mixedPool, newEntry,
  orphaned, overridesFromStats, ownedCount,
} from '../src/lib/inventory.js';
import { solveLoadout } from '../src/lib/solver.js';
import { buildRoster } from '../src/lib/roster.js';

const P = { tech: 36, rarity: 5, mat: 4, spec: 1, roster: 'all' };
const L = buildRoster(P).L;
const base = L.find((w) => w.name === 'Predator Cannon');

const w = presetWeights('mid', BAND_ANCHORS);
const bands = BAND_ANCHORS.map((km, i) => ({ km, w: w[i] / 100 })).filter((b) => b.w > 0);
const [hull, shield] = targetHP(distOf(P.tech), P.mat, 'ship', 4);
const solve = (pool, extra = {}) =>
  solveLoadout(pool, { budget: 30, bands, pres: 50, hull, shield, overkill: true, ...extra });

const entry = (over = {}, count = 1) => ({ ...newEntry(base), count, overrides: over });
/** A fresh registration, i.e. whatever the default is. */
const fresh = (over = {}) => ({ ...newEntry(base), overrides: over });

test('a new registration is a blueprint — unlimited by default', () => {
  const e = newEntry(base);
  expect(e.count).toBeNull();
  expect(isBlueprint(e)).toBe(true);
  expect(ownedCount(e)).toBe(Infinity);

  const m = materialise(e, L);
  expect(m.blueprint).toBe(true);
  expect(m.owned).toBe(Infinity);
  expect(m.maxQty).toBe(Infinity);
});

/**
 * Registering from the card copies the configured variant: a tech-37 Clandatoh viewed at the
 * reduced 4-slot scale roll (a real card: 4 slots, 54.38 km, no HighRange) must register as
 * that variant, not as the full-tech 6-slot generated turret.
 */
test('registering copies the card view — the 4-slot Clandatoh registers with 4 slots', () => {
  const L37 = buildRoster({ tech: 37, rarity: 4, mat: 4, spec: 1, roster: 'het' }).L;
  const clan = L37.find((x) => x.name === 'Clandatoh Cannon');
  const s = cardStats(clan, {
    rarity: 4, tech: 37, aScale: 0.75, aVar: 1.0, aInv: true, aHR: false, aHD: false,
    aHeat: 'mean', cal: 1,
  });

  const o = overridesFromStats(clan, s);
  expect(o.slots).toBe(4);
  expect(o.km).toBeCloseTo(54.38, 2);

  const m = materialise({ ...newEntry(clan, [], o) }, L37);
  expect(m.slots).toBe(4);
  expect(m.km).toBeCloseTo(54.38, 2);
  expect(m.vel).toBeCloseTo(875, 0);
  expect(m.tot).toBeCloseTo(m.hull * 4, 9);
  expect(m.overridden).toContain('slots');

  // the untouched card registers with no overrides at all
  expect(overridesFromStats(clan, cardStats(clan, {
    rarity: 4, tech: 37, aScale: 1, aVar: 1.0, aInv: true, aHR: true, aHD: false,
    aHeat: 'mean', cal: 1,
  }))).toEqual({});
});

test('setting a limit turns a blueprint into a capped entry', () => {
  const limited = { ...newEntry(base), count: 3 };
  expect(isBlueprint(limited)).toBe(false);
  expect(ownedCount(limited)).toBe(3);
  expect(materialise(limited, L).maxQty).toBe(3);
  // and back again
  expect(ownedCount({ ...limited, count: null })).toBe(Infinity);
});

test('a blueprint lets the solver stack as many as fit', () => {
  const pool = materialiseAll([fresh()], L);
  const r = solve(pool);
  expect(r.rows[0].q).toBeGreaterThan(1);
  // the budget, not the inventory, is what stops it
  expect(r.used + base.slots).toBeGreaterThan(30);
});

test('a limit of 1 on the same turret really does bind', () => {
  expect(solve(materialiseAll([entry({}, 1)], L)).rows[0].q).toBe(1);
});

test('a registered turret inherits the generated stats', () => {
  const m = materialise(entry(), L);
  expect(m.name).toBe(base.name);
  expect(m.slots).toBe(base.slots);
  expect(m.km).toBe(base.km);
  expect(m.hull).toBe(base.hull);
  expect(m.dt).toBe(base.dt);          // unlisted stats still come from the catalogue
  expect(m.overridden).toEqual([]);
  expect(m.id).not.toBe(base.id);      // its own identity, so duplicates can coexist
});

test('every advertised stat can actually be overridden', () => {
  for (const f of OVERRIDABLE) {
    const value = f.key === 'slots' ? 3 : f.key === 'pierce' || f.key === 'duty' ? 0.5 : 12.5;
    const m = materialise(entry({ [f.key]: value }), L);
    expect(m[f.key], f.key).toBe(f.key === 'slots' ? 3 : value);
    expect(m.overridden, f.key).toContain(f.key);
  }
});

test('blank and junk overrides fall back to the generated value', () => {
  for (const bad of ['', null, undefined, 'abc', NaN]) {
    const m = materialise(entry({ km: bad }), L);
    expect(m.km, String(bad)).toBe(base.km);
    expect(m.overridden).toEqual([]);
  }
});

test('overriding hull or slots keeps the derived total consistent', () => {
  const m = materialise(entry({ hull: 100, slots: 4 }), L);
  expect(m.tot).toBe(400);
});

test('two registrations of the same turret stay independent', () => {
  const a = { ...newEntry(base), uid: 'a', overrides: { km: 5 } };
  const b = { ...newEntry(base), uid: 'b', overrides: { km: 20 } };
  const [ma, mb] = materialiseAll([a, b], L);
  expect(ma.id).not.toBe(mb.id);
  expect(ma.km).toBe(5);
  expect(mb.km).toBe(20);
});

test('entries whose base has left the roster are reported, not silently dropped', () => {
  const stale = { ...newEntry(base), baseId: 'no-such-turret' };
  expect(materialise(stale, L)).toBeNull();
  expect(materialiseAll([stale, entry()], L)).toHaveLength(1);
  expect(orphaned([stale, entry()], L)).toHaveLength(1);
});

test('the solver draws only from the registered pool', () => {
  const pool = materialiseAll([entry({}, 4)], L);
  const r = solve(pool);
  expect(r.candidates).toBe(1);
  expect(r.rows).toHaveLength(1);
  expect(r.rows[0].n).toBe('Predator Cannon');
});

test('it never picks more than you own', () => {
  for (const owned of [1, 2, 3]) {
    const pool = materialiseAll([entry({}, owned)], L);
    const r = solve(pool);
    expect(r.rows[0].q, `owned ${owned}`).toBe(owned);
    expect(r.used).toBeLessThanOrEqual(owned * base.slots);
  }
  // and with slots to spare, it still cannot conjure a fourth
  const r = solveLoadout(materialiseAll([entry({}, 3)], L), {
    budget: 200, bands, pres: 50, hull, shield, overkill: true,
  });
  expect(r.rows[0].q).toBe(3);
});

test('the cap holds across a mixed inventory', () => {
  const other = L.find((x) => x.cls === 'armed' && x.hull > 0 && x.id !== base.id);
  const items = [entry({}, 2), { ...newEntry(other), baseId: other.id, count: 5, overrides: {} }];
  const pool = materialiseAll(items, L);
  const r = solveLoadout(pool, { budget: 200, bands, pres: 50, hull, shield, overkill: true });
  for (const row of r.rows) {
    const owned = pool.find((p) => p.id === row.id).owned;
    expect(row.q, row.n).toBeLessThanOrEqual(owned);
  }
});

test('a reservation cannot exceed the owned count either', () => {
  const pool = materialiseAll([entry({}, 2)], L);
  const r = solveLoadout(pool, {
    budget: 200, bands, pres: 50, hull, shield, overkill: true,
    reserved: { [pool[0].id]: 9 },
  });
  expect(r.rows[0].res).toBe(2);
  expect(r.rows[0].q).toBe(2);
});

test('overrides actually change what the solver sees', () => {
  const short = materialiseAll([entry({ km: 0.5 }, 4)], L);
  const long = materialiseAll([entry({ km: 20 }, 4)], L);
  // the mid preset samples 3-12 km, so a 0.5 km turret cannot reach the target
  expect(solve(short).objective).toBeGreaterThan(solve(long).objective);
});

test('an empty inventory yields an empty, honest solve', () => {
  const r = solve([]);
  expect(r.rows).toEqual([]);
  expect(r.candidates).toBe(0);
  expect(r.used).toBe(0);
});

test('unbounded catalogue turrets are unaffected by the cap logic', () => {
  const r = solve(L);
  expect(r.rows.some((x) => x.q > 3)).toBe(true);   // free to stack many
  expect(r.used).toBeLessThanOrEqual(30);
});

// --- mixed source: your turrets per type, generated estimates for the rest ---------------

test('with nothing registered the mixed pool is just the catalogue', () => {
  const pool = mixedPool([], L);
  expect(pool).toHaveLength(L.length);
  expect(pool.map((w) => w.id)).toEqual(L.map((w) => w.id));
});

test('a registration replaces its own type and nothing else', () => {
  const e = entry({}, 2);
  const pool = mixedPool([e], L);

  expect(pool).toHaveLength(L.length);                       // one in, one out
  expect(pool.some((w) => w.id === base.id)).toBe(false);    // the estimate is gone
  expect(pool.some((w) => w.invUid === e.uid)).toBe(true);
  // and it sits where the turret it stands in for used to
  expect(pool.findIndex((w) => w.invUid === e.uid)).toBe(L.findIndex((w) => w.id === base.id));
  // every other type is untouched, same objects
  const rest = L.filter((w) => w.id !== base.id);
  expect(pool.filter((w) => !w.invUid)).toEqual(rest);
});

test('several copies of one type all stand in for it', () => {
  const a = { ...newEntry(base), uid: 'a', count: 1, overrides: { km: 5 } };
  const b = { ...newEntry(base), uid: 'b', count: 3, overrides: { km: 20 } };
  const pool = mixedPool([a, b], L);

  expect(pool).toHaveLength(L.length + 1);
  expect(pool.some((w) => w.id === base.id)).toBe(false);
  expect(pool.filter((w) => w.baseId === base.id).map((w) => w.km)).toEqual([5, 20]);
});

test('estimates stay unlimited while your copies keep their cap', () => {
  const pool = mixedPool([entry({}, 2)], L);
  const mine = pool.find((w) => w.invUid);
  const estimate = pool.find((w) => !w.invUid && w.cls === 'armed');

  expect(mine.maxQty).toBe(2);
  expect(estimate.maxQty).toBeUndefined();   // the solver reads undefined as Infinity
});

test('an entry whose base has left the roster removes nothing from the pool', () => {
  const stale = { ...newEntry(base), baseId: 'no-such-turret' };
  const pool = mixedPool([stale], L);
  expect(pool.map((w) => w.id)).toEqual(L.map((w) => w.id));
});

test('the solver caps your copies but stacks the estimates freely', () => {
  const pool = mixedPool([entry({}, 2)], L);
  const r = solveLoadout(pool, { budget: 200, bands, pres: 50, hull, shield, overkill: true });

  expect(r.candidates).toBeGreaterThan(1);                     // estimates are in play
  expect(r.rows.some((row) => row.id === base.id)).toBe(false); // never the replaced estimate
  const mine = r.rows.find((row) => String(row.id).startsWith('inv:'));
  if (mine) expect(mine.q).toBeLessThanOrEqual(2);
  expect(r.rows.some((row) => row.q > 2)).toBe(true);           // something unbounded stacked past it
});

test('overrides on a registration reach the solver through the mixed pool', () => {
  expect(mixedPool([entry({ km: 7.5 }, 1)], L).find((w) => w.invUid).km).toBe(7.5);

  // Overkill is off here on purpose: it scales the wasted volley with the damage, so a
  // stronger copy of a 12 s burst weapon is no more attractive than the original.
  const pick = (over) =>
    solveLoadout(mixedPool([entry(over, 4)], L), {
      budget: 30, bands, pres: 50, hull, shield, overkill: false,
    }).rows.find((row) => String(row.id).startsWith('inv:'))?.q ?? 0;

  expect(pick({ km: 0.5, hull: 1, shield: 0 })).toBe(0);      // out of every weighted band
  expect(pick({ hull: base.hull * 3, shield: base.shield * 3 })).toBeGreaterThan(0);
});

test('loading a corrupt store degrades to an empty inventory', () => {
  const original = globalThis.localStorage;
  for (const raw of ['not json', '{"a":1}', '[{"nope":true}]', null]) {
    globalThis.localStorage = { getItem: () => raw, setItem() {} };
    expect(Array.isArray(loadInventory()), String(raw)).toBe(true);
  }
  // a well-formed entry survives the round trip, with counts and overrides coerced
  globalThis.localStorage = {
    getItem: () => JSON.stringify([{ uid: 't1', baseId: base.id, count: '3', label: 'Mine', overrides: { km: '7', bogus: 9 } }]),
    setItem() {},
  };
  const [item] = loadInventory();
  expect(item.count).toBe(3);
  expect(item.overrides).toEqual({ km: 7 });
  expect(materialise(item, L).km).toBe(7);

  // a missing or unusable count restores the blueprint default rather than becoming 1
  for (const bad of [undefined, null, 'many', {}]) {
    globalThis.localStorage = {
      getItem: () => JSON.stringify([{ uid: 't1', baseId: base.id, count: bad, overrides: {} }]),
      setItem() {},
    };
    const [loaded] = loadInventory();
    expect(loaded.count, String(bad)).toBeNull();
    expect(materialise(loaded, L).maxQty, String(bad)).toBe(Infinity);
  }
  globalThis.localStorage = original;
});
