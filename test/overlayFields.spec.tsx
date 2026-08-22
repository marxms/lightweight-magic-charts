/**
 * @jest-environment jsdom
 *
 * LIQ-04, LIQ-05 — the scale a host chooses has to REACH the field.
 *
 * `toDensityColumns` has taken a `DensityScale` since the global mode shipped, and the hook that
 * feeds the overlay called it with one argument. So the published mode was unreachable through the
 * hook every consumer actually mounts: the mode existed, the drop-in could not ask for it, and
 * nothing was red. What is asserted here is therefore not the argument — it is the LIGHT the field
 * paints, read off the recorded gradient, because an argument that arrives and is then dropped
 * paints exactly what a missing argument paints.
 */
import { renderHook } from '@testing-library/react';

import type { Bar } from '../src/domain/types';
import { utcSeconds } from '../src/domain/types';
import type { Overlay } from '../src/extension/plugins';
import { DEFAULT_DENSITY_RAMP } from '../src/overlays/densityField';
import type { DensityScale, DensitySlice, DensityTuning } from '../src/overlays/densityField';
import { useOverlayFields } from '../src/react/useOverlayFields';
import { RecordingContext, alphaOf, fakeProjection, fakeTarget } from './renderFakes';

const NO_BARS: readonly Bar[] = [];

/** The bin at 110 holds a constant 2 in both slices; the bin at 100 doubles. Maxima 4 and 8. */
const SLICES: readonly DensitySlice[] = [
  {
    time: utcSeconds(10),
    samples: [
      { price: 100, weight: 4 },
      { price: 110, weight: 2 },
    ],
  },
  {
    time: utcSeconds(20),
    samples: [
      { price: 100, weight: 8 },
      { price: 110, weight: 2 },
    ],
  },
];

/** Neither knob in the way, so the alpha a cell paints is its share of the peak and nothing else. */
const FLAT: DensityTuning = { floor: 0, gamma: 1 };

/** The two bands share the edge at 105, so each column carries three stops, top price first. */
const CONSTANT_BIN = 0;
const GROWING_BIN = 2;

interface Fields {
  readonly density?: readonly DensitySlice[];
  readonly scale?: DensityScale;
}

const mount = (initialProps: Fields) =>
  renderHook(
    (props: Fields) =>
      useOverlayFields({ bars: NO_BARS, tuning: FLAT, showDensity: true, ...props }),
    { initialProps },
  );

/** The alphas of one column, in the order the gradient stops were written: top price first. */
function alphasOf(overlays: readonly Overlay[], at: number): readonly number[] {
  const ctx = new RecordingContext();
  overlays[0].draw(
    fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
    fakeProjection({ barSpacing: 4 }),
  );
  const stops = ctx.recordedGradients()[at].stops;
  expect(stops).toHaveLength(3);
  return stops.map(([, colour]) => alphaOf(colour));
}

describe('LIQ-04, LIQ-05 — the hook carries the density scale to the field', () => {
  it('omitting the scale keeps the per-column rule: the untouched bin DIMS as its neighbour grows', () => {
    // LIQ-05. A constant 2 is half of the first column's peak and a quarter of the second's.
    const { result } = mount({ density: SLICES });

    expect(alphasOf(result.current, 0)[CONSTANT_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(0.5, 1)),
      6,
    );
    expect(alphasOf(result.current, 1)[CONSTANT_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(0.25, 1)),
      6,
    );
  });

  it('spells the default out: an explicit `column` scale paints what omitting it paints', () => {
    const omitted = mount({ density: SLICES });
    const explicit = mount({ density: SLICES, scale: { mode: 'column' } });

    expect(alphasOf(explicit.result.current, 0)).toEqual(alphasOf(omitted.result.current, 0));
    expect(alphasOf(explicit.result.current, 1)).toEqual(alphasOf(omitted.result.current, 1));
  });

  it('under the global mode the untouched bin keeps the SAME light in both columns', () => {
    // LIQ-04, and the whole point of the mode: 2 is a quarter of the window peak of 8, in both.
    const { result } = mount({ density: SLICES, scale: { mode: 'global' } });

    expect(alphasOf(result.current, 0)[CONSTANT_BIN]).toBeCloseTo(
      alphasOf(result.current, 1)[CONSTANT_BIN],
      6,
    );
    expect(alphasOf(result.current, 0)[CONSTANT_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(0.25, 1)),
      6,
    );
  });

  it('under the global mode a cell is its share of the WINDOW peak, not of its own column', () => {
    // Weight 4 IS the first column's own peak, so the per-column rule paints it at full intensity.
    const { result } = mount({ density: SLICES, scale: { mode: 'global' } });

    expect(alphasOf(result.current, 0)[GROWING_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(0.5, 1)),
      6,
    );
    expect(alphasOf(result.current, 1)[GROWING_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(1, 1)),
      6,
    );
  });

  it('normalises against the SUPPLIED peak, so the whole scale travels and not just its mode', () => {
    // 16 is nowhere in the data: only a peak that was carried through can produce these shares.
    const { result } = mount({ density: SLICES, scale: { mode: 'global', peak: 16 } });

    expect(alphasOf(result.current, 0)[CONSTANT_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(2 / 16, 1)),
      6,
    );
    expect(alphasOf(result.current, 0)[GROWING_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(4 / 16, 1)),
      6,
    );
  });

  it('re-attacks the columns when only the scale changes — the SAME slices, a new answer', () => {
    const { result, rerender } = mount({ density: SLICES });
    const before = alphasOf(result.current, 0)[GROWING_BIN];

    rerender({ density: SLICES, scale: { mode: 'global' } });

    expect(alphasOf(result.current, 0)[GROWING_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(0.5, 1)),
      6,
    );
    expect(alphasOf(result.current, 0)[GROWING_BIN]).not.toBeCloseTo(before, 6);
  });

  it('keeps the scale when the slices are replaced, so a tick does not drop back to per column', () => {
    const { result, rerender } = mount({ density: SLICES, scale: { mode: 'global', peak: 16 } });

    rerender({
      density: [SLICES[0], { time: utcSeconds(20), samples: [{ price: 100, weight: 8 }] }],
      scale: { mode: 'global', peak: 16 },
    });

    expect(alphasOf(result.current, 0)[CONSTANT_BIN]).toBeCloseTo(
      alphaOf(DEFAULT_DENSITY_RAMP(2 / 16, 1)),
      6,
    );
  });
});
