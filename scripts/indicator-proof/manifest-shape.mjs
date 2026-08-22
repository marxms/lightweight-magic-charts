/**
 * THE SHAPE OF THE COMMITTED CATALOGUE, and the three measurements that give it teeth.
 *
 * Written once and imported by both sides on purpose: `scripts/build-indicator-manifest.mjs`
 * PRODUCES the manifest and `scripts/indicator-proof.mjs` RE-DERIVES it. If the two computed a
 * digest, a settle window or a version pin by their own code, a difference between them would read
 * as a vendor change, and the check would be measuring itself.
 */
import { createHash } from 'node:crypto';

import { encodeSeries, encodeSeriesUnquantised } from './value-encoding.mjs';

export const MANIFEST_PATHS = {
  manifest: 'example/indicators/manifest.json',
  fingerprints: 'example/indicators/fingerprints.json',
  renames: 'example/indicators/renames.json',
  valueChanges: 'example/indicators/value-changes.json',
  withdrawals: 'example/indicators/withdrawals.json',
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
 * THE THREE MEMBERS OF A RESULT THAT ARE NOT A CHANNEL.
 *
 * `plots` is the lines themselves, `hlines` is served by the guide, and `metadata` is the row's own
 * name. Everything ELSE the vendor puts on a result is something asking to be drawn.
 */
export const NOT_A_CHANNEL = new Set(['metadata', 'plots', 'hlines']);

/**
 * THE CHANNELS THE HOST DRAWS, and the reason this is a set rather than a comment.
 *
 * A row that emits anything outside it emits something nobody paints, and this repository has now
 * measured that failure twice in the same place: the generator used to walk a hand-written list of
 * NINE channel names and ask `Array.isArray`, so `plotCandles` and `tables` — which arrive as
 * OBJECTS — counted zero and were recorded as emitting nothing. Ten offered rows emitted one and
 * the manifest declared they did not. The list is the defect; the enumeration below is the fix.
 */
export const HOST_CHANNELS = new Set([
  'fills',
  'markers',
  'barColors',
  'bgColors',
  'labels',
  'lines',
  'boxes',
]);

/**
 * EVERY CHANNEL A RESULT CARRIES, ENUMERATED FROM THE RESULT — never from a list of names.
 *
 * An OBJECT payload counts like an array one. `Array.isArray` on `plotCandles` answers false and
 * the count silently became zero, which is how a channel with 2,970 drawable candles in it was
 * recorded as absent. `unknown` is what the host has nowhere to put.
 */
export function channelsOf(result) {
  const counts = {};
  const unknown = [];
  for (const [key, value] of Object.entries(result ?? {})) {
    if (NOT_A_CHANNEL.has(key)) continue;
    const size = Array.isArray(value)
      ? value.length
      : value !== null && typeof value === 'object'
        ? Object.keys(value).length
        : 0;
    if (size === 0) continue;
    if (HOST_CHANNELS.has(key)) counts[key] = size;
    else unknown.push(key);
  }
  return { counts, unknown };
}

/**
 * WHAT THE COMMITTED ARTEFACT WOULD HAVE TO REFUSE, judged against the widths it declares.
 *
 * ONE MECHANISM, TWO RISKS. The generator derives the widths from the rows it writes, so on its own
 * output the set below is empty by construction — a maximum cannot be exceeded by what it is the
 * maximum of. That is exactly why it is written as a function of (rows, widths) and not as a step
 * inside the derivation: the PROOF calls it with the widths the committed file DECLARES, so a
 * width that stops describing the rows underneath it — a hand edit, a partial regeneration, a
 * vendor release read with a stale artefact — is a refusal instead of a study that draws four of
 * its twenty lines. A row that carries a channel nothing draws is the same fault seen from the
 * other side, and it is refused on the same terms.
 */
export function refusalsOf(indicators, widths) {
  const declared = { 'over-price': widths?.overPrice ?? 0, 'own-pane': widths?.ownPane ?? 0 };
  const refusals = [];
  for (const row of indicators) {
    const room = declared[row.placement] ?? 0;
    if (row.plotIds.length > room) {
      refusals.push({
        id: row.id,
        reason: 'wider than the resource declared for it',
        detail: `${row.plotIds.length} plots against a declared ${row.placement} width of ${room}`,
      });
    }
    for (const channel of Object.keys(row.channels ?? {})) {
      if (HOST_CHANNELS.has(channel)) continue;
      refusals.push({
        id: row.id,
        reason: 'emits a channel nothing draws',
        detail: channel,
      });
    }
  }
  return refusals;
}

/**
 * A ROW THE GENERATOR TURNED DOWN THAT THE COMMITTED MANIFEST STILL OFFERS — DECLARED, OR RED.
 *
 * Same doctrine as `renames.json` and `value-changes.json`, one question further along. Those two
 * refuse while an ID has vanished from the LIBRARY and while a VALUE has moved. This one refuses
 * while a rule inside the generator withdraws an indicator the catalogue is already offering.
 *
 * The exemption this replaces was reasoned and wrong in one specific way. A rule the generator
 * applied is not the rename-versus-removal ambiguity the vanished-id block exists for — the reason
 * is written, printed and in the diff — so self-refused rows were let through unremarked. But that
 * removed the ONLY ratchet on catalogue size and nothing took its place: the Verifier withdrew three
 * ordinary indicators behind a new rule and measured 307 rows written with `npm test` 1449/1449,
 * `npm run e2e` 96/96 and `npm run proof` 33/33 green. The only trace was a line on stderr that
 * nothing asserts. And the previous phase's own sentence applies verbatim — the generator refuses a
 * vanished id "because it cannot tell a rename from a removal AND A HOST'S SAVED WORKSPACE CAN". A
 * saved workspace loses `bop` exactly as hard whether the id vanished or was withdrawn.
 *
 * So the reason still does not have to be INVENTED — the generator already printed it. It has to be
 * SIGNED: somebody writes the id and why the loss is acceptable, and until they do, the build is
 * red. `offered` is the committed manifest's ids, `derived` the ids this run would write, `refused`
 * the id -> reason map of what a rule here turned down, and `ledger` the committed declarations.
 */
export function withdrawalFaults({ offered, derived, refused, ledger }) {
  const declared = new Map(
    (ledger?.withdrawals ?? [])
      .filter((entry) => typeof entry?.id === 'string' && typeof entry?.reason === 'string' && entry.reason.trim() !== '')
      .map((entry) => [entry.id, entry]),
  );
  const seen = new Set(derived);
  return offered
    .filter((id) => !seen.has(id) && refused.has(id) && !declared.has(id))
    .map((id) => ({ id, measured: refused.get(id) }));
}

/** The refusal the generator prints, written here so the message is tested with the rule. */
export function withdrawalRefusal(faults, ledgerPath) {
  return (
    `build-indicator-manifest: REFUSING to write. ${faults.length} row(s) the committed manifest ` +
    `offers would be WITHDRAWN by a rule in this generator, and nothing declares the loss:\n` +
    faults.map((fault) => `  ${fault.id} — ${fault.measured}`).join('\n') +
    `\nThe generator can see WHY it turned each of these down; it cannot see whether losing them ` +
    `is acceptable, and a host's saved workspace loses one of them exactly as hard as it loses an ` +
    `id the vendor deleted. Write the id and the reason in ${ledgerPath}, which is append-only, or ` +
    `keep the rule from refusing the row. A catalogue only shrinks through a declaration.`
  );
}

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
 *
 * HOW a reading becomes text is `value-encoding.mjs`, and it is deliberately not spelled here:
 * both sides of this check import the one encoder, and the encoding carries a NAME so that
 * changing it is a declaration rather than three hundred silent digest moves.
 */
export function digestOf(entry, plotIds, bars) {
  return digestsOf(entry, plotIds, bars, { values: encodeSeries }).values;
}

/**
 * EVERY SPELLING ASKED FOR, FROM A SINGLE `calculate` — the encoders in, their digests out under
 * the same keys.
 *
 * Two callers need more than one spelling of one computation and neither may pay for a second run
 * of the vendor: the sensor wants the unquantised control beside the committed digest, and the
 * value ledger wants this run re-derived under the identity the COMMITTED file was written in, so
 * that a declared re-spelling stops being an amnesty over every value that moved with it. A
 * computation that throws answers `threw` under every spelling asked for, because what threw is the
 * arithmetic and not the way it would have been written down.
 */
export function digestsOf(entry, plotIds, bars, encoders) {
  let result;
  try { result = entry.calculate(bars, entry.defaultInputs); } catch {
    return Object.fromEntries(Object.keys(encoders).map((name) => [name, 'threw']));
  }
  return Object.fromEntries(
    Object.entries(encoders).map(([name, encode]) => [name, digestOfResult(result, plotIds, encode)]),
  );
}

/** The digest of a result already computed, spelled by whichever encoder is handed in. */
export function digestOfResult(result, plotIds, encode) {
  const hash = createHash('sha256');
  for (const key of plotIds) {
    const { scale, tokens } = encode((result.plots?.[key] ?? []).map((point) => point?.value));
    if (scale !== null) hash.update(`${key}:scale:${scale}\n`);
    for (const [index, token] of tokens.entries()) {
      if (token !== null) hash.update(`${key}:${index}:${token}\n`);
    }
  }
  return hash.digest('hex');
}

/**
 * BOTH SPELLINGS OF ONE COMPUTATION, from a single `calculate`.
 *
 * `values` is the digest the catalogue commits. `unquantised` is the same readings spelled the way
 * they were spelled before `value-encoding.mjs` quantised them, and it exists for exactly one
 * caller: the sensor that perturbs the implementation-approximated Math functions and has to show
 * that the quantum is what holds the digest still. A sensor whose control it cannot compute is a
 * sensor that proves the perturbation was too small to matter.
 */
export function digestPairOf(entry, plotIds, bars) {
  return digestsOf(entry, plotIds, bars, { values: encodeSeries, unquantised: encodeSeriesUnquantised });
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
