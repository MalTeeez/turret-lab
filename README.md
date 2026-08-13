# Avorion Turret Lab

Calculate and compare your turrets for the optimal firing solution!

## Working on it

```sh
bun install
bun run dev      # http://localhost:5173
bun run check    # the verification suite — 97 tests, ~2s
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
  genuinely stack, which is most of why they read higher — **except the APCR Sniper and
  Flamethrower**: their generators call `createStandardCooling` while only one weapon is attached,
  so the extra barrels alternate inside a heat pool sized for a single barrel and add no sustained
  DPS. Verified against a real in-game APCR card (fire rate 0.5, +400% heat per shot, DPS = one
  barrel's damage × 0.5); both are modelled with one effective barrel and pinned by
  `test/model-parity.test.js` (`GAME_FIX`).
- **Both rosters now carry max turret-factory investment.** Vanilla's used to sit at ×1.00 against
  HET's ×1.00–3.00, which made the comparison unfair; it is now derived from each recipe's own
  `investFactor` totals in `turretingredients.lua`. See [Factory investment](#factory-investment).

Rolled ranges (`rand:getFloat(a, b)`) collapse to their mean, matching how the rest of the lab reports
an average roll. Low-probability damage-type procs (a chaingun's 7.5% AntiMatter roll, for instance)
are not modelled — the base roll is shown. Repair Beam and Force Gun do no damage at all and are
listed for completeness. Point defense damage is flat rather than budget-derived, so it does not scale
with distance from the core.

## My turrets — solving with what you own

The catalogue is generated, so by default the solver assumes you can obtain anything at your tech
level. To plan around your actual inventory instead:

1. Open a turret's card, set the assumption toggles to match your turret's rolls (scale roll,
   variation, heat roll, specialties), and press **Register one I own**. The entry copies the card
   as configured — a 4-slot scale roll registers with 4 slots, its rolled range and velocity —
   with everything that differs from the generated base prefilled as overrides.
2. Give it a **Label** if you like, and adjust any stat to match the real in-game card exactly.
   Blank keeps the generated value; overridden fields turn orange.
3. Pick a **Draw turrets from** mode in the solver.

New entries are **blueprints** — unlimited, on the assumption that holding one means you can build
more. Untick **Blueprint** to cap an entry at a fixed **Limit** instead, for a turret you looted and
cannot reproduce.

### Where the solver draws from

| Mode | Pool |
| --- | --- |
| **Generated catalogue** | Everything this tech can roll, all unlimited. The default. |
| **Mixed** | Per type: the copies you registered where you have them, the generated estimate where you don't. |
| **My turrets only** | Registered entries and nothing else. |

*Mixed* is the one to use once you have a few real turrets: your Predator Cannons are the ones you
actually own, at their measured stats and their limit, while everything you haven't registered stays
an estimate you could go and build. A registration replaces **its own type only**, and takes that
turret's place in the pool — register two Predators and both stand in for it, with the generated one
gone. Solved comps tag the rows that came from your stock as **yours**.

Your limits are never exceeded in any mode — the cap holds through the greedy fill, the
ruin-and-recreate pass, and reservations alike. Unlisted stats (damage type, volley cycle, per-type
resistance shares) still come from the generated turret, so only what you measure needs entering.

Overridable: slots, range, hull DPS/slot, shield DPS/slot, shield pierce, velocity, duty cycle.

Registering the same turret twice gives two independent entries, so a lucky roll and an ordinary one
can be tracked separately. The inventory persists in `localStorage`; a corrupt or hand-edited store
degrades to empty rather than breaking startup. Entries whose base turret is not in the current
roster or tech level are hidden and counted, not silently dropped.

## Solver constraints

Each armed turret's card has a **Loadout solver** block with two controls:

- **Exclude** — the solver never picks this turret. It is dropped from the candidate list entirely,
  so the readout's "N turrets considered" count falls and reports how many are excluded.
- **Reserve N** — that many are seeded before solving and never dropped by the optimiser. Useful for
  keeping a knife-range turret the range curve would otherwise cut. Disabled while excluded, since
  excluding wins.

The card also reports whether the turret is **in the current solution**, and at what count.

Both controls follow the source mode. Once your registered copies stand in for a type, they carry
their own identity, so excluding or reserving from the card acts on **those copies** rather than on
the generated turret the solver is no longer using — the card says so when that is what's happening.
A reservation is a single count, so with several copies of one type it rides on the first.

Excluded and reserved turrets are tagged in the table, and the solver panel's **Constraints** field
lists them as chips — click one to clear it, or **Clear** for all. This replaced the old single
reserve dropdown, which could only hold one turret type; reservations that no longer fit the slot
budget are trimmed and reported rather than silently dropped.

## Turret factory costs

The turret card and the loadout solver both show what it costs to actually build the thing:
credits, the 20% creation tax, and the bill of goods. Tick **Own faction** to waive the tax.

Every cost block has a **Copy** button that puts the bill on the clipboard as plain tab-separated
text — one heading line, then two columns (amount ⇥ item) covering the goods and the money rows, in
raw integers with no currency signs or locale separators, so it pastes into Excel as numbers and
still reads fine in chat. The solver's comp copy lists the **merged goods only**, not the turret
composition. Warnings (tech cap, missing recipes) append as plain lines. The format is pinned by
`test/copy.test.js`.

The card's cost block has a **Quantity** field — set it to cost up however many of that turret you
plan to build. Credits, tax, goods value and every line of the bill of materials scale with it, and a
**per turret** figure appears alongside the total so the unit price stays visible. It is display only;
the solver ignores it.

All of it is ported from the game's own Lua — `lib/inventoryitemprice.lua` for `ArmedObjectPrice()`
and `entity/merchants/turretfactory.lua` for the rest:

```
credits = ceil(max(itemPrice x 0.15, itemPrice - goodsPrice) / 1000) x 1000
tax     = credits x 0.2          (waived at your own faction's factory)
```

The goods bill is the recipe's **base amounts × ceil(1 + rarity)** — what the factory asks at
default sliders, and, per `getDuplicatedTurretIngredientsAndTax()`, exactly what building a copy
from a blueprint costs even when the blueprint was rolled at max investment. So the lab's pairing
of max-invested stats with the base bill is the blueprint-replica deal, not an inconsistency.
`test/factory.test.js` pins this against a real in-game bill (APCR Sniper, tech 37, Exotic).

`scripts/extract-factory-data.mjs` regenerates `src/lib/factory-data.js` from the Lua — recipes, good
prices and price weights, for the base game *and* the HET mod. Re-run it after a game update:

```sh
bun run scripts/extract-factory-data.mjs           # standard Steam paths
bun run scripts/extract-factory-data.mjs --game <dir> --mod <dir>
```

The generated file is committed, so building the app never needs the game installed.

**Read the totals as estimates, not quotes:**

- `ArmedObjectPrice` takes the engine's turret DPS field. This lab feeds it the summed-barrel figure,
  which is the closest analogue available — if the engine reports only the first weapon, multi-barrel
  HET turrets will price higher here than in game.
- Goods are valued at base price. A real factory charges by local supply, and you can supply the
  goods yourself instead of paying for them.
- Factories cap at tech 50, so tech 51–52 turrets cannot be built at all. The card says so.

### Factory investment

`turretingredients.lua` carries an `investFactor` per good, which *is* the max-investment multiplier
this lab applies as `inv` / `rinv`. Vanilla turrets now derive theirs from it instead of sitting at
×1.00, which finally makes the two rosters comparable. A vanilla Chaingun comes out at damage ×1.4,
reach ×1.4.

That derivation also cross-checks the HET numbers, and **eight of the twenty-one disagree** with the
mod's own recipes — the app claims investment the recipe does not grant:

| Turret | App | HET recipe |
| --- | --- | --- |
| Ophidian | reach ×2.00 | no reach investment |
| Triad Chaingun | reach ×2.00 | no reach investment |
| Gatling Plasma | reach ×2.00 | no reach investment |
| Clandatoh Cannon | reach ×2.50 | reach ×1.50 |
| Swarm Missiles | damage ×2.25 | damage ×1.25 |
| Homing Anti-Fighter | damage ×3.75 | damage ×2.75 |
| Mining Laser | damage ×2.00 | no damage investment |
| Salvaging Laser | damage ×2.00 | no damage investment |

The other thirteen match exactly, which is what confirms the name↔recipe mapping. The HET values are
left as they were — changing them would alter every HET figure in the app and break the parity the
test suite exists to guarantee. `test/factory.test.js` pins the list of eight so any drift on either
side shows up as a failing diff rather than passing unnoticed.

## Model figures vs. the game

Every DPS number in the app is marked with a **†**, and the banner under the readout explains why:
these come from this lab's reconstruction of `turretgenerator.lua`, summing every barrel assembly
that actually adds output, on a budget constant fitted to in-game cards (×0.4439). The base game's
own turret card builds most per-type eDPS lines from the **first weapon only**, so it reports
different — usually lower — numbers on multi-barrel turrets (Predator ×6, Proton ×7, Gatling ×5).
Expect the ranking and the shape to hold; expect absolute values to drift from the tooltip. The one
turret with a full in-game cross-check (APCR Sniper, tech 37 Exotic Xanion) lands within ~4%.

**‡** marks Raw DPS, the one field that should agree, since it isn't built per damage type.

Markers appear on the chart headings, the Hull/Shield table columns, the readout's budget and volume,
and the DPS rows of the turret card. Hovering any one of them shows the full explanation.

## Scale roll

Half of all generated turrets roll a reduced size: the game re-enters the turret's *scale band
table* at a random lower tech (`floor(tech × rand)`), so the possible variants are the table's
bands, nothing in between. The card's **Scale roll** selector lists exactly those variants — one
option per distinct slot band reachable at the current tech, built from the turret's own table
(a tech-37 Clandatoh offers precisely two: the full-tech 6-slot build and the reduced 4-slot band).
Range and velocity follow the rolled slot count; per-slot DPS is scale-independent, exactly as in
the generator. Pinned against a real 4-slot Clandatoh card in `test/model-parity.test.js`.

Range itself is the weapon's **reach, uncapped**: the engine keeps projectile lifetime consistent
with reach through slot scaling and factory investment. The original app capped the Clandatoh at
"projectile lifetime" (15 km × velocity factor); a real 4-slot Exotic card reads 54.38 km — the
full 1500 × invest 2.5 × slot 1.45 — and the tooltip's Range line *is* `pvelocity × pmaximumTime`,
so the cap was modelling a limit the game does not have. It is gone, carried as a `GAME_FIX`
exemption in the parity suite.

## Calibration

The turret card's *Calibrate: real Raw DPS* field fits a multiplier so the card matches a Raw DPS
value you read off an in-game turret. Set the assumption toggles to match that turret's rolls first
(scale roll, variation, heat roll, investment) — the fit is computed under whatever is currently
ticked, so the Raw DPS row lands exactly on the value you entered. Re-fitting is idempotent: the
multiplier is always derived from the uncalibrated figure, never from an already-calibrated one.
(The original app compounded the factor on every re-fit and ignored every toggle but variation.)

That multiplier is **global and sticky** — it applies to every turret and survives switching between
them, which is easy to forget about. So the current state is always shown under the field: either
`no calibration applied`, or the active factor with a **Clear** button next to it. Clear restores the
uncalibrated figures exactly. *Fit* is disabled until you enter a positive value.

## Range importance curve

The solver minimises **expected time-to-kill, in seconds** — evaluated at every weighted point on the
range curve, averaged by those weights, then blended with the worst case if the target's shield
resists one damage type at 95%, according to the resistance-risk slider. Lower is better. The readout
states it in plain terms (`~1.37 s to kill`, or `cannot kill this target` when nothing reaches), with
the full definition on hover.

A weighted point that **no available turret can even reach** — or, against a shielded target, that
only shield-immune turrets reach — would read "cannot kill" for every possible loadout. That is a
constant: it cannot steer the optimiser, but averaged in it turns the reported time into garbage
(a 2% stray weight beyond the pool once read ~28,000 minutes). Such points are excluded from the
objective and reported in the readout instead: `N weighted bands out of reach (… km — X% of curve
weight, ignored)`. If the whole curve is out of reach, the result is an honest `cannot kill this
target`. This matters most in *My turrets only* mode, where the pool's reach can be far short of the
curve the catalogue built.

The objective is sampled over a set of engagement ranges. That used to
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

`bun run check` runs `test/`, 97 tests in about a second:

| File | What it pins |
| --- | --- |
| `model-parity.test.js` | `build()`, `curves()` and `cardStats()` against the original single-file app, over the full parameter grid — tech 0–52 × 7 rarities × 7 materials × specialty, plus every card assumption combination. ~2.8M value comparisons. The APCR Sniper / Flamethrower barrel fix is carried as an explicit `GAME_FIX` exemption, and the APCR is additionally pinned to a real in-game card within 5%. |
| `solver-parity.test.js` | 8 solver scenarios with `Math.random` pinned to the same seeded sequence in both implementations, driven through the curve at preset weights. Identical picks, quantities, reserved counts and objective. |
| `vanilla.test.js` | The vanilla roster's balance relationships, since it has no original to diff against: budget multipliers per weapon type, cooling pre-compensation, the mining-vs-salvaging rarity paths, flat point-defense damage, and unique ids across the combined roster. |
| `bands.test.js` | Axis scaling, anchor preservation, tail compression, preset exactness on extended sets, lossless resampling, and the shield:hull slider — centred on even, fivefold at either end, mirrored halves, and every step round-tripping back onto itself. |
| `solver-constraints.test.js` | Excluding a turret from the candidate list, guaranteed reservations, multiple reservations sharing the budget, over-large reservations being trimmed and reported, and exclude beating reserve. |
| `inventory.test.js` | The blueprint default and finite limits, stat overrides, independent duplicate registrations, orphaned entries, corrupt-store recovery, the solver respecting a limit, and the mixed pool — replacing only the registered type, keeping estimates unbounded, and carrying overrides through to the solve. |
| `factory.test.js` | Costing: every turret resolves to a recipe, the credits/tax formulas, rarity scaling the goods bill, a real in-game APCR goods bill reproduced exactly, loadout rollups merging goods correctly, and the eight HET investment disagreements. |
| `copy.test.js` | The cost blocks' clipboard text: exact two-column output for a single-turret bill, the own-faction tax row, warning lines, and a real comp bill staying tab-separated ASCII with unformatted integers. |

`test/reference.js` lifts the original functions straight out of `reference/het-turret-lab.html` by
line range and asserts those ranges still bracket what it expects — so if that file is ever edited,
the suite says so instead of silently comparing the wrong thing.

The suite is sensitive: perturbing the budget constant from `0.4439` to `0.44391`, or the solver's
band weight by one part in ten million, both turn it red.

**Not covered:** the browser layer — chart rendering, drag handling, filters, the roster switcher.
Those were exercised ad hoc during development (mounting the real bundle in happy-dom with Chart.js,
30 interaction paths) but that harness is not committed, so `bun run check` will not catch a UI
regression. Worth adding if the UI keeps growing.