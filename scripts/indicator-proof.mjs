#!/usr/bin/env node
/**
 * THE INDICATOR PROOF — and it answers the two halves of the acceptance condition unequally.
 *
 * The condition was "test every indicator and make sure they respect the parameterisations and that
 * they are correctly calculated". THE FIRST HALF IS PROVEN EXHAUSTIVELY. THE SECOND IS PROVEN AT A
 * TIER, and the tier is published per indicator rather than averaged into a claim.
 *
 * ── WHAT IT PROVES, EXACTLY ────────────────────────────────────────────────────────────────────
 *
 * PARAMETERISATION, exhaustive: 320 offered indicators, 1021 offered controls, every one of them
 * demonstrably moving the drawing — and every control HELD BACK sitting in an exact-set ledger with
 * a written reason (46 inert, 2 colour, 120 moving only a channel this package cannot draw). Both
 * directions are asserted, so the ledger cannot be padded or thinned unnoticed.
 *
 * VENDOR DRIFT, exhaustive: 320 digests of computed values, re-derived and compared, with a moved
 * digest refused outright unless `example/indicators/value-changes.json` declares it.
 *
 * NUMERIC CORRECTNESS, tiered and NOT uniform: 6 pinned against hand-computed golden vectors, 6
 * series cross-checked against this repository's own `example/studies.ts` to ~1e-13, 111 holding a
 * family invariant that does not depend on the implementation, and 203 `structural` — they draw,
 * are deterministic, pure, aligned and on the scale they declare, and nothing is claimed about
 * their values. `seal.every-offered-indicator-carries-a-tier` prints that tally on every run for
 * exactly this reason. Uniform numeric verification of 320 indicators needs an independent oracle
 * per family; it is not this script, and this script does not imply it.
 *
 * ── WHAT IT IS, AND WHAT IT IS NOT ─────────────────────────────────────────────────────────────
 *
 * IT VERIFIES THE MANIFEST. IT DOES NOT DECIDE WHAT IS OFFERED. An earlier draft ran a curation
 * funnel of its own, in parallel with the host's manifest, and that is two sources of truth about
 * "what the product offers" — which diverge on the first release. The manifest is the artefact that
 * gets committed and that a visitor sees; this says whether what it offers holds up. Same doctrine
 * this repository already applies to every declared-exception ledger: do not exclude by a rule you
 * cannot defend, and never keep a wrong rule alive with a per-case exception list.
 *
 * IT IS NOT `npm test`, AND IT RUNS IN ITS OWN CI JOB. It loads a 1.05 MB third-party library and
 * computes three hundred indicators over 1664 bars: roughly half a minute, against `npm test`'s
 * fifteen seconds over three Node versions. `scripts/e2e-demo.mjs` already established the shape —
 * one job, one Node version, a `check()` helper, PASS/FAIL lines and an exit code.
 *
 * IT MAY NOT BE IMPORTED FROM `src/`. `test/boundary.spec.ts` bans both vendor names inside the
 * package, statically and dynamically, and that ban is the reason this feature exists at all. This
 * script lives in `scripts/`, the library is a devDependency, and nothing published imports it.
 *
 * ── WHY A NULL RESULT HERE MEANS SOMETHING ─────────────────────────────────────────────────────
 *
 * An input that changes nothing may be an inert input — or an unexercised one. A constant series, a
 * series with no volume, a series shorter than the window, or one where `hl2` happens to equal
 * `close` manufactures false inertia in bulk. So every property the sensor depends on is ASSERTED
 * before anything is measured, and the assertion is printed. And the whole sensor is held to a
 * positive control: `sma.offset` and `bb.offset` are known inert, proven from the vendor's own
 * source, and a run that does not catch them exits non-zero without measuring anything else.
 *
 * Usage:  npm run proof
 * Exit 0 means every check passed. Anything else names the indicator, the rule and the measurement.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { indicatorRegistry as registry } from 'lightweight-charts-indicators';

import { FIXTURE_A, FIXTURE_B, describeFixture } from './indicator-proof/bars.mjs';
import { candidatesFor, diffResults, senseIndicator } from './indicator-proof/sensor.mjs';
import { guideFor } from './indicator-proof/guide.mjs';
import { drawablePlotIds, movesSomethingUndrawn, movesTheDrawing } from './indicator-proof/drawing.mjs';
import { ASSERTED_BOUNDS, IFT_BOUNDED } from './indicator-proof/taxonomy.mjs';
import { cases as GOLDEN } from './indicator-proof/golden.mjs';
import * as counter from './indicator-proof/counter-impl.mjs';
import { loadAdapter } from './indicator-proof/adapter-source.mjs';
import { loadOracle } from './indicator-proof/oracle-source.mjs';
import { PINNED, sealOf, tallyOf } from './indicator-proof/seal.mjs';
import { EXCLUSION_MEASUREMENTS, channelsOf, digestPairOf, digestsOf, refusalsOf, settleWithinBars, vendorPin, widthsOf } from './indicator-proof/manifest-shape.mjs';
import { ENCODERS, IMPLEMENTATION_APPROXIMATED, UNVERSIONED_ENCODING, VALUE_ENCODING, encoderFor } from './indicator-proof/value-encoding.mjs';
import { valueLedgerFaults } from './indicator-proof/value-ledger.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(HERE, path), 'utf8'));

const CATALOGUE = read('../example/indicators/manifest.json');
const MANIFEST = CATALOGUE.indicators;
const FINGERPRINTS = read('../example/indicators/fingerprints.json');
const RENAMES = read('../example/indicators/renames.json');
const VALUE_CHANGES = read('../example/indicators/value-changes.json');
const PACKAGE = read('../package.json');
const INERT = read('./indicator-proof/INERT_INPUTS.json');
const DEFECTS = read('./indicator-proof/DEFECT_LEDGER.json');

/** A recomputation is a keystroke away in the form, so a legal value may never cost a second. */
const RECOMPUTE_BUDGET_MS = 1000;
/**
 * What "no upper bound" is probed with. Measured on `supertrend-ai-clustering.maxFactor`, which
 * declares `min: 0` and no maximum: 6 ms at its default of 5, and 12,280 ms at 100,000 — and the
 * value PERSISTS, so the tab does not come back. That measurement is what this number is.
 */
const UNBOUNDED_PROBE = 100000;
/** `onPriceScale`, `src/indicator/availability.ts:57-68`, with `CALIBRATED_PRICE_NEIGHBOURHOOD`. */
const PRICE_NEIGHBOURHOOD = 3;

const byId = new Map(registry.map((entry) => [entry.id, entry]));
const isNum = (value) => Number.isFinite(value);
const median = (xs) => { const t = [...xs].sort((a, b) => a - b); return t[(t.length - 1) >> 1]; };

const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};
const started = Date.now();

// ---------------------------------------------------------------------------------------------
// STAGE 1 — the fixtures answer for themselves before anything is measured against them.
// ---------------------------------------------------------------------------------------------

const FIXTURES = [['A', FIXTURE_A()], ['B', FIXTURE_B()]];
for (const [name, bars] of FIXTURES) {
  const measured = describeFixture(name, bars);
  check(
    `fixture.${name}-passes-its-own-checks`,
    measured.ok,
    measured.ok
      ? `${measured.count} bars, ${measured.rows.length} properties measured: ${measured.rows.map((r) => r.detail).filter(Boolean).join(' · ')}`
      : measured.fail.join('; '),
  );
}
if (checks.some((c) => !c.ok)) {
  console.error('\nindicator-proof: a fixture failed its own checks, so no null result below would mean anything.');
  process.exit(2);
}

const BARS_A = FIXTURES[0][1];
const BARS_B = FIXTURES[1][1];

// ---------------------------------------------------------------------------------------------
// STAGE 2 — the positive control. A sensor that cannot see the two defects already measured is
// broken, and everything it reports afterwards is noise.
// ---------------------------------------------------------------------------------------------

