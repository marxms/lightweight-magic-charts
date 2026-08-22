/**
 * The workspace's drawing surface: ONE chart, the native v5 pane stack, our layout policy on top.
 * See docs/explanation/react-surface.md#the-composed-surface
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { PriceAlert, PriceAlertStyle } from '../../alerts/priceAlerts';
import type { Bar, PaneSpec, PriceScaleConvention } from '../../domain/types';
import { encodeDirection } from '../../domain/types';
import type { DrawingBinding } from '../../drawing/drawingLayer';
import type { MagnetMode } from '../../drawing/magnet';
import type { Overlay } from '../../extension/plugins';
import { PRICE_PANE_ID, type LayoutBudget } from '../../layout/computeLayout';
import { paneBoxes } from '../../layout/paneBoxes';
import type { ChartEngine, SeriesMarkerPoint, SeriesShape } from '../../port/chartApi';
import { attachOverlay } from '../../render/overlayBridge';
import type { StackApplication } from '../../render/paneStack';
import { seriesKey } from '../../render/seriesFactory';
import type { ChartHandles } from './chartHandles';
import { SurfaceLegend } from './SurfaceLegend';
import { useChartMount } from './useChartMount';
import { useChartTeardown } from './useChartTeardown';
import { useLayoutApply } from './useLayoutApply';
import { useDrawingSeam } from './useDrawingSeam';
import { usePriceAlertLayer } from './usePriceAlertLayer';
import { useReferenceLines } from './useReferenceLines';
import { useSeriesData, type SeriesReader } from './useSeriesData';
import { useSurfaceGeometry } from './useSurfaceGeometry';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from '../theme';

/** One pane, as the host currently wants it drawn. */
export interface PaneView {
  readonly spec: PaneSpec;
  readonly visible: boolean;
  readonly heightPx: number;
  /** Higher is more recent. Decides which pane the price floor evicts first. */
  readonly lastUsedAt: number;
}

// `SeriesReader` IS DECLARED WHERE IT IS CONSUMED, and re-exported here: one signature, one owner.
// See docs/explanation/react-surface.md#seriesreader-re-export
export type { SeriesReader } from './useSeriesData';

/**
 * WHAT THE CHART DRAWS. One group per SUBSYSTEM: what fails together travels together.
 * See docs/explanation/react-surface.md#what-the-chart-draws
 */
export interface SurfaceData {
  readonly bars: readonly Bar[];
  readonly panes: readonly PaneView[];
  readonly read: SeriesReader;
  /** The price pane's own spec. OMIT IT to draw no price at all.
   * See docs/explanation/react-surface.md#omitting-the-price-pane */
  readonly pricePane?: PaneSpec;
  readonly priceCaption?: string;
  /** series -> chosen shape, keyed by `seriesStyleKey(paneId, seriesId)`.
   * See docs/explanation/react-surface.md#the-shape-pair-at-mount */
  readonly seriesStyles?: Readonly<Record<string, SeriesShape>>;
  readonly priceMarkers?: readonly SeriesMarkerPoint[];
  readonly seriesMarkers?: ReadonlyMap<string, readonly SeriesMarkerPoint[]>;
  /** The bar set's IDENTITY: what tells "another market" from "one more bar".
   * See docs/explanation/react-surface.md#dataset-identity */
  readonly datasetId?: string;
  readonly autoFit?: boolean;
  /** Columns of room right of the last bar, so a drawing can project. `0` turns it off; default 12.
   * See docs/explanation/domain.md#the-future-room-is-whitespace-not-candles */
  readonly futureBars?: number;
}

/** The space budget, and the report of what was done with it. `heightPx` is never the viewport. */
export interface SurfaceLayout {
  readonly heightPx: number;
  readonly budget?: LayoutBudget;
  readonly onLayout?: (application: StackApplication) => void;
}

export interface SurfaceLabels {
  readonly label: string;
  readonly describedBy: string;
}

/** What is an appearance choice, and nothing more: none of these fields changes what is drawn. */
export interface SurfaceAppearance {
  readonly theme?: WorkspaceTheme;
  /** Horizontal grid lines. Defaults to visible; the lib stays ignorant of WHY they are turned off.
   * See docs/explanation/react-surface.md#grid-lines */
  readonly gridLinesVisible?: boolean;
  readonly testIdPrefix?: string;
}

