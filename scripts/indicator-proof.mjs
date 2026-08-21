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
import { ASSERTED_BOUNDS, IFT_BOUNDED } from './indicator-proof/taxonomy.mjs';
import { cases as GOLDEN } from './indicator-proof/golden.mjs';
import * as counter from './indicator-proof/counter-impl.mjs';
import { loadOracle } from './indicator-proof/oracle-source.mjs';
import { PINNED, sealOf, tallyOf } from './indicator-proof/seal.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(join(HERE, path), 'utf8'));

const MANIFEST = read('../example/indicators/manifest.json');
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

/** Does any legal value of this control move a plotted reading or the guide, on either fixture? */
function movesTheDrawing(entry, declared, fixtures) {
  const gates = [null, ...(entry.inputConfig ?? []).filter(
    (i) => i.id !== declared.id && (i.type === 'bool' || (i.type === 'string' && Array.isArray(i.options))),
  )];
  for (const bars of fixtures) {
    for (const gate of gates) {
      const settings = gate === null ? [undefined] : [entry.defaultInputs[gate.id], ...candidatesFor(gate).slice(0, 4)];
      for (const value of settings) {
        const base = gate === null ? { ...entry.defaultInputs } : { ...entry.defaultInputs, [gate.id]: value };
        let baseline;
        try { baseline = entry.calculate(bars, base); } catch { continue; }
        const level = guideFor(entry, baseline);
        for (const candidate of candidatesFor(declared)) {
          let probe;
          try { probe = entry.calculate(bars, { ...base, [declared.id]: candidate }); } catch { continue; }
          if (diffResults(baseline, probe).value) {
            return { how: 'a plotted value', gate: gate?.id ?? null, candidate };
          }
          if (guideFor(entry, probe) !== level) {
            return { how: `the guide (${level} -> ${guideFor(entry, probe)})`, gate: gate?.id ?? null, candidate };
          }
        }
      }
    }
  }
  return null;
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
  const declared = (id) => sma.inputConfig.find((i) => i.id === id);
  const inert = movesTheDrawing(sma, declared('offset'), [BARS_A]);
  const active = movesTheDrawing(sma, declared('len'), [BARS_A]);
  const gated = movesTheDrawing(sma, declared('maLength'), [BARS_A]);
  check(
    'sensor.discriminates-in-both-directions',
    inert === null && active !== null && gated !== null && gated.gate === 'maType',
    `sma.offset -> ${inert === null ? 'inert' : `MOVED ${inert.how}`} · sma.len -> ${active === null ? 'INERT' : `moves ${active.how}`} · sma.maLength -> ${gated === null ? 'INERT' : `moves ${gated.how} behind ${gated.gate}`}`,
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
    const moved = movesTheDrawing(entry, declared, [BARS_A, BARS_B]);
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
    const gate = input.gatedBy ? entry.inputConfig?.find((i) => i.id === input.gatedBy) : null;
    const settings = gate === null || gate === undefined ? [undefined] : [entry.defaultInputs[gate.id], ...candidatesFor(gate).slice(0, 4)];
    let moved = false;
    for (const value of settings) {
      const base = gate === null || gate === undefined ? { ...entry.defaultInputs } : { ...entry.defaultInputs, [gate.id]: value };
      let baseline;
      try { baseline = entry.calculate(BARS_A, base); } catch { continue; }
      const level = guideFor(entry, baseline);
      for (const candidate of candidatesFor(declared)) {
        let probe;
        try { probe = entry.calculate(BARS_A, { ...base, [input.id]: candidate }); } catch { continue; }
        if (diffResults(baseline, probe).value || guideFor(entry, probe) !== level) { moved = true; break; }
      }
      if (moved) break;
    }
    if (!moved) {
      fail(row.id, 'offered-input-does-not-move-the-drawing', `${input.id} (${input.type}, default ${JSON.stringify(input.defval)})${input.gatedBy ? ` gatedBy ${input.gatedBy}` : ''}: no legal value changed any plotted reading or the guide`);
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
      let baseline;
      try { baseline = entry.calculate(BARS_A, entry.defaultInputs); } catch { continue; }
      const level = guideFor(entry, baseline);
      let movesTheDrawn = false;
      let movesSomething = null;
      for (const candidate of candidatesFor(declared)) {
        let probe;
        try { probe = entry.calculate(BARS_A, { ...entry.defaultInputs, [declared.id]: candidate }); } catch { continue; }
        const diff = diffResults(baseline, probe);
        if (diff.value || guideFor(entry, probe) !== level) { movesTheDrawn = true; break; }
        if (diff.colour && movesSomething === null) movesSomething = 'a per-point colour';
        if (diff.other && movesSomething === null) movesSomething = diff.other;
      }
      if (movesTheDrawn) unexplained.push(`${row.id}.${declared.id} (${declared.type}) MOVES THE DRAWING and is not offered`);
      else if (movesSomething !== null) tally.undrawnChannel += 1;
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

const failed = checks.filter((c) => !c.ok);
console.log(`\nindicator-proof: ${checks.length - failed.length}/${checks.length} passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(failed.length === 0 ? 0 : 1);
