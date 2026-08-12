/**
 * The range-importance curve spans the roster's longest weapon and compresses its tail.
 * These pin the properties the solver and the editor both rely on.
 */
import { expect, test } from 'bun:test';
import {
  BAND_ANCHORS, BAND_PRESETS, bandPos, bandSet, presetWeights, resampleWeights,
} from '../src/lib/model.js';
import { buildRoster } from '../src/lib/roster.js';

/** Longest armed reach in a roster — what the curve has to span. */
function maxArmedKm(p) {
  const armed = buildRoster(p).L.filter(
    (w) => w.cls === 'armed' && !/^VANILLA/.test(w.name) && (w.hull > 0 || w.shield > 0),
  );
  return Math.max(10, ...armed.map((w) => w.km));
}

test('the axis is square-root scaled, so close range gets the width', () => {
  expect(bandPos(0, 40)).toBe(0);
  expect(bandPos(40, 40)).toBe(1);
  // a quarter of the range occupies half the axis
  expect(bandPos(10, 40)).toBeCloseTo(0.5, 12);
  expect(bandPos(8, 40)).toBeGreaterThan(8 / 40);
});

test('every band set keeps the anchors and stays strictly increasing', () => {
  for (const maxKm of [10, 21, 22, 30, 53, 84, 113, 400]) {
    const kms = bandSet(maxKm);
    for (const a of BAND_ANCHORS) expect(kms, `maxKm ${maxKm}`).toContain(a);
    expect(kms.every((k, i) => i === 0 || k > kms[i - 1])).toBe(true);
    expect(kms[kms.length - 1]).toBeLessThanOrEqual(Math.max(maxKm, 21) + 0.5);
  }
});

test('the set extends to the longest weapon and coarsens as it goes', () => {
  const maxKm = 84;
  const kms = bandSet(maxKm);
  expect(kms[kms.length - 1]).toBeGreaterThan(21);
  expect(Math.abs(kms[kms.length - 1] - maxKm)).toBeLessThanOrEqual(0.5);

  const gaps = kms.slice(1).map((k, i) => k - kms[i]);
  // the last step must be far coarser than the first — that is the compression
  expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] * 8);
  // and the tail never gets finer again (0.5 km snapping tolerance)
  const tail = gaps.slice(BAND_ANCHORS.length - 1);
  for (let i = 1; i < tail.length; i++) expect(tail[i]).toBeGreaterThanOrEqual(tail[i - 1] - 0.51);
});

test('a short roster does not grow a pointless tail', () => {
  expect(bandSet(10)).toEqual(BAND_ANCHORS);
  expect(bandSet(21)).toEqual(BAND_ANCHORS);
});

test('real rosters produce sets that cover their longest weapon', () => {
  for (const p of [
    { tech: 36, rarity: 5, mat: 4, spec: 1, roster: 'all' },
    { tech: 52, rarity: 5, mat: 6, spec: 1, roster: 'all' },
    { tech: 0, rarity: -1, mat: 0, spec: 0, roster: 'het' },
    { tech: 36, rarity: 5, mat: 4, spec: 1, roster: 'vanilla' },
  ]) {
    const maxKm = maxArmedKm(p);
    const kms = bandSet(maxKm);
    expect(kms[kms.length - 1], JSON.stringify(p)).toBeGreaterThanOrEqual(Math.min(maxKm, 21) - 0.5);
    expect(kms.length).toBeGreaterThanOrEqual(BAND_ANCHORS.length);
  }
});

test('presets land on exact points even on an extended set', () => {
  const ext = bandSet(84);
  for (const [key, preset] of Object.entries(BAND_PRESETS)) {
    const w = presetWeights(key, ext);
    expect(w.every((v) => v === 0 || v === 100), key).toBe(true);
    const on = ext.filter((_, i) => w[i] > 0);
    expect(on, key).toEqual(preset.kms ?? ext);
  }
});

test('resampling carries a hand-tuned shape onto a new set', () => {
  const ext = bandSet(84);
  const oldW = BAND_ANCHORS.map((_, i) => i * 10);
  const next = resampleWeights(BAND_ANCHORS, oldW, ext);

  expect(next).toHaveLength(ext.length);
  expect(next.every((v) => v >= 0 && v <= 100)).toBe(true);

  // shared distances must keep their exact weight
  for (let i = 0; i < BAND_ANCHORS.length; i++) {
    expect(next[ext.indexOf(BAND_ANCHORS[i])]).toBe(oldW[i]);
  }
  // past the old curve, hold the last value rather than collapsing to zero
  expect(next[next.length - 1]).toBe(oldW[oldW.length - 1]);

  // and shrinking back is lossless on the shared points
  expect(resampleWeights(ext, next, BAND_ANCHORS)).toEqual(oldW);
});

test('resampling survives degenerate input', () => {
  expect(resampleWeights([], [], BAND_ANCHORS)).toEqual(BAND_ANCHORS.map(() => 0));
  expect(resampleWeights(null, null, [1, 2])).toEqual([0, 0]);
  expect(resampleWeights([5], [42], [1, 5, 90])).toEqual([42, 42, 42]);
});
