/**
 * LMC-41 — the glyph and the colour are one pair, and the loud failure survives the move.
 *
 * The pair is tested as a pair on purpose. Asserting the two separately would pass on a build where
 * the glyph came from one encoding and the colour from another, which is the drift that splitting
 * them across a boundary produces: a label saying up beside a bar painted down, rendering perfectly
 * and reviewing clean. So the tests below read both channels off the SAME declared convention and
 * require them to agree, including under the inverted convention where the colours swap and the
 * glyph must not.
 */

import { DIRECTION_GLYPH_TEXT, directionColor, withGlyph } from '../src/catalogue/direction';
import { directionConvention, encodeDirection, invertConvention } from '../src/domain/types';

const WESTERN = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });
/** Red is up. The convention of the east-asian markets, and the inverse of the western one. */
const EAST_ASIAN = invertConvention(WESTERN);

describe('the glyph channel, rendered as text', () => {
  it('renders each token, and the inert token as nothing', () => {
    expect(DIRECTION_GLYPH_TEXT['apex-up']).toBe('▲');
    expect(DIRECTION_GLYPH_TEXT['apex-down']).toBe('▼');
    expect(DIRECTION_GLYPH_TEXT.none).toBe('');
  });

  it('appends the glyph to a label, separated by one space', () => {
    expect(withGlyph('Buy', 'apex-up')).toBe('Buy ▲');
    expect(withGlyph('Sell', 'apex-down')).toBe('Sell ▼');
  });

  it('leaves the label untouched when the token is inert — no trailing space', () => {
    // A trailing space is an invisible difference between two labels that read identically, and it
    // is what a naive join produces for the convention that declares no shape channel.
    expect(withGlyph('Flat', 'none')).toBe('Flat');
    expect(withGlyph('Flat', 'none')).not.toMatch(/\s$/);
  });
});

describe('the colour channel, derived from the DECLARED convention', () => {
  it('paints a rise and a fall with the colours the consumer named', () => {
    expect(directionColor(WESTERN, 1)).toBe('#26a69a');
    expect(directionColor(WESTERN, -1)).toBe('#ef5350');
  });

  it('follows the inverted declaration — the same two colours, opposite meanings', () => {
    expect(directionColor(EAST_ASIAN, 1)).toBe('#ef5350');
    expect(directionColor(EAST_ASIAN, -1)).toBe('#26a69a');
  });

  it('FAILS LOUD when the convention declares no colour channel', () => {
    // The preserved failure. Falling back to a pair this library picked would be the hard-coded
    // western convention returning through the back door: it renders, it looks right to whoever
    // wrote it, and nothing says it is wrong.
    const mono = directionConvention({
      upColor: '#B8BCC4',
      downColor: '#B8BCC4',
      encodeDirectionBy: ['shape'],
    });
    expect(() => directionColor(mono, 1)).toThrow(/no colour channel to paint with/);
    expect(() => directionColor(mono, -1)).toThrow(/no colour channel to paint with/);
  });
});

describe('the pair — one encoding feeds both channels', () => {
  it('reads glyph and colour off the SAME encoding, and they agree', () => {
    const rising = encodeDirection(WESTERN, 1);
    expect(withGlyph('Buy', rising.glyph)).toBe('Buy ▲');
    expect(directionColor(WESTERN, 1)).toBe(rising.color);
  });

  it('flips the colour and NOT the glyph when the declaration inverts', () => {
    // An apex pointing up still means up. If inverting the declaration also flipped the glyph, the
    // second channel would say the same thing as hue and would stop being a second channel.
    const rising = encodeDirection(EAST_ASIAN, 1);
    expect(withGlyph('Buy', rising.glyph)).toBe('Buy ▲');
    expect(directionColor(EAST_ASIAN, 1)).toBe('#ef5350');
    expect(rising.glyph).toBe(encodeDirection(WESTERN, 1).glyph);
  });

  it('a convention with no shape channel still paints, and the label carries no glyph', () => {
    const noShape = directionConvention({
      upColor: '#26a69a',
      downColor: '#ef5350',
      encodeDirectionBy: ['color', 'position'],
    });
    const rising = encodeDirection(noShape, 1);
    expect(withGlyph('Buy', rising.glyph)).toBe('Buy');
    expect(directionColor(noShape, 1)).toBe('#26a69a');
  });
});
