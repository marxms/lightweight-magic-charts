/**
 * Public surface. NOTE WHAT IS ABSENT: there is no `register(name, factory)`, and there will not be
 * one (D1) — extension is by INSTANCE. See docs/explanation/entry.md#no-registry
 */

export type {
  Bar,
  Direction,
  DirectionChannel,
  DirectionEncoding,
  DirectionEncodingViolation,
  DirectionGlyph,
  PaneId,
  PaneSpec,
  PaneState,
  Point,
  PortResult,
  PriceScaleConvention,
  Scope,
  SeriesId,
  SeriesSpec,
  UtcSeconds,
  ValueFormat,
} from './domain/types';
export { formatterFor, minMoveOf } from './domain/format';
export {
  auditDirectionEncoding,
  directionConvention,
  directionOf,
  encodeDirection,
  invertConvention,
  isGap,
  nonChromaticChannels,
  paneId,
  sameScope,
  scopeKey,
  seriesId,
  utcSeconds,
} from './domain/types';

export type {
  ChannelDescriptor,
  ChannelShape,
  Frame,
  LinkStatus,
  ResetCause,
} from './port/frames';
export type { LiveEnvelope, LiveTip } from './port/frames';
export { EMPTY_LIVE_TIP, applyLiveEnvelope, resolveChannelShape } from './port/frames';

export type {
  FrameSink,
  HistoryPort,
  HistoryRequest,
  HistoryResult,
  LivePort,
  MarketDataPort,
  Unsubscribe,
} from './port/ports';
export { isHistoryPort, isLivePort } from './port/ports';

export type {
  TabsAction,
  TabsState,
  WorkspaceExporter,
  WorkspaceStore,
  WorkspaceTab,
} from './tabs/workspaceTabs';
export type {
  WorkspaceLayoutMode,
  WorkspaceSetup,
  WorkspaceSetupPolicy,
} from './tabs/setup';
export {
  coerceWorkspaceSetup,
  defaultWorkspaceSetup,
  reconcileGridCells,
  seedWorkspaceTabs,
} from './tabs/setup';
export type { TabsCodecOptions } from './tabs/codec';
export { coerceIndicatorList, parseTabsLayout, serializeTabsLayout } from './tabs/codec';
export {
  MAX_TAB_NAME,
  MAX_WORKSPACE_TABS,
  exportTabsPayload,
  exportTabsToFile,
  parseTabsPayload,
  reduceTabs,
  sanitizeTabs,
} from './tabs/workspaceTabs';

export type { ScopePhase, ScopeState, SeamState, SeedApplication, SeedVerdict } from './port/scopeMachine';
export {
  applyFrame,
  createScopeState,
  discardScope,
  needsRefetch,
  restartScope,
  seedHistory,
  MAX_BUFFERED_FRAMES,
} from './port/scopeMachine';

// `SeedTransaction` was declared here and never implemented, so it is gone; the real mechanism is
// `openScope`. See docs/explanation/entry.md#the-type-that-had-no-function
export type { SeedOutcome, Session, SessionOptions } from './port/seedTransaction';
export { openScope } from './port/seedTransaction';

export type { LayoutBudget, LayoutOutcome, PaneRequest } from './layout/computeLayout';
export { PRICE_PANE_ID, computeLayout, renderHeights, sinkCollapsed } from './layout/computeLayout';

// PUBLISHED IS WHAT HAS A CONSUMER, and nothing more — the other `pane/budget` symbols stay in the
// MODULE. See docs/explanation/entry.md#published-is-what-has-a-consumer
export type { CataloguedPane, PaneCatalogueEntry, PaneConfig, PaneLayout } from './pane/budget';
export { DEFAULT_INDICATOR_FLOOR_PX, reconcilePaneLayout, toCatalogueEntry } from './pane/budget';

export { applyTipToLastPoint } from './indicator/liveTip';

export type {
  DerivativePoint,
  DerivativeSeries,
  DerivativeSnapshot,
  ReadingSeries,
  ReadingSnapshot,
  RowBar,
  SeriesReading,
  WorkspaceRow,
} from './indicator/rows';
export { buildWorkspaceRows } from './indicator/rows';

export type { ReportedPane, ReportedSeries, WorkspaceReport } from './indicator/coverage';
export { buildWorkspaceReport, formatWorkspaceReport } from './indicator/coverage';

export type { BoundSeries, RelabellablePane } from './catalogue/relabel';
export { relabelled } from './catalogue/relabel';

