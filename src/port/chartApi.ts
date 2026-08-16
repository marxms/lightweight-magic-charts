/**
 * THE CHART PORT — the base library's surface DECLARED structurally, never imported, narrowed to the MINIMUM we call and pinned by `test/renderBoundary.spec.ts`. See docs/explanation/port.md#the-chart-port-declared-not-imported
 */

/** One pane of the base library's native pane stack. */
export interface PaneHandle {
  paneIndex(): number;
  getStretchFactor(): number;
  setStretchFactor(stretchFactor: number): void;
  setPreserveEmptyPane(preserve: boolean): void;
  moveTo(paneIndex: number): void;
  /** `null` until this pane's index has a widget: the GUI catch-up read. See docs/explanation/port.md#gethtmlelement-is-the-gui-catch-up-read */
  getHTMLElement(): HTMLElement | null;
}

/** The chart, seen as a pane container: ONE chart, N panes, and no `create`. See docs/explanation/port.md#one-chart-n-panes */
export interface PaneChartHandle {
  panes(): readonly PaneHandle[];
  addPane(preserveEmptyPane?: boolean): PaneHandle;
}

/** A series' own price converter — the anchor every overlay reads from. See docs/explanation/port.md#overlays-anchor-on-the-candle-series-price-scale */
export interface PriceConverter {
  priceToCoordinate(price: number): number | null;
}

/** The base library's horizontal-scale item, as a structural union. See docs/explanation/port.md#horzscaleitem-is-a-union-not-a-number */
export type HorzScaleItem =
  | number
  | string
  | { readonly year: number; readonly month: number; readonly day: number };

export interface TimeScaleHandle {
  timeToCoordinate(time: HorzScaleItem): number | null;
  options(): { readonly barSpacing: number };
  width(): number;
}

export interface ScaleChartHandle {
  timeScale(): TimeScaleHandle;
}

/** The scope handed to a renderer for the duration of one frame. Bitmap space: multiply by ratios. */
export interface BitmapScope {
  readonly context: CanvasRenderingContext2D;
  readonly mediaSize: { readonly width: number; readonly height: number };
  readonly horizontalPixelRatio: number;
  readonly verticalPixelRatio: number;
}

export interface BitmapTarget {
  useBitmapCoordinateSpace(fn: (scope: BitmapScope) => void): void;
}

/** What `series.attachPrimitive` / `pane.attachPrimitive` need from us, in both directions. */
export interface PrimitiveHost<TPrimitive> {
  attachPrimitive(primitive: TPrimitive): void;
  detachPrimitive(primitive: TPrimitive): void;
}

/* The composed surface's half of the port. See docs/explanation/port.md#the-composed-surface-still-does-not-import-the-base-library */

/** How a series draws. A TOKEN, so the port stays a type and the consumer resolves it to a value. */
export type SeriesShape = 'candlestick' | 'line' | 'histogram' | 'area';

export interface PriceScaleHandle {
  applyOptions(options: {
    readonly scaleMargins?: { readonly top: number; readonly bottom: number };
    /** The scale's VERTICAL autoscale — without it "refit" reaches half the chart. See docs/explanation/port.md#autoscale-is-the-vertical-half-of-refit */
    readonly autoScale?: boolean;
  }): void;
}

export interface PriceLineOptions {
  readonly price: number;
  readonly color?: string;
  /** NOT `number`: the base library's `LineWidth` is `1 | 2 | 3 | 4`. See docs/explanation/port.md#linewidth-is-an-ordinal-union */
  readonly lineWidth?: 1 | 2 | 3 | 4;
  readonly lineStyle?: number;
  readonly axisLabelVisible?: boolean;
  readonly title?: string;
  readonly lineVisible?: boolean;
}

export interface PriceLineHandle {
  applyOptions(options: Partial<PriceLineOptions>): void;
}

/** One drawn series, hosting primitives as `unknown`. See docs/explanation/port.md#serieshandle-hosts-primitives-as-unknown */
export interface SeriesHandle extends PriceConverter, PrimitiveHost<unknown> {
  coordinateToPrice(coordinate: number): number | null;
  setData(data: readonly unknown[]): void;
  applyOptions(options: Record<string, unknown>): void;
  priceScale(): PriceScaleHandle;
  createPriceLine(options: PriceLineOptions): PriceLineHandle;
  removePriceLine(line: PriceLineHandle): void;
  /** OPTIONAL: markers ship as a standalone plugin, so an adapter has to ADD it. See docs/explanation/port.md#setmarkers-is-optional-and-called-through */
  setMarkers?(markers: readonly SeriesMarkerPoint[]): void;
}

/** What the crosshair reports; `time` is `unknown` as only the host knows its scale. See docs/explanation/port.md#crosshair-and-click-carry-point-and-paneindex */
export interface CrosshairParam {
  readonly point?: { readonly x: number; readonly y: number };
  readonly paneIndex?: number;
  readonly time?: unknown;
}

/** What a chart CLICK reports; `point` is LOCAL TO THE PANE. See docs/explanation/port.md#crosshair-and-click-carry-point-and-paneindex */
export interface ChartClickParam {
  readonly point?: { readonly x: number; readonly y: number };
  readonly paneIndex?: number;
  readonly time?: unknown;
}

export interface SeriesMarkerPoint {
  readonly time: number;
  readonly position: 'aboveBar' | 'belowBar' | 'inBar';
  readonly shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  readonly color: string;
  readonly text?: string;
}

/** The chart members the workspace calls that the base library already provides UNCHANGED. */
export interface ChartLifecycle extends PaneChartHandle {
  applyOptions(options: Record<string, unknown>): void;
  subscribeCrosshairMove(handler: (param: CrosshairParam) => void): void;
  unsubscribeCrosshairMove(handler: (param: CrosshairParam) => void): void;
  remove(): void;
}

export interface WorkspaceChartHandle extends ChartLifecycle {
  addSeries(
    shape: SeriesShape,
    options: Record<string, unknown>,
    paneIndex?: number,
  ): SeriesHandle;
  timeScale(): { fitContent(): void; coordinateToTime?(coordinate: number): unknown };
  subscribeClick?(handler: (param: ChartClickParam) => void): void;
  unsubscribeClick?(handler: (param: ChartClickParam) => void): void;
}

/** How the consumer makes a chart; `options` passes through VERBATIM. See docs/explanation/port.md#chartengine-owns-the-options-object */
export type ChartEngine = (
  container: HTMLElement,
  options: Record<string, unknown>,
) => WorkspaceChartHandle;
