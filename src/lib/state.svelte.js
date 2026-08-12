import { SvelteSet } from 'svelte/reactivity';
import { BAND_ANCHORS, presetWeights } from './model.js';

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
  srat: 4,
  cHull: 20000,
  cShield: 80000,
  overkill: true,
  pres: 50,
  lockId: 'Flamethrower',
  lockN: 0,
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

export function sortBy(k) {
  if (view.sortK === k) view.sortDir *= -1;
  else {
    view.sortK = k;
    view.sortDir = k === 'name' || k === 'cls' ? 1 : -1;
  }
}
