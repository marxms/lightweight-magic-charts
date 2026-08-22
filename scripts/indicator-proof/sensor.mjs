/**
 * THE PARAMETERISATION SENSOR.
 *
 * For every indicator and every input it declares, compute with `defaultInputs`, then again with
 * that ONE input moved to another LEGAL value, and ask whether any plot changed at any index.
 *
 * An input is INERT only when NO legal alternative changes any plotted value, on EITHER fixture.
 * That definition is deliberately hard to satisfy: a single changed reading anywhere clears it.
 */
import { SOURCE_TYPES } from './bars.mjs';

/** NaN is the vendor's warm-up marker and `NaN !== NaN`, so equality is defined explicitly. */
const sameNumber = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') {
    return (Number.isFinite(a) || Number.isFinite(b)) ? a === b : true; // both non-finite == equal
  }
  return a === b;
};

/** Legal alternatives for one input, respecting `min`/`max`/`step`/`options`. */
export function candidatesFor(input) {
  const d = input.defval;
  const min = typeof input.min === 'number' ? input.min : -Infinity;
  const max = typeof input.max === 'number' ? input.max : Infinity;
  const legal = (v) => v >= min && v <= max && !sameNumber(v, d);

  switch (input.type) {
    case 'bool':
      return [typeof d === 'boolean' ? !d : true];
    case 'source':
      return SOURCE_TYPES.filter((s) => s !== d); // the 8 values live only in the types
    case 'string':
      if (Array.isArray(input.options)) return input.options.filter((o) => o !== d);
      if (typeof d === 'string' && /^#[0-9a-f]{3,8}$/i.test(d)) return ['#FF00FF'];
      return typeof d === 'string' ? [`${d}~alt`] : []; // no declared domain — flagged, not trusted
    case 'color':
      return [String(d) === '#FF00FF' ? '#00FF00' : '#FF00FF'];
    case 'int': {
      const base = typeof d === 'number' ? d : 0;
      // Prefer moves that are large relative to the default but still inside the series length,
      // then fall back to the smallest legal nudge, then to the declared bounds.
      const raw = [base * 2, base + 10, base + 1, base - 1, Math.round(base / 2), base + 5, base - 5, 1, 0];
      const out = [];
      for (const v of raw) if (Number.isFinite(v) && legal(Math.round(v)) && !out.includes(Math.round(v))) out.push(Math.round(v));
      if (Number.isFinite(min) && legal(min) && !out.includes(min)) out.push(min);
      if (Number.isFinite(max) && max <= 2000 && legal(max) && !out.includes(max)) out.push(max);
      return out.slice(0, 6);
    }
    case 'float': {
      const base = typeof d === 'number' ? d : 0;
      const step = typeof input.step === 'number' && input.step > 0 ? input.step : 0;
      const snap = (v) => (step ? Math.round(v / step) * step : v);
      const raw = [base * 2, base + 1, base * 0.5, base + 0.5, base - 0.5, base + (step || 0.1), 0.5, 0];
      const out = [];
      for (const v of raw) {
        const s = snap(v);
        if (Number.isFinite(s) && legal(s) && !out.some((o) => sameNumber(o, s))) out.push(s);
      }
      if (Number.isFinite(min) && legal(snap(min)) && !out.some((o) => sameNumber(o, snap(min)))) out.push(snap(min));
      if (Number.isFinite(max) && max <= 2000 && legal(snap(max)) && !out.some((o) => sameNumber(o, snap(max)))) out.push(snap(max));
      return out.slice(0, 6);
    }
    default:
      return [];
  }
}

/** What changed between two vendor results — split so a colour-only change is not read as a value. */
const NORM_CACHE = new WeakMap();
/** The non-plot channels of a result, normalised once. The base result is compared against many
 *  probes, and re-stringifying it every time was 68 of the census's 88 seconds. */
function channelNorms(r) {
  if (!r || typeof r !== 'object') return {};
  const hit = NORM_CACHE.get(r);
  if (hit) return hit;
  const out = {};
  for (const k of Object.keys(r)) {
    if (k === 'plots') continue;
    out[k] = JSON.stringify(r[k], (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? '~nf~' : x));
  }
  NORM_CACHE.set(r, out);
  return out;
}

export function diffResults(a, b) {
  const out = { value: null, colour: null, other: null };
  const ka = Object.keys(a?.plots ?? {});
  const kb = Object.keys(b?.plots ?? {});
  if (ka.length !== kb.length || ka.some((k) => !kb.includes(k))) {
    out.value = `plot key set changed: [${ka}] -> [${kb}]`;
    return out;
  }
  for (const key of ka) {
    const pa = a.plots[key] ?? [], pb = b.plots[key] ?? [];
    if (pa.length !== pb.length) { out.value = `${key}: length ${pa.length} -> ${pb.length}`; return out; }
    for (let i = 0; i < pa.length; i += 1) {
      if (!out.value && !sameNumber(pa[i]?.value, pb[i]?.value)) {
        out.value = `${key}[${i}] ${pa[i]?.value} -> ${pb[i]?.value}`;
      }
      if (!out.colour && pa[i]?.color !== pb[i]?.color) {
        out.colour = `${key}[${i}] colour ${pa[i]?.color} -> ${pb[i]?.color}`;
      }
      if (out.value && out.colour) break;
    }
    if (out.value) break;
  }
  if (!out.value && !out.colour) {
    // EVERY channel the vendor returns, discovered rather than listed: `fills`, `markers`, `hlines`,
    // `bgColors`, `barColors`, `lines`, `labels`, `plotCandles`, `boxes`, `tables`, `pivots`,
    // `extension`. A hard-coded list missed `barColors` and mis-cased `bgColors`, and that turned
    // real changes into false inertia. Comparing the key union cannot miss a channel again.
    const na = channelNorms(a), nb = channelNorms(b);
    for (const side of new Set([...Object.keys(na), ...Object.keys(nb)])) {
      if (na[side] !== nb[side]) { out.other = side; break; }
    }
  }
  return out;
}

/** One indicator, one fixture: the verdict for every input it declares. */
export function senseIndicator(entry, bars) {
  let base;
  try { base = entry.calculate(bars, entry.defaultInputs); }
  catch (error) { return { threw: `baseline: ${error?.message ?? error}`, inputs: [] }; }
  const plotKeys = Object.keys(base?.plots ?? {});
  const inputs = [];
  for (const input of entry.inputConfig ?? []) {
    const cands = candidatesFor(input);
    const verdict = {
      id: input.id, type: input.type, defval: input.defval, tried: cands.length,
      value: null, colour: null, other: null, threw: null,
      weakDomain: input.type === 'string' && !Array.isArray(input.options),
    };
    for (const cand of cands) {
      let probe;
      try { probe = entry.calculate(bars, { ...entry.defaultInputs, [input.id]: cand }); }
      catch (error) { verdict.threw ??= `${JSON.stringify(cand)}: ${error?.message ?? error}`; continue; }
      const d = diffResults(base, probe);
      if (d.value && !verdict.value) verdict.value = { cand, where: d.value };
      if (d.colour && !verdict.colour) verdict.colour = { cand, where: d.colour };
      if (d.other && !verdict.other) verdict.other = { cand, where: d.other };
      if (verdict.value) break; // a changed reading settles it
    }
    inputs.push(verdict);
  }
  return { threw: null, plotKeys, inputs };
}
