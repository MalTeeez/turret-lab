<script>
  import Card from './Card.svelte';
  import Field from './Field.svelte';
  import BandEqualizer from './BandEqualizer.svelte';
  import { sim, opt } from '../lib/state.svelte.js';
  import {
    BAND_PRESETS, bandSet, distOf, presetWeights, resampleWeights, targetHP,
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
  // Anything the solver could actually pick, so the list follows the roster.
  const lockable = $derived(
    model.L.filter((w) => w.cls === 'armed' && !LEGACY_VANILLA.has(w.name) && (w.hull > 0 || w.shield > 0)),
  );

  // Keep the custom HP fields showing what the chosen profile would produce, so
  // switching to "custom" starts from a sensible baseline.
  $effect(() => {
    const kind = opt.profile === 'custom' ? 'ship' : opt.profile;
    const [h, s] = targetHP(distOf(sim.tech), sim.mat, kind, opt.srat);
    opt.cHull = Math.round(h);
    opt.cShield = Math.round(s);
  });

  const lockName = $derived(lockable.find((w) => w.id === opt.lockId)?.name ?? '');
  const reserveLabel = $derived(opt.lockN > 0 && lockName ? `${opt.lockN} × ${lockName}` : 'none');

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
    opt.result = solveLoadout(model.L, {
      budget: opt.budget, bands, pres: opt.pres, hull, shield,
      overkill: opt.overkill, lockId: opt.lockId, lockN: opt.lockN,
    });
  }

  const r = $derived(opt.result);
</script>

{#snippet note()}
  Picks integer turret counts for an <b>armed</b>-slot budget — Unarmed (Salvaging, Mining, Hammer
  Heads) and Defense (A.D.S.T., Anti-Fighter, Torpedo) turrets mount on their own slot pools and
  never compete here; stack salvagers on top of any solution for free hull DPS. Objective blends
  time-to-kill across a range band with the worst case if the target's <b>shield</b> resists one
  damage type at 95% (hull damage is never resisted, and Energy / Fragments weapons can't be resisted
  at all). Reserve a fixed count of any armed turret to guarantee it survives the solve — useful for
  keeping knife-range Flamethrowers the range band would otherwise cut.
{/snippet}

<Card title="Loadout solver" accent="var(--color-solver)" {note}>
  <div class="hud-controls mb-3.5">
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

    <Field label="Shield : hull ratio" value={opt.srat.toFixed(2)}>
      <input type="range" min="0" max="10" step="0.25" bind:value={opt.srat} />
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

    <Field label="Reserve turrets" value={reserveLabel}>
      <div class="flex items-end gap-2">
        <select class="hud-input" bind:value={opt.lockId}>
          <option value="">— none —</option>
          {#each lockable as w (w.id)}
            <option value={w.id}>{w.name}{w.src === 'vanilla' ? ' (vanilla)' : ''}</option>
          {/each}
        </select>
        <input class="hud-input w-[74px] shrink-0" type="number" min="0" max="40" step="1" bind:value={opt.lockN} />
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
          >{#if row.src === 'vanilla'}<span class="hud-tag">vanilla</span>{/if}{#if row.res}<span
            class="hud-tag">{row.res} reserved</span
          >{/if}{/each}
      </b>
      <div class="mt-1 text-dim">
        {r.used}/{r.budget} armed slots used &middot; objective {r.objective.toFixed(4)} &middot; target
        hull {n0(r.H)} / shield {n0(r.S)} &middot; damage types: {r.types.join(', ')}{#if r.immune}
          — <span class="text-good">immune to shield resistances</span>{/if} &middot;
        {r.bands.length} weighted band{r.bands.length === 1 ? '' : 's'} across {r.bandSpan[0]}–{r
          .bandSpan[1]} km{#if r.lockNote} &middot; <span class="text-hot">{r.lockNote}</span
          >{/if} &middot; tip: add Salvaging Lasers on unarmed slots for free hull DPS
      </div>
    </div>
  {/if}
</Card>
