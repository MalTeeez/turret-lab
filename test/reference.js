/**
 * Loads the original single-file app's own functions out of `reference/het-turret-lab.html`
 * so the ported modules can be diffed against them directly.
 *
 * The line slices below are the only fragile part: they must bracket the original
 * `<script>` sections. `assertReferenceIntact()` fails loudly if the file moves under us.
 */
import { readFileSync } from 'node:fs';

const HTML = new URL('../reference/het-turret-lab.html', import.meta.url);
const lines = readFileSync(HTML, 'utf8').split(/\r?\n/);

/** 1-indexed, inclusive line ranges of the parts we lift. */
const SLICES = {
  build: [268, 416],   // NAMES/C/budget/distOf/beltMat/specMul/DT/RESISTABLE/build
  curves: [418, 432],  // hitF/curves
  solve: [512, 579],   // function solve(){ ... minus its closing brace
};

const slice = ([from, to]) => lines.slice(from - 1, to).join('\n');

export function assertReferenceIntact() {
  const at = (n) => lines[n - 1] ?? '';
  const checks = [
    [268, 'const NAMES='],
    [307, 'function build(){'],
    [416, '}'],
    [419, 'function curves('],
    [512, 'function solve(){'],
    [580, '}'],
  ];
  for (const [line, expected] of checks) {
    if (!at(line).trim().startsWith(expected)) {
      throw new Error(
        `reference/het-turret-lab.html changed: line ${line} should start with ${JSON.stringify(expected)}, ` +
          `got ${JSON.stringify(at(line).trim().slice(0, 60))}. Update SLICES in test/reference.js.`,
      );
    }
  }
}

/** The original `build()` and `curves()`, with the DOM elements they read stubbed out. */
export function originalModel({ tech, rarity, mat, hitm = 1, spec = 1, metric = 'slot' }) {
  const stub = (v) => ({ value: v });
  return new Function(
    'tech', 'rarity', 'mat_', 'hitm', 'spec', 'metric',
    `${slice(SLICES.build)}\n${slice(SLICES.curves)}\n;return {build, curves};`,
  )(stub(tech), stub(rarity), stub(mat), stub(hitm), stub(spec), stub(metric));
}

/** The original `solve()`, returning its internals instead of writing to the DOM. */
export function originalSolve(args) {
  const stub = (v) => ({ value: v });
  const fn = new Function(
    'build', 'slotBudget', 'band_', 'srat', 'profile', 'cHull', 'cShield', 'pres_', 'okChk',
    'lockType', 'lockN', 'optOut', 'tech', 'mat_', 'distOf', 'targetHP', 'RESISTABLE',
    `${slice(SLICES.solve).replace(/^function solve\(\)\{/, '')}
     return {rows, bv, used2, H, S, types, immune, band, lockNote};`,
  );
  return fn(
    args.build, stub(args.budget), stub(args.band), stub(args.srat), stub(args.profile),
    stub(args.cHull), stub(args.cShield), stub(args.pres), { checked: args.overkill },
    stub(args.lockName), stub(args.lockN), {}, stub(args.tech), stub(args.mat),
    args.distOf, args.targetHP, args.RESISTABLE,
  );
}
