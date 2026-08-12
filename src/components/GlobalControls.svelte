<script>
  import Field from './Field.svelte';
  import { sim } from '../lib/state.svelte.js';
  import { NAMES as MATERIALS, RARITIES, beltMat, distOf } from '../lib/model.js';
  import { ROSTERS } from '../lib/roster.js';

  let { dist, counts } = $props();

  const DIFFICULTIES = [
    [0.2, 'Beginner ×0.2'], [0.4, 'Easy ×0.4'], [0.6, 'Normal ×0.6'], [0.8, 'Veteran ×0.8'],
    [1.0, 'Expert ×1.0'], [2.0, 'Hardcore ×2.0'], [4.0, 'Insane ×4.0'],
  ];

  const syncMaterial = () => (sim.mat = beltMat(distOf(sim.tech)));
</script>

<div class="hud-controls">
  <Field label="Turret roster" hint="({counts.total} shown)">
    <select class="hud-input" bind:value={sim.roster}>
      {#each ROSTERS as [v, name] (v)}
        <option value={v}>{name}</option>
      {/each}
    </select>
  </Field>

  <Field label="Tech level" value={sim.tech} hint="(~{Math.round(dist)} sectors out)">
    <input type="range" min="0" max="52" step="1" bind:value={sim.tech} />
  </Field>

  <Field label="Rarity">
    <select class="hud-input" bind:value={sim.rarity}>
      {#each RARITIES as [v, name] (v)}
        <option value={v}>{name}</option>
      {/each}
    </select>
  </Field>

  <Field label="Material">
    <select class="hud-input" bind:value={sim.mat}>
      {#each MATERIALS as name, i (name)}
        <option value={i}>{name}</option>
      {/each}
    </select>
  </Field>

  <Field label="Difficulty">
    <select class="hud-input" bind:value={sim.diff}>
      {#each DIFFICULTIES as [v, name] (v)}
        <option value={v}>{name}</option>
      {/each}
    </select>
  </Field>

  <Field label="Hit model">
    <select class="hud-input" bind:value={sim.hitm}>
      <option value={1}>Penalise flight time</option>
      <option value={0}>Stationary target (no penalty)</option>
    </select>
  </Field>

  <Field label="Table figures">
    <select class="hud-input" bind:value={sim.metric}>
      <option value="slot">Per slot (total in parens)</option>
      <option value="total">Turret total (per slot in parens)</option>
    </select>
  </Field>

  <Field label="Specialty roll">
    <div class="flex items-end gap-2">
      <select class="hud-input" bind:value={sim.spec}>
        <option value={1}>HighRange where possible</option>
        <option value={0}>No specialty</option>
      </select>
      <button
        type="button"
        class="hud-btn shrink-0 whitespace-nowrap"
        title="Set material to the belt that matches this tech level"
        onclick={syncMaterial}>Sync&nbsp;mat</button
      >
    </div>
  </Field>
</div>