/**
 * The user's own price levels, DECLARATIVELY — the levels pass, the handle never does.
 * See docs/explanation/react-surface.md#declarative-price-levels
 */
export interface SurfaceAlerts {
  readonly levels?: readonly number[];
  readonly onChange?: (levels: readonly number[]) => void;
  readonly onCrossed?: (crossed: readonly PriceAlert[]) => void;
  readonly style?: PriceAlertStyle;
}

/**
 * The drawing seam: the surface ATTACHES the layer, the consumer IMPLEMENTS it. Requires price.
 * See docs/explanation/react-surface.md#the-drawing-seam-prop-group
 */
export interface SurfaceDrawing {
  readonly binding?: DrawingBinding;
  readonly activeTool?: string | null;
  /** Absent is `off`: the library never defaults to the behaviour the magnet exists to escape.
   * See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement */
  readonly magnet?: MagnetMode;
  /** A SCREEN distance. Absent is eight pixels. */
  readonly snapThresholdPx?: number;
  readonly onCountChange?: (count: number) => void;
  readonly onToolFinished?: () => void;
}

export interface ChartSurfaceProps {
  readonly engine: ChartEngine;
  readonly convention: PriceScaleConvention;
  readonly data: SurfaceData;
  readonly layout: SurfaceLayout;
  readonly a11y: SurfaceLabels;
  readonly appearance?: SurfaceAppearance;
  readonly alerts?: SurfaceAlerts;
  readonly drawing?: SurfaceDrawing;
  readonly overlays?: readonly Overlay[];
}

const DEFAULT_BUDGET: LayoutBudget = { priceFloorPx: 180, defaultPaneHeightPx: 90 };
/** Eight pixels: near enough to be deliberate, far enough that a steady hand is not required. */
const DEFAULT_SNAP_THRESHOLD_PX = 8;
export function seriesStyleKey(paneKey: string, id: string): string {
  return seriesKey(paneKey, id);
}

