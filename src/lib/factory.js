/**
 * Turret-factory costing, ported from the game's own Lua:
 *
 *   lib/inventoryitemprice.lua        ArmedObjectPrice()
 *   entity/merchants/turretfactory.lua calculateTurretIngredients() / getNewTurretIngredientsAndTax()
 *
 * Buying a turret costs credits *and* a bill of goods. The credit price is whatever the
 * turret is worth beyond the goods you hand over, floored at 15% of its value, rounded up
 * to the nearest 1000, plus 20% tax unless it is your own faction's factory.
 */

import {
  CREATION_TAX, GOOD_PRICE, HET_RECIPE, INVESTMENT, MAX_FACTORY_TECH,
  RARITY_WEIGHT, REACH_WEIGHT, VALUE_WEIGHT, VANILLA_RECIPE,
} from './factory-data.js';

/**
 * Turret display name -> the WeaponType key its recipe is filed under.
 *
 * Mapped by name against the mod's own type list, then cross-checked against the
 * investFactor totals: 13 of the 21 HET turrets reproduce this app's `inv` / `rinv`
 * constants exactly, which is what confirms the mapping. See FACTORY_NOTES for the
 * eight that disagree.
 */
export const RECIPE_KEY = {
  het: {
    'Ophidian': 'HETOphidian',
    'Flamethrower': 'HETFlamethrower',
    'APCR Sniper': 'HETBolter',
    'Interceptor': 'HETInterceptor',
    'Triad Chaingun': 'HETChainGun',
    'Clandatoh Cannon': 'HETCannon',
    'Swarm Missiles': 'HETSwarmMissiles',
    'Gatling Plasma': 'HETGatlingPlasma',
    'Proton Laser': 'HETLaser',
    'Predator Cannon': 'HETPredatorCannon',
    'Pulse Shotgun': 'HETPulseShotgun',
    'Thunder Hook': 'HETTeslaGun',
    'Crawlers': 'HETCrawler',
    'Neutron Drill': 'HETRailGun',
    'A.D.S.T.': 'HETADST',
    'Homing Anti-Fighter': 'HETAntiFighter',
    'Torpedo Countermeasure': 'HETTopedoKiller',
    'Salvaging Laser': 'HETSalvagingLaser',
    'Mining Laser': 'HETMiningLaser',
    'R-Salv Hammer Head': 'HETRSHammerHead',
    'R-Mining Hammer Head': 'HETRMHammerHead',
  },
  vanilla: {
    'Chaingun': 'ChainGun',
    'Bolter': 'Bolter',
    'Laser': 'Laser',
    'Plasma Gun': 'PlasmaGun',
    'Rocket Launcher': 'RocketLauncher',
    'Cannon': 'Cannon',
    'Railgun': 'RailGun',
    'Lightning Gun': 'LightningGun',
    'Tesla Gun': 'TeslaGun',
    'Pulse Cannon': 'PulseCannon',
    'Point Defense Cannon': 'PointDefenseChainGun',
    'Point Defense Laser': 'PointDefenseLaser',
    'Anti-Fighter Cannon': 'AntiFighter',
    'Mining Laser': 'MiningLaser',
    'Salvaging Laser': 'SalvagingLaser',
    'R-Mining Laser': 'RawMiningLaser',
    'R-Salvaging Laser': 'RawSalvagingLaser',
    'Repair Beam': 'RepairBeam',
    'Force Gun': 'ForceGun',
  },
};

export const recipeKeyFor = (w) => RECIPE_KEY[w.src === 'vanilla' ? 'vanilla' : 'het']?.[w.name] ?? null;

const recipeFor = (key, src) => (src === 'vanilla' ? VANILLA_RECIPE : HET_RECIPE)[key] ?? null;

/** Fully-invested multiplier for a stat, i.e. stat x (1 + summed investFactor). */
export function investmentFor(key, stat) {
  return 1 + (INVESTMENT[key]?.[stat] ?? 0);
}

/**
 * ArmedObjectPrice(), verbatim apart from the fields this lab does not model
 * (repair rates, holding force, mining efficiencies) which are passed in via `extra`.
 *
 * `dps` is the engine's turret DPS field. This lab feeds it the summed-barrel figure,
 * which is the closest analogue available — see FACTORY_NOTES.
 */
export function armedObjectPrice(w, extra = {}) {
  const key = recipeKeyFor(w);
  const type = key ?? 'ChainGun';
  const {
    stoneDamage = 0, hullRepairRate = 0, shieldRepairRate = 0,
    stoneEfficiency = 0, metalEfficiency = 0, seeker = false,
  } = extra;

  const rarity = w.rarityValue ?? 0;
  const material = w.materialValue ?? 0;

  const baseValue = (w.raw / (0.5 + w.slots / 2)) * 2;
  let value = baseValue;

  value += baseValue * (w.shMult - 1) * 0.5;
  value += baseValue * (w.hullMult - 1) * 0.5;
  value += baseValue * w.hullMult * w.pierce;
  value += baseValue * w.hullMult * stoneDamage * 0.15;

  value += (hullRepairRate / w.slots) * 2.5;
  value += (shieldRepairRate / w.slots) * 2.5;

  value = value * (w.km * 100) * (REACH_WEIGHT[type] ?? 1);
  value = value * (1 + stoneEfficiency * (1 + (Math.pow(1.2, material) - 1) * 5));
  value = value * (1 + metalEfficiency * (1 + (Math.pow(1.1, material) - 1) * 3));
  if (seeker) value *= 2;

  value = value * (VALUE_WEIGHT[type] ?? 1);
  value = value + value * Math.max(0, rarity * (RARITY_WEIGHT[type] ?? 0.1));

  return Math.max(value, 100);
}