export type { ResolvedSourceView, SourceResolution } from './indicator/resolution';
export { resolveSources } from './indicator/resolution';

// The TYPES only. See docs/explanation/entry.md#published-is-what-has-a-consumer
export type { IndicatorAvailability, Reading } from './indicator/availability';

export type {
  PlacementRequest,
  PlottableSource,
  PlottedSeries,
  ResolutionPolicy,
  ResolutionPolicyOptions,
  SourceLookup,
} from './catalogue/sources';
// The two calibrated numbers arrive through `resolutionPolicy` alone.
// See docs/explanation/entry.md#published-is-what-has-a-consumer
export { resolutionPolicy } from './catalogue/sources';

export type {
  DetachOverlay,
  Overlay,
  OverlayHost,
  OverlayHostApi,
  Projection,
  RenderTarget,
  SeriesProvider,
} from './extension/plugins';

// CONFORMANCE IS NOT HERE, and the absence is the point (LMC-27, LMC-34): it leaves by the
// `./conformance` subpath. See docs/explanation/entry.md#conformance-leaves-by-a-subpath
//
//     import { CONFORMANCE_CASES } from 'lightweight-magic-charts/conformance';

// The chart port. See docs/explanation/entry.md#the-chart-port-stays-react-free
export type {
  BitmapScope,
  BitmapTarget,
  ChartClickParam,
  ChartEngine,
  ChartLifecycle,
  CrosshairParam,
  HorzScaleItem,
  PaneChartHandle,
  PaneHandle,
  PriceConverter,
  PriceLineHandle,
  PriceLineOptions,
  PriceScaleHandle,
  PrimitiveHost,
  ScaleChartHandle,
  SeriesHandle,
  SeriesMarkerPoint,
  SeriesShape,
  TimeScaleHandle,
  WorkspaceChartHandle,
} from './port/chartApi';

// The drawing seam: the interface lives here, the implementation is the consumer's dependency
// decision. See docs/explanation/entry.md#the-drawing-seam
export type {
  DrawingBinding,
  DrawingLayer,
  DrawingLayerEvents,
  DrawingSnapshot,
  DrawingSurfaceHost,
} from './drawing/drawingLayer';

// The one module-scope cache this package keeps, with its ceiling and its discard policy declared.
export type { DrawingMemory } from './drawing/drawingMemory';
export {
  MAX_DRAWING_MEMORY,
  clearDrawingMemory,
  drawingMemoryFor,
  rememberedMarkets,
} from './drawing/drawingMemory';

export type { StackApplication, StackPane } from './layout/application';
export { COLLAPSED_STRETCH, COLLAPSED_STRETCH_CEILING, PaneStack } from './render/paneStack';

export type { BaseZOrder, OverlayAttachment } from './render/overlayBridge';
export { OverlayPrimitive, attachOverlay } from './render/overlayBridge';

export type {
  DensityCell,
  DensityColumn,
  DensityFrameStats,
  DensityRamp,
  DensitySample,
  DensitySlice,
  DensityTuning,
} from './overlays/densityField';
export {
  DEFAULT_DENSITY_RAMP,
  DEFAULT_DENSITY_TUNING,
  DensityFieldOverlay,
  toDensityColumns,
} from './overlays/densityField';

export type { TuningBound } from './overlays/densityTuning';
export { DENSITY_TUNING_BOUNDS, clampDensityTuning } from './overlays/densityTuning';

export type { AlertObservation, AlertSide, PriceAlert, PriceAlertStyle } from './alerts/priceAlerts';
export {
  ALERT_GRAB_PX,
  DEFAULT_PRICE_ALERT_STYLE,
  PriceAlertLines,
  armAlert,
  observePrice,
  sideOf,
} from './alerts/priceAlerts';

export type {
  Profile,
  ProfileBucket,
  TroughFrameStats,
  TroughGeometry,
  TroughStyle,
} from './overlays/troughProfile';
export {
  DEFAULT_TROUGH_STYLE,
  TroughProfileOverlay,
  buildProfile,
  troughStyleFor,
} from './overlays/troughProfile';

// THE COMPOSED INTERFACE. Everything above is usable without a DOM; everything below renders.
// See docs/explanation/entry.md#the-composed-interface
export type { WorkspaceTheme } from './react/theme';
export { DEFAULT_WORKSPACE_THEME } from './react/theme';

