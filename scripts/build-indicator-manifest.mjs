#!/usr/bin/env node
/**
 * THE COMMITTED CATALOGUE, GENERATED — and it cannot change behind the check.
 *
 * `example/indicators/manifest.json` is what the demo offers, and it is DERIVED from the vendor
 * rather than typed: 457 entries with 1744 declared inputs is not a list anybody maintains by hand,
 * and a hand-maintained one agrees with the library on the day it is written and lies afterwards.
 *
 * ── WHAT MAKES A VENDOR UPGRADE VISIBLE ────────────────────────────────────────────────────────
 *
 * NAMES AND SHAPES ARE NOT ENOUGH. A check that compares the ids, the plot keys and the input
 * shapes is green when a release changes what a number IS — which is the upgrade that matters and
 * the one nobody would notice. `fingerprints.json` therefore digests the computed VALUES: the
 * finite readings of every promised plot, over a fixed seeded fixture, at the entry's own defaults.
 * `npm run proof` re-derives those digests and compares. A release that moves a value by one part
 * in a billion turns it red and names the indicator.
 *
 * AND A DIGEST THAT MOVED IS DECLARED, NOT REGENERATED. The line above had one hole and it was the
 * ordinary workflow: regenerating the fingerprints is part of taking the release, so the number
 * moves, the file moves with it, and the gate is green over a value nobody read. Measured with an
 * inverted-weight `wma`, 2.1% wrong, shipped the way a release arrives — every check passed. So the
 * generator refuses to write, and `--check` refuses to pass, while a digest has moved and
 * `value-changes.json` does not say why. See `indicator-proof/value-ledger.mjs`.
 *
 * THE VENDOR VERSION IS PINNED EXACTLY, NOT BY RANGE. This is the doctrine `size-budget.json`
 * already applies to esbuild, for the same reason: a reference number that moves on its own turns
 * a gate into noise, because a failure stops meaning "regression" and starts meaning "dependency
 * update". `package.json` carries `0.5.0`, not `^0.5.0`, and the proof asserts the shape.
 *
 * AN ID THAT VANISHES STOPS THE BUILD. The generator can see that an id in the committed manifest
 * is gone from the library; it CANNOT see whether the vendor renamed it or removed it, and those
 * two have opposite consequences for a host's saved workspaces. So it refuses to write until a
 * human writes which, in `renames.json`, which is append-only. Silent loss only gets through a red
 * build.
 *
 * ── WHAT IT DECIDES, AND WHAT DECIDES IT ───────────────────────────────────────────────────────
 *
 * Placement is MEASURED with this package's own rule, not read from `metadata.overlay`. Four
 * entries declare `overlay: true` and are oscillators — `easy-trend-colors`, `scalping-line`,
 * `volume-linreg-trend`, `tops-bottoms` — and drawing them on the price axis puts a line at 0.5
 * beside a price of 116. The rule is `onPriceScale` (`src/indicator/availability.ts:57-68`) with
 * `CALIBRATED_PRICE_NEIGHBOURHOOD` (= 3, `src/catalogue/sources.ts:35`), reimplemented here so the
 * generator does not import from `src/`.
 *
 * A control is offered only when it moves THE DRAWING, and "the drawing" has exactly one definition
 * in this repository — `scripts/indicator-proof/drawing.mjs`, imported by both this generator and
 * the proof that judges it. Two definitions were tried and they disagreed on six controls.
 *
 * Usage:  node scripts/build-indicator-manifest.mjs [--check]
 *   --check   derive and compare, write nothing, exit non-zero on any difference
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as vendor from 'lightweight-charts-indicators';
import { input as oakInput } from 'oakscriptjs';

import { FIXTURE_A, FIXTURE_B } from './indicator-proof/bars.mjs';
import { candidatesFor } from './indicator-proof/sensor.mjs';
import { drawablePlotIds, movesTheDrawing } from './indicator-proof/drawing.mjs';
import { declaredLevels, guideOf } from './indicator-proof/guide.mjs';
import { sealOf, tallyOf } from './indicator-proof/seal.mjs';
import { UNVERSIONED_ENCODING, VALUE_DIGEST_WHY, VALUE_ENCODING } from './indicator-proof/value-encoding.mjs';
import { valueLedgerFaults, valueLedgerRefusal } from './indicator-proof/value-ledger.mjs';
import {
  EXCLUSION_MEASUREMENTS,
  HOST_BOUNDS,
  MANIFEST_PATHS,
  PRICE_NEIGHBOURHOOD,
  SETTLE_CUTS,
  channelsOf,
  digestOf,
  refusalsOf,
  settleWithinBars,
  vendorPin,
  widthsOf,
  withdrawalFaults,
  withdrawalRefusal,
} from './indicator-proof/manifest-shape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const path = (name) => join(HERE, '..', MANIFEST_PATHS[name]);
const readJson = (name) => JSON.parse(readFileSync(path(name), 'utf8'));
const CHECK_ONLY = process.argv.includes('--check');

const DEFECTS = JSON.parse(readFileSync(join(HERE, 'indicator-proof', 'DEFECT_LEDGER.json'), 'utf8'));
const RENAMES = readJson('renames');
const VALUE_CHANGES = readJson('valueChanges');
const WITHDRAWALS = readJson('withdrawals');
const PIN = vendorPin(JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')));

/** THE VENDOR NAMES ITS OWN SOURCES. Never typed out here. */
const SOURCE_OPTIONS = oakInput.source().options;

