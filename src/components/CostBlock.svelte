<script>
  /**
   * Manufacturing cost breakdown — credits, tax and the goods bill.
   *
   * Used both for a single turret (with a quantity you can set) and for a whole solved
   * comp, so `cost` may carry either a per-turret `rows` list or a merged `goods` list.
   */
  import { FACTORY_NOTES } from '../lib/factory.js';
  import { n0 } from '../lib/format.js';

  let {
    cost, label = 'Manufacturing cost', tech, ownFaction, unpriced = [],
    qty = null, unitTotal = null, techCapped = false, onqty = null,
  } = $props();

  const money = (v) => '¢' + n0(v);
</script>

{#if cost}
  <div class="border border-line bg-panel2 px-3 py-2.5">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span class="hud-label mb-0">{label}</span>

      {#if onqty}
        <label class="hud-label hud-label-inline flex items-center gap-2 text-[11.5px]">
          Quantity
          <input
            class="hud-input w-[74px] py-1"
            type="number" min="1" max="999" step="1" value={qty}
            oninput={(e) => onqty(Math.max(1, Math.floor(+e.currentTarget.value || 1)))}
          />
        </label>
      {/if}

      <span class="font-semibold text-warn">{money(cost.total)}</span>
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
      <span><span class="text-dim">credits</span> <b>{money(cost.credits)}</b></span>
      {#if cost.tax > 0}
        <span><span class="text-dim">tax 20%</span> <b>{money(cost.tax)}</b></span>
      {:else}
        <span class="text-dim">no tax — own faction</span>
      {/if}
      <span><span class="text-dim">goods worth</span> <b>{money(cost.goodsPrice)}</b></span>
      {#if qty > 1 && unitTotal != null}
        <span><span class="text-dim">per turret</span> <b>{money(unitTotal)}</b></span>
      {/if}
    </div>

    {#if cost.rows?.length}
      <div class="mt-2 flex flex-wrap gap-1">
        {#each cost.rows as g (g.name)}
          <span class="rounded-hud border border-line px-1.5 py-0.5 text-[10.5px]">
            <b class="text-ink">{n0(g.amount)}×</b> <span class="text-dim">{g.name}</span>
          </span>
        {/each}
      </div>
    {/if}

    {#if cost.goods?.length}
      <div class="mt-2">
        <div class="mb-1 text-[10px] uppercase tracking-[0.13em] text-dim">
          {qty > 1 ? `Goods for ${qty} turrets` : 'Bill of materials'} — {cost.goods.length} kinds
        </div>
        <div class="flex flex-wrap gap-1">
          {#each cost.goods as g (g.name)}
            <span class="rounded-hud border border-line px-1.5 py-0.5 text-[10.5px]">
              <b class="text-ink">{n0(g.amount)}×</b> <span class="text-dim">{g.name}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    <p class="mt-2 mb-0 text-[10.5px] leading-relaxed text-dim">
      {#if techCapped || cost.techCapped}
        <span class="text-hot">Tech {tech} is above the factory cap — this cannot be built.</span>
      {/if}
      {#if unpriced.length}
        <span class="text-hot">No recipe for {unpriced.join(', ')} — excluded from the total.</span>
      {/if}
      {FACTORY_NOTES.goods}
      {FACTORY_NOTES.dps}
    </p>
  </div>
{/if}