for (const id of ['sma', 'bb']) {
  const entry = byId.get(id);
  const offset = entry === undefined ? undefined : senseIndicator(entry, BARS_A).inputs.find((v) => v.id === 'offset');
  check(
    `control.${id}-offset-reads-as-inert`,
    offset !== undefined && !offset.value,
    offset === undefined
      ? `${id} declares no offset — the control cannot be run, so the sensor is unproven`
      : `${offset.tried} legal values tried and none moved a plotted reading; the vendor's own source destructures ${id}'s inputs WITHOUT offset`,
  );
}
if (checks.some((c) => !c.ok)) {
  console.error('\nindicator-proof: the positive control failed. The sensor is wrong; nothing below is evidence.');
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// STAGE 2b — the same predicate, measured in BOTH directions and behind a gate.
//
// The ledger below is an EXACT set: it fails when a declared-inert control turns out to move the
// drawing, AND it fails when a control that moves nothing is offered. Both directions rest on ONE
// predicate, so the predicate is exercised on three stimuli whose answers are already known.
//
// The gated case is not decoration. `sma.maLength` and `sma.bbMult` read as inert when moved one at
// a time — they sit behind `maType: 'None'` — and a one-at-a-time sensor would have written 58 lies
// into the ledger. The gate pass is what stops that, and this is where it is proven to work.
// ---------------------------------------------------------------------------------------------

{
  const sma = byId.get('sma');
  const obv = byId.get('obv');
  const declared = (entry, id) => entry.inputConfig.find((i) => i.id === id);
  const smaPlots = MANIFEST.find((r) => r.id === 'sma')?.plotIds ?? drawablePlotIds(sma);
  const obvPlots = MANIFEST.find((r) => r.id === 'obv')?.plotIds ?? drawablePlotIds(obv);
  const inert = movesTheDrawing(sma, declared(sma, 'offset'), smaPlots, [BARS_A]);
  const active = movesTheDrawing(sma, declared(sma, 'len'), smaPlots, [BARS_A]);
  const gated = movesTheDrawing(sma, declared(sma, 'maLength'), smaPlots, [BARS_A]);
  // THE FOURTH STIMULUS is the one that separates "moves a plot" from "moves the DRAWING", and it
  // was found by this check disagreeing with an earlier, coarser one: `obv.maLength` moves
  // `obv.plot1` exactly as `sma.maLength` moves `sma.plot1` — and the vendor declares obv's hidden.
  const hidden = movesTheDrawing(obv, declared(obv, 'maLength'), obvPlots, [BARS_A]);
  check(
    'sensor.discriminates-in-both-directions',
    inert === null && active !== null && gated !== null && gated.gate === 'maType' && hidden === null,
    `sma.offset -> ${inert === null ? 'inert' : `MOVED ${inert.how}`} · sma.len -> ${active === null ? 'INERT' : `moves ${active.how.split(' (')[0]}`} · sma.maLength -> ${gated === null ? 'INERT' : `moves ${gated.how.split(' (')[0]} behind ${gated.gate}`} · obv.maLength -> ${hidden === null ? 'moves no DRAWN series, only the plot the vendor hides' : `MOVED ${hidden.how}`}`,
  );
}

// ---------------------------------------------------------------------------------------------
// STAGE 3 — ORACLE LAYER C: golden vectors computed by hand.
// ---------------------------------------------------------------------------------------------

const goldenFailed = GOLDEN.filter((c) => !c.ok);
check(
  'oracle.golden-vectors',
  goldenFailed.length === 0,
  goldenFailed.length === 0
    ? `${GOLDEN.length}/${GOLDEN.length} hand-computed vectors, including the two that pin a CONVENTION: BB uses the POPULATION deviation, and a mean's warm-up ends at index len-1`
    : goldenFailed.map((c) => `${c.name}: expected ${JSON.stringify(c.expected)} got ${JSON.stringify(c.actual)}`).join(' | '),
);

// ---------------------------------------------------------------------------------------------
// STAGE 4 — ORACLE LAYER B: the vendor against `example/studies.ts`, which predates it.
//
// `example/studies.ts` is the ORACLE and may not be deleted. It was written from the definitions,
// by another hand, before this library was considered, and its conventions are documented in its
// own comments. Two implementations arriving at the same number by different routes is evidence;
// one implementation agreeing with itself is not.
// ---------------------------------------------------------------------------------------------

const TOLERANCE = 1e-9;
const valueOf = (point) => (point !== undefined && Number.isFinite(point?.value) ? point.value : null);

function cross(label, vendorPoints, hostPoints) {
  let maxAbs = 0;
  let overlap = 0;
  let onlyVendor = 0;
  let onlyHost = 0;
  for (let i = 0; i < BARS_A.length; i += 1) {
    const v = valueOf(vendorPoints[i]);
    const h = valueOf(hostPoints[i]);
    if (v !== null && h !== null) { overlap += 1; maxAbs = Math.max(maxAbs, Math.abs(v - h)); }
    else if (v !== null) onlyVendor += 1;
    else if (h !== null) onlyHost += 1;
  }
  return { label, overlap, maxAbs, onlyVendor, onlyHost, agree: overlap > 0 && maxAbs <= TOLERANCE };
}

// The port is held to the real file BEFORE it is used as an oracle. Exact equality, no tolerance:
// a difference here is drift between the port and `example/studies.ts`, not a numeric question.
{
  const { module: live, lines } = await loadOracle();
  const drift = [];
  const compare = (label, a, b) => {
    if (a.length !== b.length) { drift.push(`${label}: ${a.length} points against ${b.length}`); return; }
    for (let i = 0; i < a.length; i += 1) {
      if (valueOf(a[i]) !== valueOf(b[i])) { drift.push(`${label}[${i}]: ${valueOf(a[i])} against ${valueOf(b[i])}`); return; }
    }
  };
  compare('movingAverage(20)', live.movingAverage(BARS_A, 20), counter.movingAverage(BARS_A, 20));
  compare('exponentialAverage(21)', live.exponentialAverage(BARS_A, 21), counter.exponentialAverage(BARS_A, 21));
  compare('relativeStrength(14)', live.relativeStrength(BARS_A, 14), counter.relativeStrength(BARS_A, 14));
  const liveMacd = live.convergence(BARS_A);
  const portMacd = counter.convergence(BARS_A);
  for (const part of ['line', 'signal', 'histogram']) compare(`convergence.${part}`, liveMacd[part], portMacd[part]);
  check(
    'oracle.the-port-has-not-drifted-from-example-studies',
    drift.length === 0,
    drift.length === 0
      ? `${lines} lines read out of example/studies.ts, stripped of their TypeScript and evaluated: six series identical to the port at every index, exactly`
      : `the port and example/studies.ts disagree — update the port, do not widen a tolerance: ${drift.join('; ')}`,
  );
}

{
  const sma = byId.get('sma');
  const ema = byId.get('ema');
  const rsi = byId.get('rsi');
  const macd = byId.get('macd');
  const macdOut = macd.calculate(BARS_A, macd.defaultInputs);
  const parts = counter.convergence(BARS_A);
  const rows = [
    cross('SMA(20)', sma.calculate(BARS_A, { ...sma.defaultInputs, len: 20 }).plots.plot0, counter.movingAverage(BARS_A, 20)),
    cross('EMA(21)', ema.calculate(BARS_A, { ...ema.defaultInputs, length: 21 }).plots.plot0, counter.exponentialAverage(BARS_A, 21)),
    cross('RSI(14)', rsi.calculate(BARS_A, { ...rsi.defaultInputs, length: 14 }).plots.plot0, counter.relativeStrength(BARS_A, 14)),
    cross('MACD line', macdOut.plots.plot1, parts.line),
    cross('MACD signal', macdOut.plots.plot2, parts.signal),
    cross('MACD histogram', macdOut.plots.plot0, parts.histogram),
  ];
  const bad = rows.filter((r) => !r.agree);
  check(
    'oracle.counter-implementation',
    bad.length === 0,
    bad.length === 0
      ? `${rows.length} series cross-checked against example/studies.ts: ${rows.map((r) => `${r.label} ${r.overlap} overlapping, maxAbs ${r.maxAbs.toExponential(2)}`).join(' · ')}. Warm-up conventions differ by design and are reported separately: ${rows.map((r) => `${r.label} vendor-only ${r.onlyVendor}/host-only ${r.onlyHost}`).join(' · ')}`
      : bad.map((r) => `${r.label}: ${r.overlap} overlapping, maxAbs ${r.maxAbs.toExponential(3)} over the ${TOLERANCE} tolerance`).join(' | '),
  );

  // The identity that holds whatever the convention, so it discriminates a mis-wired triple.
  let worst = 0;
  for (let i = 0; i < BARS_A.length; i += 1) {
    const h = valueOf(macdOut.plots.plot0[i]);
    const l = valueOf(macdOut.plots.plot1[i]);
    const s = valueOf(macdOut.plots.plot2[i]);
    if (h !== null && l !== null && s !== null) worst = Math.max(worst, Math.abs(h - (l - s)));
  }
  check('oracle.macd-histogram-identity', worst === 0, `histogram == macd - signal, maximum deviation ${worst.toExponential(3)}`);
}

// ---------------------------------------------------------------------------------------------
// STAGE 5 — THE INERT LEDGER, AN EXACT SET IN BOTH DIRECTIONS.
//
// A one-way check lets a ledger rot into folklore. This fails when an entry no longer describes
// the vendor — the vendor FIXED it and the ledger is now a lie — just as loudly as it fails when
// an offered control turns out to be inert.
// ---------------------------------------------------------------------------------------------

{
  const unresolvable = [];
  const revived = [];
  const reasonless = [];
  for (const row of INERT) {
    const entry = byId.get(row.indicator);
    const declared = entry?.inputConfig?.find((i) => i.id === row.input);
    if (entry === undefined || declared === undefined) { unresolvable.push(`${row.indicator}.${row.input}`); continue; }
    if (typeof row.reason !== 'string' || row.reason.trim().length < 20) reasonless.push(`${row.indicator}.${row.input}`);
    // COARSE ON PURPOSE, and it is the stronger direction: this counts EVERY plot the vendor
    // returns, hidden ones included, which is the definition the ledger was built with. An entry
    // that moves anything at all is a ledger entry that no longer describes the vendor.
    const moved = movesTheDrawing(entry, declared, Object.keys(entry.plotConfig ?? []).length === 0 ? [] : (entry.plotConfig ?? []).map((c) => c.id), [BARS_A, BARS_B]);
    if (moved !== null) revived.push(`${row.indicator}.${row.input} now moves ${moved.how}${moved.gate ? ` behind ${moved.gate}` : ''} at ${JSON.stringify(moved.candidate)}`);
  }
  check(
    'ledger.every-entry-is-still-inert',
    revived.length === 0,
    revived.length === 0
      ? `${INERT.length} declared inert controls re-probed on BOTH fixtures, against every gate the entry declares, and none of them moved a plotted value or the guide`
      : `the vendor fixed these — drop the entry rather than keeping a ledger that lies: ${revived.join('; ')}`,
  );
  check(
    'ledger.every-entry-still-exists',
    unresolvable.length === 0,
    unresolvable.length === 0
      ? 'every ledger entry names an indicator and an input the vendor still declares'
      : `stale entries naming nothing: ${unresolvable.join(', ')}`,
  );
  check(
    'ledger.every-entry-has-a-written-reason',
    reasonless.length === 0,
    reasonless.length === 0
      ? `${INERT.length} entries, each with a reason of its own — an exemption without a reason is a suppression under another name`
      : `no reason written: ${reasonless.join(', ')}`,
  );
}

// ---------------------------------------------------------------------------------------------
// STAGE 6 — THE MANIFEST, LINE BY LINE.
// ---------------------------------------------------------------------------------------------

const inertKeys = new Map(INERT.map((x) => [`${x.indicator}.${x.input}`, x.reason]));
const excludingDefect = new Map(DEFECTS.filter((d) => d.excludes).map((d) => [d.id, `${d.class}: ${d.detail}`]));
const findings = [];
const fail = (id, rule, detail) => findings.push({ id, rule, detail });
const bounds = [...ASSERTED_BOUNDS, ...IFT_BOUNDED.map((x) => ({ ...x, lo: -1, hi: 1, definition: 'the Inverse Fisher Transform is tanh, whose range is (-1, 1) for every real input' }))];

for (const row of MANIFEST) {
  const entry = byId.get(row.id);

  // 0. the offered id exists, and is not one this harness has already condemned by measurement.
  if (entry === undefined) { fail(row.id, 'not-in-registry', 'the manifest offers an id the library does not carry'); continue; }
  if (excludingDefect.has(row.id)) { fail(row.id, 'confirmed-defect', excludingDefect.get(row.id)); continue; }

  let threw = null;
  const outs = [];
  for (const [, bars] of FIXTURES) {
    try { outs.push(entry.calculate(bars, entry.defaultInputs)); }
    catch (error) { threw = error?.message ?? String(error); break; }
  }
  if (threw !== null) { fail(row.id, 'throws', `calculate threw at its own defaults: ${threw}`); continue; }

  // 1. it draws — a toggle that opens an empty pane is the silent failure the spec forbids.
  const finite = outs.map((o) => Object.values(o.plots ?? {}).flat().filter((p) => isNum(p?.value)).length);
  if (finite.some((n) => n === 0)) { fail(row.id, 'draws-nothing', `finite readings per fixture: ${finite.join(', ')}`); continue; }

  // 2. the plots the manifest PROMISES are the plots that arrive — a broken promise is a lane
  //    slot spent on nothing.
  const arriving = Object.keys(outs[0].plots ?? {});
  const missing = (row.plotIds ?? []).filter((p) => !arriving.includes(p));
  if (missing.length > 0) fail(row.id, 'promised-plot-absent', `manifest promises [${missing}] which the result does not carry`);

  // 3. full length and index alignment — the adapter builds every Point from `bars[index].time`.
  for (const [key, points] of Object.entries(outs[0].plots ?? {})) {
    if (points.length !== BARS_A.length) { fail(row.id, 'not-bar-length', `${key}: ${points.length} points for ${BARS_A.length} bars`); break; }
  }

  // 4. deterministic — the study is memoised by identity, so two runs must agree.
  const norm = (r) => JSON.stringify(r, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '~nf~' : v));
  if (norm(entry.calculate(BARS_A, entry.defaultInputs)) !== norm(outs[0])) {
    fail(row.id, 'non-deterministic', 'two runs over the same input differ');
  }

  // 5. pure — `resolveSources` builds `positionOf` ONCE before the loop, so a provider that
  //    mutated `bars` would corrupt every later source in the same pass.
  {
    const before = JSON.stringify(BARS_A);
    const inputs = { ...entry.defaultInputs };
    const inputsBefore = JSON.stringify(inputs);
    entry.calculate(BARS_A, inputs);
    if (JSON.stringify(BARS_A) !== before) fail(row.id, 'mutates-bars', "the caller's bar array was modified");
    if (JSON.stringify(inputs) !== inputsBefore) fail(row.id, 'mutates-inputs', "the caller's inputs object was modified");
  }

  // 6. it is on the scale the MANIFEST declares, judged by THIS PACKAGE'S OWN RULE.
  //
  //    `onPriceScale` (`src/indicator/availability.ts:57-68`) is what the workspace already uses:
  //    the median magnitude of a series must sit within CALIBRATED_PRICE_NEIGHBOURHOOD (= 3,
  //    `src/catalogue/sources.ts:35`) of the window's price midpoint. Reimplemented here so the
  //    verifier does not import from `src/`.
  //
  //    The first attempt used lambda-scale EQUIVARIANCE and it was the wrong instrument:
  //    `supertrend-ai-clustering` scored 902/952 because k-means over absolute values is
  //    scale-SENSITIVE by construction — a property of the algorithm, saying nothing about whether
  //    its trailing stop is denominated in price. It plainly is.
  //
  //    BOTH fixtures must agree. A trades around 116 and B around 4200, so an entry off-scale on
  //    both is off-scale because its levels are ABSOLUTE, not because of the price level the
  //    fixture happened to generate.
  //
  //    ITS MEASURED LIMIT, SAID OUT LOUD: declaring `rsi` over-price does NOT fire, because a
  //    reading around 50 is inside a factor of three of fixture A's price of 116. That is the
  //    package's own rule answering, not this check being lax — the workspace would draw that line
  //    on the price axis too. What does fire, measured: `chaikin-mf` at 0.07 and `laguerre-rsi` at
  //    0.80, both against 116 and both off on B as well.
  if (row.placement === 'over-price') {
    const perFixture = FIXTURES.map(([, bars], at) => {
      const priceMid = median(bars.map((b) => b.close));
      const off = [];
      const on = [];
      for (const key of row.plotIds ?? Object.keys(outs[at].plots ?? {})) {
        const magnitudes = (outs[at].plots?.[key] ?? []).map((p) => p?.value).filter(isNum).map(Math.abs);
        if (magnitudes.length === 0) continue;
        const scale = median(magnitudes);
        if (scale >= priceMid / PRICE_NEIGHBOURHOOD && scale <= priceMid * PRICE_NEIGHBOURHOOD) on.push(key);
        else off.push({ key, scale, priceMid });
      }
      return { off, on };
    });
    const offBoth = perFixture[0].off.filter((o) => perFixture[1].off.some((p) => p.key === o.key));
    if (offBoth.length > 0) {
      const detail = offBoth.map((o) => `${o.key} "${row.plotTitles?.[row.plotIds?.indexOf(o.key)] ?? o.key}" median |value| ${o.scale.toFixed(2)} against price ${o.priceMid.toFixed(2)}`).join('; ');
      const anyOn = perFixture[0].on.length > 0 || perFixture[1].on.length > 0;
      if (!anyOn) fail(row.id, 'placement-wrong', `declared over-price but NO plot sits in the price neighbourhood on EITHER fixture: ${detail}`);
      else fail(row.id, 'placement-mixed-scale', `declared over-price; some plots sit on the price scale and these do not, on both fixtures, so they render off-axis: ${detail}`);
    }
  }

  // 7. no asserted mathematical bound violated. BY EXACT ID, with the definition written beside
  //    it in `taxonomy.mjs`. Never by name pattern: matching on the NAME was tried and produced
  //    FORTY false positives — Williams %R is legitimately [-100, 0], CMO is [-100, +100], %B is a
  //    ratio around 0..1, and RSI Bands draws bands AROUND an RSI where exceeding 100 is the
  //    drawing working. A gate that fires falsely is worse than no gate.
  {
    const bound = bounds.find((x) => x.id === row.id);
    if (bound !== undefined) {
      for (const out of outs) {
        let broken = false;
        for (const [key, points] of Object.entries(out.plots ?? {})) {
          if (bound.plot && key !== bound.plot) continue;
          const bad = points.find((p) => isNum(p?.value) && (p.value < bound.lo - 1e-6 || p.value > bound.hi + 1e-6));
          if (bad !== undefined) {
            fail(row.id, 'bound-violated', `${key} = ${bad.value}, outside [${bound.lo}, ${bound.hi}] — ${bound.definition}`);
            broken = true;
            break;
          }
        }
        if (broken) break;
      }
    }
  }

  // 8. THE OWNER'S CONDITION: every control the manifest OFFERS moves the drawing.
  //
  //    "The drawing" is the plots AND THE GUIDE. `guide?` is a line the lane marks, and in the
  //    adapter it is a getter recomputed from the live result — so a control that moves a level
  //    moves what the user sees while moving no plotted value. Counting plots alone called three
  //    live controls dead. `extraLevels` are NOT part of it: forty entries carry levels the lane
  //    cannot mark, so moving one of those changes nothing on screen.
  //
  //    Re-proved here rather than inherited from a census, because this is the assertion the owner
  //    named and a cached answer is not a measurement.
  for (const input of row.inputs ?? []) {
    const key = `${row.id}.${input.id}`;
    const declared = entry.inputConfig?.find((i) => i.id === input.id);
    if (declared === undefined) { fail(row.id, 'offers-undeclared-input', `${input.id} is offered but the library does not declare it`); continue; }
    if (inertKeys.has(key)) {
      fail(row.id, 'offers-a-known-inert-input', `${input.id} is offered and is in the inert ledger: ${inertKeys.get(key)}`);
      continue;
    }
    const moved = movesTheDrawing(entry, declared, row.plotIds ?? drawablePlotIds(entry), [BARS_A]);
    if (moved === null) {
      const elsewhere = movesSomethingUndrawn(entry, declared, row.plotIds ?? drawablePlotIds(entry), BARS_A);
      fail(row.id, 'offered-input-does-not-move-the-drawing', `${input.id} (${input.type}, default ${JSON.stringify(input.defval)})${input.gatedBy ? ` gatedBy ${input.gatedBy}` : ''}: no legal value changed a promised plot or the guide${elsewhere === null ? '' : `; it moves ${elsewhere}, which this host does not draw`}`);
    }
  }
}

