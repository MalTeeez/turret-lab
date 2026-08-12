/**
 * Turret-factory costing, pinned to the formulas in turretfactory.lua.
 */
import { expect, test } from 'bun:test';
import { CREATION_TAX, GOOD_PRICE, INVESTMENT, MAX_FACTORY_TECH } from '../src/lib/factory-data.js';
import { RECIPE_KEY, armedObjectPrice, factoryCost, investmentFor, loadoutCost, recipeKeyFor }
  from '../src/lib/factory.js';
import { buildRoster } from '../src/lib/roster.js';
import { build } from '../src/lib/model.js';

const P = { tech: 36, rarity: 5, mat: 4, spec: 1, roster: 'all' };
const L = buildRoster(P).L;

test('every turret in both rosters resolves to a recipe', () => {
  const missing = L.filter((w) => !recipeKeyFor(w)).map((w) => `${w.name} (${w.src})`);
  expect(missing).toEqual([]);
});

test('recipe keys point at recipes that actually exist', () => {
  for (const [name, key] of Object.entries(RECIPE_KEY.het)) {
    expect(INVESTMENT[key], `HET ${name} -> ${key}`).toBeDefined();
  }
  for (const [name, key] of Object.entries(RECIPE_KEY.vanilla)) {
    expect(INVESTMENT[key], `vanilla ${name} -> ${key}`).toBeDefined();
  }
});

/**
 * The mapping is confirmed by the HET turrets whose recipe investFactors reproduce this
 * app's own `inv` / `rinv` constants. Eight do not — recorded here so a future change to
 * either side is a visible diff rather than a silent drift. See the README.
 */
test('HET investment constants agree with the mod recipes, except eight known cases', () => {
  const het = build({ tech: 52, rarity: 5, mat: 6, spec: 1 }).L;
  const disagree = [];

  for (const w of het) {
    const key = RECIPE_KEY.het[w.name];
    if (!key) continue;
    const dmg = investmentFor(key, 'damage');
    const reach = investmentFor(key, 'reach');
    if (Math.abs(dmg - w.inv) > 1e-9 || Math.abs(reach - w.rinv) > 1e-9) {
      disagree.push(w.name);
    }
  }

  expect(disagree.sort()).toEqual([
    'Clandatoh Cannon',
    'Gatling Plasma',
    'Homing Anti-Fighter',
    'Mining Laser',
    'Ophidian',
    'Salvaging Laser',
    'Swarm Missiles',
    'Triad Chaingun',
  ]);
});

test('vanilla investment is taken straight from the recipe', () => {
  for (const w of L.filter((x) => x.src === 'vanilla')) {
    const key = RECIPE_KEY.vanilla[w.name];
    expect(w.inv).toBeCloseTo(investmentFor(key, 'damage'), 12);
    expect(w.rinv).toBeCloseTo(investmentFor(key, 'reach'), 12);
  }
});

test('ArmedObjectPrice is positive, floored, and rises with output', () => {
  for (const w of L) expect(armedObjectPrice(w), w.name).toBeGreaterThanOrEqual(100);

  const w = L.find((x) => x.name === 'Chaingun');
  const stronger = { ...w, raw: w.raw * 2 };
  expect(armedObjectPrice(stronger)).toBeGreaterThan(armedObjectPrice(w));

  const longer = { ...w, km: w.km * 2 };
  expect(armedObjectPrice(longer)).toBeCloseTo(armedObjectPrice(w) * 2, 6);

  // a zero-output turret still floors at 100 rather than going free or negative
  expect(armedObjectPrice({ ...w, raw: 0 })).toBe(100);
});

test('credits follow max(15% of value, value - goods), rounded up to 1000', () => {
  for (const w of L.filter((x) => x.cls === 'armed')) {
    const c = factoryCost(w, { tech: P.tech });
    const expected = Math.ceil(Math.max(c.itemPrice * 0.15, c.itemPrice - c.goodsPrice) / 1000) * 1000;
    expect(c.credits, w.name).toBe(expected);
    expect(c.credits % 1000, w.name).toBe(0);
    expect(c.total, w.name).toBe(c.credits + c.tax + c.goodsPrice);
  }
});

test('tax is 20% and is waived at your own faction factory', () => {
  const w = L.find((x) => x.name === 'Predator Cannon');
  const taxed = factoryCost(w, { tech: P.tech });
  const own = factoryCost(w, { tech: P.tech, ownFaction: true });

  expect(taxed.tax).toBe(Math.round(taxed.credits * CREATION_TAX));
  expect(own.tax).toBe(0);
  expect(own.credits).toBe(taxed.credits - Math.round(taxed.credits * CREATION_TAX));
  expect(own.total).toBeLessThan(taxed.total);
});

