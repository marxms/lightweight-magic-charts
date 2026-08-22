/**
 * ONE DEFINITION OF "THE DRAWING", imported by the generator and by the proof alike.
 *
 * WHY IT IS A MODULE AND NOT A PARAGRAPH IN EACH. The generator decides which controls to offer and
 * the proof decides whether offering them was right. If those two answer the question differently,
 * the generator ships controls the proof condemns, or — far worse — the proof clears controls the
 * user cannot reach. Measured, on the first pass of exactly that split: `obv.maType`,
 * `obv.maLength`, `obv.bbMult`, `rci.bbMult`, `rvol.bbMult` and `ultimate-rsi.osValue` read as
 * live under a predicate that counted EVERY plot the vendor returns, and read as correctly held
 * back under the one below. They move `obv.plot1`, `rci.plot2`, `rvol.plot2` and
 * `ultimate-rsi.plot_dn` — every one of them a plot the vendor itself declares hidden.
 *
 * THE DRAWING IS:
 *   - the plots the MANIFEST PROMISES, which is what `resolveSources` turns into series, and
 *   - the GUIDE, one horizontal level the lane marks, recomputed by the adapter from the live
 *     result — so a control that moves the guide moves what a user sees while moving no series.
 *
 * THE DRAWING IS NOT:
 *   - a plot the vendor hides (`display: 'none'`, or `lineWidth: 0`, which is how it states a
 *     LEVEL): this package draws `SeriesSpec`s, and a hidden plot is not one
 *   - `extraLevels`: forty entries carry levels the lane cannot mark, so moving one changes nothing
 *   - a per-point colour: `SeriesSpec.color` is required and host-supplied
 *   - `markers`, `boxes`, `barColors`, `fills` and the nine other channels the vendor returns:
 *     `SeriesSpec.shape` is `'line' | 'histogram' | 'area'` and nothing else is rendered here
 *
 * The contrast that makes the line checkable: `sma.maLength` moves `sma.plot1`, which the manifest
 * promises, so it IS the drawing and `sma` offers the control. `obv.maLength` moves `obv.plot1`,
 * which the vendor hides, so it is not, and `obv` offers nothing.
 */
import { candidatesFor, diffResults } from './sensor.mjs';
import { guideFor } from './guide.mjs';

/** NaN is the vendor's warm-up marker and `NaN !== NaN`, so equality is stated rather than assumed. */
const sameNumber = (a, b) =>
  typeof a === 'number' && typeof b === 'number'
    ? (Number.isFinite(a) || Number.isFinite(b) ? a === b : true)
    : a === b;

/** The plots this host would draw for an entry the manifest does not carry: the ones it does not hide. */
export const drawablePlotIds = (entry) =>
  (entry.plotConfig ?? [])
    .filter((p) => p.display !== 'none' && p.lineWidth !== 0)
    .map((p) => p.id);

/** Did any promised plot move between two results? Returns where, or `null`. */
export function movedSeries(before, after, plotIds) {
  for (const key of plotIds) {
    const a = before.plots?.[key] ?? [];
    const b = after.plots?.[key] ?? [];
    if (a.length !== b.length) return `${key}: length ${a.length} -> ${b.length}`;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameNumber(a[i]?.value, b[i]?.value)) return `${key}[${i}] ${a[i]?.value} -> ${b[i]?.value}`;
    }
  }
  return null;
}

/** Every gate a control can be hiding behind: a boolean, or a string with a declared domain. */
const gatesOf = (entry, control) =>
  (entry.inputConfig ?? []).filter(
    (i) => i.id !== control.id && (i.type === 'bool' || (i.type === 'string' && Array.isArray(i.options))),
  );

/**
 * Does any legal value of this control move a PROMISED plot or the GUIDE, on any of these series?
 *
 * The gate pass is not optional. `sma.maLength` and `sma.bbMult` move nothing when perturbed one at
 * a time — they sit behind `maType: 'None'` — and a one-at-a-time sensor would have written 58 such
 * controls off as dead. Returns the evidence, or `null`.
 */
export function movesTheDrawing(entry, control, plotIds, fixtures, { gated = true } = {}) {
  const gates = gated ? [null, ...gatesOf(entry, control)] : [null];
  for (const bars of fixtures) {
    for (const gate of gates) {
      const settings = gate === null ? [undefined] : [entry.defaultInputs[gate.id], ...candidatesFor(gate).slice(0, 4)];
      for (const value of settings) {
        const base = gate === null ? { ...entry.defaultInputs } : { ...entry.defaultInputs, [gate.id]: value };
        let before;
        try { before = entry.calculate(bars, base); } catch { continue; }
        const level = guideFor(entry, before);
        for (const candidate of candidatesFor(control)) {
          let after;
          try { after = entry.calculate(bars, { ...base, [control.id]: candidate }); } catch { continue; }
          const where = movedSeries(before, after, plotIds);
          if (where !== null) return { how: `a drawn series (${where})`, gate: gate?.id ?? null, gateValue: value, candidate };
          const moved = guideFor(entry, after);
          if (moved !== level) return { how: `the guide (${level} -> ${moved})`, gate: gate?.id ?? null, gateValue: value, candidate };
        }
      }
    }
  }
  return null;
}

/**
 * What a control moves that this host does NOT draw — the sentence a held-back control needs, so
 * "held back" and "forgotten" stop looking the same. Returns a description, or `null` for a control
 * that moves nothing at all, which is the inert ledger's business and not this one's.
 */
export function movesSomethingUndrawn(entry, control, plotIds, bars) {
  // THE GATE PASS RUNS HERE TOO. Without it `obv.maLength` reads as moving nothing at all — it sits
  // behind `maType: 'None'` — and a control that moves nothing belongs in the inert ledger, which
  // would then be a lie about it. It moves `obv.plot1` the moment the smoothing is switched on;
  // that plot is simply one the vendor hides, and hiding it is the reason the control is held back.
  let found = null;
  for (const gate of [null, ...gatesOf(entry, control)]) {
    const settings = gate === null ? [undefined] : [entry.defaultInputs[gate.id], ...candidatesFor(gate).slice(0, 4)];
    for (const value of settings) {
      const base = gate === null ? { ...entry.defaultInputs } : { ...entry.defaultInputs, [gate.id]: value };
      let before;
      try { before = entry.calculate(bars, base); } catch { continue; }
      const hidden = Object.keys(before.plots ?? {}).filter((k) => !plotIds.includes(k));
      for (const candidate of candidatesFor(control)) {
        let after;
        try { after = entry.calculate(bars, { ...base, [control.id]: candidate }); } catch { continue; }
        const movedHidden = movedSeries(before, after, hidden);
        if (movedHidden !== null) return `a plot the vendor declares hidden (${movedHidden.split('[')[0]})`;
        const diff = diffResults(before, after);
        if (found === null && diff.colour) found = 'a per-point colour, which is the host’s and not the vendor’s';
        if (found === null && diff.other) found = `the ${diff.other} channel, which this package does not render`;
      }
    }
  }
  return found;
}
