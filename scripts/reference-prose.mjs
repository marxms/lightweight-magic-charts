/**
 * THE HALF OF THE REFERENCE THAT CANNOT BE DERIVED — written by hand, on purpose, and only this.
 *
 * `gen-reference.mjs` reads the entry and knows every symbol, every signature, every prop type and
 * every default. What it cannot read is what a module is FOR and what calling it looks like: a type
 * says `(state: ScopeState, frame: Frame) => ScopeState` and never says "a frame for another scope
 * is discarded rather than applied". So the prose lives here, one entry per module, and the
 * generator splices it into a page whose other half it derives. The document on disk stays byte for
 * byte the generator's output, which is what the gate asserts — editing a page is a failure, editing
 * THIS file is the supported way to change one.
 *
 * `summary` is at most five lines, because a reference page that opens with an essay is an
 * explanation page wearing the wrong hat; the argument belongs under `docs/explanation/`.
 *
 * `example` IS COMPILED, by `test/gates/docExamples.spec.ts`, in the same program as every other
 * block in `docs/`. It is written whole and alone — no preamble is stitched in — so `declare const`
 * stands for the value the reader already holds rather than a fixture invented to make the fence
 * green.
 *
 * ONE TRAP, MEASURED: a bare decimal in an example — `1.2345`, `101.00` — is read by the
 * dangling-reference gate as a pointer into an archived plan, because that gate scans a document
 * line by line and cannot see that this one sits inside a fence. Its allowlist already spares a
 * number inside an inline code span for exactly this reason; a fenced block is the form it has not
 * met. Until it does, write the number as a named value or give it a leading zero.
 */

/** @typedef {{ title: string, summary: string, example: string, language?: 'ts' | 'tsx' }} Entry */

