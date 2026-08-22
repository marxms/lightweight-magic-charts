/**
 * HOW A COMPUTED READING BECOMES THE TEXT A DIGEST IS TAKEN OVER — written once, imported by both
 * the generator that WRITES `fingerprints.json` and the proof that RE-DERIVES it.
 *
 * The two-sides rule `manifest-shape.mjs` already states applies with more force here than
 * anywhere else in this directory. A digest is a comparison between two runs of the same encoder;
 * if the generator and the proof each spelled a number their own way, a difference between the two
 * spellings would read as a vendor changing an indicator, and the check would be measuring itself.
 * So there is exactly one `encodeSeries`, `VALUE_ENCODING.id` names which one it is, and
 * `ENCODERS` keeps every spelling this catalogue has ever committed under addressable by that
 * same name — a digest can only be re-derived under the identity it was written in.
 *
 * ── WHY THE ENCODING HAS A NAME ────────────────────────────────────────────────────────────────
 *
 * `value-changes.json` refuses a digest that moved with nothing saying why, and that rule is right
 * for a VALUE. It is wrong for the encoding: changing how a reading is spelled moves every digest
 * in the file at once, and declaring three hundred value changes for it would be three hundred
 * false statements — no value moved, the spelling did. So the encoding carries an identity, the
 * committed file records it, and a change of identity is declared ONCE, in `value-changes.json`'s
 * `encodings` chain, with the reason written by hand. Same doctrine, one level up: the generator
 * can see that the spelling changed and cannot see whether that was a fix or a laundering.
 *
 * AND A DECLARED RE-SPELLING IS NOT AN AMNESTY, which is what it became when the per-id comparison
 * was merely SKIPPED while the identity moved. Measured: a vendor bump, a tampered `wma` and a
 * genuine re-spelling in one run rewrote 310 of 310 digests with zero value declarations and every
 * gate green. The comparison never needed THIS run's spelling — it needed the one the committed
 * file was written in, so `ENCODERS` keeps it, and `value-ledger.mjs` re-derives every id under the
 * committed identity and compares that pair. A re-spelling costs one declaration and proves
 * nothing; a value that moved beneath it is named exactly as it would have been on its own.
 *
 * ── WHY THE READING IS QUANTISED BEFORE IT IS DIGESTED ─────────────────────────────────────────
 *
 * A digest of a raw double is a digest of the PLATFORM as much as of the arithmetic. ECMAScript
 * leaves `Math.exp`, `Math.pow`, `Math.log`, `Math.log10`, `Math.sin`, `Math.cos`, `Math.atan` and
 * `Math.acos` implementation-approximated — only `Math.sqrt` is required exact by IEEE 754 — and
 * the vendor calls the approximated eight 66 times. So the same vendor version, the same fixture
 * and the same defaults produce digests that disagree between machines, and the check goes red over
 * a difference no chart could show. MEASURED, not argued: `npm run proof` on linux/amd64/Node 22
 * reported 31/33 while macOS/arm64/Node 25 reported 33/33, and the four disagreeing indicators —
 * `choppiness`, `fisher-transform`, `ehlers-mesa-ma`, `ift-stoch-rsi-cci` — differed by at most
 * 3.304e-16 relative, about 1.5 ULP of a double.
 *
 * THE QUANTUM IS PER SERIES, NOT PER READING, AND THAT IS THE WHOLE OF THE DESIGN. Rounding each
 * reading to N significant digits of ITSELF sounds like the answer and is not, because a reading
 * near zero has no significant digits left to round: `trix` is a rate of change, its flat stretches
 * lose everything to cancellation, and a 1-ULP nudge of the eight functions moves those readings by
 * 1.68e-12 relative under a systematic perturbation and 2.16e-11 under a seeded one — four to five
 * orders above the 3.3e-16 that went in. Measured across all 310 offered indicators: at 12
 * significant digits `trix` and `ml-moving-average` still move under 1 ULP, at 13 digits eight do,
 * at 14 twelve do. Quantising against the SERIES turns that blow-up back into what it actually is,
 * a difference far below anything the line could show, and the measurement says so: at 2^-36 of the
 * series scale, 0 of 310 digests move under a systematic perturbation of 1, 2, 4, 8, 16 or 64 ULP.
 *
 * AND IT STAYS SENSITIVE, which is the other side and the one a quantum can quietly cost. Measured
 * by applying a uniform relative change to every reading of every offered indicator: 1e-13 moves
 * 262 of the 310 digests, 1e-12 moves 292, 1e-11 moves 309 and 1e-9 moves all 310. The defect this
 * file exists to catch — the inverted-weight `wma` planted through the sanctioned regeneration — was
 * 2.1e-2 wrong, nine orders above the quantum. A vendor release that moves a reading by one part in
 * a hundred thousand million still turns the check red and names the indicator.
 *
 * NOTHING HERE CALLS A LIBM. The series scale is read out of the exponent bits rather than from
 * `Math.log2`, the step is a power of two so the division is exact, and `Math.round` and IEEE
 * division are both required exact — so the encoder itself cannot be the thing that differs
 * between two machines.
 *
 * WHAT IT DOES NOT COVER: the `**` operator is implementation-approximated too and cannot be
 * monkey-patched, so the sensor in `indicator-proof.mjs` perturbs the eight functions and not the
 * operator. This repository has already been bitten by that exact hole once — `10 ** -4` is 0.0001
 * on one Node and 0.00009999999999999999 on another, which is why `ci.yml` runs a Node matrix. The
 * quantum absorbs a difference of that size wherever it arises; the sensor only proves it for the
 * eight it can reach.
 */

