<script>
  import ModelFlag from './ModelFlag.svelte';
  import { NAMES, beltMat, shipVolume } from '../lib/model.js';
  import { n0 } from '../lib/format.js';

  let { model } = $props();

  const stats = $derived([
    ['sector DPS budget', model.D.toFixed(1), true],
    ['distance from core', Math.round(model.dist)],
    ['rarity damage factor', '×' + model.ad.toFixed(1)],
    ['HighRange reach', '×' + model.HR.toFixed(2)],
    ['belt material here', NAMES[beltMat(model.dist)]],
    ['sector ship volume', n0(shipVolume(model.dist)) + ' m³', true],
  ]);
</script>

<div class="mb-1.5 flex flex-wrap gap-x-[22px] gap-y-1 border border-t-0 border-line bg-panel2 px-[18px] py-2.5 text-[11.5px]">
  {#each stats as [label, value, flagged] (label)}
    <span>
      <span class="text-dim">{label}</span>
      <b class="font-semibold text-ink">{value}</b>{#if flagged}<ModelFlag />{/if}
    </span>
  {/each}
</div>
