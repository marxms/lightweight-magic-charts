/**
 * THE DATA ON SCREEN — candles, series, the shape pair, the markers, and the framing.
 * See docs/explanation/react-surface.md#framing-lives-inside-the-effect-that-writes
 */

import { useEffect, useMemo, useRef } from 'react';

import { carryReadings, plottedPoints } from '../../domain/readings';
import { futureBarCount, futureTail } from '../../domain/futureTail';
import type { Bar, PaneSpec, SeriesSpec } from '../../domain/types';
import type { SeriesMarkerPoint, SeriesShape } from '../../port/chartApi';
import { seriesKey, twinKey, twinShapeOf } from '../../render/seriesFactory';
import type { ChartHandles } from './chartHandles';
import { shouldReframe } from './reframe';

/** One series' RAW readings, one entry per bar, `null` where nothing was measured.
 * See docs/explanation/react-surface.md#raw-readings-and-the-declared-drawing */
export type SeriesReader = (pane: PaneSpec, series: SeriesSpec) => readonly (number | null)[];

export interface SeriesDataPaneView {
  readonly spec: PaneSpec;
}

export type ReadingsByPane = ReadonlyMap<string, ReadonlyArray<ReadonlyArray<number | null>>>;

/** AN OPTIONS OBJECT, unlike the mount: ten values, and two adjacent `string`s that could swap.
 * See docs/explanation/react-surface.md#an-options-object-unlike-the-mount */
export interface SeriesDataInput {
  readonly bars: readonly Bar[];
  readonly panes: readonly SeriesDataPaneView[];
  readonly pricePane?: PaneSpec;
  readonly read: SeriesReader;
  readonly upColor: string;
  readonly downColor: string;
  readonly seriesStyles?: Readonly<Record<string, SeriesShape>>;
  readonly priceMarkers?: readonly SeriesMarkerPoint[];
  /** Marks on a COMPUTED series, by `seriesStyleKey`. See docs/explanation/react-surface.md#a-study-marks-its-own-series */
  readonly seriesMarkers?: ReadonlyMap<string, readonly SeriesMarkerPoint[]>;
  /** The dataset's IDENTITY: changed = dataset replaced, and the scale is redone once. */
  readonly datasetId?: string;
  readonly autoFit?: boolean;
  readonly futureBars?: number;
}

/** What the last framing was made of: which dataset, and how many bars it had at the time. */
interface Framed {
  readonly datasetId: string | undefined;
  readonly barCount: number;
}

/** Writes everything the chart draws, and returns the CARRIED readings for the legend.
 * See docs/explanation/react-surface.md#the-legend-speaks-of-the-measured-numbers */
export function useSeriesData(handles: ChartHandles | null, input: SeriesDataInput): ReadingsByPane {
  const {
    bars,
    panes,
    pricePane,
    read,
    upColor,
    downColor,
    seriesStyles,
    priceMarkers,
    seriesMarkers,
    datasetId,
    autoFit,
    futureBars,
  } = input;

  /** Every pane that carries READINGS, price included — price is withheld from the LAYOUT, not here. */
  const dataPanes = useMemo<readonly SeriesDataPaneView[]>(
    () => (pricePane === undefined ? panes : [{ spec: pricePane }, ...panes]),
    [panes, pricePane],
  );

  const readingsByPane = useMemo<ReadingsByPane>(() => {
    const readings = new Map<string, ReadonlyArray<ReadonlyArray<number | null>>>();
    for (const view of dataPanes) {
      readings.set(
        String(view.spec.id),
        view.spec.series.map((spec) => carryReadings(read(view.spec, spec), spec)),
      );
    }
    return readings;
  }, [dataPanes, read]);

  const fittedRef = useRef<Framed | null>(null);

  useEffect(() => {
    if (handles === null) return;

    // The tail is appended HERE and nowhere else: this is the only place domain bars become the base
    // library's payload, so overlays, providers and the legend keep reading real bars with no guard
    // of their own. See docs/explanation/domain.md#the-future-room-is-whitespace-not-candles
    handles.candle?.setData([
      ...bars.map((bar) => ({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
      ...futureTail(bars, futureBarCount(futureBars, bars.length)),
    ]);

    for (const view of dataPanes) {
      const paneKey = String(view.spec.id);
      const readings = readingsByPane.get(paneKey) ?? [];
      view.spec.series.forEach((spec, position) => {
        const key = seriesKey(paneKey, String(spec.id));
        const series = handles.series.get(key);
        if (series === undefined) return;
        // Mirroring and sign/direction colouring are DOMAIN vocabulary, applied in domain/readings.
        const points = plottedPoints(readings[position] ?? [], bars, spec, {
          up: upColor,
          down: downColor,
        });
        series.setData(points);
        // The twin carries the SAME readings, so flipping style never waits for a data pass.
        handles.series.get(twinKey(key))?.setData(points);
      });
    }

    // AFTER every `setData`, in the same body. With no bars there is nothing to frame.
    // The bar count is remembered ALONGSIDE the dataset because a load that has since doubled was a
    // partial one, and the view framed for it is wrong.
    // See docs/explanation/react-surface.md#a-partial-load-is-not-the-dataset
    const framed = fittedRef.current;
    if (
      !shouldReframe({
        datasetChanged: framed?.datasetId !== datasetId,
        barCount: bars.length,
        framedAt: framed !== null && framed.datasetId === datasetId ? framed.barCount : null,
        autoFit: autoFit === true,
      })
    )
      return;
    fittedRef.current = { datasetId, barCount: bars.length };
    for (const scale of handles.priceScales) scale.applyOptions({ autoScale: true });
    // NOT `fitContent`: measured in the base library's source, it frames `_points.length - 1`, and
    // whitespace points are in `_points` — so framing by content would put the whole proportional
    // tail on screen and squeeze the price. Framing by INDEX frames the candles and a short margin.
    const scale = handles.chart.timeScale();
    // `fitContent`, and NOTHING after it. Framing by logical index was tried here and measured on
    // the deploy with the candles squeezed into the first column on EVERY interval change, while
    // `fitContent` filled the width on the same changes. The room is kept short enough that framing
    // all of it is the right picture.
    // See docs/explanation/react-surface.md#framing-is-fitcontent-and-nothing-after-it
    scale.fitContent();
  }, [bars, dataPanes, handles, readingsByPane, upColor, downColor, datasetId, autoFit, futureBars]);

  /** THE SHAPE PAIR — which of the two members is on screen. Applied to the PAIR only.
   * See docs/explanation/react-surface.md#the-shape-pair-applies-to-the-pair-only */
  useEffect(() => {
    if (handles === null) return;
    for (const view of panes) {
      const paneKey = String(view.spec.id);
      for (const spec of view.spec.series) {
        const key = seriesKey(paneKey, String(spec.id));
        const twin = handles.series.get(twinKey(key));
        if (twin === undefined) continue;
        const flipped = seriesStyles?.[key] === twinShapeOf(spec);
        handles.series.get(key)?.applyOptions({ visible: !flipped });
        twin.applyOptions({ visible: flipped });
      }
    }
  }, [handles, panes, seriesStyles]);

  /** Pattern marks ride the candle series. Absent prop = feature unused, never a clear. */
  useEffect(() => {
    if (priceMarkers === undefined) return;
    handles?.candle?.setMarkers?.(priceMarkers);
  }, [handles, priceMarkers]);

  useEffect(() => {
    if (seriesMarkers === undefined) return;
    for (const [key, marks] of seriesMarkers) handles?.series.get(key)?.setMarkers?.(marks);
  }, [handles, seriesMarkers]);

  return readingsByPane;
}