const FIXTURES = [FIXTURE_A(), FIXTURE_B()];
/**
 * TWO fixtures probe the CONTROLS and THREE judge LIVENESS, and the asymmetry is deliberate.
 *
 * "This control is live" is an EXISTENTIAL claim — a divergence lookback genuinely changes nothing
 * on a window holding no divergence, so one window proving it is enough. "This indicator draws" is
 * a UNIVERSAL one: a study that says nothing on some ordinary window is the silent toggle the spec
 * forbids, so every fixture has to agree.
 */
const LIVENESS = [...FIXTURES, seededWalk(400, 20260821)];

function seededWalk(count, seed) {
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
  const bars = [];
  let price = 100;
  let time = 1_700_000_000;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const close = Math.max(1, open + (rnd() - 0.48) * 1.6);
    bars.push({ time, open, high: Math.max(open, close) + rnd() * 0.8, low: Math.min(open, close) - rnd() * 0.8, close, volume: Math.round(1000 + rnd() * 9000) });
    price = close;
    time += 3600;
  }
  return bars;
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const isColourish = (v) => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v);
const median = (xs) => { const t = [...xs].sort((a, b) => a - b); return t[(t.length - 1) >> 1]; };
const sameNumber = (a, b) =>
  typeof a === 'number' && typeof b === 'number'
    ? (Number.isFinite(a) || Number.isFinite(b) ? a === b : true)
    : a === b;

const excludingDefect = new Map(DEFECTS.filter((d) => d.excludes).map((d) => [d.id, d]));
const renderVariants = DEFECTS.filter(
  (d) => d.class === 'duplicate-plot-render-variant' || d.class === 'duplicate-plot-same-quantity-SUSPECT',
);

/**
 * WHERE THE LINE IS DRAWN, measured rather than declared.
 *
 * `over-price` only when at least one promised plot sits in the price neighbourhood on at least one
 * fixture, and none sits outside it on BOTH. A trades around 116 and B around 4200, so an entry
 * off-scale on both is off-scale because its levels are ABSOLUTE — which is `bitcoin-log-curves`,
 * excluded by measurement in the defect ledger, not repositioned.
 */