test('the goods bill is real and priced from goodsindex.lua', () => {
  const c = factoryCost(L.find((x) => x.name === 'Ophidian'), { tech: P.tech });
  expect(c.rows.length).toBeGreaterThan(0);
  for (const g of c.rows) {
    expect(GOOD_PRICE[g.name], g.name).toBeGreaterThan(0);
    expect(g.amount).toBeGreaterThan(0);
    expect(Number.isInteger(g.amount), `${g.name} amount must be whole`).toBe(true);
  }
  const worth = c.rows.reduce((a, g) => a + GOOD_PRICE[g.name] * g.amount, 0);
  expect(c.goodsPrice).toBeCloseTo(worth, 6);
});

/**
 * Pinned to a real in-game factory card: Double (HET) APCR Sniper Cannon, tech 37,
 * Exotic, Xanion. The bill is the recipe's base amounts x ceil(1 + rarity) = x5 —
 * no `investable` added, matching what the factory asks at default sliders and what
 * a blueprint replica costs.
 */
test('the APCR goods bill matches a real factory card (tech 37, Exotic, Xanion)', () => {
  const w = buildRoster({ tech: 37, rarity: 4, mat: 4, spec: 1, roster: 'het' }).L
    .find((x) => x.name === 'APCR Sniper');
  const c = factoryCost(w, { tech: 37 });
  expect(Object.fromEntries(c.rows.map((r) => [r.name, r.amount]))).toEqual({
    'High Pressure Tube': 5,
    'Ammunition M': 25,
    'Explosive Charge': 10,
    'Steel': 25,
    'Aluminium': 35,
    'Copper': 50,
    'Lead': 50,
    'Conductor': 25,
  });
});

test('rarity scales the goods bill up', () => {
  const cheap = buildRoster({ ...P, rarity: 0 }).L.find((w) => w.name === 'Ophidian');
  const rich = buildRoster({ ...P, rarity: 5 }).L.find((w) => w.name === 'Ophidian');
  expect(factoryCost(rich, {}).goodsPrice).toBeGreaterThan(factoryCost(cheap, {}).goodsPrice);
});

test('the tech cap above 50 is reported', () => {
  const w = L.find((x) => x.name === 'Ophidian');
  expect(factoryCost(w, { tech: MAX_FACTORY_TECH }).techCapped).toBe(false);
  expect(factoryCost(w, { tech: MAX_FACTORY_TECH + 1 }).techCapped).toBe(true);
});

test('a loadout bill sums its turrets and merges the goods', () => {
  const a = L.find((x) => x.name === 'Predator Cannon');
  const b = L.find((x) => x.name === 'Ophidian');
  const bill = loadoutCost([{ w: a, q: 3 }, { w: b, q: 2 }], { tech: P.tech });

  const ca = factoryCost(a, { tech: P.tech }), cb = factoryCost(b, { tech: P.tech });
  expect(bill.credits).toBe(ca.credits * 3 + cb.credits * 2);
  expect(bill.tax).toBe(ca.tax * 3 + cb.tax * 2);
  expect(bill.goodsPrice).toBeCloseTo(ca.goodsPrice * 3 + cb.goodsPrice * 2, 6);
  expect(bill.total).toBeCloseTo(bill.credits + bill.tax + bill.goodsPrice, 6);
  expect(bill.priced).toBe(2);
  expect(bill.unpriced).toEqual([]);

  // merged goods: every name appears once, sorted by what it is worth
  expect(new Set(bill.goods.map((g) => g.name)).size).toBe(bill.goods.length);
  for (let i = 1; i < bill.goods.length; i++) {
    expect(bill.goods[i - 1].worth).toBeGreaterThanOrEqual(bill.goods[i].worth);
  }
  // a shared good must be the sum of both contributions
  const servo = bill.goods.find((g) => g.name === 'Servo');
  if (servo) {
    const fromA = ca.rows.find((g) => g.name === 'Servo')?.amount ?? 0;
    const fromB = cb.rows.find((g) => g.name === 'Servo')?.amount ?? 0;
    expect(servo.amount).toBe(fromA * 3 + fromB * 2);
  }
});

test('an unrecognised turret is reported rather than silently dropped', () => {
  const fake = { ...L[0], name: 'Not A Turret', src: 'het' };
  expect(factoryCost(fake, {})).toBeNull();
  const bill = loadoutCost([{ w: fake, q: 1 }], {});
  expect(bill.unpriced).toEqual(['Not A Turret']);
  expect(bill.priced).toBe(0);
  expect(bill.total).toBe(0);
});

test('costs stay finite across the parameter space', () => {
  for (const tech of [0, 20, 36, 52]) {
    for (const rarity of [-1, 0, 5]) {
      for (const mat of [0, 6]) {
        for (const w of buildRoster({ tech, rarity, mat, spec: 1, roster: 'all' }).L) {
          const c = factoryCost(w, { tech });
          const at = `${w.name} T${tech}R${rarity}M${mat}`;
          expect(Number.isFinite(c.total), at).toBe(true);
          expect(c.total, at).toBeGreaterThan(0);
          expect(c.goodsPrice, at).toBeGreaterThanOrEqual(0);
        }
      }
    }
  }
});
