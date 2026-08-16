/**
 * Up and down are the CONSUMER's to declare, and hue is never the only thing that says
 * which is which.
 *
 * TWO CLAIMS, TESTED SEPARATELY. The first is a mapping: whichever colour the consumer names as up
 * is the one that comes back for a rising value, and inverting the declaration inverts every
 * answer. The second is an accessibility invariant, and it is the one that decays silently — a
 * configuration encoding direction by hue alone renders perfectly, passes every visual review by
 * anyone who can separate red from green, and is unreadable to roughly one man in twelve. So it is
 * refused at construction rather than audited later, and the refusal is tested against the literal
 * that bypasses the factory, so the assertion is known to be capable of failing.
 */

import {
  auditDirectionEncoding,
  directionConvention,
  directionOf,
  encodeDirection,
  invertConvention,
  nonChromaticChannels,
  paneId,
  seriesId,
  type DirectionChannel,
  type PaneSpec,
  type PriceScaleConvention,
  type SeriesSpec,
} from '../src/domain/types';

const WESTERN = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });
/** Red is up. The convention of the east-asian markets, and the inverse of the western one. */
const EAST_ASIAN = invertConvention(WESTERN);

describe('the convention is declared, not assumed', () => {
  it('gives a rising value the colour the consumer named as up', () => {
    expect(encodeDirection(WESTERN, 1).color).toBe('#26a69a');
    expect(encodeDirection(WESTERN, -1).color).toBe('#ef5350');
  });

  it('inverts every answer when the inverted convention is declared — the same two colours', () => {
    // The physical colours do not change; their MEANING does. #ef5350 is now what a rise looks like.
    expect(EAST_ASIAN.upColor).toBe('#ef5350');
    expect(EAST_ASIAN.downColor).toBe('#26a69a');
    expect(encodeDirection(EAST_ASIAN, 1).color).toBe('#ef5350');
    expect(encodeDirection(EAST_ASIAN, -1).color).toBe('#26a69a');
  });

  it('leaves position and shape alone when the colours flip — an apex up still means up', () => {
    expect(EAST_ASIAN.encodeDirectionBy).toEqual(WESTERN.encodeDirectionBy);
    expect(encodeDirection(EAST_ASIAN, 1).side).toBe(encodeDirection(WESTERN, 1).side);
    expect(encodeDirection(EAST_ASIAN, 1).glyph).toBe(encodeDirection(WESTERN, 1).glyph);
  });

  it('is its own inverse — flipping twice is the declaration it started from', () => {
    expect(invertConvention(EAST_ASIAN)).toEqual(WESTERN);
  });

  it('reads direction against a declared reference, not only against zero', () => {
    // A series whose parity sits at 1.0 is above its line at 1.2 and below it at 0.9. Read against
    // zero instead, both are "up" and the pane says nothing about which side is crowded.
    expect(directionOf(1.2, 1)).toBe('up');
    expect(directionOf(0.9, 1)).toBe('down');
    expect(directionOf(1, 1)).toBe('flat');
  });

  it('refuses to call a missing measurement flat', () => {
    // A gap has no direction. Answering `flat` would draw a neutral mark where nothing was measured
    // — the same conflation `Point` refuses when it declines to spell absence as `value: 0`.
    expect(() => directionOf(Number.NaN)).toThrow(/not a measurement/);
    expect(() => directionOf(Number.POSITIVE_INFINITY)).toThrow(/not a measurement/);
    expect(() => directionOf(1, Number.NaN)).toThrow(/not a measurement/);
  });

  it('gives a value ON the reference line no direction at all, on any channel', () => {
    expect(encodeDirection(WESTERN, 0)).toEqual({
      direction: 'flat',
      color: null,
      side: 0,
      glyph: 'none',
    });
  });
});