function placementOf(entry, plotIds, results) {
  if (entry.overlay !== true) return { placement: 'own-pane', mixed: false };
  const perFixture = FIXTURES.map((bars, at) => {
    const priceMid = median(bars.map((b) => b.close));
    const off = [];
    const on = [];
    for (const key of plotIds) {
      const magnitudes = (results[at].plots?.[key] ?? []).map((p) => p?.value).filter(finite).map(Math.abs);
      if (magnitudes.length === 0) continue;
      const scale = median(magnitudes);
      if (scale >= priceMid / PRICE_NEIGHBOURHOOD && scale <= priceMid * PRICE_NEIGHBOURHOOD) on.push(key);
      else off.push(key);
    }
    return { off, on };
  });
  const offBoth = perFixture[0].off.filter((k) => perFixture[1].off.includes(k));
  const anyOn = perFixture[0].on.length > 0 || perFixture[1].on.length > 0;
  if (offBoth.length === 0) return { placement: 'over-price', mixed: false };
  return { placement: 'own-pane', mixed: anyOn };
}

const rejected = [];
const indicators = [];
const byId = new Map(registryOf().map((e) => [e.id, e]));

function registryOf() { return vendor.indicatorRegistry; }

for (const entry of registryOf()) {
  const say = (reason, detail) => rejected.push({ id: entry.id, reason, ...(detail === undefined ? {} : { detail }) });

  // ADAPT-07 — the untyped path. An entry reachable only through `indicatorRegistry.find(...)`
  // arrives as `calculate: any`: nothing at compile time ties the inputs to `inputConfig` or the
  // result to the shape the adapter expects, and the adapter is built entirely on the typed
  // surface. The proof would catch a shape change in CI; the type catches it in the compiler, and
  // both are wanted.
  const exported = Object.values(vendor).some((v) => v !== null && typeof v === 'object' && v.calculate === entry.calculate);
  if (!exported) { say('reachable only through the untyped registry'); continue; }

  const defect = excludingDefect.get(entry.id);
  if (defect !== undefined) { say(`confirmed defect: ${defect.class}`, defect.detail); continue; }

  let results;
  try { results = FIXTURES.map((bars) => entry.calculate(bars, entry.defaultInputs)); }
  catch (error) { say('threw at its own defaults', error.message); continue; }

  if (Object.keys(results[0].plots ?? {}).length === 0) { say('returns no plot series'); continue; }

  const plotIds = drawablePlotIds(entry);
  if (plotIds.length === 0) { say('every declared plot is hidden'); continue; }
  if (!plotIds.some((id) => results.some((r) => Array.isArray(r.plots?.[id])))) {
    say('every declared plot is absent from the result'); continue;
  }

  let liveEverywhere = true;
  for (const bars of LIVENESS) {
    let out;
    try { out = entry.calculate(bars, entry.defaultInputs); } catch { liveEverywhere = false; break; }
    if (!plotIds.some((id) => (out.plots?.[id] ?? []).some((p) => finite(p.value)))) { liveEverywhere = false; break; }
  }
  if (!liveEverywhere) { say('no plot carries a finite value on one of the three fixtures'); continue; }

  // A fill whose reading nothing else carries. The COARSE version of this rule cut 130 entries,
  // the RSI among them — and this harness proved that RSI correct to 2.8e-14. A fill IS the
  // reading only when neither of its bounds is already on screen.
  const seriesOf = (id) => results[0].plots?.[id] ?? [];
  const onScreen = (id) => {
    if (plotIds.includes(id)) return true;
    const points = seriesOf(id).map((p, i) => [i, p?.value]).filter(([, v]) => finite(v));
    if (points.length === 0) return true;
    if (new Set(points.map(([, v]) => v)).size === 1) return true;
    const projections = [
      (b) => b.open, (b) => b.high, (b) => b.low, (b) => b.close,
      (b) => (b.high + b.low) / 2, (b) => (b.open + b.close) / 2,
      (b) => (b.high + b.low + b.close) / 3, (b) => (b.open + b.high + b.low + b.close) / 4,
    ];
    if (projections.some((pick) => points.every(([i, v]) => Math.abs(pick(FIXTURES[0][i]) - v) < 1e-9))) return true;
    return plotIds.some((drawn) => points.every(([i, v]) => Math.abs((seriesOf(drawn)[i]?.value ?? NaN) - v) < 1e-9));
  };
  const hlineIds = new Set((results[0].hlines ?? []).map((h, i) => h.id ?? `hline_${i}`));
  if ((results[0].fills ?? []).some((f) => [f.plot1, f.plot2].some((b) => !hlineIds.has(b) && !onScreen(b)))) {
    say('its reading depends on a fill this package does not draw'); continue;
  }

  const { placement, mixed } = placementOf(entry, plotIds, results);
  if (mixed) { say('mixed scale: some plots are denominated in price and some are not, so no single placement is right'); continue; }

  /* ---- the controls the form may offer ----------------------------------- */
  const controls = [];
  for (const config of entry.inputConfig ?? []) {
    if (config.type === 'color' || isColourish(config.defval)) continue;
    const moved = movesTheDrawing(entry, config, plotIds, FIXTURES);
    if (moved === null) continue;
    const bound = HOST_BOUNDS[`${entry.id}.${config.id}`];
    controls.push({
      id: config.id,
      type: config.type === 'source' || config.type === 'string' ? 'enum' : config.type,
      defval: entry.defaultInputs[config.id],
      fallbackTitle: config.title ?? config.id,
      ...(config.min === undefined ? {} : { min: config.min }),
      ...(config.max === undefined ? (bound === undefined ? {} : { max: bound.max }) : { max: config.max }),
      ...(config.step === undefined ? {} : { step: config.step }),
      ...(moved.gate === null ? {} : { gatedBy: moved.gate }),
      ...(config.type === 'source' ? { options: SOURCE_OPTIONS }
        : config.type === 'string' ? { options: config.options ?? [] } : {}),
    });
  }

  /* ---- one quantity carried under two styles is drawn once --------------- */
  const collapse = [];
  const identical = (a, b) => FIXTURES.every((bars, f) => {
    const sa = results[f].plots?.[a] ?? [];
    const sb = results[f].plots?.[b] ?? [];
    return sa.length === sb.length && sa.length > 0 && sa.every((p, i) => sameNumber(p?.value, sb[i]?.value));
  });
  for (const row of renderVariants.filter((d) => d.id === entry.id)) {
    const pair = [...row.detail.matchAll(/\((\w+), style/g)].map((m) => m[1]);
    if (pair.length !== 2 || !plotIds.includes(pair[0]) || !plotIds.includes(pair[1])) continue;
    if (!identical(pair[0], pair[1])) continue;
    // ...and it has to STAY identical under every control the form offers, or collapsing would
    // hide a divergence the user is able to create.
    const diverges = controls.some((control) => {
      const config = (entry.inputConfig ?? []).find((i) => i.id === control.id);
      return candidatesFor(config).some((candidate) => {
        let probe;
        try { probe = entry.calculate(FIXTURES[0], { ...entry.defaultInputs, [control.id]: candidate }); } catch { return false; }
        const sa = probe.plots?.[pair[0]] ?? [];
        const sb = probe.plots?.[pair[1]] ?? [];
        return sa.length !== sb.length || sa.some((p, i) => !sameNumber(p?.value, sb[i]?.value));
      });
    });
    if (!diverges && !collapse.some(([, drop]) => drop === pair[1])) collapse.push([pair[0], pair[1]]);
  }
  const kept = plotIds.filter((id) => !collapse.some(([, drop]) => drop === id));

  const levels = declaredLevels(entry, results[0]).sort((a, b) => a - b);
  const guide = guideOf(levels);

  /* ---- what the row asks to be drawn, ENUMERATED FROM THE RESULT --------- *
   * The list of nine names this replaces asked `Array.isArray`, so the two object-shaped channels
   * counted zero: ten offered rows emitted a `plotCandles` or a `tables` and the manifest recorded
   * that they emitted nothing. A row whose channel nobody paints is REFUSED here rather than
   * offered with a piece missing, which is the same sentence the spec writes about a fill whose
   * bounds do not resolve and about a study wider than its lane.                                */
  const { counts: channels, unknown } = channelsOf(results[0]);
  if (unknown.length > 0) { say('emits a channel nothing draws', unknown.join(', ')); continue; }

  indicators.push({
    id: entry.id,
    fallbackLabel: entry.metadata?.title ?? entry.name,
    fallbackShortLabel: entry.metadata?.shortTitle ?? entry.shortName,
    category: entry.category,
    placement,
    plotIds: kept,
    plotTitles: kept.map((id) => entry.plotConfig.find((p) => p.id === id)?.title ?? id),
    inputs: controls,
    ...(guide === undefined ? {} : { guide }),
    ...(levels.filter((l) => l !== guide).length > 0 ? { extraLevels: levels.filter((l) => l !== guide) } : {}),
    ...(collapse.length > 0 ? { collapsed: collapse } : {}),
    ...(Object.keys(channels).length > 0 ? { channels } : {}),
  });
}

/* ---- the seal, and the settle window, both carried per indicator --------- */
const seal = sealOf(indicators, byId, FIXTURES[0]);
const fingerprints = {};
for (const row of indicators) {
  const entry = byId.get(row.id);
  row.verification = seal[row.id];
  row.confirmsWithinBars = settleWithinBars(entry, row.plotIds, FIXTURES[0]);
  fingerprints[row.id] = {
    values: digestOf(entry, row.plotIds, FIXTURES[0]),
    confirmsWithinBars: row.confirmsWithinBars,
  };
}

/* ---- AN ID THAT VANISHED STOPS THE BUILD --------------------------------- */
{
  const committed = readJson('manifest');
  const derived = new Set(indicators.map((r) => r.id));
  const renamedFrom = new Map((RENAMES.renames ?? []).map((r) => [r.from, r]));
  // AN ID THIS RUN REFUSED, WITH ITS REASON, IS NOT AN ID THAT VANISHED — it is a WITHDRAWAL, and
  // it answers to the ledger below instead. The block this sits in exists because the generator can
  // see that an id left the LIBRARY and cannot see whether it was renamed or removed; that
  // ambiguity does not exist for a row still in the registry that a rule here turned down. But
  // exempting those outright removed the only ratchet on catalogue size: three ordinary indicators
  // were withdrawn behind a new rule and 307 rows were written with every gate green.
  const refused = new Map(rejected.map((r) => [r.id, r.reason]));
  const unexplained = [];
  for (const row of committed.indicators ?? committed) {
    if (derived.has(row.id)) continue;
    const rename = renamedFrom.get(row.id);
    if (rename !== undefined && derived.has(rename.to)) continue;
    if (excludingDefect.has(row.id)) continue;
    if (refused.has(row.id)) continue;
    unexplained.push(row.id);
  }
  /* ---- AND A WITHDRAWAL THAT NOBODY SIGNED STOPS IT TOO -------------------- *
   * The generator already knows WHY it turned each of these down and prints it. What it cannot
   * know is whether losing the row is acceptable, and a host's saved workspace loses a withdrawn
   * id exactly as hard as one the vendor deleted. So the reason is not invented here; it is
   * SIGNED in example/indicators/withdrawals.json, and until it is the build is red.        */
  const undeclared = withdrawalFaults({
    offered: (committed.indicators ?? committed).map((row) => row.id),
    derived,
    refused,
    ledger: WITHDRAWALS,
  });
  if (undeclared.length > 0) {
    console.error(withdrawalRefusal(undeclared, MANIFEST_PATHS.withdrawals));
    process.exit(1);
  }
  const withdrawn = (committed.indicators ?? committed)
    .filter((row) => !derived.has(row.id) && refused.has(row.id))
    .map((row) => `${row.id} — ${refused.get(row.id)}`);
  if (withdrawn.length > 0) {
    console.error(
      `build-indicator-manifest: WITHDRAWING ${withdrawn.length} declared row(s) the committed ` +
      `manifest still offers, each because a rule in this generator turned it down:\n  ${withdrawn.join('\n  ')}`,
    );
  }
  if (unexplained.length > 0) {
    console.error(
      `build-indicator-manifest: REFUSING to write. ${unexplained.length} id(s) in the committed ` +
      `manifest are gone from the library and nothing says why: ${unexplained.join(', ')}.\n` +
      'This generator can see that the id disappeared. It CANNOT see whether the vendor renamed it ' +
      'or removed it, and those two have opposite consequences for a host\'s saved workspaces — a ' +
      'rename can migrate, a removal cannot. Write which in example/indicators/renames.json, which ' +
      'is append-only, or record the removal in scripts/indicator-proof/DEFECT_LEDGER.json with its ' +
      'measurement. Silent loss only gets through a red build.',
    );
    process.exit(1);
  }
}

/* ---- A NUMBER THAT MOVED WITHOUT A DECLARATION STOPS THE BUILD ----------- *
 * Same doctrine as the block above, one level down: that one refuses while an ID has vanished and
 * nothing says whether it was renamed or removed; this one refuses while a VALUE has moved and
 * nothing says whether the vendor fixed a defect or shipped one. Regenerating the digests as part
 * of taking a release is what turned the fingerprint check into a check of itself. The committed
 * manifest comes in with it because an ABSENT digest and a NEW indicator are the same shape, and
 * only the manifest knows which of the two this is — deleting the entry is cheaper than forging it.
 * See scripts/indicator-proof/value-ledger.mjs for what it closes and what it does not.       */
{
  const onFile = readJson('manifest');
  const offered = (onFile.indicators ?? onFile).map((row) => row.id);
  const onDisk = readJson('fingerprints');
  const committed = onDisk.entries ?? {};
  const encoding = { committed: onDisk.algorithm?.id ?? UNVERSIONED_ENCODING, derived: VALUE_ENCODING.id };
  const faults = valueLedgerFaults({ committed, derived: fingerprints, ledger: VALUE_CHANGES, offered, encoding });
  if (faults.length > 0) {
    console.error(valueLedgerRefusal(faults, MANIFEST_PATHS.valueChanges));
    process.exit(1);
  }
}

/* ---- AND A ROW THAT CANNOT BE DRAWN WHOLE IS NOT WRITTEN ----------------- *
 * The widths are DERIVED from the rows above, so on this generator's own output the set below is
 * empty by construction — a maximum is not exceeded by what it is the maximum of. It is asserted
 * anyway, and by the same function `scripts/indicator-proof.mjs` calls with the widths the
 * COMMITTED file declares: one mechanism, and the two risks it closes are a width that stops
 * describing the rows under it and a channel nobody counted.                                    */
const widths = widthsOf(indicators);
{
  const refusals = refusalsOf(indicators, widths);
  if (refusals.length > 0) {
    console.error(
      `build-indicator-manifest: REFUSING to write. ${refusals.length} row(s) cannot be drawn ` +
      `whole against the resource this run derived (over-price ${widths.overPrice}, own-pane ` +
      `${widths.ownPane}):\n` +
      refusals.map((r) => `  ${r.id} — ${r.reason}: ${r.detail}`).join('\n') +
      '\nA row offered with a piece missing is the defect this catalogue exists to remove. Either ' +
      'the resource grows to fit it or the row is not offered; it is never both.',
    );
    process.exit(1);
  }
}

const tally = tallyOf(seal);
const manifest = {
  generatedBy: 'scripts/build-indicator-manifest.mjs',
  why: 'DERIVED, never typed: 457 entries with 1744 declared inputs is not a list anybody maintains by hand, and a hand-maintained one agrees with the library on the day it is written and lies afterwards. `npm run proof` verifies every line of it.',
  vendor: PIN,
  fixture: {
    bars: FIXTURES[0].length,
    why: 'the seeded fixture `scripts/indicator-proof/bars.mjs` builds and asserts ten properties of, so that a null answer from it means something',
  },
  seal: tally,
  sealMeaning: {
    pinned: 'a hand-computed golden vector or example/studies.ts fixes its numbers',
    constrained: 'a family invariant that holds regardless of implementation applies AND passes',
    structural: 'it draws, is deterministic, is pure, is aligned and sits on the scale it declares — nothing is claimed about the values',
  },
  exclusions: EXCLUSION_MEASUREMENTS(DEFECTS),
  widths: {
    ...widths,
    why: 'THE HOST\'S DRAWING RESOURCE, DERIVED FROM THE ROWS BELOW rather than typed beside them. Nothing in the library adds a series to the price pane and a lane is built once at mount, so these two numbers are what the host must create before a study can be drawn into them — and a hand-written one is how a five-plot Ichimoku came to draw one line. DECLARED, never observed: `auto-support` brings 24 of its 56 plots alive at 240 bars and 40 at 1024, so sizing by what a window showed would drop the rest in silence.',
  },
  indicators,
};

const fingerprintFile = {
  why: VALUE_DIGEST_WHY,
  declaredIn: 'NOT EDITED BY HAND, AND NOT REGENERATED IN SILENCE EITHER. A digest that moved has to be DECLARED in example/indicators/value-changes.json — the id, the digest it moved from, the digest it moved to and the reason — and until it is, `scripts/build-indicator-manifest.mjs` REFUSES to write and `--check` REFUSES to pass. Deleting an entry is not a way round it: while the committed manifest still offers the id, an absent digest is a proof that vanished, not an indicator that appeared. Typing a number in here to agree with a vendor you patched yourself is the one move this file cannot catch, which is why the sentence you are reading is at the top of the file you would be editing.',
  algorithm: VALUE_ENCODING,
  vendor: PIN,
  entries: fingerprints,
};

const asText = (value) => `${JSON.stringify(value, null, 1)}\n`;
const manifestText = asText(manifest);
const fingerprintText = asText(fingerprintFile);

if (CHECK_ONLY) {
  const same = readFileSync(path('manifest'), 'utf8') === manifestText
    && readFileSync(path('fingerprints'), 'utf8') === fingerprintText;
  console.log(same
    ? `build-indicator-manifest: OK — the committed artefacts are what this generator produces (${indicators.length} offered)`
    : 'build-indicator-manifest: STALE — names, shapes or a DECLARED value moved; re-run without --check and commit the result. An undeclared value never reaches this line: it is refused above.');
  process.exit(same ? 0 : 1);
}

writeFileSync(path('manifest'), manifestText);
writeFileSync(path('fingerprints'), fingerprintText);

const reasons = {};
for (const r of rejected) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
console.log(`build-indicator-manifest: ${indicators.length} offered, ${rejected.length} rejected`);
console.log(JSON.stringify(reasons, null, 1));
console.log(`seal: pinned ${tally.pinned} · constrained ${tally.constrained} · structural ${tally.structural}`);
console.log(`controls offered: ${indicators.reduce((n, r) => n + r.inputs.length, 0)}, of which ${indicators.reduce((n, r) => n + r.inputs.filter((i) => i.gatedBy).length, 0)} only behind a gate`);
console.log(`retroactive: ${indicators.filter((r) => r.confirmsWithinBars > 0).length} entries settle within ${Math.max(...indicators.map((r) => r.confirmsWithinBars))} bars; the rest never restate a closed bar`);
