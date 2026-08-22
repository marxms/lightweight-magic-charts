/**
 * A density field behind the price action, on the candles' scale.
 *
 * The anchoring is asserted in `overlayBridge.spec.ts`, where it is decided. What is decided HERE is
 * the geometry and the transfer curve, and the two defects those produced in the prototype: a bright
 * seam between columns from overlapping translucent fills, and faint clusters indistinguishable from
 * absence.
 */

import { utcSeconds } from '../src/domain/types';
import {
  DEFAULT_DENSITY_RAMP,
  DensityFieldOverlay,
  toDensityColumns,
  type DensityColumn,
  type DensitySlice,
  type DensityTuning,
} from '../src/overlays/densityField';
import { clampDensityTuning } from '../src/overlays/densityTuning';
import { PRICE_ORIGIN, RecordingContext, alphaOf, fakeProjection, fakeTarget } from './renderFakes';

const slice = (time: number, samples: Array<[number, number]>): DensitySlice => ({
  time: utcSeconds(time),
  samples: samples.map(([price, weight]) => ({ price, weight })),
});

const column = (time: number, cells: Array<[number, number, number]>): DensityColumn => ({
  time: utcSeconds(time),
  cells: cells.map(([low, high, weight]) => ({ low, high, weight })),
  peak: Math.max(...cells.map(([, , weight]) => weight), 0),
});

describe('task 4.5 — turning samples into columns', () => {
  it('derives band height from the MEDIAN gap, so one doubled step does not resize every band', () => {
    // Gaps 10,10,20 -> median 10 -> half 5. The minimum would give the same here; the point is what
    // happens with the outlier, which a mean (13.3) would smear across every band in the slice.
    const [built] = toDensityColumns([slice(1, [[100, 1], [110, 2], [120, 3], [140, 4]])]);

    expect(built.cells[0]).toEqual({ low: 95, high: 105, weight: 1 });
    expect(built.peak).toBe(4);
  });

  it('drops non-positive samples and slices that end up empty', () => {
    const built = toDensityColumns([
      slice(1, [[100, 0], [110, -3]]),
      slice(2, [[100, 5], [110, 0]]),
    ]);

    expect(built).toHaveLength(1);
    expect(built[0].time).toBe(2);
    expect(built[0].cells).toHaveLength(1);
  });

  it('sorts by time, because the renderer tiles a column against its neighbour', () => {
    const built = toDensityColumns([slice(30, [[1, 1]]), slice(10, [[1, 1]]), slice(20, [[1, 1]])]);
    expect(built.map((c) => c.time as number)).toEqual([10, 20, 30]);
  });
});

