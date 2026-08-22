/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { toDensityColumns, type DensitySlice } from '../src/overlays/densityField';
import { clampDensityTuning } from '../src/overlays/densityTuning';
import { DensityControls } from '../src/react/DensityControls';
import { coerceWorkspaceSetup } from '../src/tabs/setup';

/**
 * The four seams an adversarial review found open on the absolute-scale change. Every case here is
 * a mutant that shipped: each one passed the whole suite before this file existed.
 */

const SLICES: readonly DensitySlice[] = [
  { time: 1 as never, samples: [{ price: 10, weight: 100 }, { price: 20, weight: 400 }] },
  { time: 2 as never, samples: [{ price: 10, weight: 100 }, { price: 20, weight: 900 }] },
];

describe('a supplied peak crosses a public seam, so it is not trusted', () => {
  it('a peak that is not a scale at all falls back to the window peak instead of erasing the field', () => {
    // ZERO is deliberately absent from this list: it IS a scale — a window with no mass paints
    // nothing — and deriving a peak over it would paint that window at full intensity.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5]) {
      const columns = toDensityColumns(SLICES, { mode: 'global', peak: bad });
      expect(columns.every((column) => column.peak === 900)).toBe(true);
    }
  });

  it('a peak BELOW the window maximum is honoured — capping the scale is what a threshold is for', () => {
    const columns = toDensityColumns(SLICES, { mode: 'global', peak: 200 });
    expect(columns.every((column) => column.peak === 200)).toBe(true);
  });

  it('a cell above a capped peak saturates instead of leaving the ramp', () => {
    // A weight far above a capped peak (`900 / 200`) would reach `colour(288)` on a 64-bucket
    // ramp unclamped, and both the alpha and the channel interpolation run past their ends there.
    const columns = toDensityColumns(SLICES, { mode: 'global', peak: 200 });
    const worst = Math.max(
      ...columns.flatMap((column) => column.cells.map((cell) => cell.weight / column.peak)),
    );
    expect(worst).toBeGreaterThan(1);

    const stops: string[] = [];
    const overlay = new (require('../src/overlays/densityField').DensityFieldOverlay)();
    overlay.setColumns(columns);
    overlay.draw(
      {
        useBitmapSpace: (fn: (ctx: unknown) => void) =>
          fn({
            ctx: {
              createLinearGradient: () => ({ addColorStop: (_o: number, c: string) => stops.push(c) }),
              fillRect: () => undefined,
              set fillStyle(_v: unknown) {},
            },
            widthPx: 500,
            hRatio: 1,
            vRatio: 1,
          }),
      } as never,
      { barSpacing: 6, timeToX: () => 100, priceToY: (p: number) => 400 - p } as never,
    );

    const alphas = stops
      .map((stop) => /rgba\([^)]*,([\d.]+)\)$/.exec(stop)?.[1])
      .filter((a): a is string => a !== undefined)
      .map(Number);
    expect(alphas.length).toBeGreaterThan(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.62);
  });
});

describe('an absolute floor survives the seams that used to eat it', () => {
  it('the persistence gate carries floorMode across a restore', () => {
    const policy = {
      catalogue: [],
      servedTimeframes: ['1d'],
      gridFallback: ['1d'],
      maxGridCells: 4,
      density: { floor: 0.05, gamma: 1.5 },
      showDensity: true,
      showProfile: false,
      autoFit: false,
      // AN ARRAY, which is what the contract declares — `(raw, legacy) => readonly string[]`. It
      // read `({})` and compiled only because the whole policy is cast; the gate then walked the
      // active list to prune the per-study values, and a plain object is not iterable.
      coerceIndicators: () => [],
    };
    const restored = coerceWorkspaceSetup(
      { density: { floor: 5000, gamma: 1.5, floorMode: 'absolute' } } as never,
      policy as never,
    );
    expect(restored.density.floorMode).toBe('absolute');
    expect(restored.density.floor).toBe(5000);
  });

  it('the floor rail goes inert instead of rewriting the host threshold into a share', () => {
    const seen: unknown[] = [];
    render(
      <DensityControls
        tuning={clampDensityTuning({ floor: 5000, gamma: 1.5, floorMode: 'absolute' })}
        onChange={(next) => seen.push(next)}
      />,
    );

    const rail = screen.getByTestId('density-floor') as HTMLInputElement;
    expect(rail.disabled).toBe(true);
    fireEvent.change(rail, { target: { value: '0.12' } });
    expect(seen).toHaveLength(0);
  });

  it('the readout drops the percent sign, because an absolute floor is not a percentage', () => {
    render(
      <DensityControls
        tuning={clampDensityTuning({ floor: 5000, gamma: 1.5, floorMode: 'absolute' })}
        onChange={() => undefined}
      />,
    );
    const group = screen.getByTestId('density-tuning');
    expect(group.textContent).toContain('5000');
    expect(group.textContent).not.toContain('500000%');
  });

  it('reset keeps the mode — it is the one field the host cannot restate afterwards', () => {
    const seen: { floorMode?: string }[] = [];
    render(
      <DensityControls
        tuning={clampDensityTuning({ floor: 5000, gamma: 1.5, floorMode: 'absolute' })}
        onChange={(next) => seen.push(next)}
      />,
    );
    fireEvent.click(screen.getByTestId('density-reset'));
    expect(seen[0]?.floorMode).toBe('absolute');
  });

  it('a relative floor still round-trips through the rail, unchanged', () => {
    const seen: { floor?: number; floorMode?: string }[] = [];
    render(
      <DensityControls tuning={{ floor: 0.05, gamma: 1.5 }} onChange={(next) => seen.push(next)} />,
    );
    const rail = screen.getByTestId('density-floor') as HTMLInputElement;
    expect(rail.disabled).toBe(false);
    fireEvent.change(rail, { target: { value: '0.12' } });
    expect(seen[0]?.floor).toBeCloseTo(0.12);
    expect(seen[0]?.floorMode).toBeUndefined();
  });
});
