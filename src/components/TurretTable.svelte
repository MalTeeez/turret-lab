<script>
  import ModelFlag from './ModelFlag.svelte';
  import { sim, view, card, sortBy } from '../lib/state.svelte.js';
  import { CLSNAME } from '../lib/model.js';
  import { n0 } from '../lib/format.js';

  let { model, onselect } = $props();

  /** Columns whose numbers come out of the model rather than an in-game card. */
  const FLAGGED = new Set(['hull', 'shield']);

  const CLSORD = { armed: 0, def: 1, una: 2 };
  const perSlot = $derived(sim.metric === 'slot');

  const COLUMNS = $derived([
    ['name', 'Turret'],
    ['cls', 'Class'],
    ['slots', 'Slots'],
    ['nb', 'Barrels'],
    ['hull', perSlot ? 'Hull /slot (total)' : 'Hull total (/slot)'],
    ['shield', perSlot ? 'Shield /slot (total)' : 'Shield total (/slot)'],
    ['pierce', 'Pierce'],
    ['km', 'Range km'],
    ['vel', 'Velocity'],
    ['duty', 'Duty'],
    ['inv', 'Fac. dmg'],
  ]);

  const filtered = $derived.by(() => {
    const q = view.query.trim().toLowerCase();
    return model.L.filter(
      (w) =>
        (view.filterCls === 'all' || w.cls === view.filterCls) &&
        (!q ||
          w.name.toLowerCase().includes(q) ||
          (w.dt || '').toLowerCase().includes(q) ||
          w.src.includes(q)),
    );
  });

  const rows = $derived.by(() => {
    const { sortK, sortDir } = view;
    const kv = (o) => {
      if (sortK === 'hull') return perSlot ? o.hull : o.hull * o.slots;
      if (sortK === 'shield') return perSlot ? o.shield : o.shield * o.slots;
      if (sortK === 'cls') return CLSORD[o.cls];
      if (sortK === 'nb') return o.nb || 1;
      return o[sortK] ?? 0;
    };
    return [...filtered].sort((a, b) => {
      const x = sortK === 'name' ? a.name.localeCompare(b.name) : kv(a) - kv(b);
      return sortDir * x;
    });
  });

  /** Primary figure with the other view in parentheses. */
  const dual = (v, sl) => [n0(perSlot ? v : v * sl), n0(perSlot ? v * sl : v)];
</script>

<div class="mt-[22px] flex flex-wrap items-center gap-2 border border-line bg-panel px-3 py-2 text-[10.5px]">
  <span class="uppercase tracking-[0.13em] text-dim">Filter</span>

  <select class="hud-input w-auto py-1 text-[11px]" bind:value={view.filterCls} aria-label="Filter by slot class">
    <option value="all">All classes</option>
    <option value="armed">Armed</option>
    <option value="def">Defense</option>
    <option value="una">Unarmed</option>
  </select>

  <input
    class="hud-input w-auto flex-1 py-1 text-[11px] sm:max-w-[240px]"
    type="search"
    placeholder="name, damage type, or “vanilla”…"
    aria-label="Search turrets"
    bind:value={view.query}
  />

  <span class="text-dim">{rows.length}/{model.L.length}</span>

  {#if view.filterCls !== 'all' || view.query}
    <button
      type="button"
      class="hud-btn px-2 py-1"
      onclick={() => {
        view.filterCls = 'all';
        view.query = '';
      }}>Reset</button
    >
  {/if}
</div>

<div class="overflow-x-auto">
  <table class="w-full border-collapse text-[12px]">
    <thead class="sticky top-0 z-10 bg-panel">
      <tr>
        {#each COLUMNS as [k, label] (k)}
          <th
            class="cursor-pointer border-b border-line px-[9px] py-1.5 text-[10px] uppercase tracking-[0.1em]
                   whitespace-nowrap {k === 'name' ? 'text-left' : 'text-right'}
                   {view.sortK === k ? 'text-hull' : 'text-dim'}"
            aria-sort={view.sortK === k ? (view.sortDir === 1 ? 'ascending' : 'descending') : 'none'}
            onclick={() => sortBy(k)}
          >
            {label}{#if FLAGGED.has(k)}<ModelFlag />{/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as w (w.id)}
        {@const h = dual(w.hull, w.slots)}
        <tr
          class="cursor-pointer border-b border-line hover:bg-panel2 {card.id === w.id ? 'bg-panel2' : ''}"
          onclick={() => onselect(w.id)}
        >
          <td class="px-[9px] py-1.5 text-left">
            <span class="mr-[7px] inline-block size-[9px] rounded-[1px]" style:background={w.c}></span>{w.name}
            {#if w.src === 'vanilla'}<span class="hud-tag border-[#3d4a5c] text-shield">vanilla</span>{/if}
            {#if w.cls === 'def'}<span class="hud-tag border-[#5c5330] text-warn">defense</span>{/if}
            {#if w.cls === 'una'}<span class="hud-tag border-[#1d4c48] text-teal">unarmed</span>{/if}
            {#if w.pierce > 0}<span class="hud-tag">pierce</span>{/if}
            {#if w.vel == null}<span class="hud-tag">no travel</span>{/if}
            {#if w.capped}<span class="hud-tag">despawn cap</span>{/if}
          </td>
          <td class="px-[9px] py-1.5 text-right">{CLSNAME[w.cls]}</td>
          <td class="px-[9px] py-1.5 text-right">{w.slots}</td>
          <td class="px-[9px] py-1.5 text-right">{w.nb || 1}</td>
          <td class="px-[9px] py-1.5 text-right">
            {h[0]} <span class="text-[10.5px] text-dim">({h[1]})</span>
          </td>
          <td class="px-[9px] py-1.5 text-right">
            {#if w.shield > 0}
              {@const s = dual(w.shield, w.slots)}
              {s[0]} <span class="text-[10.5px] text-dim">({s[1]})</span>
            {:else}—{/if}
          </td>
          <td class="px-[9px] py-1.5 text-right">{w.pierce > 0 ? Math.round(w.pierce * 100) + '%' : '—'}</td>
          <td class="px-[9px] py-1.5 text-right">{w.km.toFixed(1)}</td>
          <td class="px-[9px] py-1.5 text-right">{w.vel == null ? 'beam' : w.vel}</td>
          <td class="px-[9px] py-1.5 text-right">{Math.round(w.duty * 100)}%</td>
          <td class="px-[9px] py-1.5 text-right">×{w.inv.toFixed(2)}</td>
        </tr>
      {:else}
        <tr>
          <td class="px-[9px] py-4 text-left text-dim" colspan={COLUMNS.length}>
            No turret matches these filters.
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