{
  const broken = new Set(findings.map((f) => f.id));
  const byRule = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  check(
    'manifest.every-offered-indicator-holds-up',
    findings.length === 0,
    findings.length === 0
      ? `${MANIFEST.length}/${MANIFEST.length} offered indicators draw, are deterministic, are pure, are bar-length aligned, sit on the scale they declare, break no asserted bound, and offer only controls that move the drawing`
      : `${broken.size} of ${MANIFEST.length} offered indicators fail ${JSON.stringify(byRule)} :: ${findings.map((f) => `${f.id} [${f.rule}] ${f.detail}`).join(' | ')}`,
  );
}

// ---------------------------------------------------------------------------------------------
// STAGE 7 — THE OTHER HALF: every control the library declares and the manifest does NOT offer
// carries a written reason. Without it, "held back" and "forgotten" look identical, and a vendor
// upgrade that starts making an input work would silently never reach a user.
// ---------------------------------------------------------------------------------------------

{
  const tally = { inLedger: 0, colour: 0, undrawnChannel: 0 };
  const unexplained = [];
  for (const row of MANIFEST) {
    const entry = byId.get(row.id);
    if (entry === undefined) continue;
    const offered = new Set((row.inputs ?? []).map((i) => i.id));
    for (const declared of entry.inputConfig ?? []) {
      if (offered.has(declared.id)) continue;
      if (inertKeys.has(`${row.id}.${declared.id}`)) { tally.inLedger += 1; continue; }
      if (declared.type === 'color') { tally.colour += 1; continue; }
      const promised = row.plotIds ?? drawablePlotIds(entry);
      const moved = movesTheDrawing(entry, declared, promised, [BARS_A]);
      if (moved !== null) { unexplained.push(`${row.id}.${declared.id} (${declared.type}) MOVES THE DRAWING — ${moved.how} — and is not offered`); continue; }
      const elsewhere = movesSomethingUndrawn(entry, declared, promised, BARS_A);
      if (elsewhere !== null) tally.undrawnChannel += 1;
      else unexplained.push(`${row.id}.${declared.id} (${declared.type}) is inert and absent from the ledger`);
    }
  }
  check(
    'manifest.every-held-back-control-has-a-reason',
    unexplained.length === 0,
    unexplained.length === 0
      ? `held back with a reason: ${tally.inLedger} in the inert ledger, ${tally.colour} colour controls this host does not render, ${tally.undrawnChannel} moving only a channel this package cannot draw`
      : `${unexplained.length} without one: ${unexplained.join('; ')}`,
  );
}

// ---------------------------------------------------------------------------------------------
// STAGE 8 — COST. A persisted value re-applies on every load, so a control that can be given a
// legal value costing a second is a tab that never comes back.
//
// Measured on `supertrend-ai-clustering.maxFactor`, which declares `min: 0` and NO max: 6 ms at
// the default, 12,280 ms at 100,000 — and the value persists.
// ---------------------------------------------------------------------------------------------

{
  // The spec's rule is conditional — "IF a vendor input has no upper bound AND ITS COST GROWS WITH
  // ITS VALUE" — so the check MEASURES rather than demanding a declared maximum. Most lengths are
  // unbounded and linear in the bar count: `sma.len` at 100,000 over 1024 bars is a window that
  // never fills, and it costs nothing. What the rule is for is the other shape, and there is one.
  const slow = [];
  let probed = 0;
  let worst = { key: '-', ms: 0, at: 0 };
  for (const row of MANIFEST) {
    const entry = byId.get(row.id);
    if (entry === undefined) continue;
    for (const input of row.inputs ?? []) {
      if (input.type !== 'int' && input.type !== 'float') continue;
      const declared = typeof input.max === 'number' ? input.max : null;
      const ceiling = declared === null ? UNBOUNDED_PROBE : declared;
      const at = process.hrtime.bigint();
      try { entry.calculate(BARS_A, { ...entry.defaultInputs, [input.id]: ceiling }); } catch { /* a throw costs nothing */ }
      const ms = Number(process.hrtime.bigint() - at) / 1e6;
      probed += 1;
      if (ms > worst.ms) worst = { key: `${row.id}.${input.id}`, ms, at: ceiling };
      if (ms > RECOMPUTE_BUDGET_MS) {
        slow.push(`${row.id}.${input.id} at ${declared === null ? `${ceiling} (it declares NO maximum, so a persisted value has no bound at all)` : `its declared maximum ${ceiling}`} takes ${ms.toFixed(0)} ms`);
      }
    }
  }
  check(
    'cost.no-offered-control-can-cost-a-second',
    slow.length === 0,
    slow.length === 0
      ? `${probed} offered numeric controls computed at their declared maximum, or at ${UNBOUNDED_PROBE} where they declare none; the slowest is ${worst.key} at ${worst.at} with ${worst.ms.toFixed(0)} ms, under the ${RECOMPUTE_BUDGET_MS} ms budget`
      : slow.join('; '),
  );
}

