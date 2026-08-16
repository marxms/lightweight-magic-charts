/** Direction, rendered: the glyph and the colour. See docs/explanation/catalogue.md#glyph-and-colour-are-one */

import type { DirectionGlyph, PriceScaleConvention } from '../domain/types';
import { encodeDirection } from '../domain/types';

/** Token to character, for a text label. See docs/explanation/catalogue.md#the-glyph-table-is-a-default */
export const DIRECTION_GLYPH_TEXT: Readonly<Record<DirectionGlyph, string>> = {
  'apex-up': '▲',
  'apex-down': '▼',
  none: '',
};

/** Append the glyph to a label. See docs/explanation/catalogue.md#appending-costs-no-separator */
export function withGlyph(text: string, glyph: DirectionGlyph): string {
  return [text, DIRECTION_GLYPH_TEXT[glyph]].filter((part) => part !== '').join(' ');
}

/** The colour a rising or falling value is painted with. See docs/explanation/catalogue.md#no-fallback-pair */
export function directionColor(convention: PriceScaleConvention, value: 1 | -1): string {
  const color = encodeDirection(convention, value).color;
  if (color === null) {
    throw new Error('directionColor: the declared convention has no colour channel to paint with');
  }
  return color;
}
