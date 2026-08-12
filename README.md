# Avorion Turret Lab

Calculate and compare your turrets for the optimal firing solution!

## Working on it

```sh
bun install
bun run dev      # http://localhost:5173
bun run check    # the verification suite — 32 tests, ~1s
bun run build    # -> dist/
bun run preview
```

Svelte 5 + Tailwind 4 + Vite, on Bun. `bun run check` is what CI gates on; run it before pushing.

### Deploying

`.github/workflows/deploy.yml` builds on push to `main` and publishes `dist/` to GitHub Pages.

Two things it depends on, both wired up:

- **`bun run check`** must exist — it runs the test suite.
- **`BASE_PATH`** is passed in from `actions/configure-pages` and consumed by `vite.config.js` as
  Vite's `base`. A GitHub *project* page is served from `/<repo>/`, so without this every asset URL
  would 404. Empty or `/` (a user/org page) falls back to `/`.

To deploy: `git init && git add -A && git commit`, push to a `main` branch, then set
**Settings → Pages → Source** to **GitHub Actions**.

## Turrets & Divergences from vanilla

Use the **Turret roster** control to show HET + vanilla (default), HET only, or vanilla only. Vanilla
rows carry a `vanilla` tag in the table and a `V` on chart legend chips.

Two things are worth knowing when comparing across rosters:

- **Vanilla gains no DPS from barrel count.** Projectile types multiply `fireDelay` by the barrel
  count and beam types divide `damage` by it, so a 1-barrel and a 4-barrel vanilla turret of the same
  tech put out the same total. The barrel figure on a vanilla card is cosmetic. HET assemblies
  genuinely stack, which is most of why they read higher.
- **Vanilla rows carry no turret-factory damage investment** (`×1.00` in the Fac. dmg column). The
  per-turret investment factors in this lab come from the mod's definitions; there is no equivalent
  figure for vanilla types, so nothing is invented. HET rows range from ×1.00 to ×3.00, so the gap is
  partly that.

Rolled ranges (`rand:getFloat(a, b)`) collapse to their mean, matching how the rest of the lab reports
an average roll. Low-probability damage-type procs (a chaingun's 7.5% AntiMatter roll, for instance)
are not modelled — the base roll is shown. Repair Beam and Force Gun do no damage at all and are
listed for completeness. Point defense damage is flat rather than budget-derived, so it does not scale
with distance from the core.

## Model figures vs. the game

Every DPS number in the app is marked with a **†**, and the banner under the readout explains why:
these come from this lab's reconstruction of `turretgenerator.lua`, summing *every* barrel assembly
on a budget constant fitted to in-game cards (×0.4439). The base game's own turret card builds most
per-type eDPS lines from the **first weapon only**, so it reports different — usually lower — numbers
on multi-barrel turrets (Predator ×6, Proton ×7, Gatling ×5). Expect the ranking and the shape to
hold; expect absolute values to drift from the tooltip.

**‡** marks Raw DPS, the one field that should agree, since it isn't built per damage type.

Markers appear on the chart headings, the Hull/Shield table columns, the readout's budget and volume,
and the DPS rows of the turret card. Hovering any one of them shows the full explanation.

## Calibration

The turret card's *Calibrate: real Raw DPS* field fits a multiplier so the card matches a Raw DPS
value you read off an in-game turret. That multiplier is **global and sticky** — it applies to every
turret and survives switching between them, which is easy to forget about.

So the current state is always shown under the field: either `no calibration applied`, or the active
factor with a **Clear** button next to it. Clear restores the uncalibrated figures exactly. *Fit* is
disabled until you enter a positive value.

## Range importance curve

The loadout solver's objective is time-to-kill averaged over a set of engagement ranges. That used to
be a fixed choice of four preset point-sets; it is now a curve with one draggable control point per
sampling distance.

- **Drag a point** to move just that one. **Drag from empty canvas** to sweep across several at once.
  **Arrow keys** fine-tune a focused point (Shift for single steps, PageUp/Down for 20, Home/End for
  0/100).
- **The curve spans the whole roster.** Its last point sits on the longest-reaching armed weapon
  currently listed — at default settings that is Swarm Missiles at ~84 km, not a fixed 21 km ceiling.
- **The axis is square-root scaled**, so the far end compresses: half the width covers the first
  quarter of the range, where turret curves actually separate, and the long tail takes progressively
  coarser steps (…21, 30.5, 41, 54, 68, 84).
- `BAND_ANCHORS` (0.5 → 21 km) is always present; the tail is generated on top. Presets therefore
  still land on exact points, so `Mid 3–12 km` means exactly {3, 7, 12}. Touching the curve switches
  the profile to *Custom curve*.
- Changing tech, rarity or roster moves the maximum range and rebuilds the point set. A hand-tuned
  shape is **resampled onto the new distances** rather than reset; weights on shared anchors carry
  over untouched.
- A point at zero is skipped entirely, so it costs nothing to evaluate.
- With every active point at full weight, the weighted mean reduces to the plain mean it replaced —
  bit-for-bit, which is what keeps the original solver parity verifiable.

## Verification

`bun run check` runs `test/`, 32 tests in about a second:

| File | What it pins |
| --- | --- |
| `model-parity.test.js` | `build()`, `curves()` and `cardStats()` against the original single-file app, over the full parameter grid — tech 0–52 × 7 rarities × 7 materials × specialty, plus every card assumption combination. ~2.8M value comparisons. |
| `solver-parity.test.js` | 8 solver scenarios with `Math.random` pinned to the same seeded sequence in both implementations, driven through the curve at preset weights. Identical picks, quantities, reserved counts and objective. |
| `vanilla.test.js` | The vanilla roster's balance relationships, since it has no original to diff against: budget multipliers per weapon type, cooling pre-compensation, the mining-vs-salvaging rarity paths, flat point-defense damage, and unique ids across the combined roster. |
| `bands.test.js` | Axis scaling, anchor preservation, tail compression, preset exactness on extended sets, and lossless resampling. |

`test/reference.js` lifts the original functions straight out of `reference/het-turret-lab.html` by
line range and asserts those ranges still bracket what it expects — so if that file is ever edited,
the suite says so instead of silently comparing the wrong thing.

The suite is sensitive: perturbing the budget constant from `0.4439` to `0.44391`, or the solver's
band weight by one part in ten million, both turn it red.

**Not covered:** the browser layer — chart rendering, drag handling, filters, the roster switcher.
Those were exercised ad hoc during development (mounting the real bundle in happy-dom with Chart.js,
30 interaction paths) but that harness is not committed, so `bun run check` will not catch a UI
regression. Worth adding if the UI keeps growing.