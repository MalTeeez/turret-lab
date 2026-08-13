/**
 * The clipboard text behind every cost block's Copy button: two tab-separated
 * columns (amount, then item), plain ASCII throughout, raw integers so Excel
 * parses them as numbers in any locale.
 */
import { expect, test } from 'bun:test';
import { costClipboard } from '../src/lib/format.js';
import { loadoutCost } from '../src/lib/factory.js';
import { buildRoster } from '../src/lib/roster.js';

const COST = {
  credits: 1883000,
  tax: 376600,
  goodsPrice: 2570400,
  total: 4830000,
  goods: [
    { name: 'Servo', amount: 12 },
    { name: 'Plasma Cell', amount: 8 },
  ],
};

test('single-turret bill: heading, goods, then the money rows', () => {
  expect(costClipboard(COST, { heading: 'Clandatoh Cannon x4 (tech 37, Exotic, Xanion)' })).toBe(
    [
      'Clandatoh Cannon x4 (tech 37, Exotic, Xanion)',
      '12\tServo',
      '8\tPlasma Cell',
      '1883000\tCredits',
      '376600\tTax 20%',
      '2570400\tGoods worth',
      '4830000\tTotal',
    ].join('\n'),
  );
});

test('own faction: the tax row says so instead of 20%', () => {
  const text = costClipboard(
    { ...COST, tax: 0, total: COST.total - COST.tax },
    { heading: 'Loadout comp (tech 37, Exotic, Xanion)', ownFaction: true },
  );
  expect(text).toContain('0\tTax (own faction)');
  expect(text).not.toContain('Tax 20%');
});

test('a per-turret rows bill is accepted in place of a merged goods list', () => {
  const { goods, ...rowsCost } = COST;
  const text = costClipboard({ ...rowsCost, rows: goods }, { heading: 'H' });
  expect(text).toContain('12\tServo');
});

test('tech-cap and unpriced warnings append as plain lines', () => {
  const text = costClipboard(COST, {
    heading: 'H',
    techCapped: true,
    unpriced: ['Homing Anti-Fighter', 'A.D.S.T.'],
  });
  const lines = text.split('\n');
  expect(lines).toContain('Tech above the factory cap - cannot be built');
  expect(lines).toContain('No recipe: Homing Anti-Fighter, A.D.S.T. - excluded from the total');
});

test('a real comp bill stays tab-separated ASCII with unformatted integers', () => {
  const { L } = buildRoster({ tech: 37, rarity: 4, mat: 4, spec: 0, roster: 'all' });
  const rows = L.filter((w) => w.cls === 'armed' && w.src === 'het')
    .slice(0, 3)
    .map((w) => ({ w, q: 2 }));
  const cost = loadoutCost(rows, { ownFaction: false, tech: 37 });
  const text = costClipboard(cost, { heading: 'Loadout comp (tech 37, Exotic, Xanion)' });

  expect(text).toMatch(/^[\x20-\x7e\t\n]+$/);          // printable ASCII only
  for (const line of text.split('\n').slice(1)) {
    expect(line).toMatch(/^(\d+\t[^\t]+|[^\t]+)$/);    // amount TAB item, or a plain note line
  }
  expect(text).not.toMatch(/\d[,.]\d{3}/);             // no thousands separators
});
