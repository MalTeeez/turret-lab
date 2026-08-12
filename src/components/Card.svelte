<script>
  import ModelFlag from './ModelFlag.svelte';

  /** A titled HUD panel. `accent` colours the heading; `flag` marks it as model output. */
  let {
    title, accent = 'var(--color-ink)', note = null, flag = false, class: klass = '', children,
  } = $props();
</script>

<section class="hud-panel px-4 pt-3.5 pb-4 {klass}">
  <h2 class="m-0 text-[13px] uppercase tracking-[0.16em]" style:color={accent}>
    {title}{#if flag}<ModelFlag />{/if}
  </h2>
  {#if note}
    <p class="hud-note mt-0.5">{@render note()}</p>
  {/if}
  {@render children?.()}
</section>
