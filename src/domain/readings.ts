/**
 * The RAW reading of a series, carried to the point the chart draws.
 * See docs/explanation/domain.md#readings-are-domain-not-render
 * See docs/explanation/domain.md#the-measured-value-is-not-the-plotted-value
 */

import type { Bar, SeriesSpec, UtcSeconds } from './types';

/** The two colours that carry direction. Never fixed: the host declares it and it arrives here. */
export interface DirectionPalette {
  readonly up: string;
  readonly down: string;
}

/** A point as the chart port accepts it. `color` absent = the series paints its declared colour. */
export interface PlottedPoint {
  readonly time: UtcSeconds;
  readonly value: number;
  readonly color?: string;
}

/** Readings, with `stepCarry` applied. See docs/explanation/domain.md#carrying-only-fits-a-step-function */
export function carryReadings(
  raw: readonly (number | null)[],
  spec: SeriesSpec,
): Array<number | null> {
  if (spec.stepCarry !== true) return raw.map((value) => (value === null ? null : value));
  const out: Array<number | null> = [];
  let carried: number | null = null;
  for (const value of raw) {
    if (value !== null) carried = value;
    out.push(value ?? carried);
  }
  return out;
}

/** Carried readings + bars -> drawable points. See docs/explanation/domain.md#matched-by-position-and-the-bar-beats-the-sign */
export function plottedPoints(
  readings: readonly (number | null)[],
  bars: readonly Bar[],
  spec: SeriesSpec,
  palette: DirectionPalette,
  hues?: readonly (string | null)[],
): PlottedPoint[] {
  const points: PlottedPoint[] = [];
  readings.forEach((value, index) => {
    const bar = bars[index];
    if (value === null || bar === undefined) return;
    const plotted = spec.mirrored === true ? -Math.abs(value) : value;
    points.push({
      time: bar.time,
      value: plotted,
      color:
        hues?.[index] ??
        (spec.barDirectionColoring === true
          ? bar.close >= bar.open
            ? palette.up
            : palette.down
          : spec.signColoring === true
            ? plotted >= 0
              ? palette.up
              : palette.down
            : undefined),
    });
  });
  return points;
}
