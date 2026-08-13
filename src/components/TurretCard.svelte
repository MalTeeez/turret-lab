<script>
  import Card from './Card.svelte';
  import Field from './Field.svelte';
  import ModelFlag from './ModelFlag.svelte';
  import CostBlock from './CostBlock.svelte';
  import { factoryCost, loadoutCost } from '../lib/factory.js';
  import {
    addToInventory, card, inv, opt, removeFromInventory, setExcluded, setOverride, setReserved,
    sim, solverIdsFor, updateInventory,
  } from '../lib/state.svelte.js';
  import { OVERRIDABLE, materialise, overridesFromStats } from '../lib/inventory.js';
  import { CLSNAME, CREW, NAMES, RARITY_NAME, cardStats, fitCalibration } from '../lib/model.js';
  import { n0, pct } from '../lib/format.js';

  let { model } = $props();

  const selected = $derived(model.L.find((w) => w.id === card.id));
  const stats = $derived(
    cardStats(selected, {
      rarity: sim.rarity, tech: sim.tech, aScale: card.aScale, aVar: card.aVar, aInv: card.aInv,
      aHR: card.aHR, aHD: card.aHD, aHeat: card.aHeat, cal: card.cal,
    }),
  );

  /**
   * [label, value, footnote, flag] rows — mirrors the in-game turret tooltip order.
   * `flag` marks which figures are model output ('model') vs. the one the game agrees on ('raw').
   */
  const rows = $derived.by(() => {
    if (!stats) return [];
    const { w, slots, duty, hullPS, shPS, rawPS, km, vel, nb, fireRate, perShot, hasHeatRoll } = stats;
    return [
      ['Average DPS /slot', n0((hullPS + shPS) / 2), 'model figure — game card differs', 'model'],
      ['Hull DPS /slot', n0(hullPS), 'model figure — game card differs', 'model'],
      [
        'Shield DPS /slot',
        shPS > 0 ? n0(shPS) : '—',
        shPS > 0 ? 'model figure — game card differs' : 'no shield damage',
        shPS > 0 ? 'model' : null,
      ],
      ['Raw DPS', n0(rawPS * slots), 'before multipliers, all barrels — should match in game', 'raw'],
      [
        'Barrels',
        nb > 1
          ? nb + (w.name === 'Pulse Shotgun' ? ' pellets / shot'
            : w.alt ? ' — alternating, one heat pool' : ' — all summed here')
          : '1',
        w.alt ? 'extra barrels add no sustained DPS' : 'in-game per-type card lines may show one',
      ],
      ['Hull Damage', (perShot * w.hullMult).toFixed(1), 'per volley, whole turret', 'model'],
      [
        'Shield Damage',
        w.shMult > 0 ? (perShot * w.shMult).toFixed(1) : '—',
        w.shMult > 0 ? 'per volley, whole turret' : '',
        w.shMult > 0 ? 'model' : null,
      ],
      ['Fire Rate', fireRate ? fireRate.toFixed(2) : '—', nb > 1 ? 'all barrels' : ''],
      [
        'Damage Type',
        w.dt === 'ALL' ? 'All six (per barrel)' : w.dt || '—',
        w.dt === 'Energy' || w.dt === 'Fragments' ? 'cannot be resisted' : '',
      ],
      ['Shield Penetration', w.pierce > 0 ? (w.pierce * 100).toFixed(1) + '%' : '—'],
      ['Accuracy', w.acc ? (w.acc * 100).toFixed(1) + '%' : '—'],
      ['Velocity', vel == null ? 'beam' : n0(vel * 10) + ' m/s'],
      ['Range', km.toFixed(2) + ' km'],
      ['Duty cycle', Math.round(duty * 100) + '%', hasHeatRoll ? card.aHeat + ' heat roll' : 'no cooling'],
      [
        'Volley cycle',
        w.cycle > 0.5 ? w.cycle + ' s' : 'sustained',
        w.cycle > 0.5 ? 'burst of ' + n0(hullPS * slots * w.cycle) + ' hull dmg' : '',
        w.cycle > 0.5 ? 'model' : null,
      ],
      ['Slots', slots, card.aScale < 1 ? 'reduced scale roll' : 'max for tech'],
      ['Crew', CREW[Math.min(2, slots)] || slots + ' Gunners'],
      ['Turret total hull DPS', n0(hullPS * slots), 'damage ×slots', 'model'],
    ];
  });

  const qty = $derived(Math.max(1, Math.floor(+card.qty || 1)));

  // Registered copies of whatever turret is on the card.
  const entries = $derived(inv.items.filter((i) => i.baseId === card.id));
  /** What an entry resolves to once its overrides are applied — for the live preview. */
  const resolved = (item) => materialise(item, model.L);

  /** Per-turret price, and the bill for `qty` of them with the goods merged. */
  const unitCost = $derived(
    selected ? factoryCost(selected, { ownFaction: opt.ownFaction, tech: sim.tech }) : null,
  );
  const cost = $derived(
    selected && unitCost
      ? loadoutCost([{ w: selected, q: qty }], { ownFaction: opt.ownFaction, tech: sim.tech })
      : null,
  );

  const calibrated = $derived(card.cal !== 1);

  /**
   * Bonus lines in the in-game card's own phrasing: a boost reads "+200% Damage to Shields",
   * a malus reads "Hull damage: 7% of weapon damage". Neutral (x1) and zero sides get no line
   * — the DPS rows already say "no shield damage".
   */
  const bonusLine = (mult, kind) =>
    mult > 1
      ? `${pct(mult)} Damage to ${kind === 'hull' ? 'Hull' : 'Shields'}`
      : `${kind === 'hull' ? 'Hull' : 'Shield'} damage: ${+(mult * 100).toFixed(1)}% of weapon damage`;

  /**
   * The scale roll can only land on the turret's own table bands, so the dropdown lists the
   * actual variants reachable at this tech — one option per distinct slot count — instead of
   * fixed multipliers that may all collapse into the same band.
   */
  const scaleOptions = $derived.by(() => {
    const opts = [{ value: 1, label: `Full tech — ${selected?.slots ?? '—'} slots` }];
    if (!selected?.slotsAt) return opts;
    let last = selected.slots;
    for (let t = sim.tech - 1; t >= 1; t--) {
      const s = selected.slotsAt(t);
      if (s !== last) {
        // (t + 0.5) / tech survives cardStats' floor() round-trip exactly onto scale tech t
        opts.push({ value: (t + 0.5) / sim.tech, label: `Reduced — ${s} slots (scale tech ≤ ${t})` });
        last = s;
      }
    }
    return opts;
  });

  // A stale factor (turret or tech changed) matches no option — snap back to full tech.
  $effect(() => {
    if (!scaleOptions.some((o) => o.value === card.aScale)) card.aScale = 1;
  });

  // Solver constraints for this turret, plus what the last solve actually picked.
  const isArmed = $derived(selected?.cls === 'armed' && !/^VANILLA/.test(selected.name));

  /** Which ids the solver actually sees for this turret — your copies, or the generated one. */
  const solverIds = $derived(selected ? solverIdsFor(selected.id) : []);
  /** True when the constraints below act on your copies rather than the generated turret. */
  const substituted = $derived(solverIds.length > 0 && solverIds[0] !== selected?.id);

  const excluded = $derived(solverIds.length > 0 && solverIds.every((id) => opt.excluded.has(id)));
  const reserved = $derived(solverIds.reduce((a, id) => a + (opt.reserved[id] ?? 0), 0));
  const inSolution = $derived(
    opt.result?.rows.reduce((a, r) => a + (solverIds.includes(r.id) ? r.q : 0), 0) ?? 0,
  );

  /** Slots per unit of whatever the reservation lands on — a registered copy may override them. */
  const reserveSlots = $derived(
    (substituted ? resolved(entries[0])?.slots : selected?.slots) ?? selected?.slots ?? 1,
  );

  /** A reservation is a single count, so it rides on the first copy when there are several. */
  function reserveHere(v) {
    const [first, ...rest] = solverIds;
    if (!first) return;
    setReserved(first, v);
    for (const id of rest) setReserved(id, 0);
  }

  function fit() {
    const next = fitCalibration(selected, +card.calVal, {
      rarity: sim.rarity, tech: sim.tech, aScale: card.aScale, aVar: card.aVar, aInv: card.aInv,
      aHR: card.aHR, aHD: card.aHD, aHeat: card.aHeat,
    });
    if (next != null) card.cal = next;
  }

  /** Drop the fitted multiplier — it is global and sticky, so it needs an obvious exit. */
  function clearCal() {
    card.cal = 1;
    card.calVal = null;
  }
