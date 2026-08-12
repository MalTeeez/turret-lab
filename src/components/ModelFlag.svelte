<script>
  /**
   * Marks a number as produced by this lab's formula rather than read off an in-game
   * card. See <ModelNotice> for the expanded explanation the dagger points at.
   */
  let { kind = 'model' } = $props();

  const NOTES = {
    model:
      'Model figure — reconstructed from turretgenerator.lua, summing every barrel assembly ' +
      "on a budget constant fitted to in-game cards (×0.4439). The base game's own card builds " +
      'most per-type eDPS lines from the first weapon only, so it will read differently — ' +
      'usually lower on multi-barrel turrets.',
    raw:
      'Raw DPS is the field that should agree with the in-game card, since it is not built ' +
      'per damage type.',
  };
</script>

<span
  class="cursor-help align-super text-[9px] {kind === 'raw' ? 'text-good' : 'text-warn'}"
  title={NOTES[kind]}>{kind === 'raw' ? '‡' : '†'}</span
>
