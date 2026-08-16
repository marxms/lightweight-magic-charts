/**
 * CREATE THE CHART, THE PANES, THE SERIES, THE TWINS AND THE SCALES — once, at mount. The only part
 * of the surface that talks to the base library, and it talks through the port.
 * See docs/explanation/render.md#creation-once-at-mount and docs/explanation/render.md#every-pane-is-created
 */

import { PriceAlertLines, type PriceAlertStyle } from '../alerts/priceAlerts';
import { formatterFor, minMoveOf } from '../domain/format';
import { encodeDirection } from '../domain/types';
import type { PaneSpec, PriceScaleConvention, SeriesSpec } from '../domain/types';
import type { LayoutBudget } from '../layout/computeLayout';
import type {
  ChartEngine,
  PriceScaleHandle,
  SeriesHandle,
  SeriesShape,
  WorkspaceChartHandle,
} from '../port/chartApi';
import { PaneStack } from './paneStack';

/** Indicator panes get the larger top margin. See docs/explanation/render.md#own-format-own-margins */
const INDICATOR_SCALE_MARGINS = { top: 0.24, bottom: 0.12 };
const PRICE_SCALE_MARGINS = { top: 0.12, bottom: 0.12 };
/**
 * Where a price-pane series sits: the bottom sixth, on a scale of its OWN.
 * See docs/explanation/render.md#where-a-companion-sits
 */
const PRICE_COMPANION_MARGINS = { top: 0.84, bottom: 0 };

/** A series' key in the handle map. One function, so host and surface cannot disagree. */
export const seriesKey = (paneKey: string, id: string): string => `${paneKey}:${id}`;

/** Where a series' hidden twin lives. `::` cannot appear in a pane:series pair. */
export const twinKey = (key: string): string => `${key}::alt`;

/** The other member of the line/histogram pair, or `null` for a shape that has no twin. */
export const twinShapeOf = (spec: SeriesSpec): SeriesShape | null =>
  spec.shape === 'line' ? 'histogram' : spec.shape === 'histogram' ? 'line' : null;

/** What the factory reads from a theme. `WorkspaceTheme` satisfies it structurally, no adapter. */
export interface ChartPalette {
  readonly background: string;
  readonly text: string;
  readonly gridLine: string;
}

/** The minimum the factory needs to know of a pane. Height and recency belong to the budget. */
export interface FactoryPaneView {
  readonly spec: PaneSpec;
}

export interface SeriesFactoryInput {
  /** The element the chart is created in. The factory neither looks for it nor creates it. */
  readonly host: HTMLElement;
  readonly engine: ChartEngine;
  /** Omitted = no price drawn, and the first listed pane takes over pane 0. */
  readonly pricePane?: PaneSpec;
  readonly panes: readonly FactoryPaneView[];
  readonly convention: PriceScaleConvention;
  readonly budget: LayoutBudget;
  readonly theme: ChartPalette;
  readonly priceAlertStyle?: PriceAlertStyle;
}

/**
 * Everything the creation produces, in a single object.
 * See docs/explanation/render.md#seven-handles-born-together
 */
export interface ChartCreation {
  readonly chart: WorkspaceChartHandle;
  readonly stack: PaneStack;
  /** The candles. `null` when the host withholds the price pane. */
  readonly candle: SeriesHandle | null;
  /** The series that carries pane 0 — the candles, or the first of the first listed pane. */
  readonly anchor: SeriesHandle | null;
  readonly series: Map<string, SeriesHandle>;
  /** Every price scale this creation configured, so all of them can be refit at once. */
  readonly priceScales: PriceScaleHandle[];
  /** The user's levels. `null` without candles: an alert is priced on their scale. */
  readonly alerts: PriceAlertLines | null;
}

