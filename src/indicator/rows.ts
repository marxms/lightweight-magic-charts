/**
 * Series responses folded into one row per bar, keyed by timestamp.
 *
 * INVARIANT: TIMESTAMPED VALUES ONLY. An index-based fallback maps every value one candle late
 * whenever the in-progress bar sits inside the window, and a value that did not arrive with its own
 * timestamp cannot be placed on a grid.
 *
 * INVARIANT: `volume` is seeded from the BAR, never from the study payload — nothing computes it,
 * so it cannot be missing the way a study can, and the price pane reads it like any other field.
 */

/** A bar as this fold needs it: a timestamp, and a volume when the feed carries one. */
export interface RowBar {
  readonly timestamp: number;
  readonly volume?: number | null;
}

export interface SeriesReading {
  readonly name: string;
  readonly values?: readonly (number | null)[] | null;
  readonly timestamps?: readonly number[];
}

export interface ReadingSnapshot {
  readonly indicators?: readonly SeriesReading[] | null;
}

export interface ReadingSeries {
  readonly data?: readonly ReadingSnapshot[] | null;
}

/** The per-bucket fields a derivatives feed publishes alongside the candles. */
export interface DerivativeSnapshot {
  readonly openInterestBase?: number | null;
  readonly openInterest?: number | null;
  readonly fundingRate?: number | null;
  readonly longShortRatio?: number | null;
}

export interface DerivativePoint {
  readonly timestamp: number;
  readonly snapshot?: DerivativeSnapshot | null;
}

export interface DerivativeSeries {
  readonly data?: readonly DerivativePoint[] | null;
}

export type WorkspaceRow = { readonly timestamp: number } & Readonly<Record<string, number | null>>;

export function buildWorkspaceRows(
  bars: readonly RowBar[],
  indicators: ReadingSeries | null,
  derivatives: DerivativeSeries | null,
): WorkspaceRow[] {
  const byTimestamp = new Map<number, Record<string, number | null>>();
  for (const bar of bars) {
    byTimestamp.set(bar.timestamp, {
      timestamp: bar.timestamp,
      volume: typeof bar.volume === 'number' && Number.isFinite(bar.volume) ? bar.volume : null,
    });
  }

  for (const snapshot of indicators?.data ?? []) {
    for (const entry of snapshot.indicators ?? []) {
      const values = entry.values ?? [];
      const stamps = entry.timestamps;
      if (values.length === 0 || stamps === undefined || stamps.length !== values.length) continue;
      values.forEach((value, index) => {
        const row = byTimestamp.get(stamps[index]);
        if (row === undefined || typeof value !== 'number' || !Number.isFinite(value)) return;
        if (row[entry.name] === undefined) row[entry.name] = value;
      });
    }
  }

  for (const point of derivatives?.data ?? []) {
    const row = byTimestamp.get(point.timestamp);
    if (row === undefined) continue;
    row.openInterestBase = point.snapshot?.openInterestBase ?? null;
    row.openInterest = point.snapshot?.openInterest ?? null;
    row.fundingRate = point.snapshot?.fundingRate ?? null;
    row.longShortRatio = point.snapshot?.longShortRatio ?? null;
  }

  return bars.map((bar) => byTimestamp.get(bar.timestamp) as WorkspaceRow);
}