/** The identity the committed `fingerprints.json` carried before this rule existed. */
export const UNVERSIONED_ENCODING = 'unversioned';

/**
 * THE SPELLING THOSE UNVERSIONED DIGESTS WERE ACTUALLY TAKEN OVER — every bit of the double,
 * verbatim. Naming it is the whole of the first entry in `value-changes.json`'s `encodings` chain:
 * not one number moved, the spelling acquired a name so that changing it could be declared.
 */
export const RAW_VALUE_TEXT_V1 = 'raw-value-text/sha256/v1';

/**
 * The spelling committed today, and it NAMES ITS OWN QUANTUM: 2^-36 of the series scale ≈ 1.46e-11.
 *
 * A power of two and not a decimal because the division by the step is then exact, so the rounding
 * has one boundary rather than two, and because the scale it is taken from is a power of two read
 * straight out of the exponent bits. The number lives in the identity rather than in a constant
 * beside it, because `ENCODERS` reads each shift back out of the identity it is registered under —
 * so a past spelling cannot follow this tree when the quantum moves on, which is the one moment
 * the registry exists for.
 */
export const SERIES_SCALED_V2 = 'series-scaled-2^-36/sha256/v2';

/** The eight the vendor calls that ECMAScript leaves implementation-approximated. `sqrt` is exact. */
export const IMPLEMENTATION_APPROXIMATED = ['exp', 'pow', 'log', 'log10', 'sin', 'cos', 'atan', 'acos'];

/** Why there are digests of VALUES at all — the file's own first sentence, not the encoding's. */
export const VALUE_DIGEST_WHY = 'NAMES AND SHAPES ARE NOT ENOUGH. A check that compares ids, plot keys and input shapes stays green when a vendor release changes what a number IS — the upgrade that matters and the one nobody would notice. These are digests of computed VALUES.';

/** The encoding record the committed file carries, so that changing it is a declaration. */
export const VALUE_ENCODING = {
  id: SERIES_SCALED_V2,
  how: 'sha256 over `plotId:index:reading` for every finite reading of every promised plot, at the entry\'s own defaults, over the fixture named in the manifest — each reading first divided by a step of 2^-36 of its own series\' scale and rounded to the nearest whole number, with that scale digested beside the readings. The scale is the smallest power of two at or above the largest reading in the series, read from the exponent bits.',
  why: 'NOT THE RAW DOUBLE, BECAUSE THAT DIGESTS THE PLATFORM TOO. ECMAScript leaves Math.exp, pow, log, log10, sin, cos, atan and acos implementation-approximated — only sqrt is exact by IEEE 754 — and the vendor calls those eight 66 times, so the same version over the same fixture produced different digests on linux/amd64/Node 22 and macOS/arm64/Node 25 and the check went red over a difference no chart could show. MEASURED: the four indicators that disagreed differed by at most 3.304e-16 relative, about 1.5 ULP. The quantum is 2^-36 of the SERIES scale (~1.46e-11) rather than a count of significant digits of each reading, because a reading near zero has no significant digits to round — trix loses its flat stretches to cancellation, and 1 ULP in moves it 1.68e-12 out. At 12 significant digits two of the 310 still move under 1 ULP; at 2^-36 of the series scale none of them move under 1, 2, 4, 8, 16 or 64. It stays sensitive at the other end, also measured: a uniform relative change of 1e-13 across every reading moves 262 of the 310 digests, 1e-12 moves 292, 1e-11 moves 309, and the 2.1e-2 inverted-weight wma this file exists to catch is nine orders above the quantum.',
};

