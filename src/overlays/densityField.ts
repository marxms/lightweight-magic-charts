/**
 * Task 4.5 — a density field drawn behind the price action, on the candles' own price scale.
 * See docs/explanation/overlays.md#the-density-field-and-the-three-drawing-rules
 */

import type { UtcSeconds } from '../domain/types';
import type { Overlay, OverlayHost, Projection, RenderTarget } from '../extension/plugins';

export interface DensityCell {
  readonly low: number;
  readonly high: number;
  readonly weight: number;
}

export interface DensityColumn {
  readonly time: UtcSeconds;
  readonly cells: readonly DensityCell[];
  /** Largest weight in this column. Intensity is normalised per column, against its own peak. */
  readonly peak: number;
}

/** What a consumer has: a price and a weight, per slice. Band edges are derived, not supplied. */
export interface DensitySample {
  readonly price: number;
  readonly weight: number;
}

export interface DensitySlice {
  readonly time: UtcSeconds;
  readonly samples: readonly DensitySample[];
}

/** Which peak normalises a cell. Omitted: per column. Under `global`, absent `peak` = the run's max.
 * See docs/explanation/overlays.md#why-a-per-column-scale-makes-accumulation-unrepresentable */
export interface DensityScale {
  readonly mode: 'column' | 'global';
  readonly peak?: number;
}

/**
 * THE TWO KNOBS. Neither changes the DATA: both are monotonic in the normalised weight.
 * See docs/explanation/overlays.md#why-faint-clusters-were-invisible
 */
export interface DensityTuning {
  /** Share of the peak below which a cell draws nothing — or a weight, under an absolute floor. */
  readonly floor: number;
  /** Transfer-curve exponent. Below 1 lifts faint cells; above 1 suppresses them. */
  readonly gamma: number;
  /** How `floor` reads. Absent means `relative`, a share of the peak, which is the published rule. */
  readonly floorMode?: 'relative' | 'absolute';
}

export const DEFAULT_DENSITY_TUNING: DensityTuning = { floor: 0.05, gamma: 1.5 };

/** `normalised` is 0..1 against the column peak. Returns any canvas fill style. */
export type DensityRamp = (normalised: number, gamma: number) => string;

/** Cold blue -> amber -> hot magenta, with alpha carrying most of the signal. */
export const DEFAULT_DENSITY_RAMP: DensityRamp = (normalised, gamma) => {
  const alpha = 0.62 * normalised ** gamma;
  if (normalised < 0.5) {
    const t = normalised / 0.5;
    return `rgba(${Math.round(25 + 150 * t)},${Math.round(80 + 60 * t)},${Math.round(200 - 40 * t)},${alpha.toFixed(3)})`;
  }
  const t = (normalised - 0.5) / 0.5;
  return `rgba(${Math.round(175 + 70 * t)},${Math.round(140 - 100 * t)},${Math.round(160 - 90 * t)},${alpha.toFixed(3)})`;
};

/** Colour-cache resolution. The ramp is continuous; this only bounds how many strings get built. */
const RAMP_BUCKETS = 64;

/** Counted, not timed. See docs/explanation/overlays.md#counted-not-timed */
export interface DensityFrameStats {
  /** Columns that produced a fill. */
  readonly drawn: number;
  /** Cells suppressed by the floor. */
  readonly skipped: number;
  /** Columns inside the viewport, drawn or not. */
  readonly visibleColumns: number;
}

const NO_STATS: DensityFrameStats = { drawn: 0, skipped: 0, visibleColumns: 0 };

/** Largest weight in the whole run, walked rather than spread: a run of slices overflows the stack. */
function windowPeak(slices: readonly DensitySlice[]): number {
  let peak = 0;
  for (const slice of slices) {
    for (const sample of slice.samples) if (sample.weight > peak) peak = sample.weight;
  }
  return peak;
}

/**
 * Turns samples into columns, deriving each band's half-height from the MEDIAN gap in that slice.
 * See docs/explanation/overlays.md#the-median-gap
 */
/** A supplied peak, or nothing. See docs/explanation/overlays.md#what-a-supplied-peak-may-be */
function usablePeak(peak: number | undefined): number | null {
  if (peak === undefined) return null;
  return Number.isFinite(peak) && peak >= 0 ? peak : null;
}

export function toDensityColumns(
  slices: readonly DensitySlice[],
  scale?: DensityScale,
): readonly DensityColumn[] {
  const shared = scale?.mode === 'global' ? usablePeak(scale.peak) ?? windowPeak(slices) : null;
  return slices
    .map((slice): DensityColumn => {
      const prices = slice.samples.map((sample) => sample.price).sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < prices.length; i += 1) {
        const gap = prices[i] - prices[i - 1];
        if (gap > 0) gaps.push(gap);
      }
      gaps.sort((a, b) => a - b);
      const half = (gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 0) / 2;

      let peak = 0;
      const cells: DensityCell[] = [];
      for (const sample of slice.samples) {
        if (sample.weight <= 0) continue;
        if (sample.weight > peak) peak = sample.weight;
        cells.push({ low: sample.price - half, high: sample.price + half, weight: sample.weight });
      }
      return { time: slice.time, cells, peak: shared ?? peak };
    })
    .filter((column) => column.cells.length > 0)
    .sort((a, b) => (a.time as number) - (b.time as number));
}

