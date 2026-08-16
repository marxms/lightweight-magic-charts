/**
 * What a window LETS YOU READ of a study: where its numbers land, and what the warm-up ate.
 * See docs/explanation/indicator.md#alignment-is-by-timestamp
 */

import { isGap } from '../domain/types';
import type { Bar, Point } from '../domain/types';
import {
  CALIBRATED_PRICE_NEIGHBOURHOOD,
  CALIBRATED_WARM_UP_SHARE,
} from '../catalogue/sources';

/** What the window permits. Three states; the difference between them is what gets SAID. */
export type IndicatorAvailability = 'ok' | 'warmup' | 'empty';

/** A reading, or the declared absence of one. `null` is a hole; it is never a zero. */
export type Reading = number | null;

/** A point's reading, or `null` for a declared gap. See docs/explanation/indicator.md#reading-a-declared-gap */
export function readingOf(point: Point): Reading {
  if (isGap(point)) return null;
  const reading = (point as { readonly value: number }).value;
  return Number.isFinite(reading) ? reading : null;
}

/** Bar time -> position in the window. Built once per resolution, read once per point. */
export function barPositions(bars: readonly Bar[]): ReadonlyMap<number, number> {
  const positionOf = new Map<number, number>();
  bars.forEach((bar, at) => {
    positionOf.set(bar.time as number, at);
  });
  return positionOf;
}

/** Points onto the window's grid, by TIME. A point off the grid is dropped, never appended. */
export function alignReadings(
  points: readonly Point[],
  positionOf: ReadonlyMap<number, number>,
  length: number,
): readonly Reading[] {
  const readings = new Array<Reading>(length).fill(null);
  for (const point of points) {
    const at = positionOf.get(point.time as number);
    if (at === undefined) continue;
    readings[at] = readingOf(point);
  }
  return readings;
}

/** Median, not mean. See docs/explanation/indicator.md#median-not-mean */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

/** Is this line on the price scale? See docs/explanation/indicator.md#a-rule-not-a-list-of-ids */
export function onPriceScale(
  readings: readonly Reading[],
  priceMid: number,
  neighbourhood: number = CALIBRATED_PRICE_NEIGHBOURHOOD,
): boolean {
  const magnitudes = readings
    .filter((reading): reading is number => reading !== null)
    .map((reading) => Math.abs(reading));
  if (magnitudes.length === 0) return true;
  const scale = median(magnitudes);
  return scale >= priceMid / neighbourhood && scale <= priceMid * neighbourhood;
}

/** The first bar at which ANY drawn line has a reading. `bars` means none of them does. */
export function firstReadingAt(
  readings: ReadonlyArray<readonly Reading[]>,
  bars: number,
): number {
  let first = bars;
  for (const line of readings) {
    for (let at = 0; at < line.length && at < first; at += 1) {
      if (line[at] !== null) {
        first = at;
        break;
      }
    }
  }
  return first;
}

/** What the window permits, said out loud. See docs/explanation/indicator.md#warm-up-keeps-the-lines-drawn */
export function availabilityOf(
  drawn: number,
  warmUpBars: number,
  windowBars: number,
  warmUpShare: number = CALIBRATED_WARM_UP_SHARE,
): IndicatorAvailability {
  if (drawn === 0) return 'empty';
  return warmUpBars > windowBars * warmUpShare ? 'warmup' : 'ok';
}
