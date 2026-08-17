/**
 * The renderer seam, filled with the real `lightweight-charts` — the one adapter every host writes.
 *
 * WHY THE PACKAGE DOES NOT DO THIS ITSELF. `lightweight-charts@5` is `"type": "module"` and its
 * `exports` map offers only the `import` condition, while this package also ships CommonJS. So the
 * library talks to the base API through the structural port in `src/port/chartApi.ts`, and a file
 * like this one is where that port meets the real package.
 *
 * IT IS A PASS-THROUGH. Exactly one member needs translating: the base library names a series kind
 * with an imported VALUE, and a value is the one thing a structural type cannot carry.
 */
import type {
  ChartEngine,
  SeriesHandle,
  SeriesShape,
  WorkspaceChartHandle,
} from 'lightweight-magic-charts';
import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from 'lightweight-charts';

/** Resolved one shape at a time, so an example that draws no area series retains no area series. */
function definitionOf(shape: SeriesShape): unknown {
  switch (shape) {
    case 'candlestick':
      return CandlestickSeries;
    case 'line':
      return LineSeries;
    case 'histogram':
      return HistogramSeries;
    case 'area':
      return AreaSeries;
  }
}

/**
 * THE REAL CHART, KEPT REACHABLE — and the reason is a gap in the drawing seam worth naming.
 *
 * `DrawingSurfaceHost` hands a binding `{ chart, series, container }`, where `series` is the real
 * `ISeriesApi` (a real series satisfies `SeriesHandle` structurally, as below) but `chart` is the
 * STRUCTURAL handle this file builds. A drawing library that wants `IChartApi` — and
 * `lightweight-charts-drawing` does — cannot get it from the seam alone.
 *
 * So the host keeps the pairing. A WeakMap rather than a field on the handle: nothing should be able
 * to reach the base chart by walking the port, and an entry dies with the handle that keys it.
 */
const REAL_CHARTS = new WeakMap<WorkspaceChartHandle, IChartApi>();

export const realChartOf = (handle: WorkspaceChartHandle): IChartApi | undefined =>
  REAL_CHARTS.get(handle);

export const demoEngine: ChartEngine = (container, options) => {
  const chart = createChart(container, {
    // DECLARED, never inherited: the base library falls back to `navigator.language` and hands the
    // raw value to `Intl`, and at least one headless browser answers with the string "undefined" —
    // which `Intl` rejects with a whole-page RangeError.
    localization: { locale: 'en-US' },
    ...(options as DeepPartial<ChartOptions>),
  });

  const handle: WorkspaceChartHandle = {
    panes: () => chart.panes(),
    addPane: (preserveEmptyPane) => chart.addPane(preserveEmptyPane),
    applyOptions: (next) => chart.applyOptions(next as DeepPartial<ChartOptions>),
    timeScale: () => chart.timeScale(),
    subscribeCrosshairMove: (listener) => chart.subscribeCrosshairMove(listener),
    unsubscribeCrosshairMove: (listener) => chart.unsubscribeCrosshairMove(listener),
    subscribeClick: (listener) => chart.subscribeClick(listener),
    unsubscribeClick: (listener) => chart.unsubscribeClick(listener),
    remove: () => chart.remove(),
    // The two casts ARE the translation: the definition is chosen at runtime, so its type parameter
    // cannot be inferred, and the options are the base library's own record. The RESULT needs no
    // cast — a real series satisfies `SeriesHandle` structurally.
    addSeries: (shape, seriesOptions, paneIndex): SeriesHandle => {
      const created: ISeriesApi<SeriesType> = chart.addSeries(
        definitionOf(shape) as never,
        seriesOptions as never,
        paneIndex,
      );
      return created;
    },
  };
  REAL_CHARTS.set(handle, chart);
  return handle;
};
