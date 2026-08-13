<script>
  import Card from './Card.svelte';
  import Field from './Field.svelte';
  import BandEqualizer from './BandEqualizer.svelte';
  import CostBlock from './CostBlock.svelte';
  import { loadoutCost } from '../lib/factory.js';
  import {
    SOURCES, clearSolverConstraints, inv, opt, setReserved, sim, toggleExcluded,
  } from '../lib/state.svelte.js';
  import { materialiseAll, mixedPool, orphaned } from '../lib/inventory.js';
  import {
    BAND_PRESETS, NAMES, RARITY_NAME, SRAT_LEAN, bandSet, distOf, presetWeights, resampleWeights,
    sratFromPos, sratLabel, sratToPos, targetHP,
  } from '../lib/model.js';
  import { LEGACY_VANILLA } from '../lib/roster.js';
  import { solveLoadout } from '../lib/solver.js';
  import { n0 } from '../lib/format.js';

  let { model } = $props();

  const PROFILES = [
    ['fighter', 'Fighter / drone (0.15× sector ship)'],
    ['ship', 'Sector ship (derived from volume)'],
    ['flagship', 'Flagship (4× sector ship)'],
    ['station', 'Station (100× volume, capped)'],
    ['custom', 'Custom values below'],
  ];
  // What the solver draws from: the generated catalogue, your turrets, or a mix where
  // your copies stand in for the types you own and the rest stay estimates.
  const owned = $derived(materialiseAll(inv.items, model.L));
  const usingInventory = $derived(inv.source === 'inventory');
  const usingMixed = $derived(inv.source === 'mixed');
  const pool = $derived(
    usingInventory ? owned : usingMixed ? mixedPool(inv.items, model.L) : model.L,
  );
  const orphans = $derived(orphaned(inv.items, model.L));

  // Anything the solver could actually pick, so the list follows the roster.
  const lockable = $derived(
    pool.filter((w) => w.cls === 'armed' && !LEGACY_VANILLA.has(w.name) && (w.hull > 0 || w.shield > 0)),
  );
  /** Split the pickable pool by where it came from, which is what the readout reports. */
  const mine = $derived(lockable.filter((w) => w.invUid));
  const mineTypes = $derived(new Set(mine.map((w) => w.baseId)).size);
  const estimated = $derived(lockable.length - mine.length);
  const blueprints = $derived(mine.filter((w) => w.blueprint).length);
  const capped = $derived(mine.filter((w) => !w.blueprint));
  /** Slots the capped entries can fill; blueprints are unbounded so they are counted separately. */
  const cappedSlots = $derived(capped.reduce((a, w) => a + w.slots * w.owned, 0));
  /** Rows the last solve drew from the inventory, so the result can say which are really yours. */
  const ownedIds = $derived(new Set(owned.map((w) => w.id)));

  // Round-tripping the ratio through the position can leave float dust, which a stepped
  // range input would then snap away from — trim it so the thumb stays put.
  const sratPos = $derived(+sratToPos(opt.srat).toFixed(4));

  // Keep the custom HP fields showing what the chosen profile would produce, so
  // switching to "custom" starts from a sensible baseline.
  $effect(() => {
    const kind = opt.profile === 'custom' ? 'ship' : opt.profile;
    const [h, s] = targetHP(distOf(sim.tech), sim.mat, kind, opt.srat);
    opt.cHull = Math.round(h);
    opt.cShield = Math.round(s);
  });

  // Constraints are edited on the turret card; this panel just summarises and clears them.
  // Look outside the pool too: a constraint set in one source mode should still read as a
  // name after switching to another.
  const nameOf = (id) =>
    pool.find((w) => w.id === id)?.name ?? owned.find((w) => w.id === id)?.name
    ?? model.L.find((w) => w.id === id)?.name ?? id;
  const reservedList = $derived(
    Object.entries(opt.reserved)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n, name: nameOf(id) })),
  );
  const excludedList = $derived([...opt.excluded].map((id) => ({ id, name: nameOf(id) })));
  const constraintCount = $derived(reservedList.length + excludedList.length);

  // The curve spans whatever the roster's longest armed weapon reaches, so it never
  // stops short of a turret's envelope.
  const maxKm = $derived(
    Math.max(10, ...lockable.map((w) => w.km)),
  );
  const bandKms = $derived(bandSet(maxKm));

  // Rebuilding the band set (tech, rarity or roster changed the longest range) must not
  // throw away a hand-tuned shape — resample it onto the new distances instead.
  $effect(() => {
    const next = bandKms;
    const prev = opt.bandKms;
    if (prev.length === next.length && prev.every((k, i) => k === next[i])) return;
    opt.bandWeights = resampleWeights(prev, opt.bandWeights, next);
    opt.bandKms = next;
  });

  // Weights are 0–100 in the UI; the objective takes them as fractions, so a band left
  // at full importance weighs exactly 1 and the mean matches an unweighted sample set.
  const bands = $derived(
    bandKms.map((km, i) => ({ km, w: (opt.bandWeights[i] ?? 0) / 100 })).filter((b) => b.w > 0),
  );
  const totalWeight = $derived(opt.bandWeights.reduce((a, w) => a + w, 0));

  function applyPreset(key) {
    opt.bandPreset = key;
    if (BAND_PRESETS[key]) opt.bandWeights = presetWeights(key, bandKms);
  }

  function solve() {
    let hull, shield;
    if (opt.profile === 'custom') {
      hull = opt.cHull;
      shield = opt.cShield;
    } else {
      [hull, shield] = targetHP(distOf(sim.tech), sim.mat, opt.profile, opt.srat);
    }
    opt.result = solveLoadout(pool, {
      budget: opt.budget, bands, pres: opt.pres, hull, shield,
      overkill: opt.overkill,
      excluded: new Set(opt.excluded),
      reserved: { ...opt.reserved },
    });
  }

  /**
   * The objective is a time, in seconds: how long this loadout takes to strip the
   * target's shields and hull, averaged over the range curve and blended with the
   * worst-case resistance by the risk slider. Lower is better.
   */
  const OBJECTIVE_HELP =
    'Expected seconds to destroy the target: time-to-kill evaluated at every weighted point on '
    + 'the range curve, averaged by those weights, and blended with the worst case if the shield '
    + 'resists one damage type at 95% (by the resistance-risk slider). Lower is better — this is '
    + 'the number the solver minimises.';

  /** 1e9 is the solver's "cannot kill this at all" sentinel. */
  const ttkLabel = (v) => {
    if (!isFinite(v) || v >= 1e8) return 'cannot kill this target';
    if (v >= 120) return `~${(v / 60).toFixed(1)} min to kill`;
    return `~${v < 10 ? v.toFixed(2) : v.toFixed(1)} s to kill`;
  };

  const r = $derived(opt.result);

  // Cost the solved comp. The solver returns compact rows, so pair each back up with
  // its full turret entry before pricing.
  const cost = $derived.by(() => {
    if (!r?.rows?.length) return null;
    const priced = r.rows
      .map((row) => ({ q: row.q, w: pool.find((x) => x.id === row.id) }))
      .filter((x) => x.w);
    return loadoutCost(priced, { ownFaction: opt.ownFaction, tech: sim.tech });
  });
