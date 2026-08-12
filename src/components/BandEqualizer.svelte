<script>
  /**
   * Range-importance curve — a polyline whose control points are draggable, one per
   * sampling distance. The x axis is square-root scaled, so close quarters get most of
   * the width and long-range bands compress toward the right.
   *
   * Grab a point to move just that one; drag from empty canvas to sweep across several.
   * Arrow keys nudge a focused point.
   */
  import { bandPos } from '../lib/model.js';

  let { kms, weights, maxKm, onchange } = $props();

  const MAXW = 100;
  const H = 150;            // plot height in px
  const PAD = { t: 10, r: 12, b: 22, l: 12 };
  const HULL = [255, 138, 61];   // close range
  const SHIELD = [79, 195, 247]; // long range

  let box = $state(0);      // measured width
  const W = $derived(Math.max(240, box));
  const plotW = $derived(W - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;

  let svg;
  let drag = $state(null);  // { index | null } — null index means sweep to nearest

  const x = (i) => PAD.l + bandPos(kms[i], maxKm) * plotW;
  const y = (w) => PAD.t + (1 - w / MAXW) * plotH;

  function pointColor(i) {
    const t = kms.length > 1 ? bandPos(kms[i], maxKm) : 0;
    const c = HULL.map((h, k) => Math.round(h + (SHIELD[k] - h) * t));
    return `rgb(${c.join(',')})`;
  }

  const line = $derived(weights.map((w, i) => `${x(i)},${y(w)}`).join(' '));
  const area = $derived(
    `${PAD.l},${y(0)} ${line} ${PAD.l + plotW},${y(0)}`,
  );

  function set(i, w) {
    const next = Math.max(0, Math.min(MAXW, Math.round(w)));
    if (weights[i] === next) return;
    weights[i] = next;
    onchange?.();
  }

  /** Nearest control point to a client x coordinate. */
  function nearest(clientX) {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < kms.length; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function weightAt(clientY) {
    const rect = svg.getBoundingClientRect();
    const py = ((clientY - rect.top) / rect.height) * H;
    return (1 - (py - PAD.t) / plotH) * MAXW;
  }

  function down(e, index) {
    e.preventDefault();
    drag = { index };
    set(index ?? nearest(e.clientX), weightAt(e.clientY));
  }

  function move(e) {
    if (!drag) return;
    set(drag.index ?? nearest(e.clientX), weightAt(e.clientY));
  }

  function key(e, i) {
    const step = e.shiftKey ? 1 : 5;
    const map = {
      ArrowUp: () => set(i, weights[i] + step),
      ArrowRight: () => set(i, weights[i] + step),
      ArrowDown: () => set(i, weights[i] - step),
      ArrowLeft: () => set(i, weights[i] - step),
      PageUp: () => set(i, weights[i] + 20),
      PageDown: () => set(i, weights[i] - 20),
      Home: () => set(i, 0),
      End: () => set(i, MAXW),
    };
    if (!map[e.key]) return;
    e.preventDefault();
    map[e.key]();
  }

  /** Thin out x labels so the compressed tail does not collide. */
  const labelled = $derived.by(() => {
    const out = [];
    let lastX = -Infinity;
    for (let i = 0; i < kms.length; i++) {
      if (x(i) - lastX < 34) continue;
      out.push(i);
      lastX = x(i);
    }
    if (out[out.length - 1] !== kms.length - 1) {
      if (x(kms.length - 1) - lastX < 24) out.pop();
      out.push(kms.length - 1);
    }
    return out;
  });
</script>

<svelte:window
  onpointermove={move}
  onpointerup={() => (drag = null)}
  onpointercancel={() => (drag = null)}
/>

<div class="select-none" bind:clientWidth={box}>
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {H}"
    width="100%"
    height={H}
    class="block border border-line bg-panel2 {drag ? 'cursor-grabbing' : 'cursor-crosshair'}"
    role="group"
    aria-label="Range importance curve"
    onpointerdown={(e) => down(e, null)}
  >
    <defs>
      <linearGradient id="bandFill" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="rgb(255,138,61)" stop-opacity="0.30" />
        <stop offset="100%" stop-color="rgb(79,195,247)" stop-opacity="0.30" />
      </linearGradient>
      <linearGradient id="bandStroke" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="rgb(255,138,61)" />
        <stop offset="100%" stop-color="rgb(79,195,247)" />
      </linearGradient>
    </defs>

    <!-- horizontal guides at 25 / 50 / 75 / 100% -->
    {#each [0, 0.25, 0.5, 0.75, 1] as g (g)}
      <line
        x1={PAD.l} x2={PAD.l + plotW} y1={y(g * MAXW)} y2={y(g * MAXW)}
        stroke="var(--color-line)" stroke-width="1" opacity={g === 0 ? 1 : 0.55}
      />
    {/each}

    <!-- one tick per band, so the compressed spacing is visible -->
    {#each kms as km, i (km)}
      <line
        x1={x(i)} x2={x(i)} y1={PAD.t} y2={PAD.t + plotH}
        stroke="var(--color-line)" stroke-width="1"
        opacity={weights[i] > 0 ? 0.8 : 0.35}
      />
    {/each}

    <polygon points={area} fill="url(#bandFill)" />
    <polyline points={line} fill="none" stroke="url(#bandStroke)" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" />

    {#each kms as km, i (km)}
      <circle
        cx={x(i)} cy={y(weights[i])} r={drag?.index === i ? 7 : 5}
        fill={weights[i] > 0 ? pointColor(i) : 'var(--color-panel)'}
        stroke={pointColor(i)} stroke-width="2"
        class="cursor-ns-resize focus:outline-none [&:focus-visible]:stroke-hull"
        role="slider"
        tabindex="0"
        aria-label="Importance at {km} km"
        aria-valuemin="0"
        aria-valuemax={MAXW}
        aria-valuenow={weights[i]}
        aria-valuetext="{weights[i]}%"
        onpointerdown={(e) => {
          e.stopPropagation();
          down(e, i);
        }}
        onkeydown={(e) => key(e, i)}
      />
    {/each}

    {#each labelled as i (i)}
      <text
        x={x(i)} y={H - 7} text-anchor="middle"
        font-size="9.5" font-family="var(--font-mono)"
        fill={weights[i] > 0 ? 'var(--color-ink)' : 'var(--color-dim)'}
      >{kms[i]}</text>
    {/each}
  </svg>

  <div class="mt-1 flex justify-between text-[9.5px] uppercase tracking-[0.13em] text-dim">
    <span>engagement range (km) — compressed at long range</span>
    <span>reaches {maxKm.toFixed(1)} km, the roster's longest weapon</span>
  </div>
</div>