// Pointer intent is published because the HOST also opens boxes under the cursor.
// See docs/explanation/entry.md#pointer-intent-is-published
export type { HoverDismissOptions, HoverIntent } from './react/hoverIntent';
export {
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
  useHoverDismiss,
  useHoverIntent,
} from './react/hoverIntent';

// The host's own content region, embedded in the library's chrome. `Body` is a component TYPE.
// See docs/explanation/entry.md#body-is-a-component-type
export type { WorkspaceSection } from './react/chrome/ChromeContext';
export { DEFAULT_WORKSPACE_CHROME_LABELS, resolveWorkspaceLabels } from './react/chrome/labels';
export type {
  GridControlsLabels,
  OverlayTogglesLabels,
  PaneListLabels,
  PatternChipsLabels,
  PrimaryActionsLabels,
  StatusFooterLabels,
  StudiesPanelLabels,
  StylePickerLabels,
  SymbolTriggerLabels,
  WorkspaceChromeLabels,
  WorkspaceLabelOverrides,
  WorkspaceNoticeLabels,
  WorkspaceSectionLabels,
} from './react/chrome/labels';

export type { LegendEntry, LegendLine, WorkspaceLegendProps } from './react/WorkspaceLegend';
export { WorkspaceLegend } from './react/WorkspaceLegend';

// THE COMPOSED SURFACE. It lives in `react/surface/` with the rest of its dissolution, and the name
// moved with it. See docs/explanation/entry.md#the-composed-surface
export type {
  ChartSurfaceProps,
  PaneView,
  SeriesReader,
  SurfaceAlerts,
  SurfaceAppearance,
  SurfaceData,
  SurfaceDrawing,
  SurfaceLabels,
  SurfaceLayout,
} from './react/surface/ChartSurface';
export { ChartSurface, seriesStyleKey } from './react/surface/ChartSurface';

// THE COMPOSED COMPONENT — the only one this entry publishes out of `react/workspace/`.
// See docs/explanation/entry.md#the-composed-component
export type {
  ChartWorkspaceProps,
  WorkspaceChromeOptions,
  WorkspaceDataSource,
  WorkspaceDrawingOptions,
  WorkspaceLayoutBudget,
  WorkspaceStudies,
} from './react/workspace/ChartWorkspace';
export { ChartWorkspace } from './react/workspace/ChartWorkspace';
// The two vocabularies a host hands the composed component, as TYPES only.
// See docs/explanation/entry.md#the-composed-component
export type { CandlePatternChoice } from './react/workspace/PatternChipsSection';
export type { DrawingVocabulary } from './react/workspace/DrawingRail';
// Where the tab set is kept between visits. The port is `WorkspaceStore`, published above.
export type { WorkspaceTabsOptions } from './react/workspace/usePersistedTabs';

// THE TWO ABSORBED BINDINGS ARE INTERNAL AGAIN, and `carryReadings` CHANGED HOUSE, NOT NAME.
// See docs/explanation/entry.md#the-two-absorbed-bindings
export { carryReadings } from './domain/readings';

export type { DensityControlLabels, DensityControlsProps } from './react/DensityControls';
export { DEFAULT_DENSITY_CONTROL_LABELS, DensityControls } from './react/DensityControls';

export type {
  DrawingTool,
  DrawingToolGroup,
  DrawingToolOption,
  DrawingToolbarLabels,
  DrawingToolbarProps,
} from './react/DrawingToolbar';
export { DEFAULT_DRAWING_TOOLBAR_LABELS, DrawingToolbar } from './react/DrawingToolbar';

export type { SeriesCatalogueEntry, SeriesMenuLabels, SeriesMenuProps } from './react/SeriesMenu';
export { DEFAULT_SERIES_MENU_LABELS, SeriesMenu } from './react/SeriesMenu';

export type {
  WorkspaceTabsBarItem,
  WorkspaceTabsBarLabels,
  WorkspaceTabsBarProps,
} from './react/WorkspaceTabsBar';
export {
  DEFAULT_WORKSPACE_TABS_BAR_LABELS,
  WorkspaceTabsBar,
  workspaceTabButtonId,
} from './react/WorkspaceTabsBar';

export type { CompactCellLabels, CompactCellProps } from './react/CompactCell';
export { CompactCell, DEFAULT_COMPACT_CELL_LABELS } from './react/CompactCell';

export type { TimeframeChipsProps } from './react/TimeframeChips';
export { TimeframeChips } from './react/TimeframeChips';
