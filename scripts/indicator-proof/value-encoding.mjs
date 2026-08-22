/**
 * HOW A COMPUTED READING BECOMES THE TEXT A DIGEST IS TAKEN OVER — written once, imported by both
 * the generator that WRITES `fingerprints.json` and the proof that RE-DERIVES it.
 *
 * The two-sides rule `manifest-shape.mjs` already states applies with more force here than
 * anywhere else in this directory. A digest is a comparison between two runs of the same encoder;
 * if the generator and the proof each spelled a number their own way, a difference between the two
 * spellings would read as a vendor changing an indicator, and the check would be measuring itself.
 * So there is exactly one `encodeSeries`, and `VALUE_ENCODING.id` names which one it is.
 *
 * ── WHY THE ENCODING HAS A NAME ────────────────────────────────────────────────────────────────
 *
 * `value-changes.json` refuses a digest that moved with nothing saying why, and that rule is right
 * for a VALUE. It is wrong for the encoding: changing how a reading is spelled moves every digest
 * in the file at once, and declaring three hundred value changes would be three hundred false
 * statements — no value moved, the spelling did. So the encoding carries an identity, the committed
 * file records it, and a change of identity is declared ONCE, in `value-changes.json`'s `encodings`
 * chain, with the reason written by hand. Same doctrine, one level up: the generator can see that
 * the spelling changed and cannot see whether that was a fix or a laundering.
 */

/** The identity the committed `fingerprints.json` carries before this rule existed. */
export const UNVERSIONED_ENCODING = 'unversioned';

/** Why there are digests of VALUES at all — the file's own first sentence, not the encoding's. */
export const VALUE_DIGEST_WHY = 'NAMES AND SHAPES ARE NOT ENOUGH. A check that compares ids, plot keys and input shapes stays green when a vendor release changes what a number IS — the upgrade that matters and the one nobody would notice. These are digests of computed VALUES.';

/** The encoding record the committed file carries, so that changing it is a declaration. */
export const VALUE_ENCODING = {
  id: 'raw-value-text/sha256/v1',
  how: 'sha256 over `plotId:index:value` for every finite reading of every promised plot, at the entry\'s own defaults, over the fixture named in the manifest — the reading spelled exactly as `String(value)` spells it',
  why: 'THE READING, VERBATIM. Every bit of every double reaches the digest, so nothing a vendor could change is rounded away before it is compared.',
};

/**
 * One plot series in; one token per index out, `null` where there is no reading.
 *
 * `scale` is the series-wide number the tokens are written against, or `null` when the encoding
 * writes each reading on its own. `digestOf` hashes it alongside the tokens whenever it is not
 * null, because an encoding that normalises by a series-wide number is blind to that number
 * otherwise: [1, 2] and [2, 4] would produce identical tokens under it.
 *
 * EVERY NON-READING IS THE SAME ANSWER, AND THAT IS DELIBERATE. `null`, `undefined`, `NaN`,
 * `Infinity`, `-Infinity` and a value that is not a number at all are all `null` here — the host's
 * adapter turns every one of them into a point carrying no value (`adapter.a-non-finite-value-
 * becomes-a-declared-gap`), so a digest that told them apart would claim a distinction the drawing
 * does not make. `-0` encodes as `0`: `Object.is` is the only thing in the language that separates
 * them, and no chart draws the sign of a zero.
 */
export function encodeSeries(values) {
  return {
    scale: null,
    tokens: values.map((value) => (typeof value === 'number' && Number.isFinite(value) ? `${value === 0 ? 0 : value}` : null)),
  };
}
