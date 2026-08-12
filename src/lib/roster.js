/**
 * Composes the HET and vanilla turret lists into the single roster the UI works on.
 *
 * The two rosters share display names ("Mining Laser", "Salvaging Laser"), so every
 * entry gets a stable `id` — that, not the name, is what selection, visibility and
 * sorting key off.
 */

import { build } from './model.js';
import { buildVanilla } from './vanilla.js';

/**
 * Placeholder rows in the HET list. They are superseded by the real vanilla Laser and
 * Railgun once the full vanilla roster is present.
 */
export const LEGACY_VANILLA = new Set(['VANILLA Laser', 'VANILLA Railgun']);

export const ROSTERS = [
  ['all', 'HET + vanilla'],
  ['het', 'HET only'],
  ['vanilla', 'Vanilla only'],
];

/** Carry the sim's rarity/material onto each entry — factory pricing needs them. */
const tag = (w, src, p) => ({
  ...w,
  src,
  id: src === 'het' ? w.name : `v:${w.name}`,
  rarityValue: +p.rarity,
  materialValue: +p.mat,
});

/**
 * @param {{tech:number, rarity:number, mat:number, spec:number, roster:string}} p
 * @returns {{L:Array, D:number, dist:number, ad:number, HR:number}}
 */
export function buildRoster(p) {
  const het = build(p);
  const hetL = het.L.map((w) => tag(w, 'het', p));

  if (p.roster === 'het') return { ...het, L: hetL };

  const vanillaL = buildVanilla(p).map((w) => tag(w, 'vanilla', p));
  if (p.roster === 'vanilla') return { ...het, L: vanillaL };

  return { ...het, L: [...hetL.filter((w) => !LEGACY_VANILLA.has(w.name)), ...vanillaL] };
}
