/**
 * The magnet, as a RULE and not as a placement: pure, pixel-thresholded, ignorant of who places
 * the anchor. See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement
 */

import type { Bar, UtcSeconds } from '../domain/types';
import type { PriceConverter } from '../port/chartApi';

export type MagnetMode = 'off' | 'on';

export interface SnapInput {
  readonly mode: MagnetMode;
  readonly bars: readonly Bar[];
  readonly time: UtcSeconds;
  /** Where the pointer is, in price. What `off` resolves to, and what `on` measures from. */
  readonly price: number;
  /** A SCREEN distance, so the tolerance means the same thing at 60 000 and at 0.4. */
  readonly thresholdPx: number;
  readonly priceToCoordinate: PriceConverter['priceToCoordinate'];
}

interface Candidate {
  readonly price: number;
  readonly distancePx: number;
}

/** A coordinate the scale can measure WITH. `null`, `NaN` and `Infinity` are all "cannot". */
const measurable = (px: number | null): px is number => Number.isFinite(px);

/** Nearest wins; a TIE goes to the higher price, so the outcome is decided and not incidental. */
function better(found: Candidate | null, next: Candidate): Candidate {
  if (found === null) return next;
  if (next.distancePx < found.distancePx) return next;
  if (next.distancePx > found.distancePx) return found;
  return next.price > found.price ? next : found;
}

export function snapAnchorPrice(input: SnapInput): number {
  if (input.mode === 'off') return input.price;
  // A TOLERANCE NOBODY CAN MEASURE MEANS "DO NOT SNAP", never "snap to anything". Every comparison
  // against NaN is false, so `distancePx > thresholdPx` stopped rejecting and the magnet took the
  // whole quartet — the anchor landed on a bar value the user never aimed at.
  if (!Number.isFinite(input.price) || !Number.isFinite(input.thresholdPx)) return input.price;
  const bar = input.bars.find((candidate) => candidate.time === input.time);
  if (bar === undefined) return input.price;
  const pointerPx = input.priceToCoordinate(input.price);
  if (!measurable(pointerPx)) return input.price;

  let found: Candidate | null = null;
  for (const price of [bar.open, bar.high, bar.low, bar.close]) {
    const px = input.priceToCoordinate(price);
    // A candidate the scale cannot place is dropped; the snap itself survives it.
    if (!measurable(px)) continue;
    const distancePx = Math.abs(px - pointerPx);
    if (distancePx > input.thresholdPx) continue;
    found = better(found, { price, distancePx });
  }
  return found === null ? input.price : found.price;
}
