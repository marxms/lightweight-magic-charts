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
} from '../src/overlays/densityField';
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