describe('direction never rides on hue alone', () => {
  it('refuses a convention that declares colour as its only channel', () => {
    expect(() =>
      directionConvention({ upColor: '#26a69a', downColor: '#ef5350', encodeDirectionBy: ['color'] }),
    ).toThrow(/position or shape/);
  });

  it('accepts colour paired with either non-chromatic channel', () => {
    for (const second of ['position', 'shape'] as const) {
      const convention = directionConvention({
        upColor: '#26a69a',
        downColor: '#ef5350',
        encodeDirectionBy: ['color', second],
      });
      expect(nonChromaticChannels(convention)).toEqual([second]);
    }
  });

  it('accepts a convention with no colour channel at all, sharing one colour — shape carries it', () => {
    // The rule is targeted, not blanket: one colour for both directions is only a defect when the
    // colour channel is DECLARED. A monochrome chart leaning entirely on shape is legitimate.
    const mono = directionConvention({
      upColor: '#B8BCC4',
      downColor: '#B8BCC4',
      encodeDirectionBy: ['shape'],
    });
    expect(encodeDirection(mono, 1)).toEqual({
      direction: 'up',
      color: null,
      side: 0,
      glyph: 'apex-up',
    });
  });

  it('refuses one colour standing for both directions when colour IS declared', () => {
    expect(() =>
      directionConvention({ upColor: '#26a69a', downColor: '#26A69A' }),
    ).toThrow(/share the colour/);
  });

  it('refuses an empty or repeated channel list', () => {
    expect(() =>
      directionConvention({ upColor: '#26a69a', downColor: '#ef5350', encodeDirectionBy: [] }),
    ).toThrow(/no channel declared/);
    expect(() =>
      directionConvention({
        upColor: '#26a69a',
        downColor: '#ef5350',
        encodeDirectionBy: ['color', 'position', 'position'],
      }),
    ).toThrow(/repeated channel/);
  });

  it('INVARIANT: every convention the factory can build stays readable without hue', () => {
    // All eight subsets of the three channels, so the guarantee is exhaustive rather than sampled.
    const all: DirectionChannel[] = ['color', 'position', 'shape'];
    const subsets: DirectionChannel[][] = [];
    for (let mask = 0; mask < 1 << all.length; mask += 1) {
      subsets.push(all.filter((_, index) => (mask & (1 << index)) !== 0));
    }
    expect(subsets).toHaveLength(8);

    let built = 0;
    for (const subset of subsets) {
      let convention: PriceScaleConvention;
      try {
        convention = directionConvention({
          upColor: '#26a69a',
          downColor: '#ef5350',
          encodeDirectionBy: subset,
        });
      } catch {
        continue;
      }
      built += 1;
      for (const value of [1, -1]) {
        const encoded = encodeDirection(convention, value);
        expect(encoded.side !== 0 || encoded.glyph !== 'none').toBe(true);
      }
    }
    // Two of the eight are refused — the empty set and {color} — so six are built. Stated as a
    // count so a factory that silently started accepting everything, or nothing, fails here
    // instead of passing a vacuous loop.
    expect(built).toBe(6);
  });

  it('POSITIVE CONTROL: the same invariant FAILS on a hue-only object built past the factory', () => {
    // The type still admits it, so the assertion above is not vacuous.
    const smuggled: PriceScaleConvention = {
      upColor: '#26a69a',
      downColor: '#ef5350',
      encodeDirectionBy: ['color'],
    };
    const encoded = encodeDirection(smuggled, 1);
    expect(encoded.color).toBe('#26a69a');
    expect(encoded.side !== 0 || encoded.glyph !== 'none').toBe(false);
    expect(nonChromaticChannels(smuggled)).toEqual([]);
  });

  it('reports a channel the convention did not declare as INERT, not as populated-and-ignored', () => {
    const noShape = directionConvention({
      upColor: '#26a69a',
      downColor: '#ef5350',
      encodeDirectionBy: ['color', 'position'],
    });
    expect(encodeDirection(noShape, 5)).toEqual({
      direction: 'up',
      color: '#26a69a',
      side: 1,
      glyph: 'none',
    });

    const noPosition = directionConvention({
      upColor: '#26a69a',
      downColor: '#ef5350',
      encodeDirectionBy: ['color', 'shape'],
    });
    expect(encodeDirection(noPosition, -5)).toEqual({
      direction: 'down',
      color: '#ef5350',
      side: 0,
      glyph: 'apex-down',
    });
  });
});

describe('the catalogue half of the rule — a directional series needs a line to be on a side of', () => {
  const series = (id: string, flags: Partial<SeriesSpec> = {}): SeriesSpec => ({
    id: seriesId(id),
    label: id,
    shape: 'histogram',
    color: '#26a69a',
    ...flags,
  });

  const pane = (id: string, list: readonly SeriesSpec[], referenceLine?: number): PaneSpec => ({
    id: paneId(id),
    title: id,
    format: { kind: 'ratio', decimals: 2 },
    series: list,
    defaultVisible: true,
    ...(referenceLine === undefined ? {} : { referenceLine }),
  });

  it('POSITIVE CONTROL: names a signed series whose pane declares no reference line', () => {
    const violations = auditDirectionEncoding([
      pane('p', [series('signed', { signColoring: true })]),
    ]);
    expect(violations).toEqual([
      {
        pane: paneId('p'),
        series: seriesId('signed'),
        reason:
          'encodes direction but its pane declares no reference line — hue is the only channel',
      },
    ]);
  });

  it('clears the same series once the pane declares the line it is measured against', () => {
    expect(
      auditDirectionEncoding([pane('p', [series('signed', { signColoring: true })], 0)]),
    ).toEqual([]);
  });

  it('holds a mirrored series to the same rule — negation is meaningless without the line', () => {
    expect(
      auditDirectionEncoding([pane('p', [series('mirror', { mirrored: true })])]),
    ).toHaveLength(1);
    expect(
      auditDirectionEncoding([pane('p', [series('mirror', { mirrored: true })], 0)]),
    ).toEqual([]);
  });

  it('says nothing about a series that carries no direction', () => {
    // A plain line on an unsigned scale has no up or down to encode, and demanding a reference line
    // of it would turn the rule into noise nobody reads.
    expect(auditDirectionEncoding([pane('p', [series('plain', { shape: 'line' })])])).toEqual([]);
  });
});