export function createChartSurface(input: SeriesFactoryInput): ChartCreation {
  const { host, engine, pricePane: priceSpec, panes: views, theme: paneTheme } = input;

  const chart = engine(host, {
    autoSize: false,
    layout: {
      background: { color: paneTheme.background },
      textColor: paneTheme.text,
      // Required by the base library's Apache-2.0 licence. See docs/explanation/render.md#the-attribution-logo
      attributionLogo: true,
    },
    grid: { vertLines: { visible: false }, horzLines: { color: paneTheme.gridLine } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true },
  });

  const stack = new PaneStack(chart, input.budget);
  const series = new Map<string, SeriesHandle>();
  const priceScales: PriceScaleHandle[] = [];
  let candle: SeriesHandle | null = null;
  let anchor: SeriesHandle | null = null;
  let alerts: PriceAlertLines | null = null;

  // Pane 0 is ADOPTED, never created. See docs/explanation/render.md#the-adopted-pane-zero
  const anchorId = priceSpec === undefined ? views[0]?.spec.id ?? null : null;
  const up = encodeDirection(input.convention, 1).color ?? paneTheme.text;
  const down = encodeDirection(input.convention, -1).color ?? paneTheme.text;

  if (priceSpec !== undefined) {
    const candles = chart.addSeries('candlestick', {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: {
        type: 'custom',
        formatter: formatterFor(priceSpec.format),
        minMove: minMoveOf(priceSpec.format),
      },
    });
    const candleScale = candles.priceScale();
    candleScale.applyOptions({ scaleMargins: PRICE_SCALE_MARGINS });
    priceScales.push(candleScale);
    candle = candles;
    anchor = candles;
    alerts =
      input.priceAlertStyle === undefined
        ? new PriceAlertLines(candles)
        : new PriceAlertLines(candles, input.priceAlertStyle);

    // The price pane's OWN series. See docs/explanation/render.md#where-a-companion-sits
    for (const spec of priceSpec.series) {
      const own = spec.ownScale === true;
      const companion = chart.addSeries(
        spec.shape,
        {
          color: spec.color,
          lineWidth: spec.lineWidth ?? 1,
          priceLineVisible: false,
          lastValueVisible: false,
          ...(own ? { priceScaleId: String(spec.id) } : {}),
          priceFormat: {
            type: 'custom' as const,
            formatter: formatterFor(spec.format ?? priceSpec.format),
            minMove: minMoveOf(spec.format ?? priceSpec.format),
          },
        },
        0,
      );
      if (own) {
        const companionScale = companion.priceScale();
        companionScale.applyOptions({ scaleMargins: PRICE_COMPANION_MARGINS });
        priceScales.push(companionScale);
      }
      series.set(seriesKey(String(priceSpec.id), String(spec.id)), companion);
    }
  }

  for (const view of views) {
    // The anchor does NOT go through `ensure`. See docs/explanation/render.md#the-adopted-pane-zero
    const isAnchor = anchorId !== null && view.spec.id === anchorId;
    const paneIndex = isAnchor ? 0 : stack.ensure(view.spec.id).paneIndex();
    // THE PANE'S UNIT, on the pane's axis. See docs/explanation/render.md#own-format-own-margins
    const priceFormat = {
      type: 'custom' as const,
      formatter: formatterFor(view.spec.format),
      minMove: minMoveOf(view.spec.format),
    };
    let first: SeriesHandle | null = null;

    for (const spec of view.spec.series) {
      const created = chart.addSeries(
        spec.shape,
        {
          color: spec.color,
          lineWidth: spec.lineWidth ?? 1,
          priceLineVisible: false,
          lastValueVisible: false,
          priceFormat,
        },
        paneIndex,
      );
      const key = seriesKey(String(view.spec.id), String(spec.id));
      series.set(key, created);
      first = first ?? created;

      // The hidden twin, in the other shape. See docs/explanation/render.md#the-hidden-twin
      const twinShape = twinShapeOf(spec);
      if (twinShape !== null) {
        const twin = chart.addSeries(
          twinShape,
          {
            color: spec.color,
            lineWidth: spec.lineWidth ?? 1,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat,
            visible: false,
          },
          paneIndex,
        );
        series.set(twinKey(key), twin);
      }
    }

    if (first === null) continue;
    if (isAnchor) anchor = first;
    const paneScale = first.priceScale();
    paneScale.applyOptions({
      scaleMargins: isAnchor && priceSpec !== undefined ? PRICE_SCALE_MARGINS : INDICATOR_SCALE_MARGINS,
    });
    priceScales.push(paneScale);
    // The reference line is NOT created here. See docs/explanation/render.md#the-reference-line
  }

  return { chart, stack, candle, anchor, series, priceScales, alerts };
}