export function ChartSurface({
  engine,
  convention,
  data,
  layout,
  a11y,
  appearance,
  alerts,
  drawing,
  overlays,
}: ChartSurfaceProps): ReactElement {
  // DESTRUCTURED AT THE DOOR: the FIELDS go into every dependency list, never the groups.
  // See docs/explanation/react-surface.md#destructured-at-the-door
  const { bars, panes, read, pricePane, priceCaption, seriesStyles, priceMarkers, seriesMarkers } = data;
  const { datasetId, autoFit, futureBars } = data;
  const { heightPx, budget = DEFAULT_BUDGET, onLayout } = layout;
  const { label, describedBy } = a11y;
  const { theme = DEFAULT_WORKSPACE_THEME, gridLinesVisible = true } = appearance ?? {};
  const { testIdPrefix = 'chart-workspace' } = appearance ?? {};
  const {
    levels: priceAlerts,
    onChange: onPriceAlertsChange,
    onCrossed: onPriceAlertCrossed,
    style: priceAlertStyle,
  } = alerts ?? {};
  const {
    binding: drawings,
    activeTool: activeDrawingTool,
    magnet = 'off',
    snapThresholdPx = DEFAULT_SNAP_THRESHOLD_PX,
    onCountChange: onDrawingCountChange,
    onToolFinished: onDrawingToolFinished,
  } = drawing ?? {};

  const hostRef = useRef<HTMLDivElement | null>(null);
  /** THE SEVEN HANDLES, AS ONE PUBLISHED VALUE — a declared dependency, not a position.
   * See docs/explanation/react-surface.md#the-seven-handles */
  const [handles, setHandles] = useState<ChartHandles | null>(null);
  const live = useRef<ChartHandles | null>(null);
  const publishHandles = useCallback((next: ChartHandles | null): void => {
    live.current = next;
    setHandles(next);
  }, []);

  // The pane list is fixed at mount, and the mount effect reads it through a ref.
  // See docs/explanation/react-surface.md#the-pane-list-is-fixed-at-mount
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const showPrice = pricePane !== undefined;
  const mountRef = useRef({ engine, pricePane, convention, budget, theme, priceAlertStyle });
  mountRef.current = { engine, pricePane, convention, budget, theme, priceAlertStyle };
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;

  const upColor = encodeDirection(convention, 1).color ?? theme.text;
  const downColor = encodeDirection(convention, -1).color ?? theme.text;

  /** Which pane's content occupies pane 0 — undoing the rename `PaneStack` applies to it.
   * See docs/explanation/react-surface.md#which-pane-occupies-pane-0 */
  const anchorDisplayId = showPrice
    ? String(pricePane.id)
    : String(panes[0]?.spec.id ?? PRICE_PANE_ID);
  const anchorDisplayIdRef = useRef(anchorDisplayId);
  anchorDisplayIdRef.current = anchorDisplayId;

  const [application, setApplication] = useState<StackApplication | null>(null);

  const { boxes, measure, hovered, publishHovered } = useSurfaceGeometry(
    handles,
    live,
    hostRef,
    anchorDisplayId,
  );

  useChartMount(hostRef, mountRef, panesRef, publishHandles, publishHovered);

  const readingsByPane = useSeriesData(handles, {
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
  });

  useReferenceLines(handles, panes, theme);

  useEffect(() => {
    const anchor = handles?.anchor ?? null;
    if (anchor === null || overlays === undefined || overlays.length === 0) return;
    // `''` is not a series key — `seriesKey` always carries a colon — so an overlay that named
    // nothing falls through to the pane-zero anchor, which is what every overlay had before.
    const detachers = overlays.map((overlay) =>
      attachOverlay(handles?.series.get(overlay.anchor ?? '') ?? anchor, overlay),
    );
    return () => {
      for (const detach of detachers) detach();
    };
  }, [handles, overlays]);

  useDrawingSeam(
    handles,
    hostRef,
    drawings,
    activeDrawingTool,
    { onCountChange: onDrawingCountChange, onToolFinished: onDrawingToolFinished },
    { magnet, thresholdPx: snapThresholdPx, bars },
  );

  usePriceAlertLayer(handles, live, hostRef, bars, priceAlerts, onPriceAlertsChange, onPriceAlertCrossed);

  useEffect(() => {
    handles?.chart.applyOptions({ grid: { horzLines: { visible: gridLinesVisible } } });
  }, [gridLinesVisible, handles]);

  // WIDTH IS OBSERVED; HEIGHT IS DECLARED, and `autoSize` is off because it governs both.
  // See docs/explanation/react-surface.md#width-observed-height-declared
  useEffect(() => {
    const host = hostRef.current;
    if (host === null || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    let lastWidth = 0;
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (width <= 0 || width === lastWidth) return;
      lastWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => live.current?.chart.applyOptions({ width }));
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useLayoutApply(handles, panes, heightPx, showPrice, measure, setApplication, onLayoutRef);

  useChartTeardown(live, publishHandles);

  return (
    <div
      data-testid={`${testIdPrefix}-surface`}
      // `minWidth` for the same reason as `minHeight`: without it the canvas already drawn is this
      // box's minimum, and no sibling column can ever be given width.
      // See docs/explanation/react-surface.md#the-surface-may-shrink-in-both-axes
      style={{ position: 'relative', width: '100%', height: heightPx, minHeight: 0, minWidth: 0 }}
    >
      <div
        ref={hostRef}
        // On the CANVAS host, never the box around it: `role="img"` prunes its subtree.
        // See docs/explanation/react-surface.md#the-canvas-and-assistive-technology
        role="img"
        aria-describedby={describedBy}
        aria-label={label}
        style={{ width: '100%', height: '100%', minHeight: 0 }}
      />
      <SurfaceLegend
        boxes={boxes.size > 0 ? boxes : paneBoxes(application, anchorDisplayId)}
        pricePane={pricePane}
        priceCaption={priceCaption}
        panes={panes}
        bars={bars}
        readings={readingsByPane}
        upColor={upColor}
        downColor={downColor}
        theme={theme}
        testIdPrefix={testIdPrefix}
        hovered={hovered}
      />
    </div>
  );
}

export default ChartSurface;