</script>

{#snippet note()}
  Click any row in the table below to inspect it. Untick an assumption to see the stat without that
  lucky roll. In-game tooltips build many lines from the <i>first</i> weapon only — the numbers here
  sum every barrel that actually adds output (alternating assemblies share one heat pool and don't).
{/snippet}

<Card title="Turret card" accent="var(--color-shield)" {note}>
  <div class="hud-controls mb-3.5">
    <Field label="Assumptions">
      <div class="flex flex-col gap-[5px] text-[11.5px]">
        <label class="hud-label hud-label-inline flex items-center gap-1.5">
          <input type="checkbox" bind:checked={card.aInv} /> Max factory investment
        </label>
        <label class="hud-label hud-label-inline flex items-center gap-1.5">
          <input type="checkbox" bind:checked={card.aHR} /> HighRange rolled
        </label>
        <label class="hud-label hud-label-inline flex items-center gap-1.5">
          <input type="checkbox" bind:checked={card.aHD} /> HighDamage rolled
        </label>
      </div>
    </Field>

    <Field label="Scale roll (50% chance of reduced tech)">
      <select class="hud-input" bind:value={card.aScale}>
        {#each scaleOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
    </Field>

    <Field label="Damage variation" value={card.aVar.toFixed(2)}>
      <input type="range" min="1.0" max="1.1" step="0.01" bind:value={card.aVar} />
    </Field>

    <Field label="Heat pool roll">
      <select class="hud-input" bind:value={card.aHeat}>
        <option value="best">Best roll</option>
        <option value="mean">Average</option>
        <option value="worst">Worst roll</option>
      </select>
    </Field>

    <Field label="Calibrate: real Raw DPS">
      <div class="flex items-end gap-2">
        <input class="hud-input" type="number" placeholder="e.g. 2526.4" step="0.1" bind:value={card.calVal} />
        <button
          type="button"
          class="hud-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!(+card.calVal > 0)}
          onclick={fit}>Fit</button
        >
      </div>
      {#if calibrated}
        <div class="mt-1.5 flex items-center justify-between gap-2 text-[10.5px]">
          <span class="text-warn">×{card.cal.toFixed(4)} on every turret</span>
          <button type="button" class="hud-btn shrink-0 hover:border-hot" onclick={clearCal}>Clear</button>
        </div>
      {:else}
        <div class="mt-1.5 text-[10.5px] text-dim">no calibration applied</div>
      {/if}
    </Field>
  </div>

  {#if !stats}
    <p class="hud-note mb-0">Select a turret from the table.</p>
  {:else}
    {@const w = stats.w}
    <div class="border border-l-[3px] border-line pt-3 pr-1 pb-2 pl-1" style:border-left-color={w.c}>
      <div
        class="px-[9px] pb-1 font-display text-[16px] uppercase tracking-[0.06em]"
        style:color={w.c}
      >
        {w.name}
      </div>
      <div class="px-[9px] pb-2.5 text-[11px] text-dim">
        Tech {sim.tech} &middot; {RARITY_NAME[sim.rarity]} &middot; {NAMES[sim.mat]} &middot;
        {CLSNAME[w.cls]} slot &middot;
        <span class={w.src === 'vanilla' ? 'text-shield' : 'text-hull'}>
          {w.src === 'vanilla' ? 'vanilla' : 'HET'}
        </span>
      </div>

      {#if w.src === 'vanilla'}
        <p class="mx-[9px] mb-2.5 border-l-2 border-shield/60 pl-2 text-[10.5px] text-dim">
          Vanilla turrets gain no DPS from barrel count — projectile types divide fire rate by
          barrels, beams divide damage — so the barrel figure is cosmetic. No turret-factory damage
          investment is applied to vanilla rows.
        </p>
      {/if}

      <table class="w-full border-collapse text-[12px]">
        <tbody>
          {#each rows as [label, value, footnote, flag] (label)}
            <tr class="border-b border-line">
              <td class="px-[9px] py-1 text-left text-dim">{label}</td>
              <td class="px-[9px] py-1 text-left">
                <b class="font-semibold">{value}</b>{#if flag}<ModelFlag kind={flag} />{/if}
              </td>
              <td class="px-[9px] py-1 text-left text-[10.5px] text-dim">{footnote ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="px-[9px] pt-2 text-[11.5px]">
        {#if w.hullMult > 0 && w.hullMult !== 1}
          <div class="text-hull">{bonusLine(w.hullMult, 'hull')}</div>
        {/if}
        {#if w.shMult > 0 && w.shMult !== 1}
          <div class="text-shield">{bonusLine(w.shMult, 'shield')}</div>
        {/if}
        {#if w.pierce > 0}<div class="text-shield">Ionized Projectiles</div>{/if}
        {#if stats.nb > 1}
          <div class="text-good">
            {w.alt ? `Assembly ×${stats.nb} — alternating fire` : `Synchronized Weapons ×${stats.nb}`}
          </div>
        {/if}
        {#if w.cls !== 'armed'}
          <div class="text-warn">
            Mounts on {CLSNAME[w.cls]} slots — does not use an armed slot
          </div>
        {/if}
      </div>
    </div>

    <div class="mt-3 border border-line bg-panel2 px-3 py-2.5">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span class="hud-label mb-0">My turrets</span>
        <button
          type="button"
          class="hud-btn"
          title="Registers the variant configured above — scale roll, heat roll, variation and
            specialty toggles are prefilled as overrides"
          onclick={() => addToInventory(selected, overridesFromStats(selected, stats))}>
          Register one I own
        </button>
      </div>

      {#if !entries.length}
        <p class="m-0 text-[10.5px] text-dim">
          Register a turret you have, then set the solver's <b>Draw turrets from</b> to
          “Mixed” — your copies stand in for this type and everything you don't own stays a
          generated estimate — or “My turrets only” to solve from your stock alone. New entries are
          <b>blueprints</b> — unlimited, since holding one usually means you can build more. Untick
          that to cap it at a fixed count. Registering copies the card as configured above — the
          scale roll's slots, range and the rest arrive as prefilled overrides. Adjust any stat to
          match the real card; blank keeps the generated value.
        </p>
      {:else}
        {#each entries as item (item.uid)}
          {@const res = resolved(item)}
          <div class="mb-2 border-l-2 border-solver/60 pl-2">
            <div class="flex flex-wrap items-end gap-x-3 gap-y-2 text-[11.5px]">
              <label class="hud-label hud-label-inline flex items-center gap-1.5"
                title="You hold the blueprint, so the solver may use as many as it likes">
                <input type="checkbox" checked={item.count == null}
                  onchange={(e) => updateInventory(item.uid, { count: e.currentTarget.checked ? null : 1 })} />
                Blueprint
              </label>

              {#if item.count != null}
                <label class="hud-label hud-label-inline flex items-center gap-1.5">
                  Limit
                  <input class="hud-input w-[64px] py-1" type="number" min="1" max="999" step="1"
                    value={item.count}
                    oninput={(e) => updateInventory(item.uid, { count: Math.max(1, Math.floor(+e.currentTarget.value || 1)) })} />
                </label>
              {/if}
              <label class="hud-label hud-label-inline flex flex-1 items-center gap-1.5">
                Label
                <input class="hud-input min-w-[120px] flex-1 py-1" type="text" placeholder={w.name}
                  value={item.label}
                  oninput={(e) => updateInventory(item.uid, { label: e.currentTarget.value })} />
              </label>
              <button type="button" class="hud-btn hover:border-hot"
                onclick={() => removeFromInventory(item.uid)}>Remove</button>
            </div>

            <div class="mt-2 grid gap-x-3 gap-y-1.5" style="grid-template-columns:repeat(auto-fit,minmax(165px,1fr))">
              {#each OVERRIDABLE as f (f.key)}
                <label class="hud-label hud-label-inline flex items-center justify-between gap-2 text-[10.5px]">
                  <span class={item.overrides[f.key] != null ? 'text-hull' : 'text-dim'}>{f.label}</span>
                  <input
                    class="hud-input w-[80px] py-0.5 text-[10.5px]"
                    type="number" min={f.min} max={f.max} step={f.step}
                    placeholder={selected[f.key] == null ? '—' : (+selected[f.key]).toFixed(2)}
                    value={item.overrides[f.key] ?? ''}
                    oninput={(e) => setOverride(item.uid, f.key, e.currentTarget.value)}
                  />
                </label>
              {/each}
            </div>

            {#if res}
              <p class="mt-1.5 mb-0 text-[10.5px] text-dim">
                Solver sees: <b class="text-ink">{res.name}</b>
                {res.blueprint ? '(blueprint — unlimited)' : `×${res.owned} max`} &middot;
                {res.slots} slots &middot; {res.km.toFixed(2)} km &middot;
                {n0(res.hull)} hull / {res.shield > 0 ? n0(res.shield) : '—'} shield DPS per slot
                {#if res.overridden.length}
                  &middot; <span class="text-hull">{res.overridden.length} stat{res.overridden.length === 1 ? '' : 's'} overridden</span>
                {/if}
              </p>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    {#if isArmed}
      <div class="mt-3 border border-line bg-panel2 px-3 py-2.5">
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span class="hud-label mb-0">Loadout solver</span>
          {#if inSolution > 0}
            <span class="text-[11px] text-good">in current solution ×{inSolution}</span>
          {:else if opt.result}
            <span class="text-[11px] text-dim">not in current solution</span>
          {/if}
        </div>

        {#if !solverIds.length}
          <p class="m-0 text-[10.5px] text-hot">
            Not registered, so “My turrets only” can't pick it — register one above, or switch the
            solver's source.
          </p>
        {:else}
          <div class="flex flex-wrap items-end gap-x-5 gap-y-2 text-[11.5px]">
            <label class="hud-label hud-label-inline flex items-center gap-1.5">
              <input type="checkbox" checked={excluded} onchange={() => setExcluded(solverIds, !excluded)} />
              Exclude — never pick this
            </label>

            <label class="hud-label hud-label-inline flex items-center gap-2">
              Reserve
              <input
                class="hud-input w-[74px] py-1 disabled:cursor-not-allowed disabled:opacity-40"
                type="number" min="0" max="99" step="1" value={reserved} disabled={excluded}
                oninput={(e) => reserveHere(e.currentTarget.value)}
              />
              <span class="text-dim">guaranteed in every solve</span>
            </label>
          </div>
        {/if}

        {#if substituted}
          <p class="mt-2 mb-0 text-[10.5px] text-good">
            Applies to your {solverIds.length === 1 ? 'registered copy' : `${solverIds.length} registered copies`}
            — in this source mode {solverIds.length === 1 ? 'it stands' : 'they stand'} in for the
            generated {w.name}.{#if solverIds.length > 1} A reservation rides on the first.{/if}
          </p>
        {:else if inv.source === 'mixed'}
          <p class="mt-2 mb-0 text-[10.5px] text-dim">
            Nothing registered for this type, so the mixed pool uses the generated estimate above.
          </p>
        {/if}

        {#if solverIds.length}
        <p class="mt-2 mb-0 text-[10.5px] text-dim">
          {#if excluded}
            <span class="text-hot">Excluded.</span> The solver will not pick this turret at all.
          {:else if reserved > 0}
            {reserved} × {w.name} ({reserved * reserveSlots} slots) is seeded before solving and never
            dropped — useful for keeping a knife-range turret the range curve would otherwise cut.
          {:else}
            Exclude a turret to keep it out of the solution, or reserve a count to guarantee it
            survives. Both apply to every solve until you clear them.
          {/if}
        </p>
        {/if}
      </div>
    {/if}

    <div class="mt-3">
      <CostBlock
        {cost}
        {qty}
        unitTotal={unitCost?.total}
        techCapped={unitCost?.techCapped}
        tech={sim.tech}
        ownFaction={opt.ownFaction}
        onqty={(v) => (card.qty = v)}
        copyHeading={`${selected.name}${qty > 1 ? ` x${qty}` : ''} (tech ${sim.tech}, ${RARITY_NAME[sim.rarity]}, ${NAMES[sim.mat]})`}
      />
    </div>
  {/if}
</Card>
