<script>
  import { onMount } from 'svelte';
  import { Chart } from '../lib/chart.js';
  import { n0 } from '../lib/format.js';

  /**
   * @property {'hull'|'shield'} axis
   * @property {Array} datasets  Chart.js datasets, already filtered by visibility
   * @property {Array} weapons   every weapon eligible for this axis (for the legend)
   */
  let { axis, datasets, maxX, weapons, hidden, metric, ontoggle, onshow, onhide, onisolate } = $props();

  const ids = $derived(weapons.map((w) => w.id));
  const shownCount = $derived(weapons.filter((w) => !hidden.has(w.id)).length);

  const GRID = 'rgba(36,48,64,.7)';
  const DIM = '#7e8fa2';

  let canvas;
  let chart;

  const perLabel = () => (metric === 'total' ? 'per turret' : '/slot');
  const axisTitle = () => `${axis} DPS ${metric === 'total' ? 'per turret' : 'per slot'}`;

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      interaction: { mode: 'nearest', intersect: false },
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${n0(c.parsed.y)} ${axis} DPS ${perLabel()} @ ${c.parsed.x} km`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: maxX,
          title: { display: true, text: 'engagement range (km)', color: DIM, font: { size: 11 } },
          ticks: { color: DIM, font: { size: 10 } },
          grid: { color: GRID },
        },
        y: {
          type: 'linear',
          beginAtZero: true,
          title: { display: true, text: axisTitle(), color: DIM, font: { size: 11 } },
          ticks: {
            color: DIM,
            font: { size: 10 },
            callback: (v) => (v >= 1000 ? v / 1000 + 'k' : v),
          },
          grid: { color: GRID },
        },
      },
    };
  }

  onMount(() => {
    chart = new Chart(canvas, { type: 'line', data: { datasets }, options: baseOptions() });
    return () => {
      chart.destroy();
      chart = null;
    };
  });

  // Push new data without tearing the canvas down — cheaper than recreating the chart.
  $effect(() => {
    const [d, mx, m] = [datasets, maxX, metric];
    if (!chart) return;
    chart.data.datasets = d;
    chart.options.scales.x.max = mx;
    chart.options.scales.y.title.text = `${axis} DPS ${m === 'total' ? 'per turret' : 'per slot'}`;
    chart.update('none');
  });
</script>

<div class="relative h-[430px]">
  <canvas bind:this={canvas} aria-label="{axis} DPS across engagement range"></canvas>
</div>

<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[10.5px] text-dim">
  <span>{shownCount}/{weapons.length} shown</span>
  <button type="button" class="hud-btn px-2 py-[3px]" onclick={() => onshow(ids)}>All</button>
  <button type="button" class="hud-btn px-2 py-[3px]" onclick={() => onhide(ids)}>None</button>
  <span class="text-dim/80">shift-click a chip to isolate it</span>
</div>

<div class="mt-2 flex flex-wrap gap-x-2 gap-y-[5px]">
  {#each weapons as w (w.id)}
    {@const on = !hidden.has(w.id)}
    <button
      type="button"
      class="flex cursor-pointer select-none items-center gap-[5px] rounded-hud border px-1.5 py-0.5 text-[10.5px]
             {on ? 'border-current text-ink' : 'border-line text-dim opacity-35 line-through'}"
      aria-pressed={on}
      aria-label="{w.name}{w.src === 'vanilla' ? ' (vanilla)' : ''}"
      onclick={(e) => (e.shiftKey ? onisolate(ids, w.id) : ontoggle(w.id))}
    >
      <span class="size-[9px] shrink-0 rounded-[1px]" style:background={w.c}></span>{w.name}{#if w.src === 'vanilla'}<span
          class="text-[8.5px] opacity-70">V</span
        >{/if}
    </button>
  {/each}
</div>
