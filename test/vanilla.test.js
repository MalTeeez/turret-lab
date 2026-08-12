/**
 * The vanilla roster has no original to diff against, so it is pinned to the balance
 * relationships in the game's own turretgenerator.lua / weapongenerator.lua.
 */
import { expect, test } from 'bun:test';
import { budget, distOf } from '../src/lib/model.js';
import { buildVanilla } from '../src/lib/vanilla.js';
import { buildRoster } from '../src/lib/roster.js';

const P = { tech: 36, rarity: 5, mat: 4, spec: 1 };
const D = budget(distOf(P.tech));
const ad = 1 + P.rarity * 0.4;          // adaptWeapon
const adMine = 1 + P.rarity * 0.05;     // adaptMiningLaser

const V = buildVanilla(P);
const by = (n) => V.find((w) => w.name === n);
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

test('every weapon type in weapontype.lua is present', () => {
  expect(V).toHaveLength(19);
  for (const n of [
    'Chaingun', 'Bolter', 'Laser', 'Plasma Gun', 'Rocket Launcher', 'Cannon', 'Railgun',
    'Lightning Gun', 'Tesla Gun', 'Pulse Cannon', 'Point Defense Cannon', 'Point Defense Laser',
    'Anti-Fighter Cannon', 'Mining Laser', 'Salvaging Laser', 'R-Mining Laser',
    'R-Salvaging Laser', 'Repair Beam', 'Force Gun',
  ]) {
    expect(by(n), `${n} missing`).toBeDefined();
  }
});

test('damage multipliers on the sector budget follow weapongenerator.lua', () => {
  close(by('Laser').hull, D * 1.5 * ad * (20 / 50));            // dps * fireDelay * 1.5, 20s/30s battery
  close(by('Tesla Gun').hull, D * 2.0 * ad * (15 / 35));        // dps * fireDelay * 2.0
  close(by('Lightning Gun').hull, D * 1.15 * ad * (15 / 35));   // dps * fireDelay * 1.15
  close(by('Chaingun').hull, D * ad);                           // plain dps, no cooling
  close(by('Cannon').hull, D * ad * (25 / 40));
  close(by('Railgun').hull, D * ad * (27.5 / 37.5));
  close(by('Rocket Launcher').hull, D * ad * (20 / 35));
});

test('bolter and pulse pre-compensate their cooling, so sustained output is the full budget', () => {
  const bolter = by('Bolter');
  close(bolter.raw * bolter.duty, D * ad);
  const pulse = by('Pulse Cannon');
  close(pulse.raw * pulse.duty, D * 0.75 * ad);   // pulse trades 25% dps for shield penetration
});

test('pulse cannons always pierce, scaled toward 1 by rarity', () => {
  expect(by('Pulse Cannon').pierce).toBeGreaterThan(0.75);
  expect(by('Pulse Cannon').pierce).toBeLessThan(1);
  const petty = buildVanilla({ ...P, rarity: -1 }).find((w) => w.name === 'Pulse Cannon');
  expect(petty.pierce).toBeLessThan(by('Pulse Cannon').pierce);
});

test('plasma and bolter carry their damage on the right axis', () => {
  close(by('Plasma Gun').shMult, 2.5 + 0.075 + P.rarity * 0.2);   // addPlasmaDamage
  close(by('Bolter').hullMult, 2.5 + 0.075 + P.rarity * 0.2);     // addAntiMatterDamage
  expect(by('Plasma Gun').hullMult).toBe(1);
});

test('mining takes the x1.05 rarity path, salvaging the full x1.4', () => {
  close(by('Mining Laser').hull, D * adMine);
  close(by('Salvaging Laser').hull, D * ad);
  close(by('R-Mining Laser').hull, D * adMine);
  close(by('R-Salvaging Laser').hull, D * ad);
  for (const n of ['Mining Laser', 'Salvaging Laser', 'R-Mining Laser', 'R-Salvaging Laser']) {
    expect(by(n).shield, `${n} should do no shield damage`).toBe(0);
    expect(by(n).cls).toBe('una');
  }
  // raw variants reach 150 units against 75
  close(by('R-Mining Laser').km, by('Mining Laser').km * 2);
});

test('point defense damage is flat, not derived from the sector budget', () => {
  const pdc = by('Point Defense Cannon');
  close(pdc.hull, (((1.5 + P.rarity * 0.25) * 0.1 + P.tech * 0.05) / 0.0875) * ad);
  const pdl = by('Point Defense Laser');
  close(pdl.hull, (((5 + P.rarity * 0.25) * 0.1 + P.tech * 0.05) / 0.2) * ad);

  // same tech, different distance from core => budget changes but PD damage does not
  const near = buildVanilla({ ...P, tech: 52 }).find((w) => w.name === 'Point Defense Cannon');
  const far = buildVanilla({ ...P, tech: 0 }).find((w) => w.name === 'Point Defense Cannon');
  expect(near.hull).not.toBe(far.hull);   // tech term still moves it
  for (const w of [near, far]) expect(w.cls).toBe('def');
});

test('repair and force turrets do no damage', () => {
  for (const n of ['Repair Beam', 'Force Gun']) {
    expect(by(n).hull).toBe(0);
    expect(by(n).shield).toBe(0);
    expect(by(n).cls).toBe('una');
  }
});

test('vanilla carries no factory investment, and beams have no travel time', () => {
  for (const w of V) expect(w.inv, `${w.name}`).toBe(1);
  for (const n of ['Laser', 'Railgun', 'Lightning Gun', 'Tesla Gun', 'Mining Laser']) {
    expect(by(n).vel, `${n} should be a beam`).toBeNull();
  }
  for (const n of ['Chaingun', 'Cannon', 'Rocket Launcher', 'Pulse Cannon']) {
    expect(by(n).vel, `${n} should be a projectile`).toBeGreaterThan(0);
  }
});

test('output stays finite and sane across the whole parameter space', () => {
  for (let T = 0; T <= 52; T++) {
    for (const R of [-1, 0, 2, 5]) {
      for (let M = 0; M <= 6; M++) {
        for (const w of buildVanilla({ tech: T, rarity: R, mat: M, spec: 1 })) {
          const at = `${w.name} T${T}R${R}M${M}`;
          expect(Number.isFinite(w.hull), at).toBe(true);
          expect(Number.isFinite(w.shield), at).toBe(true);
          expect(w.hull, at).toBeGreaterThanOrEqual(0);
          expect(w.km, at).toBeGreaterThan(0);
          expect(w.slots, at).toBeGreaterThanOrEqual(1);
          expect(w.duty, at).toBeGreaterThan(0);
          expect(w.duty, at).toBeLessThanOrEqual(1);
        }
      }
    }
  }
});

test('rosters compose with unique ids despite shared display names', () => {
  const all = buildRoster({ ...P, roster: 'all' }).L;
  expect(new Set(all.map((w) => w.id)).size).toBe(all.length);

  // these names exist in both rosters — the reason ids exist at all
  const shared = all.map((w) => w.name).filter((n, i, a) => a.indexOf(n) !== i);
  expect([...new Set(shared)].sort()).toEqual(['Mining Laser', 'Salvaging Laser']);

  expect(all.some((w) => w.name.startsWith('VANILLA'))).toBe(false);
  expect(buildRoster({ ...P, roster: 'het' }).L.some((w) => w.name === 'VANILLA Laser')).toBe(true);
  expect(buildRoster({ ...P, roster: 'vanilla' }).L).toHaveLength(19);
});
