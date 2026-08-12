<script>
  import GlobalControls from './components/GlobalControls.svelte';
  import Readout from './components/Readout.svelte';
  import ModelNotice from './components/ModelNotice.svelte';
  import Card from './components/Card.svelte';
  import DpsChart from './components/DpsChart.svelte';
  import LoadoutSolver from './components/LoadoutSolver.svelte';
  import TurretCard from './components/TurretCard.svelte';
  import TurretTable from './components/TurretTable.svelte';
  import SiteFooter from './components/SiteFooter.svelte';

  import { curves } from './lib/model.js';
  import { buildRoster } from './lib/roster.js';
  import { sim, view, card, toggleHidden, showAll, hideAll, isolate } from './lib/state.svelte.js';

  const model = $derived(buildRoster(sim));

  const hullData = $derived(
    curves(model.L, 'hull', sim.hitm, sim.metric).filter((d) => !view.hidden.has(d.id)),
  );
  const shieldData = $derived(
    curves(model.L, 'shield', sim.hitm, sim.metric).filter((d) => !view.hidden.has(d.id)),
  );
  const maxX = $derived(
    Math.max(10, ...model.L.filter((w) => !view.hidden.has(w.id)).map((w) => w.km)),
  );

  const rosterCounts = $derived({
    total: model.L.length,
    vanilla: model.L.filter((w) => w.src === 'vanilla').length,
    vanillaTotal: buildRoster({ ...sim, roster: 'vanilla' }).L.length,
  });

  const hullWeapons = $derived(model.L.filter((w) => w.hull > 0));
  const shieldWeapons = $derived(model.L.filter((w) => w.shield > 0));

  // Keep the card pointed at something real — switching rosters can retire the
  // selected turret, and an empty card panel reads as a bug.
  $effect(() => {
    if (model.L.length && !model.L.some((w) => w.id === card.id)) {
      card.id = [...model.L].sort((a, b) => b.hull - a.hull)[0].id;
    }
  });

  let cardPanel;

  function selectTurret(id) {
    card.id = id;
    cardPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
</script>

<header class="flex flex-wrap items-baseline gap-4 border-b border-line bg-panel px-[22px] py-[18px]">
  <h1 class="m-0 text-[19px] font-bold uppercase tracking-[0.14em]">
    Avorion Turret <span class="text-hull">Lab</span>
  </h1>
  <p class="m-0 text-[11.5px] tracking-[0.04em] text-dim">
    effective DPS per slot &middot; HET + all {rosterCounts.vanillaTotal} vanilla weapon types, read from
    the game's own Lua &middot; all barrel assemblies counted &middot; max turret-factory investment
  </p>
</header>

<div class="mx-auto max-w-[1560px] px-[22px] pt-5 pb-10">
  <GlobalControls dist={model.dist} counts={rosterCounts} />
  <Readout {model} />
  <ModelNotice />

  <div class="grid grid-cols-1 gap-[22px] xl:grid-cols-2">
    {#snippet hullNote()}
      Full hull output once shields are down, all barrels counted. Weapons tagged
      <b class="text-ink">pierce</b> land that share of this damage on hull even while shields are
      still up. Hull damage is never reduced by enemy resistances — those live on the shield.
    {/snippet}
    <Card title="Against hull" accent="var(--color-hull)" note={hullNote} flag>
      <DpsChart
        axis="hull"
        datasets={hullData}
        {maxX}
        weapons={hullWeapons}
        hidden={view.hidden}
        metric={sim.metric}
        ontoggle={toggleHidden}
        onshow={showAll}
        onhide={hideAll}
        onisolate={isolate}
      />
    </Card>

    {#snippet shieldNote()}
      Weapons with a shield multiplier of zero are absent here — Flamethrower, Salvaging Laser and
      both Hammer Heads cannot damage shields at all. Only Physical, Plasma, Electric and AntiMatter
      can be resisted; Energy and Fragments always land in full.
    {/snippet}
    <Card title="Against shields" accent="var(--color-shield)" note={shieldNote} flag>
      <DpsChart
        axis="shield"
        datasets={shieldData}
        {maxX}
        weapons={shieldWeapons}
        hidden={view.hidden}
        metric={sim.metric}
        ontoggle={toggleHidden}
        onshow={showAll}
        onhide={hideAll}
        onisolate={isolate}
      />
    </Card>
  </div>

  <div class="mt-[22px]">
    <LoadoutSolver {model} />
  </div>

  <div class="mt-[22px]" bind:this={cardPanel}>
    <TurretCard {model} />
  </div>

  <TurretTable {model} onselect={selectTurret} />

  <SiteFooter />
</div>