describe('task 4.5 — geometry', () => {
  it('is drawn BEHIND the price action', () => {
    expect(new DensityFieldOverlay().zOrder).toBe('behind');
  });

  it('tiles adjacent columns with no gap and NO OVERLAP', () => {
    // The overlap was the real defect. These fills are translucent, so an overlapping pixel
    // composites its alpha twice and reads as a bright seam — the reported "whitish border".
    const overlay = new DensityFieldOverlay();
    overlay.setColumns([column(100, [[10, 20, 5]]), column(110, [[10, 20, 5]])]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    expect(ctx.rects).toHaveLength(2);
    const [first, second] = ctx.rects;
    expect(first.x + first.w).toBe(second.x);
  });

  it('costs one conversion for an off-screen column and does not count it as visible', () => {
    const overlay = new DensityFieldOverlay();
    overlay.setColumns([column(50, [[10, 20, 5]]), column(9000, [[10, 20, 5]])]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    expect(overlay.frameStats()).toEqual({ drawn: 1, skipped: 0, visibleColumns: 1 });
    expect(ctx.rects).toHaveLength(1);
  });

  it('draws ONE gradient per column — a fill per column, not a rectangle per cell', () => {
    // Merging same-coloured neighbours into flat rectangles was the earlier performance trick, and
    // banding was its price. Two stops per cell make each cell a plateau with a ramp between them.
    const overlay = new DensityFieldOverlay();
    overlay.setColumns([column(100, [[10, 20, 5], [30, 40, 9]])]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    const gradients = ctx.recordedGradients();
    expect(gradients).toHaveLength(1);
    expect(gradients[0].stops).toHaveLength(4);
    expect(gradients[0].stops.map(([offset]) => offset)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(ctx.rects).toHaveLength(1);
    expect(ctx.rects[0].fill).toBe(gradients[0].id);
  });

  it('emits a shared edge between touching cells ONCE, so no stop is placed on top of another', () => {
    // Two stops at the same offset make the second one win outright, and the cell below it loses its
    // plateau. Offsets must be strictly ascending for a gradient to mean what it reads as.
    const overlay = new DensityFieldOverlay();
    overlay.setColumns([column(100, [[10, 20, 5], [20, 30, 9]])]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    const offsets = ctx.recordedGradients()[0].stops.map(([offset]) => offset);
    expect(offsets).toEqual([0, 0.5, 1]);
  });

  it('skips a cell whose price is off the price scale rather than clamping it to the edge', () => {
    const overlay = new DensityFieldOverlay();
    overlay.setColumns([column(100, [[10, 20, 5], [900, 910, 9]])]);
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10, priceToY: (p) => (p > 100 ? null : PRICE_ORIGIN - p) }),
    );

    expect(ctx.recordedGradients()[0].stops).toHaveLength(2);
  });
});

describe('task 4.5 — the transfer curve', () => {
  it('suppresses cells below the floor and counts them', () => {
    const overlay = new DensityFieldOverlay();
    overlay.setTuning({ floor: 0.5, gamma: 1 });
    overlay.setColumns([column(100, [[10, 20, 1], [20, 30, 10]])]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    expect(overlay.frameStats().skipped).toBe(1);
    expect(ctx.recordedGradients()[0].stops.map(([, colour]) => colour)).toContain('rgba(0,0,0,0)');
  });

  it('lets gamma below 1 LIFT a faint cell without changing the ranking of cells', () => {
    // Neither knob touches the data: both are monotonic in the normalised weight. A cell at 20% of
    // the peak goes from 5.5% alpha at gamma 1.5 to 28% at gamma 0.5, and stays the fainter cell.
    const faintSuppressed = alphaOf(DEFAULT_DENSITY_RAMP(0.2, 1.5));
    const faintLifted = alphaOf(DEFAULT_DENSITY_RAMP(0.2, 0.5));

    expect(faintSuppressed).toBeCloseTo(0.055, 3);
    expect(faintLifted).toBeGreaterThan(0.27);
    for (const gamma of [0.5, 1, 1.5]) {
      expect(alphaOf(DEFAULT_DENSITY_RAMP(0.2, gamma))).toBeLessThan(
        alphaOf(DEFAULT_DENSITY_RAMP(0.8, gamma)),
      );
    }
  });

  it('takes a ramp from the consumer, so the palette is not this package’s decision', () => {
    const overlay = new DensityFieldOverlay((normalised) => `custom:${normalised.toFixed(2)}`);
    overlay.setColumns([column(100, [[10, 20, 5]])]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    expect(ctx.recordedGradients()[0].stops[0][1]).toMatch(/^custom:/);
  });

  it('does not divide by a zero peak', () => {
    const overlay = new DensityFieldOverlay();
    overlay.setColumns([{ time: utcSeconds(100), cells: [{ low: 10, high: 20, weight: 0 }], peak: 0 }]);
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 10 }));

    for (const [, colour] of ctx.recordedGradients()[0].stops) expect(colour).toBe('rgba(0,0,0,0)');
  });
});

describe('task 4.5 — lifecycle', () => {
  it('asks the host to redraw when the data or the tuning changes, and stops once detached', () => {
    const overlay = new DensityFieldOverlay();
    let redraws = 0;
    overlay.attached({ requestRedraw: () => (redraws += 1), projection: fakeProjection() });

    overlay.setColumns([column(100, [[10, 20, 5]])]);
    overlay.setTuning({ floor: 0.1, gamma: 1 });
    expect(redraws).toBe(2);

    overlay.detached();
    overlay.setColumns([]);
    expect(redraws).toBe(2);
    expect(overlay.frameStats()).toEqual({ drawn: 0, skipped: 0, visibleColumns: 0 });
  });
});

/**
 * LIQ-04 and LIQ-05 — the scale a cell is normalised against.
 *
 * Per-column normalisation makes accumulation unrepresentable: a bin holding a constant absolute
 * magnitude darkens on its own as some OTHER column grows. LIQ-04 asks for one peak across the
 * window; LIQ-05 asks that omitting the argument keep exactly what the package publishes today.
 */
describe('LIQ-04, LIQ-05 — column scale and global scale', () => {
  /** The bin at 110 holds a constant 2 in both slices; the bin at 100 doubles. Maxima 4 and 8. */
  const twoColumns = (): readonly DensitySlice[] => [
    slice(10, [[100, 4], [110, 2]]),
    slice(20, [[100, 8], [110, 2]]),
  ];

  /** The two bands share the edge at 105, so the gradient carries three stops, top price first. */
  const CONSTANT_BIN = 0;
  const GROWING_BIN = 2;

  const alphasOf = (columns: readonly DensityColumn[], at: number): readonly number[] => {
    const overlay = new DensityFieldOverlay();
    overlay.setTuning({ floor: 0, gamma: 1 });
    overlay.setColumns(columns);
    const ctx = new RecordingContext();
    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 4 }));
    const stops = ctx.recordedGradients()[at].stops;
    expect(stops).toHaveLength(3);
    return stops.map(([, colour]) => alphaOf(colour));
  };

  it('omitting the scale returns exactly what the published signature returns', () => {
    // The whole published contract in one literal: median-gap geometry, the column's OWN peak,
    // non-positive samples dropped, empty slices dropped, ascending time.
    expect(
      toDensityColumns([
        slice(20, [[100, 2], [110, 4]]),
        slice(30, [[100, 0], [110, -1]]),
        slice(10, [[100, 1], [110, 3], [120, 9]]),
      ]),
    ).toEqual([
      {
        time: 10,
        cells: [
          { low: 95, high: 105, weight: 1 },
          { low: 105, high: 115, weight: 3 },
          { low: 115, high: 125, weight: 9 },
        ],
        peak: 9,
      },
      {
        time: 20,
        cells: [
          { low: 95, high: 105, weight: 2 },
          { low: 105, high: 115, weight: 4 },
        ],
        peak: 4,
      },
    ]);
  });

  it('spells the default out: omitting the scale and asking for `column` are the same call', () => {
    const slices = twoColumns();
    expect(toDensityColumns(slices)).toEqual(toDensityColumns(slices, { mode: 'column' }));
  });

  it('under the default, the untouched bin DIMS as its neighbour grows', () => {
    // LIQ-05 from the renderer's end, and the defect LIQ-04 exists to fix: a constant 2 is half of
    // the first column's peak and a quarter of the second's, so a bin nobody touched loses light.
    const columns = toDensityColumns(twoColumns());
    expect(alphasOf(columns, 0)[CONSTANT_BIN]).toBeCloseTo(alphaOf(DEFAULT_DENSITY_RAMP(0.5, 1)), 6);
    expect(alphasOf(columns, 1)[CONSTANT_BIN]).toBeCloseTo(alphaOf(DEFAULT_DENSITY_RAMP(0.25, 1)), 6);
  });

  it('global mode writes the SUPPLIED peak on every column', () => {
    const columns = toDensityColumns(twoColumns(), { mode: 'global', peak: 50 });
    expect(columns.map((c) => c.peak)).toEqual([50, 50]);
  });

  it('global mode with no peak derives the largest weight across ALL slices', () => {
    const columns = toDensityColumns(twoColumns(), { mode: 'global' });
    expect(columns.map((c) => c.peak)).toEqual([8, 8]);
  });

  it('global mode changes the peak and NOTHING else — the cells are the column-mode cells', () => {
    const slices = twoColumns();
    expect(toDensityColumns(slices, { mode: 'global' }).map((c) => c.cells)).toEqual(
      toDensityColumns(slices).map((c) => c.cells),
    );
  });

  it('under global mode, the untouched bin keeps the SAME alpha in both columns', () => {
    // LIQ-04. `draw()` is untouched — it already divides by `column.peak`; what changed is the peak.
    const columns = toDensityColumns(twoColumns(), { mode: 'global' });
    expect(alphasOf(columns, 0)[CONSTANT_BIN]).toBeCloseTo(alphasOf(columns, 1)[CONSTANT_BIN], 6);
    expect(alphasOf(columns, 0)[CONSTANT_BIN]).toBeCloseTo(alphaOf(DEFAULT_DENSITY_RAMP(0.25, 1)), 6);
  });

  it('under global mode a cell is its share of the WINDOW peak, not of its own column', () => {
    // Weight 4 is the first column's own peak, so column mode paints it at full intensity. Against
    // the window peak of 8 it is half, and half is what the ramp is asked for.
    const columns = toDensityColumns(twoColumns(), { mode: 'global' });
    expect(alphasOf(columns, 0)[GROWING_BIN]).toBeCloseTo(alphaOf(DEFAULT_DENSITY_RAMP(0.5, 1)), 6);
    expect(alphasOf(columns, 1)[GROWING_BIN]).toBeCloseTo(alphaOf(DEFAULT_DENSITY_RAMP(1, 1)), 6);
  });

  it('honours a supplied peak of ZERO instead of deriving one over it', () => {
    // LIQ-07 reaches the renderer through here: a window whose absolute peak is zero paints nothing.
    // Falling back to the derived peak on a falsy value would paint it at full intensity instead.
    expect(toDensityColumns(twoColumns(), { mode: 'global', peak: 0 }).map((c) => c.peak)).toEqual([
      0, 0,
    ]);
  });

  it('keeps the drop of non-positive samples and the time ordering under global mode too', () => {
    const columns = toDensityColumns(
      [slice(30, [[100, 5]]), slice(20, [[100, 0], [110, -3]]), slice(10, [[100, 1]])],
      { mode: 'global' },
    );
    expect(columns.map((c) => c.time as number)).toEqual([10, 30]);
    expect(columns.map((c) => c.cells.length)).toEqual([1, 1]);
  });
});

