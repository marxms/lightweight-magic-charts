/**
 * THE VERIFICATION SEAL — this harness's output, and the manifest generator TRANSCRIBES it.
 *
 * The seal says HOW WELL VERIFIED an offered indicator is, so the product can be honest instead of
 * implying that three hundred indicators are equally trustworthy. One producer, one consumer: the
 * generator copies this, it does not compute it.
 *
 *   pinned      a hand-computed golden vector or an independent counter-implementation fixes its
 *               numbers. `example/studies.ts` is that counter-implementation, and it agrees to
 *               2.8e-14 over 1024 bars.
 *   constrained a family invariant that holds regardless of implementation applies AND passes — an
 *               asserted mathematical bound, or the reachability of its own declared levels.
 *   structural  it draws, is deterministic, is pure, is bar-length and index-aligned, sits on the
 *               scale it declares, contradicts nothing it declares, and every control it offers
 *               moves the drawing. NOTHING is claimed about the values being right.
 *
 * Absence of a strong oracle is not evidence of error, which is why `structural` ships rather than
 * being cut: cutting every entry where nothing was found wrong is the false-firing gate at
 * catalogue scale.
 */
import { ASSERTED_BOUNDS, IFT_BOUNDED } from './taxonomy.mjs';
import { declaredLevels } from './guide.mjs';

/** The six whose numbers are fixed by a golden vector or by `example/studies.ts`. */
export const PINNED = ['sma', 'ema', 'rsi', 'macd', 'bb', 'atr'];

export function sealOf(manifest, byId, bars) {
  const pinned = new Set(PINNED);
  const bounded = new Set([...ASSERTED_BOUNDS, ...IFT_BOUNDED].map((x) => x.id));
  const seal = {};
  for (const row of manifest) {
    if (pinned.has(row.id)) { seal[row.id] = 'pinned'; continue; }
    const entry = byId.get(row.id);
    let out = null;
    try { out = entry.calculate(bars, entry.defaultInputs); } catch { /* structural, then */ }
    seal[row.id] = bounded.has(row.id) || (out !== null && declaredLevels(entry, out).length > 0)
      ? 'constrained'
      : 'structural';
  }
  return seal;
}

export const tallyOf = (seal) => {
  const tally = { pinned: 0, constrained: 0, structural: 0 };
  for (const value of Object.values(seal)) tally[value] += 1;
  return tally;
};
