/**
 * Registered turrets — the ones you actually own.
 *
 * An entry points at a generated turret for its unlisted stats (damage type, cycle,
 * resistance shares) and overrides whatever you measured off the real card. In
 * inventory mode the solver draws only from these, capped at the count you hold.
 */

/** Stats you can override per entry. Blank means "use the generated value". */
export const OVERRIDABLE = [
  { key: 'slots', label: 'Slots', step: 1, min: 1, int: true },
  { key: 'km', label: 'Range (km)', step: 0.1, min: 0.1 },
  { key: 'hull', label: 'Hull DPS / slot', step: 1, min: 0 },
  { key: 'shield', label: 'Shield DPS / slot', step: 1, min: 0 },
  { key: 'pierce', label: 'Shield pierce (0–1)', step: 0.01, min: 0, max: 1 },
  { key: 'vel', label: 'Velocity (blank = beam)', step: 10, min: 0 },
  { key: 'duty', label: 'Duty cycle (0–1)', step: 0.01, min: 0.01, max: 1 },
];

const OVERRIDE_KEYS = OVERRIDABLE.map((o) => o.key);

let seq = 0;
/** Ids only need to be unique within a session's stored list. */
export const nextUid = (items = []) =>
  `t${Math.max(0, ...items.map((i) => +String(i.uid).slice(1) || 0)) + ++seq}`;

/**
 * `count: null` means you hold the blueprint — buildable without limit. A number caps
 * the solver at that many.
 */
export const isBlueprint = (item) => item?.count == null;

/** Owned count as a solver cap: Infinity for a blueprint. */
export const ownedCount = (item) =>
  isBlueprint(item) ? Infinity : Math.max(1, Math.floor(+item.count || 1));

export function newEntry(base, items = [], overrides = {}) {
  return {
    uid: nextUid(items),
    baseId: base.id,
    label: '',
    count: null,   // blueprint by default — having one usually means you can build more
    overrides: { ...overrides },
  };
}

/**
 * Overrides that reproduce a configured card view: everything the card's assumption toggles
 * (scale roll, heat roll, variation, investment, specialties) moved away from the generated
 * base is prefilled, so a registered turret starts as the variant on screen — a 4-slot scale
 * roll registers with 4 slots, not the full-tech count. Untouched stats stay blank and keep
 * following the generated value.
 */
export function overridesFromStats(base, s) {
  if (!base || !s) return {};
  const o = {};
  const differs = (a, b) => Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a));
  if (s.slots !== base.slots) o.slots = s.slots;
  if (differs(s.hullPS, base.hull)) o.hull = +s.hullPS.toFixed(2);
  if (differs(s.shPS, base.shield)) o.shield = +s.shPS.toFixed(2);
  if (differs(s.km, base.km)) o.km = +s.km.toFixed(2);
  if (s.vel != null && base.vel != null && differs(s.vel, base.vel)) o.vel = +s.vel.toFixed(2);
  if (differs(s.duty, base.duty)) o.duty = +s.duty.toFixed(4);
  return o;
}

/**
 * Turn a stored entry into a weapon object the charts, table and solver understand.
 * @returns {null|object} null when the base turret is not in the current roster
 */
export function materialise(item, L) {
  const base = L.find((w) => w.id === item.baseId);
  if (!base) return null;

  const w = {
    ...base,
    id: `inv:${item.uid}`,
    invUid: item.uid,
    baseId: item.baseId,
    baseName: base.name,
    name: item.label?.trim() || base.name,
    blueprint: isBlueprint(item),
    owned: ownedCount(item),
    maxQty: ownedCount(item),
    overridden: [],
  };

  for (const key of OVERRIDE_KEYS) {
    const v = item.overrides?.[key];
    if (v === undefined || v === null || v === '') continue;
    const n = +v;
    if (!Number.isFinite(n)) continue;
    w[key] = key === 'slots' ? Math.max(1, Math.round(n)) : n;
    w.overridden.push(key);
  }

  // `tot` is derived, so keep it consistent with whatever hull/slots ended up being.
  w.tot = w.hull * w.slots;
  return w;
}

/** The full inventory as weapon objects, dropping entries whose base has left the roster. */
export function materialiseAll(items, L) {
  return items.map((i) => materialise(i, L)).filter(Boolean);
}

/**
 * The catalogue with your registrations swapped in per type: every turret type you own
 * is represented by the copies you actually hold (capped, with your measured stats), and
 * every type you don't own stays a generated estimate. Registrations take the position of
 * the turret they replace, so the pool keeps catalogue order.
 */
export function mixedPool(items, L) {
  const byBase = new Map();
  for (const w of materialiseAll(items, L)) {
    const list = byBase.get(w.baseId);
    if (list) list.push(w);
    else byBase.set(w.baseId, [w]);
  }
  return byBase.size ? L.flatMap((w) => byBase.get(w.id) ?? [w]) : L.slice();
}

/** Entries whose base turret is missing from the current roster, so the UI can say so. */
export function orphaned(items, L) {
  return items.filter((i) => !L.some((w) => w.id === i.baseId));
}

const STORAGE_KEY = 'turret-lab.inventory.v1';

export function loadInventory() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Only keep the shape we expect — a stale or hand-edited blob should not break boot.
    return parsed
      .filter((i) => i && typeof i.baseId === 'string')
      .map((i) => ({
        uid: String(i.uid ?? nextUid(parsed)),
        baseId: i.baseId,
        label: typeof i.label === 'string' ? i.label : '',
        // null / missing / junk => blueprint (unlimited)
        count: i.count == null || !Number.isFinite(+i.count) ? null : Math.max(1, Math.floor(+i.count)),
        overrides: Object.fromEntries(
          OVERRIDE_KEYS.filter((k) => i.overrides?.[k] != null && i.overrides[k] !== '')
            .map((k) => [k, +i.overrides[k]]),
        ),
      }));
  } catch {
    return [];
  }
}

export function saveInventory(items) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* private browsing / quota — the inventory just won't persist */
  }
}
