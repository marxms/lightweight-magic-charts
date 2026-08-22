/**
 * The renderer seam, filled with the real `lightweight-charts` — the one adapter every host writes.
 *
 * WHY THE PACKAGE DOES NOT DO THIS ITSELF. `lightweight-charts@5` is `"type": "module"` and its
 * `exports` map offers only the `import` condition, while this package also ships CommonJS. So the
 * library talks to the base API through the structural port in `src/port/chartApi.ts`, and a file
 * like this one is where that port meets the real package.
 *
 * IT IS ALMOST A PASS-THROUGH. One member needs translating — the base library names a series kind
 * with an imported VALUE, and a value is the one thing a structural type cannot carry — and one
 * member needs BUILDING, because the base library does not have it on a series at all.
 */
import type {
  ChartEngine,
  SeriesHandle,
  SeriesMarkerPoint,
  SeriesShape,
  WorkspaceChartHandle,
} from 'lightweight-magic-charts';
import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
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
 * THE MARKER DOOR, OPENED — and it needed opening, which is the point.
 *
 * `SeriesHandle.setMarkers?` has been on the port since it was written, with a docblock saying an
 * adapter has to add the plugin, and no adapter ever did. Measured on the installed
 * `lightweight-charts@5`: `ISeriesApi` has no `setMarkers` at all — the member lives on
 * `ISeriesMarkersPluginApi`, which `createSeriesMarkers` returns — so a host handing back the raw
 * series has a door that swallows every call. The candlestick pattern marks the published 0.2.1
 * offers do not draw, and nothing was red, because the repository's own test doubles implemented
 * what the real object does not.
 *
 * THE PLUGIN IS CREATED ON THE FIRST CALL, not at `addSeries`. Six studies over six lanes is 505
 * series, and a plugin per series that never receives a mark is 505 plugins nobody asked for.
 */
const MARKER_PLUGINS = new WeakMap<ISeriesApi<SeriesType>, ISeriesMarkersPluginApi<Time>>();

function withMarkers(created: ISeriesApi<SeriesType>): SeriesHandle {
  return Object.assign(created, {
    setMarkers: (marks: readonly SeriesMarkerPoint[]): void => {
      let plugin = MARKER_PLUGINS.get(created);
      if (plugin === undefined) {
        plugin = createSeriesMarkers(created, []);
        MARKER_PLUGINS.set(created, plugin);
      }
      plugin.setMarkers([...marks] as SeriesMarker<Time>[]);
    },
  });
}

/**
 * THE REAL CHART, KEPT REACHABLE — and the reason is a gap in the drawing seam worth naming.
 *
 * `DrawingSurfaceHost` hands a binding `{ chart, series, container, snapPrice }`, where `series` is
 * the real `ISeriesApi` (a real series satisfies `SeriesHandle` structurally, as below) but `chart`
 * is the STRUCTURAL handle this file builds. A drawing library that wants `IChartApi` — and
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
      return withMarkers(created);
    },
  };
  REAL_CHARTS.set(handle, chart);
  return handle;
};
