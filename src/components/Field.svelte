<script>
  /**
   * One labelled cell in a controls grid. The control itself is passed as
   * children, so the wrapping <label> gives it implicit association.
   */
  let { label, value = null, hint = null, children } = $props();
</script>

<label>
  <span class="hud-label">
    {label}
    {#if value !== null && value !== undefined}
      <span class="hud-value">{value}</span>
    {/if}
    {#if hint}
      <span class="text-[11.5px] tracking-[0.04em] text-dim">{hint}</span>
    {/if}
  </span>
  {@render children?.()}
</label>
