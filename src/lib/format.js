/** Rounded integer with thousands separators — the app's default number style. */
export const n0 = (v) => Math.round(v).toLocaleString();

/** A multiplier rendered as a signed percentage delta, e.g. 1.25 -> "+25%". */
export const pct = (x) => (x >= 1 ? '+' + Math.round((x - 1) * 100) : Math.round((x - 1) * 100)) + '%';

/**
 * A cost block as clipboard text: two tab-separated columns (amount, then item), one
 * heading line, plain ASCII, raw integers — pastes into Excel as numbers in any locale
 * and still reads fine in chat.
 *
 * @param {{credits:number, tax:number, goodsPrice:number, total:number,
 *          goods?:Array<{name,amount}>, rows?:Array<{name,amount}>}} cost
 *        a `factoryCost` (per-turret `rows`) or `loadoutCost` (merged `goods`) result
 * @param {{heading:string, ownFaction?:boolean, techCapped?:boolean, unpriced?:string[]}} ctx
 */
export function costClipboard(cost, { heading, ownFaction = false, techCapped = false, unpriced = [] }) {
  const lines = [heading];
  for (const g of cost.goods ?? cost.rows ?? []) lines.push(`${Math.round(g.amount)}\t${g.name}`);
  lines.push(`${Math.round(cost.credits)}\tCredits`);
  lines.push(ownFaction ? '0\tTax (own faction)' : `${Math.round(cost.tax)}\tTax 20%`);
  lines.push(`${Math.round(cost.goodsPrice)}\tGoods worth`);
  lines.push(`${Math.round(cost.total)}\tTotal`);
  if (techCapped) lines.push('Tech above the factory cap - cannot be built');
  if (unpriced.length) lines.push(`No recipe: ${unpriced.join(', ')} - excluded from the total`);
  return lines.join('\n');
}
