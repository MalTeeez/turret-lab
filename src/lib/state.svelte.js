import { SvelteSet } from 'svelte/reactivity';
import { BAND_ANCHORS, presetWeights } from './model.js';
import { loadInventory, newEntry, saveInventory } from './inventory.js';

/** Global simulation parameters — everything downstream derives from these. */
export const sim = $state({
  tech: 36,
  rarity: 5,
  mat: 4,
  diff: 0.6,      // display only: difficulty does not scale turret stats
  hitm: 1,        // 1 = penalise flight time
  metric: 'slot', // 'slot' | 'total'
  spec: 1,        // 1 = HighRange where possible
  roster: 'all',  // 'all' | 'het' | 'vanilla'
});

/** Chart / table view state. */
export const view = $state({
  hidden: new SvelteSet(),
  sortK: 'hull',
  sortDir: -1,
  /** Table filters — the roster is large enough that browsing needs narrowing. */
  filterCls: 'all', // 'all' | 'armed' | 'def' | 'una'
  query: '',        // matches name, damage type, or roster ("vanilla")
});

/** Loadout solver settings and its last result. */
export const opt = $state({
  budget: 30,
  bandPreset: 'mid',
  /** Sampling distances the curve sits on — rebuilt when the roster's max range moves. */
  bandKms: BAND_ANCHORS.slice(),
  /** Importance per band, 0–100, parallel to `bandKms`. */
  bandWeights: presetWeights('mid', BAND_ANCHORS),
  profile: 'ship',
  /** Shield HP per hull HP. 1 is an even target; the slider leans up to 5:1 either way. */
  srat: 1,
  cHull: 20000,
  cShield: 80000,
  overkill: true,
  pres: 50,
  /** Turret ids the solver may not pick at all. */
  excluded: new SvelteSet(),
  /** id -> guaranteed count, seeded before the solve and never removed. */
  reserved: {},
  /** Own-faction turret factories waive the 20% creation tax. */
  ownFaction: false,
  result: null,
  solving: false,
});

/** Turret card panel: which turret, and which lucky rolls to assume. */
export const card = $state({
  id: 'Ophidian',
  aInv: true,
  aHR: true,
  aHD: false,
  aScale: 1,
  aVar: 1.05,
  aHeat: 'best',
  cal: 1,
  calVal: null,
  /** How many of this turret to cost up. Display only — the solver ignores it. */
  qty: 1,
});

export function toggleHidden(id) {
  if (view.hidden.has(id)) view.hidden.delete(id);
  else view.hidden.add(id);
}

export function showAll(ids) {
  for (const id of ids) view.hidden.delete(id);
}

export function hideAll(ids) {
  for (const id of ids) view.hidden.add(id);
}

/** Show only `id` within `ids` — the fast way to read one curve out of a crowded chart. */
export function isolate(ids, id) {
  for (const other of ids) {
    if (other !== id) view.hidden.add(other);
  }
  view.hidden.delete(id);
}

/**
 * Turrets you own. `source` picks what the solver draws from:
 *   catalogue — every turret this tech can generate, all unlimited
 *   mixed     — your turrets for the types you own, generated estimates for the rest
 *   inventory — only what you own
 */
export const inv = $state({
  items: loadInventory(),
  source: 'catalogue', // 'catalogue' | 'mixed' | 'inventory'
});

export const SOURCES = [
  ['catalogue', 'Generated catalogue — anything at this tech'],
  ['mixed', 'Mixed — my turrets where I have them, estimates elsewhere'],
  ['inventory', 'My turrets only — what I actually own'],
];

/**
 * The ids the solver actually sees for a catalogue turret, given the current source mode.
 * Your registered copies carry their own ids, so once they stand in for a type a constraint
 * against the generated id would quietly do nothing.
 */
export function solverIdsFor(baseId) {
  const mine = inv.items.filter((i) => i.baseId === baseId).map((i) => `inv:${i.uid}`);
  if (inv.source === 'inventory') return mine;
  if (inv.source === 'mixed' && mine.length) return mine;
  return [baseId];
}

const persist = () => saveInventory($state.snapshot(inv.items));

export function addToInventory(base, overrides = {}) {
  const entry = newEntry(base, inv.items, overrides);
  inv.items.push(entry);
  persist();
  return entry.uid;
}

export function updateInventory(uid, patch) {
  const item = inv.items.find((i) => i.uid === uid);
  if (!item) return;
  Object.assign(item, patch);
  persist();
}

export function setOverride(uid, key, value) {
  const item = inv.items.find((i) => i.uid === uid);
  if (!item) return;
  if (value === '' || value == null || !Number.isFinite(+value)) delete item.overrides[key];
  else item.overrides[key] = +value;
  persist();
}

export function removeFromInventory(uid) {
  const i = inv.items.findIndex((x) => x.uid === uid);
  if (i >= 0) inv.items.splice(i, 1);
  persist();
}

export function clearInventory() {
  inv.items.length = 0;
  persist();
}

export function toggleExcluded(id) {
  if (opt.excluded.has(id)) opt.excluded.delete(id);
  else opt.excluded.add(id);
}

/**
 * Exclude or re-include several ids at once — one turret card can stand for a handful of
 * registered copies, and the checkbox has to move all of them together.
 */
export function setExcluded(ids, on) {
  for (const id of ids) {
    if (on) opt.excluded.add(id);
    else opt.excluded.delete(id);
  }
}

/** Reserve `n` of a turret; 0 clears it so the map only holds live entries. */
export function setReserved(id, n) {
  const v = Math.max(0, Math.floor(+n || 0));
  if (v === 0) delete opt.reserved[id];
  else opt.reserved[id] = v;
}

export function clearSolverConstraints() {
  opt.excluded.clear();
  for (const k of Object.keys(opt.reserved)) delete opt.reserved[k];
}

export function sortBy(k) {
  if (view.sortK === k) view.sortDir *= -1;
  else {
    view.sortK = k;
    view.sortDir = k === 'name' || k === 'cls' ? 1 : -1;
  }
}