/**
 * The goods bill for one turret, and what those goods are worth.
 * Mirrors calculateTurretIngredients(): base amounts scale with rarity, then scale back
 * down if the turret is worth less than its own materials.
 *
 * The bill uses the recipe's BASE amounts — that is what the factory asks at default
 * sliders, and (more importantly) what building a copy from a blueprint costs, even when
 * the blueprint itself was rolled at max investment. Investing adds `investable` extra
 * goods per stat, but this lab's max-invested stats + base bill is exactly the
 * blueprint-duplication deal in getDuplicatedTurretIngredientsAndTax().
 */
export function turretIngredients(w, itemPrice) {
  const key = recipeKeyFor(w);
  const base = recipeFor(key, w.src);
  if (!base) return null;

  const rarity = Math.max(0, w.rarityValue ?? 0);
  const worth = (rows) => rows.reduce((a, r) => a + (GOOD_PRICE[r.name] ?? 0) * r.amount, 0);

  let rows = base.map((r) => ({
    name: r.name,
    amount: Math.ceil(1.0 + rarity * (r.rarityFactor ?? 1.0)) * r.amount,
    minimum: r.minimum ?? 0,
  }));

  const scaled = itemPrice * 0.65;
  let goodsPrice = worth(rows);

  if (scaled < goodsPrice && goodsPrice > 0) {
    const factor = scaled / goodsPrice;
    rows = rows.map((r) => ({ ...r, amount: Math.max(r.minimum, Math.floor(r.amount * factor)) }));
    goodsPrice = worth(rows);
  }

  return { rows: rows.filter((r) => r.amount > 0), goodsPrice };
}

/**
 * Full manufacturing cost for one turret.
 * @returns {null | {itemPrice, goodsPrice, credits, tax, total, rows, techCapped}}
 */
export function factoryCost(w, { ownFaction = false, tech = 0 } = {}) {
  if (!recipeKeyFor(w)) return null;

  const itemPrice = armedObjectPrice(w);
  const ing = turretIngredients(w, itemPrice);
  if (!ing) return null;

  let credits = Math.max(itemPrice * 0.15, itemPrice - ing.goodsPrice);
  credits = Math.ceil(credits / 1000) * 1000;

  let tax = Math.round(credits * CREATION_TAX);
  if (ownFaction) {
    credits -= tax;
    tax = 0;
  }

  return {
    itemPrice,
    goodsPrice: ing.goodsPrice,
    rows: ing.rows,
    credits,
    tax,
    total: credits + tax + ing.goodsPrice,
    techCapped: tech > MAX_FACTORY_TECH,
  };
}

/** Roll a solved loadout up into one bill: credits, tax and a merged goods list. */
export function loadoutCost(rows, opts) {
  let credits = 0, tax = 0, goodsPrice = 0, priced = 0;
  const goods = new Map();
  const unpriced = [];

  for (const row of rows) {
    const cost = factoryCost(row.w, opts);
    if (!cost) {
      unpriced.push(row.w.name);
      continue;
    }
    priced++;
    credits += cost.credits * row.q;
    tax += cost.tax * row.q;
    goodsPrice += cost.goodsPrice * row.q;
    for (const g of cost.rows) {
      goods.set(g.name, (goods.get(g.name) ?? 0) + g.amount * row.q);
    }
  }

  return {
    credits, tax, goodsPrice,
    total: credits + tax + goodsPrice,
    goods: [...goods.entries()]
      .map(([name, amount]) => ({ name, amount, worth: (GOOD_PRICE[name] ?? 0) * amount }))
      .sort((a, b) => b.worth - a.worth),
    priced,
    unpriced,
  };
}

/** Caveats the UI surfaces so the numbers are not read as exact. */
export const FACTORY_NOTES = {
  dps:
    'ArmedObjectPrice uses the engine\'s turret DPS field. This lab feeds it the summed-barrel ' +
    'figure, so multi-barrel HET turrets may price higher here than in game if the engine reports ' +
    'only the first weapon.',
  goods:
    'The bill is the factory\'s default (uninvested) goods list — the same bill a blueprint replica ' +
    'costs. Goods are valued at their base price; what a factory actually charges depends on local ' +
    'supply, and you can supply the goods yourself instead.',
  tech: `Turret factories cap out at tech ${MAX_FACTORY_TECH}; tech 51–52 turrets are loot only and cannot be built.`,
};