/**
 * LIQ-06 — the floor, stated in the host's own unit instead of as a share of a peak.
 *
 * A floor relative to the column's own peak is circular under a shared scale: it says nothing about
 * the magnitude a cell holds, only about how that cell compares to whatever else happens to be in
 * the column. The relative rule stays the default; the absolute one is the opt-in.
 */
describe('LIQ-06 — a relative floor and an absolute one', () => {
  /** Peaks of 4 and 8, with a constant 2 in both. The bin at 110 is the constant one. */
  const twoPeaks = (): readonly DensityColumn[] =>
    toDensityColumns([slice(10, [[100, 4], [110, 2]]), slice(20, [[100, 8], [110, 2]])]);

  interface Painted {
    readonly skipped: number;
    readonly columns: readonly (readonly string[])[];
  }

  const paint = (tuning: DensityTuning): Painted => {
    const overlay = new DensityFieldOverlay();
    overlay.setTuning(tuning);
    overlay.setColumns(twoPeaks());
    const ctx = new RecordingContext();
    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection({ barSpacing: 4 }));
    return {
      skipped: overlay.frameStats().skipped,
      columns: ctx.recordedGradients().map((g) => g.stops.map(([, colour]) => colour)),
    };
  };

  const CLEAR = 'rgba(0,0,0,0)';

  it('leaves the relative tuning exactly two knobs — no mode is written where none was asked for', () => {
    // The default has to stay byte-for-byte what a host already stores, or every restored file
    // starts carrying a member the version that wrote it never had.
    const clamped = clampDensityTuning({ floor: 0.2, gamma: 1.2 });
    expect(Object.keys(clamped)).toEqual(['floor', 'gamma']);
    expect(clamped.floorMode).toBeUndefined();
  });

  it('keeps the absolute mode through the clamp, and does NOT force it into the relative bound', () => {
    // 0.4 is the ceiling of a SHARE. An absolute floor is a weight in the host's unit, and clamping
    // 5 000 down to 0.4 would silently turn "hide anything under five thousand" into "hide almost
    // nothing", which is the failure that looks like working software.
    expect(clampDensityTuning({ floor: 5000, gamma: 1.5, floorMode: 'absolute' })).toEqual({
      floor: 5000,
      gamma: 1.5,
      floorMode: 'absolute',
    });
  });

  it('sends a negative or unreadable absolute floor to zero, so a broken threshold hides nothing', () => {
    for (const floor of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampDensityTuning({ floor, gamma: 1.5, floorMode: 'absolute' }).floor).toBe(0);
    }
    // And gamma is still bounded on this path — the absolute branch is not an exit from the clamp.
    expect(clampDensityTuning({ floor: 1, gamma: 99, floorMode: 'absolute' }).gamma).toBe(2.5);
  });

  it('without a mode, the floor is a SHARE of the column peak — which cuts unevenly', () => {
    // The published rule, kept as the default. A constant 2 is half of one column's peak and a
    // quarter of the other's, so the same magnitude survives in one column and vanishes in the next.
    const painted = paint({ floor: 0.4, gamma: 1 });
    expect(painted.skipped).toBe(1);
    expect(painted.columns[0]).not.toContain(CLEAR);
    expect(painted.columns[1]).toContain(CLEAR);
  });

  it('under an absolute floor the SAME magnitude is cut in every column, whatever its peak', () => {
    const painted = paint({ floor: 3, gamma: 1, floorMode: 'absolute' });
    expect(painted.skipped).toBe(2);
    // The constant bin at 110 is the first two stops of each column; the growing bin is the last.
    for (const stops of painted.columns) expect(stops).toEqual([CLEAR, CLEAR, expect.not.stringMatching(/^rgba\(0,0,0,0\)$/)]);
  });

  it('cuts strictly BELOW the value, so a cell sitting exactly on the floor still draws', () => {
    expect(paint({ floor: 2, gamma: 1, floorMode: 'absolute' }).skipped).toBe(0);
    expect(paint({ floor: 2.0001, gamma: 1, floorMode: 'absolute' }).skipped).toBe(2);
  });

  it('a value far outside the relative bound survives the clamp AND reaches the paint', () => {
    // The two halves joined: the clamp keeps 5, and 5 is what the renderer cuts on. Either half
    // alone would pass while the other quietly dropped the number.
    const painted = paint(clampDensityTuning({ floor: 5, gamma: 1, floorMode: 'absolute' }));
    expect(painted.skipped).toBe(3);
    expect(painted.columns[0]).toEqual([CLEAR, CLEAR, CLEAR]);
    expect(painted.columns[1][2]).not.toBe(CLEAR);
  });
});
