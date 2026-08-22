/**
 * THE SHAPE OF THE COMMITTED CATALOGUE, and the three measurements that give it teeth.
 *
 * Written once and imported by both sides on purpose: `scripts/build-indicator-manifest.mjs`
 * PRODUCES the manifest and `scripts/indicator-proof.mjs` RE-DERIVES it. If the two computed a
 * digest, a settle window or a version pin by their own code, a difference between them would read
 * as a vendor change, and the check would be measuring itself.
 */
import { createHash } from 'node:crypto';

export const MANIFEST_PATHS = {
  manifest: 'example/indicators/manifest.json',
  fingerprints: 'example/indicators/fingerprints.json',
  renames: 'example/indicators/renames.json',
  valueChanges: 'example/indicators/value-changes.json',
};

/** `onPriceScale`, `src/indicator/availability.ts:57-68`, with `CALIBRATED_PRICE_NEIGHBOURHOOD`. */
export const PRICE_NEIGHBOURHOOD = 3;

/** Three prefixes of the fixture. One cut answers about one boundary; three answer about a rule. */
export const SETTLE_CUTS = [0.6, 0.75, 0.9];

/**
 * BOUNDS THE HOST DECLARES BECAUSE THE VENDOR DOES NOT — ADAPT-08, "bound it or do not offer it".
 *
 * A persisted value re-applies on every load, so a control that accepts a value costing a second is
 * a tab that never comes back. Each entry carries the measurement that set it.
 */
export const HOST_BOUNDS = {
  'supertrend-ai-clustering.maxFactor': {
    max: 100,
    why: 'declares min 0 and NO maximum, and its cost grows with the value: measured 9 ms at its default of 5, 33 ms at 100, and 20,276 ms at 100,000 over 1024 bars — with the value persisted, so the tab does not come back. 100 is twenty times the default and thirty times under the one-second budget',
  },
};

/** The definitional exclusions, each carried out of the defect ledger with its own measurement. */
export const EXCLUSION_MEASUREMENTS = (defects) =>
  defects
    .filter((d) => d.excludes)
    .map((d) => ({ id: d.id, class: d.class, measurement: d.detail }))
    .filter((row, at, all) => all.findIndex((x) => x.id === row.id) === at)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

/**
 * HOW WIDE THE HOST'S DRAWING RESOURCE HAS TO BE, DERIVED FROM THE ROWS THE GENERATOR WRITES.
 *
 * Nothing in the library adds a series to the price pane, and a lane's slots are created once at
 * mount, so the two widths are the host's to declare and a hand-typed number is the defect: with one
 * over-price slot per lane, a five-plot Ichimoku resolved five lines, filed five readings and drew
 * ONE. Derived from `plotIds` — the rows written under it — the number cannot fall behind the
 * catalogue it sizes, and it is DECLARED rather than observed because `alive` is a function of the
 * window: `auto-support` is 24 of 56 at 240 bars and 40 of 56 at 1024.
 */
export const widthsOf = (indicators) => {
  const widest = (placement) =>
    indicators
      .filter((row) => row.placement === placement)
      .reduce((most, row) => Math.max(most, row.plotIds.length), 0);
  return { overPrice: widest('over-price'), ownPane: widest('own-pane') };
};

/**
 * The vendor pin, read out of `package.json` and REFUSED unless it is exact.
 *
 * Same doctrine `size-budget.json` applies to esbuild: a reference that moves on its own turns a
 * gate into noise, because a failure stops meaning "regression" and starts meaning "dependency
 * update".
 */
export function vendorPin(packageJson) {
  const pin = (name) => {
    const declared = packageJson.devDependencies?.[name];
    if (typeof declared !== 'string' || !/^\d+\.\d+\.\d+$/.test(declared)) {
      throw new Error(`${name} must be pinned EXACTLY in devDependencies, not as ${JSON.stringify(declared)}`);
    }
    return declared;
  };
  return {
    name: 'lightweight-charts-indicators',
    version: pin('lightweight-charts-indicators'),
    peer: { name: 'oakscriptjs', version: pin('oakscriptjs') },
    why: 'EXACTLY, never a range. Every digest below is a number this exact build produced; a range would let the numbers move while the check stayed green, which is the failure this file exists to prevent. Both are devDependencies: `packaging.spec.ts` forbids declaring them as dependencies and `test/boundary.spec.ts` forbids importing either from `src/`.',
  };
}

/**
 * THE DIGEST IS OVER VALUES, not over names and shapes.
 *
 * Only finite readings are digested, and each is keyed by plot and index, so a value moving, a
 * warm-up getting longer, or a plot losing its readings all change the digest — while a title
 * being reworded does not, because a title is not arithmetic.
 */
export function digestOf(entry, plotIds, bars) {
  let result;
  try { result = entry.calculate(bars, entry.defaultInputs); } catch { return 'threw'; }
  const hash = createHash('sha256');
  for (const key of plotIds) {
    for (const [index, point] of (result.plots?.[key] ?? []).entries()) {
      if (Number.isFinite(point?.value)) hash.update(`${key}:${index}:${point.value}\n`);
    }
  }
  return hash.digest('hex');
}

/**
 * HOW MUCH HISTORY AN INDICATOR RESTATES — published as data instead of used as an exclusion.
 *
 * `causal` says an entry disagrees with itself; it does not say by how much history, and that
 * distinction is the whole question for a chart. A disagreement confined to the last bar is an
 * incomplete-bar adjustment. One bounded by a fixed lookback is RETROACTIVE CONFIRMATION — which is
 * what a pivot IS. One reaching arbitrarily far back rewrites history, and that is the harmful kind.
 * Measured over three prefixes so the answer is a rule and not one boundary: 0 for 313 of the 320
 * offered, and at most 28 bars for the seven that do restate.
 */
export function settleWithinBars(entry, plotIds, bars) {
  let deepest = 0;
  for (const fraction of SETTLE_CUTS) {
    const cut = Math.floor(bars.length * fraction);
    let whole;
    let prefix;
    try {
      whole = entry.calculate(bars, entry.defaultInputs);
      prefix = entry.calculate(bars.slice(0, cut), entry.defaultInputs);
    } catch { continue; }
    for (const key of plotIds) {
      const a = whole.plots?.[key] ?? [];
      const b = prefix.plots?.[key] ?? [];
      for (let i = 0; i < cut; i += 1) {
        const x = a[i]?.value;
        const y = b[i]?.value;
        const differ = Number.isFinite(x) !== Number.isFinite(y)
          || (Number.isFinite(x) && Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(x)));
        if (differ) deepest = Math.max(deepest, cut - 1 - i);
      }
    }
  }
  return deepest;
}