</script>

{#snippet note()}
  Picks integer turret counts for an <b>armed</b>-slot budget — Unarmed (Salvaging, Mining, Hammer
  Heads) and Defense (A.D.S.T., Anti-Fighter, Torpedo) turrets mount on their own slot pools and
  never compete here; stack salvagers on top of any solution for free hull DPS. It minimises
  <b>expected time-to-kill in seconds</b> — evaluated at every weighted point on the range curve,
  averaged by those weights, then blended with the worst case if the target's <b>shield</b> resists
  one damage type at 95% (hull damage is never resisted, and Energy / Fragments weapons can't be
  resisted at all). Lower is better. Open any turret's card to <b>exclude</b> it from the solution outright, or <b>reserve</b> a
  count to guarantee it survives the solve — useful for keeping knife-range Flamethrowers the range
  curve would otherwise cut.
{/snippet}

<Card title="Loadout solver" accent="var(--color-solver)" {note}>
  <div class="hud-controls mb-3.5">
    <Field
      label="Draw turrets from"
      hint={inv.source === 'catalogue' ? null : `(${owned.length} registered)`}
    >
      <select class="hud-input" bind:value={inv.source}>
        {#each SOURCES as [v, name] (v)}<option value={v}>{name}</option>{/each}
      </select>
      {#if inv.source !== 'catalogue'}
        <div class="mt-1 text-[10.5px] text-dim">
          {#if !owned.length}
            <span class="text-hot">Nothing registered.</span> Open a turret's card and press
            <b>Register</b> to add one.{#if usingMixed} Until then this is the plain catalogue.{/if}
          {:else}
            {#if usingMixed}
              {mineTypes} type{mineTypes === 1 ? '' : 's'} replaced by your turrets &middot;
              {estimated} still estimated.
            {:else}
              {#if blueprints}{blueprints} blueprint{blueprints === 1 ? '' : 's'} (unlimited){/if}{#if blueprints && capped.length}, {/if}{#if capped.length}{capped.length}
                capped at {cappedSlots} armed slots{/if}.
            {/if}
            {#if orphans.length}
              <span class="text-hot">{orphans.length} entr{orphans.length === 1 ? 'y' : 'ies'} hidden
                — their base turret isn't in this roster or tech level.</span>
            {/if}
          {/if}
        </div>
      {/if}
    </Field>

    <Field label="Armed slot budget" value={opt.budget}>
      <input type="range" min="4" max="200" step="1" bind:value={opt.budget} />
    </Field>

    <Field label="Engagement profile" value={opt.bandPreset === 'custom' ? 'custom' : null}>
      <select
        class="hud-input"
        value={opt.bandPreset}
        onchange={(e) => applyPreset(e.currentTarget.value)}
      >
        {#each Object.entries(BAND_PRESETS) as [key, p] (key)}<option value={key}>{p.label}</option>{/each}
        {#if opt.bandPreset === 'custom'}<option value="custom">Custom curve</option>{/if}
      </select>
    </Field>

    <Field label="Target">
      <select class="hud-input" bind:value={opt.profile}>
        {#each PROFILES as [v, name] (v)}<option value={v}>{name}</option>{/each}
      </select>
    </Field>

    <Field label="Shield : hull ratio" value={sratLabel(opt.srat)}>
      <input
        type="range" min={-SRAT_LEAN} max={SRAT_LEAN} step="0.25" value={sratPos}
        oninput={(e) => (opt.srat = sratFromPos(+e.currentTarget.value))}
      />
      <div class="flex justify-between text-[10.5px] text-dim">
        <span>5 : 1 hull</span><span>even</span><span>5 : 1 shield</span>
      </div>
    </Field>

    <Field label="Custom hull / shield HP">
      <div class="flex items-end gap-2">
        <input class="hud-input" type="number" min="1" step="100" bind:value={opt.cHull} />
        <input class="hud-input" type="number" min="0" step="100" bind:value={opt.cShield} />
      </div>
    </Field>

    <Field label="Burst overkill">
      <div class="text-[11.5px]">
        <label class="hud-label hud-label-inline flex items-center gap-1.5">
          <input type="checkbox" bind:checked={opt.overkill} /> Penalise wasted volley damage
        </label>
      </div>
      <div class="text-[11.5px] tracking-[0.04em] text-dim">
        A 53k Predator volley into a 10k ship wastes 80%.
      </div>
    </Field>

    <Field label="Shield resistance risk" value="{opt.pres}%">
      <input type="range" min="0" max="100" step="5" bind:value={opt.pres} />
    </Field>

    <Field label="Constraints" value={constraintCount || null}>
      {#if constraintCount === 0}
        <div class="text-[11px] text-dim">
          None. Open a turret's card to exclude it or reserve a count.
        </div>
      {:else}
        <div class="flex flex-wrap items-center gap-1">
          {#each reservedList as r (r.id)}
            <button
              type="button"
              class="hud-tag ml-0 cursor-pointer hover:border-hull"
              title="Clear this reservation"
              onclick={() => setReserved(r.id, 0)}>{r.name} &times;{r.n} &#10005;</button
            >
          {/each}
          {#each excludedList as e (e.id)}
            <button
              type="button"
              class="hud-tag ml-0 cursor-pointer text-hot hover:border-hull"
              title="Stop excluding this turret"
              onclick={() => toggleExcluded(e.id)}>no {e.name} &#10005;</button
            >
          {/each}
          <button type="button" class="hud-btn px-2 py-0.5" onclick={clearSolverConstraints}>Clear</button>
        </div>
      {/if}
    </Field>

    <Field label="Turret factory">
      <div class="text-[11.5px]">
        <label class="hud-label hud-label-inline flex items-center gap-1.5">
          <input type="checkbox" bind:checked={opt.ownFaction} /> Own faction — no 20% tax
        </label>
      </div>
    </Field>

    <Field label="&nbsp;">
      <button type="button" class="hud-btn w-full py-2 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={totalWeight === 0} onclick={solve}>Solve loadout</button>
    </Field>
  </div>

  <div class="mb-3.5 border border-line bg-panel px-[18px] py-4">
    <div class="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span class="hud-label mb-0">Range importance curve</span>
      <span class="text-[10.5px] text-dim">
        drag a point to move it &middot; drag from empty space to sweep &middot; arrow keys fine-tune
      </span>
    </div>

    <BandEqualizer
      kms={bandKms}
      weights={opt.bandWeights}
      {maxKm}
      onchange={() => (opt.bandPreset = 'custom')}
    />

    <p class="mt-2.5 mb-0 text-[11px] text-dim">
      {#if totalWeight === 0}
        <span class="text-hot">Every band is at zero — raise at least one to solve.</span>
      {:else}
        Objective = time-to-kill sampled at each point, weighted by its height. The axis is
        square-root scaled, so knife-range detail stays readable while the long tail compresses.
        Presets sit on the exact sample points the original four bands used; anything in between is
        yours to shape. A point at zero costs nothing to evaluate.
      {/if}
    </p>
  </div>

  {#if !r}
    <p class="m-0 text-[12.5px] text-ink">Press solve.</p>
  {:else if !r.rows.length}
    <p class="m-0 text-[12.5px] text-hot">No armed turret fits {r.budget} slots at this tech level.</p>
  {:else}
    <div class="text-[12.5px] text-ink">
      <b class="font-semibold">
        {#each r.rows as row, i (row.id)}{#if i > 0}<span class="text-dim">&nbsp;+&nbsp;</span>{/if}<span
            style:color={row.c}>{row.n} ×{row.q}</span
          >{#if row.src === 'vanilla'}<span class="hud-tag">vanilla</span>{/if}{#if usingMixed && ownedIds.has(row.id)}<span
            class="hud-tag text-good" title="Drawn from your registered turrets, not an estimate"
            >yours</span
          >{/if}{#if row.res}<span
            class="hud-tag">{row.res} reserved</span
          >{/if}{/each}
      </b>
      <div class="mt-1 text-dim">
        {r.used}/{r.budget} armed slots used &middot;
        <span title={OBJECTIVE_HELP} class="cursor-help border-b border-dotted border-dim">
          {ttkLabel(r.objective)}
        </span> &middot; target
        hull {n0(r.H)} / shield {n0(r.S)} &middot; damage types: {r.types.join(', ')}{#if r.immune}
          — <span class="text-good">immune to shield resistances</span>{/if} &middot;
        {r.bands.length} weighted band{r.bands.length === 1 ? '' : 's'} across {r.bandSpan[0]}–{r
          .bandSpan[1]} km &middot; {r.candidates} turret{r.candidates === 1 ? '' : 's'} considered{#if r.excluded.length}&nbsp;<span
            class="text-hot">({r.excluded.length} excluded)</span>{/if}{#if r.lockNote}
          &middot; <span class="text-hot">{r.lockNote}</span>{/if}{#if r.unreachable?.length}
          &middot; <span class="text-warn"
            title="No available turret can hurt the target at these distances, whatever the solver picks,
              so they are excluded from the time-to-kill average instead of poisoning it.">
            {r.unreachable.length} weighted band{r.unreachable.length === 1 ? '' : 's'} out of reach
            ({r.unreachable.map((b) => b.km).join(', ')} km — {Math.round(r.unreachableW * 100)}% of
            curve weight, ignored)</span>{/if} &middot; tip: add Salvaging Lasers
        on unarmed slots for free hull DPS
      </div>
    </div>

    <div class="mt-3">
      <CostBlock
        {cost}
        label="Cost to build this comp"
        tech={sim.tech}
        ownFaction={opt.ownFaction}
        unpriced={cost?.unpriced ?? []}
        copyHeading={`Loadout comp (tech ${sim.tech}, ${RARITY_NAME[sim.rarity]}, ${NAMES[sim.mat]})`}
      />
    </div>
  {/if}
</Card>