const BITS = new DataView(new ArrayBuffer(8));

/**
 * The exponent of the smallest power of two at or above |x| — from the bits, never from a log.
 *
 * `null` for a zero, which is the only reading with no scale of its own. A subnormal answers -1022
 * rather than its own exponent: it is below every normal double, the step taken from it would be
 * 2^-1058, and nothing that small survives being drawn.
 */
function ceilingExponent(x) {
  BITS.setFloat64(0, Math.abs(x));
  const bits = BITS.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const mantissa = bits & 0xfffffffffffffn;
  if (biased === 0) return mantissa === 0n ? null : -1022;
  return mantissa === 0n ? biased - 1023 : biased - 1022;
}

/**
 * ONE PLOT SERIES IN; ONE TOKEN PER INDEX OUT, `null` where there is no reading — AT THE SHIFT ASKED
 * FOR, never at whichever shift this tree currently prefers.
 *
 * The shift is a parameter and not a constant read from above because `ENCODERS` below has to keep
 * spelling a reading the way an OLDER identity spelled it. An encoder that read the current quantum
 * would follow it when it moves and stop answering for the digests already committed, which is the
 * same thing as not keeping the old spelling at all.
 *
 * `scale` is the series-wide number the tokens are written against, and `digestOf` hashes it
 * alongside them. It has to: without it [1, 2] and [2, 4] produce identical tokens, and a vendor
 * release that doubled a whole series would pass unseen. `null` when the series holds no reading
 * that is not zero, which is the one case with no scale to speak of.
 *
 * EVERY NON-READING IS THE SAME ANSWER, AND THAT IS DELIBERATE. `null`, `undefined`, `NaN`,
 * `Infinity`, `-Infinity` and a value that is not a number at all are all `null` here — the host's
 * adapter turns every one of them into a point carrying no value (`adapter.a-non-finite-value-
 * becomes-a-declared-gap`), so a digest that told them apart would claim a distinction the drawing
 * does not make. `-0` encodes as `0`: `Object.is` is the only thing in the language that separates
 * them, and no chart draws the sign of a zero.
 */
function seriesScaledAt(shift) {
  return function encodeSeriesScaled(values) {
    const readings = values.map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null));

    let largest = 0;
    for (const reading of readings) {
      if (reading !== null && Math.abs(reading) > largest) largest = Math.abs(reading);
    }
    const exponent = ceilingExponent(largest);
    if (exponent === null) {
      return { scale: null, tokens: readings.map((reading) => (reading === null ? null : '0')) };
    }

    // `exponent` is at most 1024 and at least -1022, so the step is between 2^988 and 2^-1058: always
    // finite, never zero, and a power of two, so `reading / step` is exact and at most 2^36 in size.
    const step = 2 ** (exponent - shift);
    return {
      scale: `2^${exponent}`,
      tokens: readings.map((reading) => {
        if (reading === null) return null;
        const whole = Math.round(reading / step);
        return `${whole === 0 ? 0 : whole}`;
      }),
    };
  };
}

/**
 * HOW `v1` SPELLED A READING — verbatim, every bit of the double — AND THE SENSOR'S NEGATIVE CONTROL.
 *
 * It is registered below as the encoder for `unversioned` and for `raw-value-text/sha256/v1`, which
 * is what those two identities have always meant: `String(value)` per finite reading. It is a real
 * encoder, and it is also the control for one caller — the sensor in `indicator-proof.mjs` that
 * perturbs the implementation-approximated eight and has to show the QUANTUM is what holds the
 * digest still. Without that control the sensor proves nothing, because a green result would be
 * equally explained by a perturbation too small to reach any reading at all. Measured with it: the
 * same 1-ULP perturbation moves 14 of the 310 unquantised digests and 0 of the quantised ones.
 *
 * NOTHING COMMITTED IS SPELLED THIS WAY TODAY. It stays because a spelling this catalogue has once
 * committed under stays addressable for ever; see `ENCODERS`.
 */
