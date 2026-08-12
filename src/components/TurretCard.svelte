<script>
  import Card from './Card.svelte';
  import Field from './Field.svelte';
  import ModelFlag from './ModelFlag.svelte';
  import { sim, card } from '../lib/state.svelte.js';
  import { CLSNAME, CREW, NAMES, RARITY_NAME, cardStats, fitCalibration } from '../lib/model.js';
  import { n0, pct } from '../lib/format.js';

  let { model } = $props();

  const selected = $derived(model.L.find((w) => w.id === card.id));
  const stats = $derived(
    cardStats(selected, {
      rarity: sim.rarity, aScale: card.aScale, aVar: card.aVar, aInv: card.aInv,
      aHR: card.aHR, aHD: card.aHD, aHeat: card.aHeat, cal: card.cal,
    }),
  );

  /**
   * [label, value, footnote, flag] rows — mirrors the in-game turret tooltip order.
   * `flag` marks which figures are model output ('model') vs. the one the game agrees on ('raw').
   */
  const rows = $derived.by(() => {
    if (!stats) return [];
    const { w, slots, duty, hullPS, shPS, rawPS, km, nb, fireRate, perShot, hasHeatRoll } = stats;
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
        nb > 1 ? nb + (w.name === 'Pulse Shotgun' ? ' pellets / shot' : ' — all summed here') : '1',
        'in-game per-type card lines may show one',
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
      ['Velocity', w.vel == null ? 'beam' : n0(w.vel * 10) + ' m/s'],
      ['Range', km.toFixed(2) + ' km', w.capped ? 'capped by projectile lifetime' : ''],
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

  const calibrated = $derived(card.cal !== 1);

  function fit() {
    const next = fitCalibration(selected, +card.calVal, card.aVar, card.cal);
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
  sum every barrel, which is what actually lands.
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
        <option value={1}>Full tech — max slots</option>
        <option value={0.75}>×0.75 tech</option>
        <option value={0.5}>×0.5 tech</option>
        <option value={0.25}>×0.25 tech</option>
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
        <div class="text-hull">{pct(w.hullMult)} Damage to Hull</div>
        {#if w.pierce > 0}<div class="text-shield">Ionized Projectiles</div>{/if}
        {#if stats.nb > 1}<div class="text-good">Synchronized Weapons ×{stats.nb}</div>{/if}
        {#if w.cls !== 'armed'}
          <div class="text-warn">
            Mounts on {CLSNAME[w.cls]} slots — does not use an armed slot
          </div>
        {/if}
      </div>
    </div>
  {/if}
</Card>