// ---------------------------------------------------------------------------------------------
// STAGE 9 — THE SEAL, which the manifest generator transcribes.
// ---------------------------------------------------------------------------------------------

const seal = sealOf(MANIFEST, byId, BARS_A);
const tally = tallyOf(seal);
check(
  'seal.every-offered-indicator-carries-a-tier',
  Object.keys(seal).length === MANIFEST.length && PINNED.every((id) => seal[id] === 'pinned'),
  `pinned ${tally.pinned} · constrained ${tally.constrained} · structural ${tally.structural} — and the seal is honest about tiers rather than implying that ${MANIFEST.length} indicators are equally verified`,
);

{
  const transcribed = CATALOGUE.seal ?? {};
  const wrongTier = MANIFEST.filter((row) => row.verification !== seal[row.id]).map((row) => `${row.id} says ${row.verification} and measures ${seal[row.id]}`);
  check(
    'seal.the-manifest-transcribes-it-rather-than-computing-it',
    wrongTier.length === 0 && transcribed.pinned === tally.pinned && transcribed.constrained === tally.constrained && transcribed.structural === tally.structural,
    wrongTier.length === 0 && transcribed.pinned === tally.pinned
      ? `every offered row carries the tier this run measures, and the manifest's own totals match: ${JSON.stringify(transcribed)}`
      : `one producer, one consumer — and they disagree: totals ${JSON.stringify(transcribed)} against ${JSON.stringify(tally)}${wrongTier.length === 0 ? '' : `; ${wrongTier.slice(0, 6).join('; ')}`}`,
  );
}

// ---------------------------------------------------------------------------------------------
// STAGE 10 — THE CATALOGUE CANNOT CHANGE BEHIND THE CHECK.
//
// A check that compares ids, plot keys and input shapes is GREEN when a vendor release changes
// what a number IS — which is the upgrade that matters and the one nobody would notice. So the
// committed fingerprints are digests of computed VALUES, and they are re-derived here.
// ---------------------------------------------------------------------------------------------

