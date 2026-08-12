/** Rounded integer with thousands separators — the app's default number style. */
export const n0 = (v) => Math.round(v).toLocaleString();

/** A multiplier rendered as a signed percentage delta, e.g. 1.25 -> "+25%". */
export const pct = (x) => (x >= 1 ? '+' + Math.round((x - 1) * 100) : Math.round((x - 1) * 100)) + '%';
