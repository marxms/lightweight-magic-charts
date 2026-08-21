#!/usr/bin/env node
/**
 * THE INDICATOR PROOF — the owner's acceptance condition, executed before he executes it.
 *
 * His words: "my first action when you finish will be to test every indicator and make sure they
 * respect the parameterisations and that they are correctly calculated, so you will do this before
 * me." This script is those two claims, made checkable.
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
import { EXCLUSION_MEASUREMENTS, digestOf, settleWithinBars, vendorPin } from './indicator-proof/manifest-shape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(HERE, path), 'utf8'));

const CATALOGUE = read('../example/indicators/manifest.json');
const MANIFEST = CATALOGUE.indicators;
const FINGERPRINTS = read('../example/indicators/fingerprints.json');
const RENAMES = read('../example/indicators/renames.json');
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

  const drifted = [];
  const uncovered = [];
  for (const row of MANIFEST) {
    const entry = byId.get(row.id);
    const committed = FINGERPRINTS.entries?.[row.id];
    if (committed === undefined) { uncovered.push(row.id); continue; }
    const values = digestOf(entry, row.plotIds, BARS_A);
    if (values !== committed.values) drifted.push(`${row.id}: committed ${committed.values.slice(0, 12)}… re-derived ${values.slice(0, 12)}…`);
    const settle = settleWithinBars(entry, row.plotIds, BARS_A);
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

const failed = checks.filter((c) => !c.ok);
console.log(`\nindicator-proof: ${checks.length - failed.length}/${checks.length} passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(failed.length === 0 ? 0 : 1);