/** @type {Readonly<Record<string, Entry>>} */
export const REFERENCE_PROSE = {
  'alerts/priceAlerts': {
    title: 'price levels the reader placed, and when they are crossed',
    summary: `A price alert is a level plus the side it was armed from, and crossing it is a pure
observation over a price: \`observePrice\` reports which alerts fired without mutating any of them.
\`sideOf\` decides the side at arming time, which is what makes "crossed" mean the same thing after
a reload.`,
    example: `import { observePrice, sideOf, type AlertObservation, type PriceAlert } from 'lightweight-magic-charts';

const level: PriceAlert = { id: 'a1', price: 42_000, side: sideOf(41_500, 42_000), triggered: false };

declare const lastPrice: number;
export const observed: AlertObservation = observePrice([level], lastPrice);`,
  },

  'catalogue/relabel': {
    title: 'renaming a pane and its series without rebuilding either',
    summary: `Titles are display, identifiers are not. \`relabelled\` returns a copy of a pane with new
labels applied by source field, so a host can localise or rename what a catalogue authored without
touching the ids anything else keys on.`,
    example: `import { relabelled, type RelabellablePane } from 'lightweight-magic-charts';

declare const pane: RelabellablePane;

export const renamed = relabelled(pane, new Map([['close', 'Fechamento']]), 'Preço', undefined);`,
  },

  'catalogue/sources': {
    title: 'what may be plotted, and how much room the plotting gets',
    summary: `A \`PlottableSource\` is one authored thing a reader can pick: an id, a label, where it
wants to be drawn, and a function returning its series. \`resolutionPolicy\` fills in the limits —
how many lanes exist and how many plots fit in one — from the two numbers a host actually knows.`,
    example: `import { resolutionPolicy, type ResolutionPolicy } from 'lightweight-magic-charts';

export const policy: ResolutionPolicy = resolutionPolicy({ lanes: 3, plotsPerLane: 4 });`,
  },

  'domain/format': {
    title: 'turning a number into the string a scale shows',
    summary: `\`formatterFor\` resolves a \`ValueFormat\` into the function that renders one value, and
\`minMoveOf\` gives the smallest step that format can express — which is what a price scale needs to
avoid inventing precision it does not have.`,
    example: `import { formatterFor, minMoveOf, type ValueFormat } from 'lightweight-magic-charts';

const percent: ValueFormat = { kind: 'percent', decimals: 2 };

declare const measured: number;

export const shown: string = formatterFor(percent)(measured);
export const step: number = minMoveOf(percent);`,
  },

  'domain/readings': {
    title: 'carrying a reading forward across a gap',
    summary: `A series with holes draws a broken line unless something decides what a hole means.
\`carryReadings\` applies the spec's own answer — \`stepCarry\` holds the last value, everything else
leaves the gap — so the decision lives with the series rather than with each renderer.`,
    example: `import { carryReadings, type SeriesSpec } from 'lightweight-magic-charts';

declare const spec: SeriesSpec;

export const carried: readonly (number | null)[] = carryReadings([1, null, null, 4], spec);`,
  },

  'domain/types': {
    title: 'the vocabulary everything else is written in',
    summary: `Bars, points, scopes, panes, series and the two branded identifiers. Nothing here imports
React or a canvas, so importing a type from this module costs nothing at runtime. \`paneId\` and
\`seriesId\` are the only way to make an identifier, which keeps a bare string from drifting into the
wrong slot; \`utcSeconds\` does the same for time.`,
    example: `import { paneId, seriesId, utcSeconds, type Bar, type PaneSpec } from 'lightweight-magic-charts';

const bar: Bar = { time: utcSeconds(1_700_000_000), open: 100, high: 102, low: 99, close: 101 };

export const pane: PaneSpec = {
  id: paneId('price'),
  title: 'Price action',
  format: { kind: 'price', minMove: 0.01 },
  series: [{ id: seriesId('close'), label: 'Close', shape: 'line', color: '#4c8dff' }],
  defaultVisible: true,
};
export const firstClose: number = bar.close;`,
  },

  'drawing/axisLock': {
    title: 'the axis lock, so pulling an anchor does not pan the chart',
    summary: `The base library's pan handler and the drawing engine's drag handler hear the same press
and both act, which makes a shape impossible to resize. \`attachAxisLock\` catches the press in capture
phase and holds \`handleScroll\` and \`handleScale\` while an anchor is being pulled. The one thing it
cannot know is whether a point is on an anchor, so the binding brings that predicate.`,
    example: `import { attachAxisLock, type AxisLockHost } from 'lightweight-magic-charts';

declare const host: AxisLockHost;

export const unlock: () => void = attachAxisLock(host);`,
  },

  'drawing/magnet': {
    title: 'where an anchor lands: the pointer, or the bar under it',
    summary: `A pure rule, not a placement. Off resolves an anchor to the pointer's own price; on
resolves it to the nearest of the bar's open, high, low or close within the threshold. The threshold
is a SCREEN distance, because a price tolerance means one thing at 60 000 and another at 0.4.`,
    example: `import { snapAnchorPrice, type MagnetMode, type SnapInput } from 'lightweight-magic-charts';

declare const pointer: SnapInput;
declare const mode: MagnetMode;

export const price: number = snapAnchorPrice({ ...pointer, mode });`,
  },

  'drawing/drawingLayer': {
    title: 'the seam a drawing library is plugged into',
    summary: `Five types and no implementation: the library owns the rail and the tool buttons, and the
thing that draws is the host's. A \`DrawingBinding\` is handed the chart, the price series and the
container, and returns a live layer the workspace drives.`,
    example: `import type { DrawingBinding, DrawingLayer } from 'lightweight-magic-charts';

declare const layerOver: (container: HTMLElement) => DrawingLayer;

export const binding: DrawingBinding = (host, _events) => layerOver(host.container);`,
  },

  'drawing/drawingMemory': {
    title: 'which markets have drawings, remembered for the session',
    summary: `A small bounded cache so switching market and back does not lose what was drawn.
\`MAX_DRAWING_MEMORY\` is the ceiling and it is deliberate: unbounded memory here is a leak with a
friendly name.`,
    example: `import { drawingMemoryFor, rememberedMarkets, type DrawingMemory } from 'lightweight-magic-charts';

export const memory: DrawingMemory = drawingMemoryFor('BTC-USD');
export const known: readonly string[] = rememberedMarkets();`,
  },

  'extension/plugins': {
    title: 'the extension boundary: instances, never a registry',
    summary: `An \`Overlay\` draws on the chart's own canvas through a lent \`RenderTarget\` and a
\`Projection\` that answers \`null\` for anything off scale. Extension is injection of an instance —
there is no register-by-name, because a registry needs an import for side effects and that kills
tree-shaking for every consumer.`,
    example: `import type { Overlay } from 'lightweight-magic-charts';

export const marker: Overlay = {
  zOrder: 'ahead',
  attached: (host) => host.requestRedraw(),
  detached: () => undefined,
  draw: (target, projection) => {
    const y = projection.priceToY(42_000);
    if (y === null) return;
    target.useBitmapSpace(({ ctx, widthPx, vRatio }) => ctx.fillRect(0, y * vRatio, widthPx, 1));
  },
};`,
  },

  'indicator/availability': {
    title: 'the three answers a study can give about a window',
    summary: `\`ok\`, \`warmup\` or \`empty\`, and a \`Reading\` that is a number or \`null\`. The
distinction matters on screen: a study still warming up is not a study with no data, and neither is
a flat line at zero.`,
    example: `import type { IndicatorAvailability, Reading } from 'lightweight-magic-charts';

export const availabilityOf = (readings: readonly Reading[]): IndicatorAvailability => {
  if (readings.length === 0) return 'empty';
  return readings.some((reading) => reading === null) ? 'warmup' : 'ok';
};`,
  },

  'indicator/coverage': {
    title: 'what actually arrived in the window, counted',
    summary: `\`buildWorkspaceReport\` counts candles, indicator points and the channels that answered,
and names what is missing. \`formatWorkspaceReport\` renders that as the one-line string a product
surface shows.`,
    example: `import { buildWorkspaceReport, formatWorkspaceReport, type WorkspaceRow } from 'lightweight-magic-charts';

declare const rows: readonly WorkspaceRow[];

export const line: string = formatWorkspaceReport(buildWorkspaceReport(rows, null, [], 120));`,
  },

  'indicator/liveTip': {
    title: 'the live value written onto the last point only',
    summary: `A live tick amends the newest point and nothing behind it. \`applyTipToLastPoint\`
performs exactly that substitution, which is what keeps a live series from rewriting history it has
already drawn.`,
    example: `import { applyTipToLastPoint, type LiveTip } from 'lightweight-magic-charts';

declare const series: readonly { readonly value: number }[];
declare const tip: LiveTip;

export const withTip = applyTipToLastPoint(series, tip);`,
  },

  'indicator/resolution': {
    title: 'placing the reader’s picks into lanes and panes',
    summary: `\`resolveSources\` turns a list of chosen ids into placed views: which lane, which pane,
how many points were drawn, whether the window was long enough to warm up. It is arithmetic — same
inputs, same placement — so a host can call it outside React to test a layout.`,
    example: `import { resolveSources, type Bar, type ResolutionPolicy, type SourceLookup } from 'lightweight-magic-charts';

declare const lookup: SourceLookup;
declare const bars: readonly Bar[];
declare const policy: ResolutionPolicy;

export const resolved = resolveSources(['sma.20'], lookup, bars, policy);`,
  },

  'indicator/rows': {
    title: 'bars and study readings zipped into one row per timestamp',
    summary: `The shape a table, an export or a report wants: one object per bar carrying every reading
that exists at that timestamp, and \`null\` where one does not. Building it once keeps three consumers
from each writing their own join.`,
    example: `import { buildWorkspaceRows, type RowBar, type WorkspaceRow } from 'lightweight-magic-charts';

declare const bars: readonly RowBar[];

export const rows: readonly WorkspaceRow[] = buildWorkspaceRows(bars, null, null);`,
  },

  'layout/application': {
    title: 'the outcome of a layout, ready to apply',
    summary: `Two types describing what the stack decided: the panes with their heights, or a
\`degenerate\` verdict when the budget cannot hold a chart at all. A host reads this through
\`layout.onLayout\` to mirror the decision somewhere else.`,
    example: `import type { StackApplication } from 'lightweight-magic-charts';

export const onLayout = (application: StackApplication): number =>
  application.kind === 'degenerate' ? 0 : application.outcome.priceHeightPx;`,
  },

  'layout/computeLayout': {
    title: 'how a height budget is split between price and studies',
    summary: `The arithmetic heart of the workspace, and pure: panes in, factors out, with an explicit
\`evicted\` outcome when the budget runs out. Eviction order is deterministic, so the same panes and
the same height always collapse the same one.`,
    example: `import { computeLayout, paneId, type LayoutOutcome } from 'lightweight-magic-charts';

export const outcome: LayoutOutcome = computeLayout(
  [{ id: paneId('rsi'), targetHeightPx: 120, lastUsedAt: 2 }],
  520,
  { priceFloorPx: 200, defaultPaneHeightPx: 110 },
);`,
  },

  'layout/legendModel': {
    title: 'what a legend shows, as data',
    summary: `A legend line is a title, a vertical position and its entries; an entry is a label, a
colour and an already-formatted value. Modelling it as data is what lets the legend be rendered,
tested and asserted without a canvas.`,
    example: `import type { LegendLine } from 'lightweight-magic-charts';

export const line: LegendLine = {
  id: 'price',
  title: 'Price action',
  topPx: 8,
  entries: [{ id: 'close', label: 'Close', color: '#4c8dff', value: '101' }],
};`,
  },

  'overlays/densityField': {
    title: 'the liquidation heatmap, from slices to columns to paint',
    summary: `A density slice is what a host measured at one instant; \`toDensityColumns\` turns a run of
them into the columns the overlay paints, and \`DensityFieldOverlay\` is the overlay itself. The ramp
and the tuning are separate so a host can recolour without recomputing.`,
    example: `import { toDensityColumns, type DensityColumn, type DensitySlice } from 'lightweight-magic-charts';

declare const slices: readonly DensitySlice[];

export const columns: readonly DensityColumn[] = toDensityColumns(slices);`,
  },

  'overlays/densityTuning': {
    title: 'the two knobs on the heatmap, and their bounds',
    summary: `Floor and gamma, with the bounds written down once. \`clampDensityTuning\` is what a
control calls before handing a value on, so an out-of-range number becomes a bounded one instead of
an invisible field.`,
    example: `import { clampDensityTuning, DENSITY_TUNING_BOUNDS, type DensityTuning } from 'lightweight-magic-charts';

export const safe: DensityTuning = clampDensityTuning({ floor: -1, gamma: 99 });
export const gammaBound = DENSITY_TUNING_BOUNDS.gamma;`,
  },

  'overlays/troughProfile': {
    title: 'the volume profile drawn beside the price scale',
    summary: `\`buildProfile\` buckets bars into a profile and answers \`null\` when there is nothing to
bucket — an empty profile is absent, not a profile of zeros. \`troughStyleFor\` takes the colours from
the market convention so the profile agrees with the candles.`,
    example: `import { buildProfile, type Bar, type Profile } from 'lightweight-magic-charts';

declare const bars: readonly Bar[];

export const profile: Profile | null = buildProfile(bars, 24);`,
  },

  'pane/budget': {
    title: 'reconciling a stored pane layout against today’s catalogue',
    summary: `What a previous visit saved is not authority: a pane that left the catalogue must go, and
one that arrived must appear. \`reconcilePaneLayout\` performs that merge on untrusted input and
always returns a usable layout.`,
    example: `import { reconcilePaneLayout, type PaneLayout } from 'lightweight-magic-charts';

declare const stored: unknown;

export const layout: PaneLayout = reconcilePaneLayout(
  stored,
  [{ id: 'price', defaultVisible: true, heightPx: 320 }],
  ['1h', '4h'],
  2,
);`,
  },

  'port/chartApi': {
    title: 'the structural port onto the charting library',
    summary: `Every member the workspace needs from a chart, declared structurally so no runtime import
of \`lightweight-charts\` exists anywhere in \`src\`. A host implements \`ChartEngine\` once; the
package never sees the real package. That constraint is why the CommonJS build still works.`,
    example: `import type { ChartEngine, WorkspaceChartHandle } from 'lightweight-magic-charts';

declare const makeHandle: (container: HTMLElement) => WorkspaceChartHandle;

export const engine: ChartEngine = (container, _options) => makeHandle(container);`,
  },

  'port/frames': {
    title: 'what a live channel may send, and what it means',
    summary: `Snapshot, append, amend, open, member — the frame vocabulary, plus the envelope that
carries a batch and the tip that holds the newest values. \`resolveChannelShape\` settles what a
channel really is when the declaration and the behaviour disagree.`,
    example: `import { resolveChannelShape, type ChannelShape } from 'lightweight-magic-charts';

export const shape: ChannelShape = resolveChannelShape('delta', true);`,
  },

  'port/ports': {
    title: 'the data seam every adapter implements',
    summary: `History by request, live by subscription, and a description of what a channel offers.
\`isHistoryPort\` and \`isLivePort\` are how a host asks which halves an adapter actually brought — a
port with a silent live channel is legitimate, and the workspace says so rather than failing.`,
    example: `import type { MarketDataPort } from 'lightweight-magic-charts';

export const port: MarketDataPort = {
  fetchBars: async () => ({ bars: [], exhausted: true }),
  describe: () => [],
  subscribe: () => () => undefined,
};`,
  },

  'port/scopeMachine': {
    title: 'the state machine that keeps history and live in agreement',
    summary: `Seeding, live, reset and discarded, with every transition a pure function of state and
frame. A frame for another scope is discarded rather than applied, and a sequence that skips forces a
refetch — which is what makes a reconnect recoverable instead of silently wrong.`,
    example: `import { applyFrame, createScopeState, type ScopeState } from 'lightweight-magic-charts';

const scope = { instrument: 'BTC-USD', resolution: '1h' };
const seeded: ScopeState = createScopeState(scope, 'delta');

declare const frame: Parameters<typeof applyFrame>[1];
export const next: ScopeState = applyFrame(seeded, frame);`,
  },

  'port/seedTransaction': {
    title: 'one call that seeds history and attaches live, or neither',
    summary: `\`openScope\` runs the whole opening as a transaction: fetch, verify the seam, subscribe,
and report through the callbacks. Failing halfway leaves nothing attached, which is what keeps a
retry from stacking subscriptions.`,
    example: `import { openScope, type Session, type SessionOptions } from 'lightweight-magic-charts';

declare const options: SessionOptions;

export const session: Session = openScope(options);`,
  },

  'react/chrome/ChromeContext': {
    title: 'a section of your own, injected into the composition',
    summary: `The sixth extension point, and the one that injects content rather than a control. A
section names itself, reports a count for its collapsed header and renders its own body wherever it
is placed.`,
    example: `import type { WorkspaceSection } from 'lightweight-magic-charts';

export const positions: WorkspaceSection = {
  id: 'positions',
  label: 'Open positions',
  count: 0,
  placement: 'rail',
  Body: () => null,
};`,
    language: 'tsx',
  },

  'react/chrome/labels': {
    title: 'every sentence the composition can say, in one channel',
    summary: `English is the default, not the only option: each member is overridable, at either level,
and text that depends on a value is a function so a host keeps control of word order.
\`resolveWorkspaceLabels\` merges an override over the default member by member, never by spread.`,
    example: `import { resolveWorkspaceLabels, type WorkspaceChromeLabels } from 'lightweight-magic-charts';

export const labels: WorkspaceChromeLabels = resolveWorkspaceLabels({
  dismiss: 'Fechar',
  sections: { panes: 'Painéis' },
});`,
  },

  'react/CompactCell': {
    title: 'one small chart in a grid cell',
    summary: `The grid mode's tile: its own scope, its own timeframe chips, its own remove button, and
nothing else. It mounts a chart of its own through the same engine seam the main surface uses.`,
    example: `import { DEFAULT_COMPACT_CELL_LABELS, type CompactCellLabels } from 'lightweight-magic-charts';

export const labels: CompactCellLabels = { ...DEFAULT_COMPACT_CELL_LABELS, empty: 'sem barras' };`,
  },

  'react/DensityControls': {
    title: 'the floor and boost controls for the heatmap',
    summary: `Two steppers and a reset, painted from the theme and named from the label channel. The
control never clamps on its own: it hands the value to \`clampDensityTuning\`, which is where the
bounds live.`,
    example: `import { DEFAULT_DENSITY_CONTROL_LABELS, type DensityControlLabels } from 'lightweight-magic-charts';

export const labels: DensityControlLabels = { ...DEFAULT_DENSITY_CONTROL_LABELS, reset: 'padrão' };`,
  },

  'react/DrawingToolbar': {
    title: 'the drawing rail: tools, count and the two destructive actions',
    summary: `Renders the vocabulary a host injected — it authors no tool of its own — plus the drawing
count, delete-selection and clear-all. Vertical by default; \`orientation\` is the only shape choice
it takes.`,
    example: `import type { DrawingTool } from 'lightweight-magic-charts';

export const tools: readonly DrawingTool[] = [
  { id: 'trend-line', label: 'Trend line', glyph: '╱', shortcut: 't' },
];`,
  },

  'react/drawingToolBuckets': {
    title: 'grouping a long tool list into a browsable panel',
    summary: `Two types for when a rail is not enough: options that name a group, and the groups
themselves. A host with six tools ignores both; a host with sixty needs them.`,
    example: `import type { DrawingToolGroup, DrawingToolOption } from 'lightweight-magic-charts';

export const groups: readonly DrawingToolGroup[] = [{ id: 'lines', label: 'Lines', glyph: '╱' }];
export const options: readonly DrawingToolOption[] = [
  { id: 'trend-line', name: 'Trend line', group: 'lines' },
];`,
  },

  'react/hoverIntent': {
    title: 'opening on hover without opening on a passing pointer',
    summary: `Two delays and a cancel: a panel opens after the pointer has meant it and closes after it
has left, which is what keeps a menu from flickering under a moving cursor. \`useHoverDismiss\` is the
other half — closing when the pointer leaves the panel itself.`,
    example: `import { useHoverIntent, type HoverIntent } from 'lightweight-magic-charts';

export function useMenuIntent(): HoverIntent {
  return useHoverIntent();
}`,
  },

  'react/SeriesMenu': {
    title: 'the picker for what may be plotted',
    summary: `Search, categories, a capacity readout and the chosen set. The catalogue arrives from the
host — the menu names nothing itself — and reaching capacity is reported rather than silently
ignored.`,
    example: `import { DEFAULT_SERIES_MENU_LABELS, type SeriesMenuLabels } from 'lightweight-magic-charts';

export const labels: SeriesMenuLabels = { ...DEFAULT_SERIES_MENU_LABELS, empty: 'nada corresponde' };`,
  },

  'react/surface/ChartSurface': {
    title: 'the chart itself: panes, series, alerts, drawings and overlays',
    summary: `Everything that touches the chart instance, and the only region that does. It is exported
because a host that wants the surface without the workspace chrome has a legitimate use for it, and
because the boundary is easier to keep when it has a name.`,
    example: `import { seriesStyleKey, type SurfaceLabels } from 'lightweight-magic-charts';

export const a11y: SurfaceLabels = { label: 'Chart of BTC-USD', describedBy: 'chart-status' };
export const styleKey: string = seriesStyleKey('price', 'close');`,
  },

  'react/surface/useSeriesData': {
    title: 'where a series gets its numbers',
    summary: `One type: the reader the host supplies, asked for one pane and one series at a time and
answering one value per bar. \`null\` is a gap, never a zero — a chart that draws a gap as zero
invents a crash.`,
    example: `import type { SeriesReader } from 'lightweight-magic-charts';

declare const closes: readonly number[];

export const read: SeriesReader = () => closes;`,
  },

  'react/theme': {
    title: 'twelve colour and type tokens, and nothing else',
    summary: `Every built-in control paints from these with inline style, so there is no stylesheet to
override and no cascade to fight. Spread the default and change what you need — the absent members
keep working.`,
    example: `import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from 'lightweight-magic-charts';

export const theme: WorkspaceTheme = { ...DEFAULT_WORKSPACE_THEME, accent: '#4c8dff' };`,
  },

  'react/TimeframeChips': {
    title: 'the interval row',
    summary: `A radio group over the intervals a build serves, with the accessible name coming from the
label channel. \`describe\` is what turns \`1h\` into whatever the reader should hear.`,
    example: `import type { ChartWorkspaceProps } from 'lightweight-magic-charts';

export const served: NonNullable<ChartWorkspaceProps['catalogue']>['servedTimeframes'] = ['1h', '4h'];`,
  },

  'react/workspace/ChartWorkspace': {
    title: 'the drop-in, and the shape of everything you hand it',
    summary: `One component and three required prop groups: what may be drawn, where the numbers come
from, how much height it may use. Everything else is optional and additive — chrome, panes, studies,
drawing, patterns, tabs — and each absent group leaves a working default rather than a hole.`,
    example: `import { ChartWorkspace, type ChartWorkspaceProps } from 'lightweight-magic-charts';

export function Workspace(props: ChartWorkspaceProps) {
  return <ChartWorkspace {...props} />;
}`,
    language: 'tsx',
  },

  'react/workspace/DrawingRail': {
    title: 'the words a drawing rail says',
    summary: `The vocabulary a host injects: which tools exist, what each is called, which key arms it,
and optionally the larger panel behind the rail. The rail renders it; it authors none of it.`,
    example: `import type { DrawingVocabulary } from 'lightweight-magic-charts';

export const vocabulary: DrawingVocabulary = {
  tools: [{ id: 'horizontal', label: 'Horizontal line', glyph: '─', shortcut: 'h' }],
};`,
  },

  'react/workspace/PatternChipsSection': {
    title: 'candle patterns, chosen by the reader and named by the host',
    summary: `One type: a pattern the host offers, with the id it is keyed on and the label shown. The
library carries no pattern name of its own — naming a pattern names your business.`,
    example: `import type { CandlePatternChoice } from 'lightweight-magic-charts';

declare const choices: readonly CandlePatternChoice[];

export const first: CandlePatternChoice | undefined = choices[0];`,
  },

  'react/workspace/usePersistedTabs': {
    title: 'where a tab set is between visits',
    summary: `The options a host brings for persistence: a synchronous store, a version, a migration for
what an older build wrote, and the export hook. Bring none of them and tabs live for the session and
die on unmount.`,
    example: `import type { WorkspaceTabsOptions } from 'lightweight-magic-charts';

export const tabs: WorkspaceTabsOptions = {
  store: { read: () => null, write: () => undefined },
  version: 2,
};`,
  },

  'react/WorkspaceLegend': {
    title: 'the legend, rendered from the model',
    summary: `Draws \`LegendLine\`s over the panes and nothing more: no reading, no formatting, no
decision about what a value means. Everything it shows was already decided in \`layout/legendModel\`.`,
    example: `import type { LegendLine } from 'lightweight-magic-charts';

export const lines: readonly LegendLine[] = [
  { id: 'price', title: 'Price action', topPx: 8, entries: [] },
];`,
  },

  'react/WorkspaceTabsBar': {
    title: 'the tab strip, with rename, duplicate, export and import',
    summary: `Every tab action a reader can take, emitted as a callback — the bar decides nothing about
storage. \`workspaceTabButtonId\` builds the id a test or an \`aria-controls\` needs, so the two agree
by construction.`,
    example: `import { workspaceTabButtonId, type WorkspaceTabsBarItem } from 'lightweight-magic-charts';

export const buttonId: string = workspaceTabButtonId('workspace', 'tab-1');

declare const items: readonly WorkspaceTabsBarItem[];
export const count: number = items.length;`,
  },

  'render/overlayBridge': {
    title: 'attaching an overlay to a real chart',
    summary: `The one place the extension boundary meets the charting library's primitive protocol.
\`attachOverlay\` wraps an \`Overlay\` in the primitive the chart understands and returns the function
that detaches it — call it, or the redraw subscription outlives the chart.`,
    example: `import { attachOverlay, type Overlay, type SeriesHandle } from 'lightweight-magic-charts';

declare const series: SeriesHandle;
declare const overlay: Overlay;

export const detach: () => void = attachOverlay(series, overlay);`,
  },

  'render/paneStack': {
    title: 'panes on the chart, kept in the order the layout decided',
    summary: `Holds the chart's panes and applies a computed layout to them, including the collapsed
case: a collapsed pane keeps a sliver of stretch rather than zero, because a pane at zero is a pane
the chart forgets how to restore.`,
    example: `import { COLLAPSED_STRETCH } from 'lightweight-magic-charts';

export const stretchOf = (visible: boolean): number => (visible ? 1 : COLLAPSED_STRETCH);`,
  },

  'tabs/codec': {
    title: 'reading and writing a stored tab set',
    summary: `\`serializeTabsLayout\` stamps a version into the payload; \`parseTabsLayout\` reads one
back and never throws — unreadable input falls back, and a version it does not know is offered to
\`migrate\` first. Unparseable is a state, not an exception.`,
    example: `import { serializeTabsLayout, type TabsState, type WorkspaceSetup } from 'lightweight-magic-charts';

declare const state: TabsState<WorkspaceSetup>;

export const payload: string = serializeTabsLayout(state, 2);`,
  },

  'tabs/setup': {
    title: 'what one tab holds, and how untrusted input becomes one',
    summary: `A setup is a description of configuration, never of a market. \`defaultWorkspaceSetup\`
builds one from the host's policy and \`coerceWorkspaceSetup\` turns anything at all into a valid one,
which is what a stored payload from an older build gets.`,
    example: `import { defaultWorkspaceSetup, type WorkspaceSetup, type WorkspaceSetupPolicy } from 'lightweight-magic-charts';

declare const policy: WorkspaceSetupPolicy;

export const setup: WorkspaceSetup = defaultWorkspaceSetup(policy);`,
  },

  'tabs/workspaceTabs': {
    title: 'the tab reducer, and the limits it enforces',
    summary: `Select, duplicate, close, rename, update and replace, as one pure reducer over a tab
state. The two ceilings are here rather than in a component, so the last tab cannot be closed and the
twenty-fifth cannot be opened wherever the action comes from.`,
    example: `import { reduceTabs, MAX_WORKSPACE_TABS, type TabsState, type WorkspaceSetup } from 'lightweight-magic-charts';

declare const state: TabsState<WorkspaceSetup>;

export const selected: TabsState<WorkspaceSetup> = reduceTabs(state, { kind: 'select', index: 0 });
export const ceiling: number = MAX_WORKSPACE_TABS;`,
  },
};
