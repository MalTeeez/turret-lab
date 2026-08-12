/**
 * Regenerates `src/lib/factory-data.js` from the game's own Lua.
 *
 *   bun run scripts/extract-factory-data.mjs [--game <dir>] [--mod <dir>]
 *
 * Defaults to the standard Steam install and HET workshop item. Re-run after a game
 * or mod update; the generated file is committed so the app never needs the game
 * installed to build.
 *
 * Sources:
 *   data/scripts/lib/goodsindex.lua        good prices
 *   data/scripts/lib/turretingredients.lua per-turret goods bill + investFactors
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};

const GAME = arg('--game', 'C:/Program Files (x86)/Steam/steamapps/common/Avorion');
const MOD = arg('--mod', 'C:/Program Files (x86)/Steam/steamapps/workshop/content/445220/1821043731');
const OUT = resolve(import.meta.dirname, '../src/lib/factory-data.js');

const read = (base, rel) => readFileSync(resolve(base, rel), 'utf8');

/** `goods["Servo"] = {... price=1387, ...}` */
function parseGoods(src) {
  const out = {};
  for (const line of src.split(/\r?\n/)) {
    const m = /^goods\["([^"]+)"\]\s*=\s*\{.*?\bprice\s*=\s*(-?[\d.]+)/.exec(line);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

/**
 * `goods["Aluminium"] = goods["Aluminum"]` — spelling aliases kept for backwards
 * compatibility. Recipes do reference them, so they have to resolve.
 */
function applyAliases(src, prices) {
  for (const line of src.split(/\r?\n/)) {
    const m = /^goods\["([^"]+)"\]\s*=\s*goods\["([^"]+)"\]/.exec(line);
    if (m && prices[m[2]] != null) prices[m[1]] = prices[m[2]];
  }
  return prices;
}

/** `TurretIngredients[WeaponType.X] = { {name=..., ...}, ... }` */
function parseIngredients(src) {
  const out = {};
  const header = /TurretIngredients\[WeaponType\.(\w+)\]\s*=\s*$/;
  const lines = src.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const h = header.exec(lines[i].trim()) ?? /TurretIngredients\[WeaponType\.(\w+)\]\s*=\s*\{/.exec(lines[i]);
    if (!h) continue;

    const rows = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^\s*\}\s*$/.test(line)) break;
      const body = /\{([^}]*)\}/.exec(line);
      if (!body) continue;

      const row = {};
      for (const [, k, v] of body[1].matchAll(/(\w+)\s*=\s*("(?:[^"]*)"|StatChanges\.\w+|[-\d.]+)/g)) {
        row[k] = v.startsWith('"') ? v.slice(1, -1)
          : v.startsWith('StatChanges.') ? v.slice('StatChanges.'.length)
            : Number(v);
      }
      if (row.name) rows.push(row);
    }
    if (rows.length) out[h[1]] = rows;
  }
  return out;
}

/** stat -> total investFactor, i.e. the multiplier a fully-invested turret gets. */
function investment(rows) {
  const totals = {};
  for (const r of rows) {
    const stat = r.weaponStat ?? r.turretStat;
    if (!stat || r.investFactor == null) continue;
    // Flat changes are not a multiplier; only percentage ones scale the stat.
    if (r.changeType && r.changeType !== 'Percentage') continue;
    totals[stat] = (totals[stat] ?? 0) + r.investFactor;
  }
  return totals;
}

/** `valueWeights[WeaponType.ChainGun] = 0.75` and friends, from inventoryitemprice.lua */
function parseWeights(src, table) {
  const out = {};
  const re = new RegExp(`${table}\\[WeaponType\\.(\\w+)\\]\\s*=\\s*(-?[\\d.]+)`, 'g');
  for (const [, type, v] of src.matchAll(re)) out[type] = Number(v);
  return out;
}

const goods = applyAliases(
  read(GAME, 'data/scripts/lib/goods.lua'),
  parseGoods(read(GAME, 'data/scripts/lib/goodsindex.lua')),
);
const vanilla = parseIngredients(read(GAME, 'data/scripts/lib/turretingredients.lua'));
const het = parseIngredients(read(MOD, 'data/scripts/lib/turretingredients.lua'));

if (!Object.keys(goods).length) throw new Error('no goods parsed — goodsindex.lua format changed?');
if (!Object.keys(vanilla).length) throw new Error('no vanilla ingredients parsed');
if (!Object.keys(het).length) throw new Error('no HET ingredients parsed');

// Only keep the goods actually referenced by a turret recipe.
const used = new Set();
for (const rows of [...Object.values(vanilla), ...Object.values(het)]) {
  for (const r of rows) used.add(r.name);
}
const missing = [...used].filter((n) => goods[n] == null);
if (missing.length) throw new Error(`ingredients reference unknown goods: ${missing.join(', ')}`);

// Price weights: the mod ships its own inventoryitemprice.lua, so read both and let
// the HET table win for the types it defines.
const priceSrc = read(GAME, 'data/scripts/lib/inventoryitemprice.lua');
const modPriceSrc = read(MOD, 'data/scripts/lib/inventoryitemprice.lua');
const weights = {};
for (const table of ['valueWeights', 'rarityWeights', 'reachWeights']) {
  weights[table] = { ...parseWeights(priceSrc, table), ...parseWeights(modPriceSrc, table) };
}
if (!Object.keys(weights.valueWeights).length) throw new Error('no valueWeights parsed');

const prices = Object.fromEntries([...used].sort().map((n) => [n, goods[n]]));
const invest = Object.fromEntries(
  [...Object.entries(vanilla), ...Object.entries(het)].map(([k, rows]) => [k, investment(rows)]),
);

const j = (v) => JSON.stringify(v, null, 2).replace(/\n/g, '\n');

writeFileSync(
  OUT,
  `/**
 * GENERATED by scripts/extract-factory-data.mjs — do not edit by hand.
 *
 * Turret-factory recipes and good prices lifted from the game's own Lua:
 *   ${'data/scripts/lib/{goodsindex,turretingredients}.lua'}
 * for both the base game and the HET mod (workshop 445220/1821043731).
 *
 * INVESTMENT[type][stat] is the summed investFactor for a fully-invested turret,
 * i.e. the stat ends up multiplied by (1 + that value).
 */

/** Base price per unit of each good used in a turret recipe. */
export const GOOD_PRICE = ${j(prices)};

/** Vanilla recipes, keyed by WeaponType name. */
export const VANILLA_RECIPE = ${j(vanilla)};

/** HET mod recipes, keyed by WeaponType name. */
export const HET_RECIPE = ${j(het)};

/** Summed investFactor per stat, for every recipe above. */
export const INVESTMENT = ${j(invest)};

/** ArmedObjectPrice weights. HET's inventoryitemprice.lua overrides the base table. */
export const VALUE_WEIGHT = ${j(weights.valueWeights)};
export const RARITY_WEIGHT = ${j(weights.rarityWeights)};
export const REACH_WEIGHT = ${j(weights.reachWeights)};

/** turretfactory.lua: tax on manufacturing, waived at your own faction's factory. */
export const CREATION_TAX = 0.2;

/** The factory caps tech at 50 on purpose — 51/52 turrets are loot only. */
export const MAX_FACTORY_TECH = 50;
`,
  'utf8',
);

console.log(`goods:   ${Object.keys(prices).length} referenced`);
console.log(`vanilla: ${Object.keys(vanilla).length} recipes`);
console.log(`HET:     ${Object.keys(het).length} recipes`);
console.log(`-> ${OUT}`);