export function encodeSeriesUnquantised(values) {
  return {
    scale: null,
    tokens: values.map((value) => (typeof value === 'number' && Number.isFinite(value) ? `${value === 0 ? 0 : value}` : null)),
  };
}

/** `series-scaled-2^-36/sha256/v2` → an encoder rounding at 2^-36. The KEY names the shift, so an
 *  entry can never drift from the identity it is registered under. */
const seriesScaled = (identity) => {
  const named = /^series-scaled-2\^-(\d+)\/sha256\/v\d+$/.exec(identity);
  if (named === null) throw new Error(`value-encoding: \`${identity}\` does not name the shift it spells with`);
  return seriesScaledAt(Number(named[1]));
};

/**
 * EVERY SPELLING A COMMITTED `fingerprints.json` MAY HAVE BEEN WRITTEN UNDER, ADDRESSABLE BY ITS
 * IDENTITY — and this registry is the whole of what keeps a declared re-spelling from being an
 * amnesty over every value that moved with it.
 *
 * TWO DIGESTS TAKEN OVER DIFFERENT SPELLINGS ARE INCOMPARABLE. That is true, and it was read as a
 * licence: while the identity moved, the per-id comparison was SKIPPED and every digest in the file
 * was rewritten on the strength of ONE line in the `encodings` chain. MEASURED on this tree — the
 * vendor moved to 0.5.1 everywhere, `wma`'s arithmetic multiplied by 1.0001, and the quantum
 * re-spelled from 2^-36 to 2^-34 in the same run: 310 of 310 digests rewritten, ZERO value
 * declarations, `npm run proof` 34/34 and `--check` exit 0, with `wma` on file at the byte-for-byte
 * digest the undeclared-value rule refuses when it arrives alone.
 *
 * The premise was right; the conclusion was not. The comparison does not need this run's spelling
 * — it needs THE SPELLING THE COMMITTED FILE WAS WRITTEN IN, and that one still exists as long as
 * it is kept here. So a re-spelling re-derives every id under the COMMITTED identity as well and
 * compares that pair: identical means no value moved and the re-grafting is what it says it is;
 * different means a value moved and is declared like any other, even though the encoding moved too.
 *
 * NOTHING IS EVER DELETED FROM THIS OBJECT, and nothing here may fall back to the current encoder.
 * It is the append-only bargain `renames.json` and `value-changes.json` already make: an identity
 * that stops resolving takes the comparison with it, so `value-ledger.mjs` REFUSES rather than
 * guessing — an unaddressable spelling is the amnesty wearing the registry's own clothes.
 */
export const ENCODERS = {
  [UNVERSIONED_ENCODING]: encodeSeriesUnquantised,
  [RAW_VALUE_TEXT_V1]: encodeSeriesUnquantised,
  [SERIES_SCALED_V2]: seriesScaled(SERIES_SCALED_V2),
};

/** The encoder an identity names, or `undefined` — never a fallback, because the fallback IS the hole. */
export function encoderFor(identity) {
  return Object.hasOwn(ENCODERS, identity) ? ENCODERS[identity] : undefined;
}

/**
 * THE ONE ENCODER BOTH SIDES OF THE CHECK SPELL WITH — whichever identity `VALUE_ENCODING` names,
 * looked up in the registry rather than declared beside it, so that the spelling this run writes and
 * the spelling a past run is re-derived under come from the same table.
 */
export const encodeSeries = encoderFor(VALUE_ENCODING.id);
if (encodeSeries === undefined) {
  throw new Error(
    `value-encoding: VALUE_ENCODING.id is \`${VALUE_ENCODING.id}\` and ENCODERS holds no encoder under that name. `
    + 'A digest can only be re-derived under the identity it was written in, so every identity this catalogue '
    + 'commits under is registered there and none is ever removed — add the new one beside the ones already present.',
  );
}
