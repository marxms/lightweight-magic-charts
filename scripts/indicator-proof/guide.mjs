/**
 * THE GUIDE, reimplemented here from the adapter's stated rule rather than imported, so the
 * verifier and the thing it verifies do not share a bug.
 *
 * WHY IT BELONGS IN THE SENSOR. `SeriesSpec` draws lines, and `guide?` draws ONE more: a horizontal
 * level the lane marks. In the adapter the guide is a GETTER recomputed from the live result, so a
 * control that moves a level DOES move what the user sees, even though it moves no plotted value.
 * The first version of this verifier counted only plotted values and therefore called such controls
 * dead — the same class of error this document has already made twice with family matchers.
 *
 * `extraLevels` are NOT part of the drawing: the adapter measured that 40 entries carry levels
 * "the lane cannot mark". Moving a level that is not the guide changes nothing on screen.
 */
const isNum = (v) => Number.isFinite(v);

/** Levels come from three places, all measured: `hlineConfig` (35), result `hlines` (97), and
 *  HIDDEN CONSTANT PLOTS — RSI returns no `hlines` at all and states its bands as `display:'none'`
 *  plots holding one value. */
export function declaredLevels(entry, result) {
  const levels = new Set();
  for (const h of entry.hlineConfig ?? []) if (isNum(h.price)) levels.add(h.price);
  for (const h of result?.hlines ?? []) { const v = h?.value ?? h?.price; if (isNum(v)) levels.add(v); }
  for (const cfg of entry.plotConfig ?? []) {
    if (cfg.display !== 'none' && cfg.lineWidth !== 0) continue;
    const vals = (result?.plots?.[cfg.id] ?? []).map((p) => p?.value).filter(isNum);
    if (vals.length && vals.every((x) => Math.abs(x - vals[0]) <= 1e-12 * Math.max(1, Math.abs(vals[0])))) levels.add(vals[0]);
  }
  return [...levels];
}

/** "The declared level nearest the midpoint of the declared set." 30/50/70 -> 50; -100/0/100 -> 0. */
export function guideOf(levels) {
  if (!levels.length) return undefined;
  const mid = (Math.min(...levels) + Math.max(...levels)) / 2;
  return levels.reduce((best, l) => (Math.abs(l - mid) < Math.abs(best - mid) ? l : best));
}

export const guideFor = (entry, result) => guideOf(declaredLevels(entry, result));