{
  // `vendorPin` REFUSES anything that is not `x.y.z`, so a range is caught here rather than three
  // stages later as a digest that moved for a reason nobody would guess.
  let declared = null;
  let refusal = null;
  try { declared = vendorPin(PACKAGE); } catch (error) { refusal = error.message; }
  const installed = read('../node_modules/lightweight-charts-indicators/package.json').version;
  const peerInstalled = read('../node_modules/oakscriptjs/package.json').version;
  const pinned = CATALOGUE.vendor;
  check(
    'catalogue.the-vendor-version-is-pinned-exactly',
    refusal === null && pinned?.version === declared.version && pinned.version === installed
      && pinned.peer?.version === declared.peer.version && pinned.peer.version === peerInstalled,
    refusal !== null
      ? refusal
      : pinned?.version === installed && pinned.version === declared.version
        ? `${declared.name}@${declared.version} and ${declared.peer.name}@${declared.peer.version}, exact in package.json, exact in the manifest, and exactly what is installed — a range would let every digest below move while the check stayed green`
        : `manifest says ${pinned?.version}/${pinned?.peer?.version}, package.json says ${declared.version}/${declared.peer.version}, installed is ${installed}/${peerInstalled}`,
  );
  if (declared === null) declared = { name: 'lightweight-charts-indicators', version: installed, peer: { name: 'oakscriptjs', version: peerInstalled } };
  /** The pin as one string, the way the clause above already prints it. `fingerprints.json` has
   *  always carried the one it was written under; the ledger below is the first thing to read it. */
  const pinOf = (v) => `${v?.version}/${v?.peer?.version}`;

  const drifted = [];
  const uncovered = [];
  /** What this run computes, in the shape the fingerprint file holds — the ledger judges the pair. */
  const derived = {};
  /** The same readings spelled WITHOUT the quantum, kept for the sensor below. Costs no extra run. */
  const unquantisedNow = {};
  /**
   * AND THE SAME READINGS SPELLED THE WAY THE COMMITTED FILE IS SPELLED, when that is not this
   * run's spelling. A declared change of identity used to skip the per-id comparison for every id,
   * so one line in the `encodings` chain covered all 310 digests; the comparison is made under the
   * COMMITTED identity instead, and `null` when nothing can spell that way any more — which the
   * ledger refuses rather than comparing under this run's spelling. `undefined` on every ordinary
   * run, where the two identities are one string and this costs nothing.
   */
  const committedEncoding = FINGERPRINTS.algorithm?.id ?? UNVERSIONED_ENCODING;
  const restating = committedEncoding === VALUE_ENCODING.id ? undefined : encoderFor(committedEncoding);
  const underCommitted = committedEncoding === VALUE_ENCODING.id ? undefined : (restating === undefined ? null : {});
  for (const row of MANIFEST) {
    const entry = byId.get(row.id);
    const { values, unquantised } = digestPairOf(entry, row.plotIds, BARS_A);
    unquantisedNow[row.id] = unquantised;
    if (restating !== undefined && underCommitted !== null) {
      underCommitted[row.id] = digestsOf(entry, row.plotIds, BARS_A, { values: restating }).values;
    }
    const settle = settleWithinBars(entry, row.plotIds, BARS_A);
    derived[row.id] = { values, confirmsWithinBars: settle };
    const committed = FINGERPRINTS.entries?.[row.id];
    if (committed === undefined) { uncovered.push(row.id); continue; }
    if (values !== committed.values) drifted.push(`${row.id}: committed ${committed.values.slice(0, 12)}… re-derived ${values.slice(0, 12)}…`);
    if (settle !== committed.confirmsWithinBars || settle !== row.confirmsWithinBars) {
      drifted.push(`${row.id}: settles within ${settle} bars, manifest says ${row.confirmsWithinBars}, fingerprints say ${committed.confirmsWithinBars}`);
    }
  }
  const extra = Object.keys(FINGERPRINTS.entries ?? {}).filter((id) => !MANIFEST.some((r) => r.id === id));
  check(
    'catalogue.every-fingerprint-re-derives-from-the-VALUES',
    drifted.length === 0 && uncovered.length === 0 && extra.length === 0,
    drifted.length === 0 && uncovered.length === 0 && extra.length === 0
      ? `${MANIFEST.length} digests of computed values re-derived and identical, settle windows included — ${MANIFEST.filter((r) => r.confirmsWithinBars > 0).length} entries restate a closed bar, none by more than ${Math.max(...MANIFEST.map((r) => r.confirmsWithinBars))} bars`
      : [...drifted, ...uncovered.map((id) => `${id} is offered with no fingerprint`), ...extra.map((id) => `${id} has a fingerprint and is not offered`)].join('; '),
  );

  // AND THE DIGEST HAS TO SURVIVE THE PLATFORM IT IS TAKEN ON — the sensor that was missing.
  //
  // The clause above compares this run's digests against the committed ones and says nothing about
  // WHY they agree. They agreed here and disagreed on the CI runner: `npm run proof` reported 31/33
  // on linux/amd64/Node 22 against 33/33 on macOS/arm64/Node 25, over the same pinned vendor and the
  // same fixture, because ECMAScript leaves `Math.exp`, `pow`, `log`, `log10`, `sin`, `cos`, `atan`
  // and `acos` implementation-approximated — only `sqrt` is required exact by IEEE 754 — and the
  // vendor calls those eight 66 times. A digest of a raw double is a digest of the platform.
  //
  // So the platform is SIMULATED rather than waited for: every one of the eight is wrapped to return
  // its own result nudged by one unit in the last place, which is exactly the freedom the language
  // grants an implementation, and the digests are re-derived under it. This runs anywhere, so the
  // machine that would have caught the defect is whichever one a contributor happens to own.
  //
  // AND IT DISCRIMINATES, because a green result on its own is equally well explained by a
  // perturbation too small to reach any reading. The SAME perturbed computation is spelled a second
  // time without the quantum — `encodeSeriesUnquantised`, the negative control — and that spelling
  // has to move. If it did not, this clause would be passing over a nudge that changed nothing.
  {
    const originals = new Map(IMPLEMENTATION_APPROXIMATED.map((name) => [name, Math[name]]));
    const bits = new DataView(new ArrayBuffer(8));
    /** One unit in the last place, away from zero — the whole of what "approximated" is allowed to mean. */
    const nudge = (x) => {
      if (!Number.isFinite(x) || x === 0) return x;
      bits.setFloat64(0, x);
      bits.setBigUint64(0, bits.getBigUint64(0) + (x > 0 ? 1n : -1n));
      const moved = bits.getFloat64(0);
      return Number.isFinite(moved) ? moved : x;
    };

    const held = [];
    const movedUnquantised = [];
    try {
      for (const name of IMPLEMENTATION_APPROXIMATED) {
        const original = originals.get(name);
        Math[name] = (...args) => nudge(original(...args));
      }
      for (const row of MANIFEST) {
        const under = digestPairOf(byId.get(row.id), row.plotIds, BARS_A);
        if (under.values !== derived[row.id].values) held.push(row.id);
        if (under.unquantised !== unquantisedNow[row.id]) movedUnquantised.push(row.id);
      }
    } finally {
      for (const [name, original] of originals) Math[name] = original;
    }

    check(
      'catalogue.the-digest-survives-a-platform-re-rounding-a-transcendental',
      held.length === 0 && movedUnquantised.length > 0,
      held.length === 0 && movedUnquantised.length > 0
        ? `all ${MANIFEST.length} digests are byte-identical with ${IMPLEMENTATION_APPROXIMATED.length} implementation-approximated Math functions each returning its result one ULP out, and the SAME perturbed run moves ${movedUnquantised.length} of them without the quantum (${movedUnquantised.slice(0, 4).join(', ')}…) — so the encoding is what holds them still, not a nudge too small to reach a reading. Math.sqrt is left alone: IEEE 754 requires it exact`
        : held.length > 0
          ? `${held.length} digest(s) moved under a one-ULP nudge, so the committed catalogue is a digest of this machine as much as of the arithmetic: ${held.slice(0, 8).join(', ')}`
          : 'the perturbation moved nothing at all, quantised or not — a sensor that cannot reach a reading proves nothing about the encoding that survives it',
    );
  }

  const measured = EXCLUSION_MEASUREMENTS(DEFECTS);
  const named = CATALOGUE.exclusions ?? [];
  const offeredAnyway = named.filter((x) => MANIFEST.some((r) => r.id === x.id)).map((x) => x.id);
  const thin = named.filter((x) => typeof x.measurement !== 'string' || x.measurement.length < 60).map((x) => x.id);
  check(
    'catalogue.the-definitional-exclusions-are-named-with-their-measurement',
    named.length === measured.length && offeredAnyway.length === 0 && thin.length === 0
      && measured.every((x) => named.some((y) => y.id === x.id && y.measurement === x.measurement)),
    offeredAnyway.length === 0 && thin.length === 0 && named.length === measured.length
      ? `${named.length} excluded by measurement, each named with it: ${named.map((x) => `${x.id} (${x.class})`).join(', ')}`
      : `${offeredAnyway.length} excluded-and-offered: ${offeredAnyway.join(', ')}; ${thin.length} without a measurement: ${thin.join(', ')}; manifest names ${named.length} against the ledger's ${measured.length}`,
  );

  const renames = RENAMES.renames ?? [];
  const dangling = renames.filter((r) => !MANIFEST.some((row) => row.id === r.to)).map((r) => `${r.from} -> ${r.to}`);
  check(
    'catalogue.every-recorded-rename-lands-somewhere-offered',
    Array.isArray(renames) && dangling.length === 0 && typeof RENAMES.why === 'string',
    dangling.length === 0
      ? `${renames.length} recorded rename(s); the generator REFUSES to write while an id has vanished from the library and neither this file nor the defect ledger says why, because it cannot tell a rename from a removal and a host's saved workspace can`
      : `renamed to an id nothing offers: ${dangling.join(', ')}`,
  );

  // THE SAME RULE, ONE LEVEL DOWN — and the hole it closes was measured, not imagined. An
  // inverted-weight `wma` (2.1% wrong on this very fixture) was planted in the vendor and the
  // artefacts regenerated the way a release arrives: every check above passed, because regenerating
  // the fingerprints is PART of taking the release. A digest may now only move when a human says
  // what moved it.
  const onFile = VALUE_CHANGES.changes ?? [];
  const encoding = { committed: committedEncoding, derived: VALUE_ENCODING.id };
  const vendor = { committed: pinOf(FINGERPRINTS.vendor), derived: pinOf(declared) };
  const faults = valueLedgerFaults({ committed: FINGERPRINTS.entries ?? {}, derived, ledger: VALUE_CHANGES, offered: MANIFEST.map((row) => row.id), encoding, underCommitted, vendor, renames: RENAMES.renames ?? [] });
  check(
    'catalogue.every-value-that-moved-carries-a-DECLARATION',
    faults.length === 0 && typeof VALUE_CHANGES.why === 'string' && typeof VALUE_CHANGES.form === 'string',
    faults.length === 0
      ? `${onFile.length} declared value change(s) on file; every committed digest is the one this run derives, and the generator REFUSES both to write and to pass --check while a digest has moved and nothing says whether the vendor fixed a defect or shipped one`
      : faults.map((fault) => `${fault.id} ${fault.fault}: ${fault.detail}`).join('; '),
  );

  // AND IT DISCRIMINATES. A rule whose only evidence is a file it has never rejected is a rule that
  // passes over an empty set — the same objection GATE-03 raises against the boundary guard.
  {
    const [A, B, C] = ['a', 'b', 'c'].map((ch) => ch.repeat(64));
    const was = { wma: { values: A, confirmsWithinBars: 0 } };
    const now = { wma: { values: B, confirmsWithinBars: 0 } };
    const reason = 'the vendor corrected the weighting so the newest bar carries the heaviest one';
    const HELD = { committed: 'spelling/v1', derived: 'spelling/v1' };
    /** The pin is HELD in every direction below: this clause is about the declaration, not the release. */
    const PIN = { committed: '0.5.0/0.5.0', derived: '0.5.0/0.5.0' };
    const judge = (...changes) => valueLedgerFaults({ committed: was, derived: now, ledger: { changes, encodings: [] }, offered: ['wma'], encoding: HELD, vendor: PIN, renames: [] });
    const entry = (from, to, why = reason) => ({ id: 'wma', from, to, reason: why, encoding: HELD.derived });
    const silent = judge();
    const correct = judge(entry(A, B));
    const wrongFrom = judge(entry(C, B));
    const thin = judge(entry(A, B, 'vendor update'));
    // AND THE TWO THAT LOOK IDENTICAL FROM THE DIGESTS ALONE. Deleting `entries.wma` is cheaper than
    // forging a sha256, and it reaches the same place through the sanctioned regeneration command —
    // so the committed MANIFEST decides which of the two an absent digest is. Both directions are
    // asserted: a proof that vanished is refused, an indicator that genuinely appeared is not.
    const deleted = valueLedgerFaults({ committed: {}, derived: now, ledger: { changes: [], encodings: [] }, offered: ['wma'], encoding: HELD, vendor: PIN, renames: [] });
    const debut = valueLedgerFaults({ committed: {}, derived: now, ledger: { changes: [], encodings: [] }, offered: [], encoding: HELD, vendor: PIN, renames: [] });
    // AND THE THIRD PAIR, WHICH IS THE ONE THE DIGESTS CANNOT TELL APART AT ALL. Re-spelling how a
    // reading is written moves EVERY digest in the file at once while no indicator computes anything
    // different — so declaring it per id would be three hundred false statements, and waving it
    // through would be the widest laundering channel in the file. The identity is what decides:
    // held and moved is a value change, moved and declared is a re-spelling, moved and silent is
    // refused. The `from` has to be the identity actually on file, for the same reason a per-id
    // declaration's `from` does: one that starts somewhere else describes a different change.
    const RESPELT = { committed: 'spelling/v1', derived: 'spelling/v2' };
    // Re-derived under the spelling on file, this run says what the file already says — so no value
    // moved and the only thing being judged here is the identity. That the SAME re-spelling with a
    // value moved underneath it is refused is the clause after this one; the two do not overlap.
    const respell = (...encodings) => valueLedgerFaults({ committed: was, derived: now, ledger: { changes: [], encodings }, offered: ['wma'], encoding: RESPELT, underCommitted: { wma: A }, vendor: PIN, renames: [] });
    const respelling = (from, to, why) => ({ from, to, reason: why });
    const encodingReason = 'the digest is quantised so that a platform re-rounding a transcendental cannot move it';
    const respeltSilently = respell();
    const respeltDeclared = respell(respelling('spelling/v1', 'spelling/v2', encodingReason));
    const respeltFromElsewhere = respell(respelling('spelling/v0', 'spelling/v2', encodingReason));
    const anyFault = (list, fault) => list.some((f) => f.fault === fault);
    const named = (list, fault) => list.some((f) => f.id === 'wma' && f.fault === fault);
    const verdicts = [
      named(silent, 'undeclared'),
      correct.length === 0,
      named(wrongFrom, 'wrong-from'),
      named(thin, 'no-reason'),
      named(deleted, 'vanished-fingerprint'),
      debut.length === 0,
      anyFault(respeltSilently, 'undeclared-encoding'),
      respeltDeclared.length === 0,
      anyFault(respeltFromElsewhere, 'undeclared-encoding'),
    ];
    check(
      'catalogue.the-declaration-rule-discriminates-in-nine-directions',
      verdicts.every(Boolean),
      verdicts.every(Boolean)
        ? 'a digest that moved with NO declaration is refused; the same move WITH a correct declaration passes; a declaration whose old digest is not the one on file is refused as a different change; a declaration whose reason says only what the git log already says is refused for having no reason; a fingerprint DELETED for an id the committed manifest still offers is refused as a proof that vanished rather than waved through as an indicator that appeared; an id the committed manifest does not offer passes undeclared, because that one really is new; and one level up, an ENCODING that moved with nothing in the chain is refused, the same move WITH a declaration regenerates the whole file and asks for no per-id reason, because this run re-derived under the spelling on file is what the file already says, and a declaration starting from an identity that is not the one on file is refused like any other wrong `from`'
        : `undeclared→red ${verdicts[0]}, declared→green ${verdicts[1]}, wrong-from→red ${verdicts[2]}, no-reason→red ${verdicts[3]}, deleted-entry→red ${verdicts[4]}, genuinely-new→green ${verdicts[5]}, respelt-silently→red ${verdicts[6]}, respelt-declared→green ${verdicts[7]}, respelt-from-elsewhere→red ${verdicts[8]}`,
    );
  }

  // AND THE DECLARATION THAT UNLOCKS A RE-SPELLING BUYS THE SPELLING AND NOTHING ELSE.
  //
  // The clause above proves a declared re-spelling is not refused. It said nothing about what else
  // rides in with it, and what rode in was everything: while the identity moved, the per-id
  // comparison was SKIPPED for every id. MEASURED on this tree — vendor 0.5.1 everywhere, `wma`
  // multiplied by 1.0001 and the quantum re-spelled 2^-36 → 2^-34 in one run: 310 of 310 digests
  // rewritten, ZERO value declarations, this script 34/34 and `--check` exit 0, with `wma` on file
  // at the byte-for-byte digest the undeclared rule refuses when it arrives alone. 304 of the 310
  // offered rows have no oracle but their digest, so one line in the `encodings` chain covered them
  // all.
  //
  // The comparison never needed THIS run's spelling — it needed the one the committed file was
  // written in, and `ENCODERS` keeps it. So the pair judged is the digest on file against this
  // run re-derived under the COMMITTED identity, and the five directions below are what that buys.
  {
    const HELD = 'spelling/v1';
    const MOVED = 'spelling/v2';
    const [X, Y, Z] = ['1', '2', '3'].map((ch) => ch.repeat(64));
    const NEW = ['7', '8'].map((ch) => ch.repeat(64));
    const reason = 'the vendor corrected the weighting so the newest bar carries the heaviest one';
    const respelling = { from: HELD, to: MOVED, reason: 'the digest is quantised so that a platform re-rounding a transcendental cannot move it' };
    /** The file: two ids, spelled the old way. */
    const was = { wma: { values: X, confirmsWithinBars: 0 }, sma: { values: Y, confirmsWithinBars: 0 } };
    /** This run, spelled the NEW way — every digest moves, which is what a re-spelling IS. */
    const now = { wma: { values: NEW[0], confirmsWithinBars: 0 }, sma: { values: NEW[1], confirmsWithinBars: 0 } };
    const judge = (underCommitted, ...changes) => valueLedgerFaults({
      committed: was,
      derived: now,
      ledger: { changes, encodings: [respelling] },
      offered: ['wma', 'sma'],
      encoding: { committed: HELD, derived: MOVED },
      underCommitted,
      vendor: { committed: '0.5.0/0.5.0', derived: '0.5.0/0.5.0' },
      renames: [],
    });
    /** Nothing moved: this run, spelled the old way, is what the file already says. */
    const honest = judge({ wma: X, sma: Y });
    /** `wma` moved underneath the re-spelling — the drill's tamper, in the drill's disguise. */
    const tampered = judge({ wma: Z, sma: Y });
    const declaration = { id: 'wma', from: X, to: Z, reason, encoding: HELD };
    const owned = judge({ wma: Z, sma: Y }, declaration);
    const owndedElsewhere = judge({ wma: Z, sma: Y }, { ...declaration, encoding: MOVED });
    /** And the spelling on file no longer exists, so nothing can be read against it. */
    const unreadable = judge(null);
    const names = (list, fault, id) => list.some((f) => f.id === id && f.fault === fault);
    const verdicts = [
      honest.length === 0,
      names(tampered, 'undeclared', 'wma') && !tampered.some((f) => f.id === 'sma'),
      owned.length === 0,
      names(owndedElsewhere, 'undeclared', 'wma'),
      unreadable.some((f) => f.fault === 'unaddressable-encoding'),
    ];
    check(
      'catalogue.a-declared-re-spelling-discriminates-in-five-directions',
      verdicts.every(Boolean),
      verdicts.every(Boolean)
        ? 'a re-spelling in which no value moved passes and rewrites the file as before; the SAME re-spelling with one indicator\'s arithmetic moved underneath it is refused, naming that id and only that id, because every id is re-derived under the identity the committed file carries and compared there; the same move WITH a declaration written in the spelling the two ends share passes; the same declaration written in the spelling this run moves TO is refused, because neither of its digests is on file in that spelling; and a committed identity `ENCODERS` no longer answers to is refused outright rather than compared under this run\'s spelling, which would restore the amnesty in full'
        : `honest-respelling→green ${verdicts[0]}, tampered-under-respelling→red-and-named ${verdicts[1]}, declared-in-the-old-spelling→green ${verdicts[2]}, declared-in-the-new-spelling→red ${verdicts[3]}, unaddressable-spelling→red ${verdicts[4]}`,
    );
  }

  // AND A RENAME MOVES THE ID, NOT THE ARITHMETIC.
  //
  // `renames.json` resolves a vanished id for the generator, and the old digest simply left the
  // file: the new id had never been seen, so it read as a debut, and a debut has no old value to
  // answer to. MEASURED — `wma` renamed to `wma-weighted` in the registry with its arithmetic
  // multiplied by 1.0001, only the rename declared: the generator wrote, `--check` exited 0, this
  // script passed, and `entries["wma-weighted"]` was on file at 042a185abf7c…, the byte-for-byte
  // digest an undeclared move is refused for. Vendors rename and rewrite in the same release
  // routinely. So the digest is carried to the new id before anything is judged, and the OFFER is
  // carried with it: without the second half, deleting the entry buys back through the rename what
  // deleting it buys nowhere else.
  {
    const HELD = { committed: 'spelling/v1', derived: 'spelling/v1' };
    const PIN = { committed: '0.5.0/0.5.0', derived: '0.5.0/0.5.0' };
    const [X, Z] = ['1', '3'].map((ch) => ch.repeat(64));
    const was = { wma: { values: X, confirmsWithinBars: 0 } };
    const renamed = [{ from: 'wma', to: 'wma-weighted', reason: 'the vendor renamed it in 0.5.1' }];
    const twice = [...renamed, { from: 'wma-weighted', to: 'weighted-ma', reason: 'and again in 0.6.0' }];
    const judge = ({ committed = was, derived, renames, offered = ['wma'] }) => valueLedgerFaults({
      committed, derived, ledger: { changes: [], encodings: [] }, offered, encoding: HELD, vendor: PIN, renames,
    });
    const held = { 'wma-weighted': { values: X, confirmsWithinBars: 0 } };
    const moved = { 'wma-weighted': { values: Z, confirmsWithinBars: 0 } };
    /** Renamed and rewritten in one release, with only the rename declared — the measured hole. */
    const rewritten = judge({ derived: moved, renames: renamed });
    /** Renamed and nothing else: the id moved, the arithmetic did not. */
    const purely = judge({ derived: held, renames: renamed });
    /** Renamed, rewritten, and the old entry deleted from the file rather than forged. */
    const deleted = judge({ committed: {}, derived: moved, renames: renamed });
    /** Renamed twice, because the file is append-only and a chain is what it accumulates. */
    const chained = judge({ derived: { 'weighted-ma': { values: Z, confirmsWithinBars: 0 } }, renames: twice });
    /** And an id nothing renamed and nothing offers is still a genuine debut, declaring nothing. */
    const debut = judge({ committed: {}, derived: moved, renames: [], offered: [] });
    const names = (list, fault, id) => list.some((f) => f.id === id && f.fault === fault);
    const verdicts = [
      names(rewritten, 'undeclared', 'wma-weighted'),
      purely.length === 0,
      names(deleted, 'vanished-fingerprint', 'wma-weighted'),
      names(chained, 'undeclared', 'weighted-ma'),
      debut.length === 0,
    ];
    check(
      'catalogue.a-declared-rename-carries-the-old-digest-forward',
      verdicts.every(Boolean),
      verdicts.every(Boolean)
        ? 'an indicator renamed AND rewritten in one release is refused under its NEW id, because the committed digest is carried to wherever the recorded renames land it before anything is judged; a rename that moves only the name passes and declares nothing, which is what a rename is; deleting the old entry instead of forging it is refused as a proof that vanished, because the OFFER is carried forward with the digest; a chain of two renames carries it the whole way, which is what an append-only table accumulates; and an id nothing renamed and the committed manifest does not offer is still a debut with nothing to declare'
        : `renamed-and-rewritten→red-under-the-new-id ${verdicts[0]}, renamed-only→green ${verdicts[1]}, renamed-and-deleted→red ${verdicts[2]}, renamed-twice→red ${verdicts[3]}, genuine-debut→green ${verdicts[4]}`,
    );
  }

  // AND THE TWO CHANGES THAT MOVE EVERY DIGEST AT ONCE ARRIVE ONE AT A TIME.
  //
  // The clause above compares each id under the spelling on file, which rests on ONE thing nothing
  // in the tree can confirm: that the encoder registered under the old identity still spells the way
  // that identity spelled. A vendor release is exactly the moment somebody is editing both. And it
  // is what a reviewer needs either way — in a run that bumps AND re-spells, every digest in the
  // file moves anyway and the tampered one is invisible in the diff, which is how the measured
  // laundering would have passed review. `fingerprints.json` has always carried the pin it was
  // written under; nothing read it until now. The cost is one extra commit in the life of the
  // catalogue, and only when both land together.
  {
    const HELD = 'spelling/v1';
    const MOVED = 'spelling/v2';
    const [X, N] = ['1', '7'].map((ch) => ch.repeat(64));
    const was = { wma: { values: X, confirmsWithinBars: 0 } };
    const respelling = { from: HELD, to: MOVED, reason: 'the digest is quantised so that a platform re-rounding a transcendental cannot move it' };
    const judge = ({ encoding, vendor, respelt }) => valueLedgerFaults({
      committed: was,
      derived: { wma: { values: respelt ? N : X, confirmsWithinBars: 0 } },
      ledger: { changes: [], encodings: respelt ? [respelling] : [] },
      offered: ['wma'],
      encoding,
      underCommitted: respelt ? { wma: X } : undefined,
      vendor,
      renames: [],
    });
    const RESPELT = { encoding: { committed: HELD, derived: MOVED }, respelt: true };
    const SPELT = { encoding: { committed: HELD, derived: HELD }, respelt: false };
    const SAME = { committed: '0.5.0/0.5.0', derived: '0.5.0/0.5.0' };
    const BUMPED = { committed: '0.5.0/0.5.0', derived: '0.5.1/0.5.0' };
    const together = judge({ ...RESPELT, vendor: BUMPED });
    const respellingAlone = judge({ ...RESPELT, vendor: SAME });
    const releaseAlone = judge({ ...SPELT, vendor: BUMPED });
    const unnamed = valueLedgerFaults({ committed: was, derived: was, ledger: { changes: [], encodings: [] }, offered: ['wma'], encoding: SPELT.encoding, renames: [] });
    const verdicts = [
      together.some((f) => f.fault === 'release-with-respelling'),
      respellingAlone.length === 0,
      releaseAlone.length === 0,
      unnamed.some((f) => f.fault === 'unreadable'),
    ];
    check(
      'catalogue.a-release-and-a-re-spelling-cannot-arrive-together',
      verdicts.every(Boolean),
      verdicts.every(Boolean)
        ? 'a run that moves the vendor pin AND re-spells the digest is refused outright, naming both moves — the one shape in which every digest in the file changes for two reasons at once, so a value the release moved cannot be read out of the diff; a re-spelling under a held pin passes, a release under a held spelling passes and answers to the per-id rule as always, and a caller that does not name the pin the committed digests were taken under is refused rather than assumed to be holding it'
        : `both-together→red ${verdicts[0]}, respelling-alone→green ${verdicts[1]}, release-alone→green ${verdicts[2]}, pin-not-named→red ${verdicts[3]}`,
    );
  }

  // AND THE SPELLING EVERY COMMITTED DIGEST WAS WRITTEN IN HAS TO STILL EXIST.
  //
  // The comparison above is only possible while the identity `fingerprints.json` carries resolves to
  // an encoder. Deleting one is therefore exactly as expensive as deleting a rename: it removes the
  // comparison rather than failing it, so `ENCODERS` is append-only and this clause is the ratchet.
  // Both halves are asserted, because "addressable" is satisfied trivially by pointing every past
  // identity at today's encoder — which is the amnesty wearing the registry's clothes. The
  // spellings it holds have to genuinely disagree about a reading.
  {
    const chain = VALUE_CHANGES.encodings ?? [];
    const everCommitted = [...new Set([
      ...chain.flatMap((row) => [row?.from, row?.to]),
      FINGERPRINTS.algorithm?.id ?? UNVERSIONED_ENCODING,
      VALUE_ENCODING.id,
    ])].filter((id) => typeof id === 'string' && id !== '');
    const unaddressable = everCommitted.filter((id) => encoderFor(id) === undefined);
    const probe = [1, 1 + 2 ** -20, -12345.6789, 0, NaN, null];
    const spellings = new Set(everCommitted.map((id) => JSON.stringify(encoderFor(id)?.(probe) ?? null)));
    const invented = encoderFor(`${VALUE_ENCODING.id}-nothing-registered-this`) === undefined;
    const registered = Object.keys(ENCODERS).length;
    check(
      'catalogue.every-encoding-ever-committed-is-still-addressable',
      unaddressable.length === 0 && spellings.size > 1 && invented,
      unaddressable.length === 0 && spellings.size > 1 && invented
        ? `${everCommitted.length} identity(ies) this catalogue has committed or declared — ${everCommitted.join(', ')} — all still addressable among the ${registered} in ENCODERS, and they spell one probe series ${spellings.size} genuinely different ways, so keeping them is not the same as aliasing them to this run's encoder. An identity nothing registered answers \`undefined\` rather than falling back: a committed digest can only be read under the spelling it was written in, and the fallback IS the hole`
        : unaddressable.length > 0
          ? `${unaddressable.length} identity(ies) the committed digests or the encodings chain name have no encoder, so nothing can re-derive what they were written in: ${unaddressable.join(', ')}`
          : invented
            ? `every registered identity spells a reading the same way, so "addressable" claims nothing — a re-spelling would be compared against itself and the ${MANIFEST.length} digests under it would answer for nothing`
            : 'an identity nothing registered resolved to an encoder anyway, and a fallback there is the amnesty this registry exists to remove',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// STAGE 11 — THE ADAPTER. Vendor numbers in, this domain's points out.
//
// Loaded from `example/indicators.ts` itself rather than ported here: a port drifts, and the day
// somebody corrects the adapter while the port keeps the old rule, this stage goes on printing PASS
// about a fossil. `adapter-source.mjs` declares the two substitutions it makes and why.
//
// The synthetic entries below are the discrimination half. A sweep over 320 real indicators says
// the adapter does not break on what the vendor actually emits; it says nothing about what the
// adapter would do with what the vendor emits RARELY — a point stamped with a neighbour's bar time,
// a plot key that is not `plot0`, a computation that throws. Each of those is built here on purpose,
// with its answer known in advance.
// ---------------------------------------------------------------------------------------------

{
  const { module: adapter } = await loadAdapter();

  /** A vendor entry the harness builds: `plots` is whatever the case is about. */
  const syntheticEntry = (plots, { plotConfig, throws = false, count = { calls: 0 } } = {}) => ({
    id: 'synthetic',
    defaultInputs: {},
    plotConfig: plotConfig ?? Object.keys(plots).map((id) => ({ id })),
    calculate: () => {
      count.calls += 1;
      if (throws) throw new Error('the vendor computation failed');
      return { plots };
    },
    calls: count,
  });
  const syntheticRow = (plotIds, extra = {}) => ({
    id: 'synthetic',
    fallbackLabel: 'Synthetic',
    fallbackShortLabel: 'SYN',
    category: 'Harness',
    placement: 'own-pane',
    plotIds,
    plotTitles: plotIds,
    inputs: [],
    ...extra,
  });
  const pointsOf = (source, bars) => source.series().map((plot) => plot.provider.compute(bars));

  /* ---- every point is timed by ITS bar, whatever the vendor stamped on it ------------------- */
  {
    const grid = BARS_A;
    // The `double-macd` shape, distilled: value i carried on bar i-2's timestamp. That timestamp IS
    // on the grid, so `alignReadings` does not discard the point — it overwrites bar i-2's reading.
    const shifted = grid.map((bar, i) => ({ time: grid[Math.max(0, i - 2)].time, value: i }));
    const source = adapter.studySourceFor(
      syntheticRow(['plot0']),
      syntheticEntry({ plot0: shifted }),
      {},
    );
    const [points] = pointsOf(source, grid);
    const misplaced = points.filter((point, i) => point.time !== grid[i].time).length;
    const wrongValue = points.filter((point, i) => point.value !== i).length;

    const offenders = [];
    let series = 0;
    let plotted = 0;
    const lookup = adapter.sourceLookupFor({ indicatorRegistry: registry }, undefined);
    for (const row of MANIFEST) {
      const live = lookup(row.id);
      if (live === undefined) { offenders.push(`${row.id}: the lookup does not know it`); continue; }
      for (const plot of live.series()) {
        series += 1;
        let emitted;
        try { emitted = plot.provider.compute(grid); } catch (error) { offenders.push(`${row.id}: threw — ${error.message}`); continue; }
        if (emitted.length !== grid.length) { offenders.push(`${row.id}.${plot.spec.id}: ${emitted.length} points against ${grid.length} bars`); continue; }
        const off = emitted.findIndex((point, i) => point.time !== grid[i].time);
        if (off >= 0) offenders.push(`${row.id}.${plot.spec.id}: point ${off} carries ${emitted[off].time}, bar ${off} is ${grid[off].time}`);
        plotted += emitted.filter((point) => 'value' in point).length;
      }
    }
    check(
      'adapter.every-point-is-timed-by-its-own-bar',
      misplaced === 0 && wrongValue === 0 && offenders.length === 0,
      offenders.length === 0 && misplaced === 0 && wrongValue === 0
        ? `a series stamped two bars back round-trips with the grid intact and value i on bar i, and all ${series} plot series of the ${MANIFEST.length} offered entries land one point per bar over ${grid.length} bars (${plotted} finite readings) — the timestamp is the host's, only the value is the vendor's`
        : misplaced > 0 || wrongValue > 0
          ? `the shifted-point control failed: ${misplaced} points off their bar, ${wrongValue} carrying the wrong value`
          : `${offenders.length}: ${offenders.slice(0, 6).join('; ')}`,
    );
  }

  /* ---- the bars reach the vendor ASCENDING, because the library validates nothing ---------- */
  {
    const grid = BARS_A.slice(0, 8);
    const descending = [...grid].reverse();
    let seen = null;
    const source = adapter.studySourceFor(
      syntheticRow(['plot0']),
      {
        id: 'synthetic',
        defaultInputs: {},
        plotConfig: [{ id: 'plot0' }],
        calculate: (bars) => {
          seen = bars.map((bar) => bar.time);
          return { plots: { plot0: bars.map((_bar, i) => ({ value: i })) } };
        },
      },
      {},
    );
    const [points] = pointsOf(source, descending);
    const climbing = seen !== null && seen.every((time, i) => i === 0 || time > seen[i - 1]);
    const untouched = descending[0].time === grid[grid.length - 1].time;
    const onTheSortedGrid = points.every((point, i) => point.time === grid[i].time);
    check(
      'adapter.the-bars-reach-the-vendor-ascending',
      climbing && untouched && onTheSortedGrid && points.length === grid.length,
      `${descending.length} bars handed over newest-first arrive at the vendor oldest-first, the caller's own array is left in the order it was given, and the points come back on the SAME order the vendor computed against — an adapter that sorted a copy for the vendor and timed the points off the original would silently transpose every reading`,
    );
  }

  /* ---- a value that is not a finite number is a DECLARED GAP, never a zero ------------------ */
  {
    const grid = BARS_A.slice(0, 6);
    const source = adapter.studySourceFor(
      syntheticRow(['plot0']),
      syntheticEntry({ plot0: [{ value: 7 }, { value: NaN }, { value: null }, { value: Infinity }, { value: '3' }, undefined] }),
      {},
    );
    const [points] = pointsOf(source, grid);
    const carries = points.map((point) => 'value' in point);
    // A short series is gaps to the end of the grid, never a short array: `alignReadings` reads by
    // index and a missing row would silently shorten the study rather than declare its absence.
    const short = adapter.studySourceFor(syntheticRow(['plot0']), syntheticEntry({ plot0: [{ value: 1 }] }), {});
    const [tail] = pointsOf(short, grid);
    check(
      'adapter.a-non-finite-value-becomes-a-declared-gap',
      JSON.stringify(carries) === JSON.stringify([true, false, false, false, false, false])
        && points[0].value === 7
        && points.every((point) => point.value !== 0)
        && tail.length === grid.length
        && tail.filter((point) => 'value' in point).length === 1,
      `7 -> a reading, and NaN, null, Infinity, a string and a missing row -> a point with no value at all (never a zero); a one-point series over ${grid.length} bars yields ${tail.length} points of which ${tail.filter((p) => 'value' in p).length} carries a reading`,
    );
  }

  /* ---- the plot key comes from the manifest, which read it off `plotConfig` ----------------- */
  {
    // The negative control that matters: the result ALSO carries a full `plot0`, and the row does
    // not promise it. An adapter that assumed `plot0` would draw those numbers instead.
    const source = adapter.studySourceFor(
      syntheticRow(['alpha']),
      syntheticEntry({ alpha: [{ value: 11 }, { value: 12 }], plot0: [{ value: 91 }, { value: 92 }] }),
      {},
    );
    const drawn = source.series();
    const [points] = pointsOf(source, BARS_A.slice(0, 2));
    const readings = points.map((point) => point.value);

    const named = MANIFEST.filter((row) => row.plotIds.some((key) => !/^plot\d+$/.test(key)));
    const lookup = adapter.sourceLookupFor({ indicatorRegistry: registry }, undefined);
    const wrongKeys = MANIFEST.filter((row) => {
      const ids = (lookup(row.id)?.series() ?? []).map((plot) => String(plot.spec.id));
      return ids.join('|') !== row.plotIds.map((key) => `${row.id}.${key}`).join('|');
    }).map((row) => row.id);
    // Every key the manifest promises is a key the vendor DECLARES and does not hide, so a hidden
    // level never becomes a line: `drawablePlotIds` is the same predicate the generator used.
    const undeclared = MANIFEST.filter((row) => {
      const entry = byId.get(row.id);
      const drawable = entry === undefined ? [] : drawablePlotIds(entry);
      return row.plotIds.some((key) => !drawable.includes(key));
    }).map((row) => row.id);

    check(
      'adapter.the-plot-key-comes-from-the-plot-config',
      drawn.length === 1 && String(drawn[0].spec.id) === 'synthetic.alpha'
        && JSON.stringify(readings) === JSON.stringify([11, 12])
        && wrongKeys.length === 0 && undeclared.length === 0 && named.length > 0,
      wrongKeys.length === 0 && undeclared.length === 0
        ? `an entry whose only promised plot is \`alpha\` draws alpha and never the \`plot0\` sitting beside it in the same result; all ${MANIFEST.length} offered entries draw exactly the keys the manifest promises, ${named.length} of them under a key that is not \`plotN\`, and every one of those keys is declared and unhidden in the vendor's own plotConfig`
        : `${wrongKeys.length} draw keys the manifest does not promise (${wrongKeys.slice(0, 5).join(', ')}); ${undeclared.length} promise a key the vendor hides or never declares (${undeclared.slice(0, 5).join(', ')})`,
    );
  }

  /* ---- a computation that throws costs ONE study, and ONE attempt --------------------------- */
  {
    const grid = BARS_A.slice(0, 4);
    const failing = { calls: 0 };
    const passing = { calls: 0 };
    const broken = adapter.studySourceFor(
      syntheticRow(['plot0', 'plot1', 'plot2']),
      syntheticEntry({}, { throws: true, count: failing }),
      {},
    );
    const whole = adapter.studySourceFor(
      syntheticRow(['plot0', 'plot1', 'plot2']),
      syntheticEntry({ plot0: [{ value: 1 }], plot1: [{ value: 2 }], plot2: [{ value: 3 }] }, { count: passing }),
      {},
    );
    let threw = 0;
    for (const plot of broken.series()) {
      try { plot.provider.compute(grid); } catch { threw += 1; }
    }
    const neighbour = pointsOf(whole, grid);
    check(
      'adapter.a-computation-that-throws-costs-one-study-and-one-attempt',
      threw === 3 && failing.calls === 1
        && passing.calls === 1 && neighbour.length === 3
        && neighbour.every((points) => points.length === grid.length)
        && neighbour[2][0].value === 3,
      `a three-plot study whose computation throws reports on all ${threw} of its plots — which is where \`resolveSources\` catches it per plot and leaves every other study drawn — after exactly ${failing.calls} attempt, not one per plot; the study beside it computes ${passing.calls} time and draws all ${neighbour.length} of its lines`,
    );
  }

  /* ---- the `unknown` is narrowed HERE, and out of range is REFUSED, never clamped ----------- */
  {
    const row = syntheticRow(['plot0'], {
      inputs: [
        { id: 'len', type: 'int', defval: 14, fallbackTitle: 'Length', min: 1, max: 500 },
        { id: 'mult', type: 'float', defval: 2, fallbackTitle: 'Multiplier', min: 0.001 },
        { id: 'src', type: 'enum', defval: 'close', fallbackTitle: 'Source', options: ['close', 'open'] },
        { id: 'on', type: 'bool', defval: false, fallbackTitle: 'Enabled' },
      ],
    });
    const read = (held) => adapter.readStudyValues(held, row);
    const notAnObject = [null, undefined, 7, 'x', true, [1, 2], new Date()].map((raw) => JSON.stringify(read(raw)));
    const inherited = read(Object.create({ len: 20 }));
    const refused = read({ len: 0, mult: 2 });
    const notAnInteger = read({ len: 1.5 });
    const overMax = read({ len: 900 });
    const translated = read({ src: 'fechamento' });
    const undeclared = read({ nothingDeclaresThis: 3 });
    const kept = read({ len: 30, mult: 1.5, src: 'open', on: true });

    const settings = adapter.coerceStudySettingsFor([row])(
      { synthetic: { len: 30 }, gone: { len: 30 } },
      ['synthetic'],
    );
    const dropped = adapter.coerceStudySettingsFor([row])({ synthetic: { len: 30 } }, []);
    const preFeature = adapter.coerceStudySettingsFor([row])(undefined, ['synthetic']);

    check(
      'adapter.a-stored-value-is-refused-rather-than-clamped',
      notAnObject.every((seen) => seen === '{}')
        && JSON.stringify(inherited) === '{}'
        && JSON.stringify(refused) === '{"mult":2}'
        && JSON.stringify(notAnInteger) === '{}'
        && JSON.stringify(overMax) === '{}'
        && JSON.stringify(translated) === '{}'
        && JSON.stringify(undeclared) === '{}'
        && JSON.stringify(kept) === '{"len":30,"mult":1.5,"src":"open","on":true}'
        && JSON.stringify(settings) === '{"synthetic":{"len":30}}'
        && JSON.stringify(dropped) === '{}'
        && JSON.stringify(preFeature) === '{}',
      'null, undefined, 7, "x", true, [1,2] and a Date all narrow to no values; a key reachable only through the prototype chain yields none; 0 against min 1 and 900 against max 500 are REFUSED rather than rewritten to the bound, and the neighbouring value in the same study survives; 1.5 against an int and a translated word against an enum are refused; a study no longer in the list is dropped, and a payload written before this feature loads with no values and no throw',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// STAGE 12 — THE CHANNELS, AND THE COUNT OF LINES.
//
// WHAT LET 199 AMPUTATED INDICATORS PASS 320/320. Every stage above verifies vendor -> domain: the
// numbers are right, the points are timed by their own bar, the controls move the drawing. Not one
// of them asks whether what the vendor EMITS is what the chart DRAWS, and the manifest recorded
// every drop honestly while nothing failed on it. This stage is the other half of the chain.
//
// AND THE COMPARISON IS ENUMERATED FROM THE RESULT, never from a list of channel names — because a
// list of names is precisely how the biggest channel of all went uncounted. `channelsOf` walks
// `Object.keys(result)` and counts an object payload like an array one; a name nobody wrote down is
// therefore still seen, and a `plotCandles` is no longer invisible for being the wrong shape.
//
// VERIFIED BY DELETION, three times, and each stub left a DIFFERENT direction red while the other
// two stayed live: blinding `channelsOf` to an unknown channel turned only the object-shaped
// direction red; refusing nothing for width turned only the narrow-width direction red; and
// silencing the declaration comparison turned only the dropped-channel direction red. Three
// plantings against three clauses, so no one of them is carrying the other two.
//
// THE LINE COUNT IS JUDGED AGAINST WHAT IS LIVE, NOT AGAINST WHAT IS DECLARED, and the difference
// is not small: measured over this fixture, 949 plots of the 1,026 declared carry a finite value,
// so 77 are dead across 23 of the 310 rows and a proof written against the declared count would be
// red on 23 rows for ever. The declared number sizes the RESOURCE — `auto-support` brings 40 of its
// 56 alive at 1,024 bars and 24 at 240, so a window-sized resource would drop the rest in silence —
// and the live number judges the DRAWING. Both numbers are needed and they are not the same number.
// ---------------------------------------------------------------------------------------------

{
  const drift = [];
  const undrawn = [];
  const noRoom = [];
  const differing = [];
  let declaredPlots = 0;
  let livePlots = 0;
  const declaredWidths = CATALOGUE.widths;

  /**
   * ONE definition, two callers: the sweep below and the plantings under it. A planting that walked
   * its own copy of this comparison would be a second declaration of one fact, and the day somebody
   * corrects one copy the other goes on printing PASS about a rule nobody applies any more.
   */
  const driftOf = (result, row) => {
    const seen = channelsOf(result);
    const declared = row.channels ?? {};
    const missed = [];
    for (const [channel, count] of Object.entries(seen.counts)) {
      if (declared[channel] !== count) missed.push(`${row.id}: emits ${count} ${channel} and the manifest declares ${declared[channel] ?? 'none'}`);
    }
    for (const channel of Object.keys(declared)) {
      if (seen.counts[channel] === undefined) missed.push(`${row.id}: the manifest declares ${channel} and the result carries none`);
    }
    return { missed, unknown: seen.unknown.map((channel) => `${row.id}: ${channel}`) };
  };

  for (const row of MANIFEST) {
    const entry = byId.get(row.id);
    if (entry === undefined) continue;
    let result;
    try { result = entry.calculate(BARS_A, entry.defaultInputs); } catch { continue; }

    const compared = driftOf(result, row);
    drift.push(...compared.missed);
    undrawn.push(...compared.unknown);

    const live = row.plotIds.filter((key) =>
      (result.plots?.[key] ?? []).some((point) => isNum(point?.value)),
    ).length;
    declaredPlots += row.plotIds.length;
    livePlots += live;
    if (live !== row.plotIds.length) differing.push(`${row.id} ${live}/${row.plotIds.length}`);
    const room = row.placement === 'over-price' ? declaredWidths.overPrice : declaredWidths.ownPane;
    if (live > room) noRoom.push(`${row.id}: ${live} live lines against a declared ${row.placement} width of ${room}`);
  }

  check(
    'channels.every-member-the-result-carries-is-what-the-manifest-declares',
    drift.length === 0,
    drift.length === 0
      ? `${MANIFEST.length} offered rows, every top-level member of every result enumerated from the result itself and compared against the row that offers it — the seven drawn channels, counted, with an object payload counted like an array one`
      : `${drift.length} divergence(s): ${drift.slice(0, 6).join(' · ')}`,
  );

  check(
    'channels.no-offered-row-emits-a-channel-nothing-draws',
    undrawn.length === 0,
    undrawn.length === 0
      ? 'not one offered row carries a top-level member the host has nowhere to paint — the generator refuses to write such a row, and this is the other side of that refusal read off the committed artefact'
      : `${undrawn.length} offered row(s) emit a channel nothing draws: ${undrawn.slice(0, 8).join(' · ')}`,
  );

  check(
    'lines.every-live-plot-has-a-slot-in-the-declared-resource',
    noRoom.length === 0 && differing.length > 0,
    noRoom.length === 0
      ? `${livePlots} live plots of ${declaredPlots} declared over ${BARS_A.length} bars — ${declaredPlots - livePlots} dead across ${differing.length} rows, worst ${differing[0]} — and every live one fits the resource the manifest declares (over-price ${declaredWidths.overPrice}, own-pane ${declaredWidths.ownPane}). The two numbers are DIFFERENT numbers: judging the drawing by the declared count would be red on ${differing.length} rows for ever, and sizing the resource by the live count would drop what a longer window brings alive`
      : `${noRoom.length} row(s) resolve more live lines than the declared resource holds: ${noRoom.slice(0, 6).join(' · ')}`,
  );

  /* ---- THE THREE PLANTINGS, one per clause -------------------------------------------------- *
   * Each of the three clauses above gets a synthetic case that is red ONLY under it, so the set it
   * judges is demonstrably non-empty and stubbing any one of the three leaves the other two red on
   * their own planting. A single planting would leave two clauses passing over nothing, which is
   * the failure shape this repository has now recorded twice.                                    */
  {
    // 1. A DROPPED CHANNEL: the result carries a fill and the row that offers it declares none.
    const droppedFill = driftOf({ plots: { plot0: [] }, fills: [{ plot1: 'a', plot2: 'b' }] }, { id: 'planted' });
    // 2. AN OBJECT-SHAPED CHANNEL: `Array.isArray` answers false, which is how ten offered rows
    //    emitted a `plotCandles` or a `tables` and the manifest declared they emitted nothing.
    const objectShaped = driftOf({ plots: { plot0: [] }, plotCandles: { candle0: [1, 2, 3] } }, { id: 'planted' });
    // 3. A WIDTH NARROWER THAN THE ROWS WRITTEN UNDER IT: the real catalogue judged against a
    //    resource one line short of what it declares — the exact defect the host shipped, where a
    //    five-plot Ichimoku met one over-price slot and drew a single line.
    const narrowed = refusalsOf(MANIFEST, {
      overPrice: declaredWidths.overPrice - 1,
      ownPane: declaredWidths.ownPane,
    });
    // And the same three inputs told the truth: the honest direction of every clause.
    const honestChannel = driftOf({ plots: { plot0: [] }, fills: [{ plot1: 'a' }] }, { id: 'planted', channels: { fills: 1 } });
    const honestWidth = refusalsOf(MANIFEST, widthsOf(MANIFEST));

    const verdicts = [
      droppedFill.missed.length === 1 && droppedFill.missed[0].includes('fills') && droppedFill.unknown.length === 0,
      objectShaped.unknown.length === 1 && objectShaped.unknown[0].includes('plotCandles') && objectShaped.missed.length === 0,
      narrowed.length > 0 && narrowed.every((refusal) => refusal.reason === 'wider than the resource declared for it'),
      honestChannel.missed.length === 0 && honestChannel.unknown.length === 0,
      honestWidth.length === 0,
    ];

    check(
      'channels.the-comparison-discriminates-in-three-independent-directions',
      verdicts.every(Boolean),
      verdicts.every(Boolean)
        ? `a fill the result carries and the row does not declare is caught by the declaration clause ALONE; an object-shaped channel is caught by the nothing-draws clause ALONE, and under \`Array.isArray\` it was caught by neither; a resource one line short of what the catalogue declares refuses ${narrowed.length} row(s), the widest first. Three plantings, three different clauses — so stubbing any one of them leaves another red, and none of the three is passing over an empty set`
        : `dropped-channel→red ${verdicts[0]}, object-shaped→red ${verdicts[1]}, narrow-width→red ${verdicts[2]}, honest-channel→green ${verdicts[3]}, honest-width→green ${verdicts[4]}`,
    );
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\nindicator-proof: ${checks.length - failed.length}/${checks.length} passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(failed.length === 0 ? 0 : 1);