export class DensityFieldOverlay implements Overlay {
  /** Behind the price action. This was one of the two defects reported against the prototype. */
  readonly zOrder = 'behind' as const;

  private columns: readonly DensityColumn[] = [];
  private tuning: DensityTuning = DEFAULT_DENSITY_TUNING;
  private stats: DensityFrameStats = NO_STATS;
  private host: OverlayHost | null = null;

  constructor(private readonly ramp: DensityRamp = DEFAULT_DENSITY_RAMP) {}

  attached(host: OverlayHost): void {
    this.host = host;
  }

  detached(): void {
    this.host = null;
    this.stats = NO_STATS;
  }

  setColumns(columns: readonly DensityColumn[]): void {
    this.columns = columns;
    this.host?.requestRedraw();
  }

  /** Repaints only — the columns are untouched, so no refetch is involved. */
  setTuning(tuning: DensityTuning): void {
    this.tuning = tuning;
    this.host?.requestRedraw();
  }

  frameStats(): DensityFrameStats {
    return this.stats;
  }

  draw(target: RenderTarget, projection: Projection): void {
    if (this.columns.length === 0) {
      this.stats = NO_STATS;
      return;
    }
    const { floor, gamma } = this.tuning;
    // A share of the peak says nothing about the magnitude a cell holds; absolute cuts on the weight.
    const absolute = this.tuning.floorMode === 'absolute';
    // The cache lives for ONE draw, so a tuning change can never be served a stale colour.
    const cache = new Map<number, string>();
    const colour = (bucket: number): string => {
      const hit = cache.get(bucket);
      if (hit !== undefined) return hit;
      const built = this.ramp(bucket / RAMP_BUCKETS, gamma);
      cache.set(bucket, built);
      return built;
    };

    // FALSE POSITIVE — a canvas method, not a React hook. See docs/explanation/overlays.md#usebitmapspace-is-not-a-hook
    // biome-ignore lint/correctness/useHookAtTopLevel: canvas method of the base lib, not a hook
    target.useBitmapSpace(({ ctx, widthPx, hRatio, vRatio }) => {
      const columnWidth = Math.max(1, projection.barSpacing);
      let drawn = 0;
      let skipped = 0;
      let visibleColumns = 0;

      for (const column of this.columns) {
        const x = projection.timeToX(column.time);
        if (x === null || x < -columnWidth || x > widthPx + columnWidth) continue;
        visibleColumns += 1;

        const left = Math.round((x - columnWidth / 2) * hRatio);
        const right = Math.round((x + columnWidth / 2) * hRatio);
        const barWidth = Math.max(1, right - left);

        const bands = column.cells
          .map((cell) => ({
            cell,
            top: projection.priceToY(cell.high),
            bottom: projection.priceToY(cell.low),
          }))
          .filter(
            (band): band is { cell: DensityCell; top: number; bottom: number } =>
              band.top !== null && band.bottom !== null,
          )
          .sort((a, b) => a.top - b.top);
        if (bands.length === 0) continue;

        const columnTop = bands[0].top;
        const columnBottom = bands[bands.length - 1].bottom;
        const span = columnBottom - columnTop;
        if (span <= 0) continue;

        const gradient = ctx.createLinearGradient(0, columnTop * vRatio, 0, columnBottom * vRatio);
        let lastOffset = -1;
        for (const band of bands) {
          const raw = column.peak > 0 ? band.cell.weight / column.peak : 0;
          const normalised = raw > 1 ? 1 : raw;
          const below = absolute ? band.cell.weight < floor : normalised < floor;
          if (below) skipped += 1;
          const stop = below ? 'rgba(0,0,0,0)' : colour(Math.round(normalised * RAMP_BUCKETS));
          // Two stops per cell — its top and its bottom. See docs/explanation/overlays.md#two-stops-per-cell
          for (const edge of [band.top, band.bottom]) {
            const offset = Math.min(1, Math.max(0, (edge - columnTop) / span));
            if (offset <= lastOffset) continue;
            gradient.addColorStop(offset, stop);
            lastOffset = offset;
          }
        }

        ctx.fillStyle = gradient;
        const top = Math.round(columnTop * vRatio);
        ctx.fillRect(left, top, barWidth, Math.max(1, Math.round(columnBottom * vRatio) - top));
        drawn += 1;
      }

      this.stats = { drawn, skipped, visibleColumns };
    });
  }
}
