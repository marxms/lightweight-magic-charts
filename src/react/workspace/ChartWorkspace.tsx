/**
 * The composed component: the only one this package publishes that renders a whole workspace. The
 * providers sit above every region, so a region reads chrome, setup, patterns and the drawing seam
 * from context and declares none of them as a prop.
 * See docs/explanation/react-workspace.md#what-lives-in-the-composition-because-no-region-may-own-it
 */
import { memo, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';

import { DEFAULT_PRICE_ALERT_STYLE } from '../../alerts/priceAlerts';
import type { PriceAlert } from '../../alerts/priceAlerts';
import type { Bar, PaneSpec, PriceScaleConvention } from '../../domain/types';
import type { DrawingBinding } from '../../drawing/drawingLayer';
import { drawingScopeKey } from '../../drawing/drawingMemory';
import { readingWithTip } from '../../indicator/liveTip';
import type { ResolvedSourceView, SourceResolution } from '../../indicator/resolution';
import type { StackApplication } from '../../layout/application';
import { PRICE_PANE_ID } from '../../layout/computeLayout';
import type { DensitySlice } from '../../overlays/densityField';
import { mintedPaneSpec } from '../../pane/budget';
import type { ChartEngine, SeriesMarkerPoint, SeriesShape } from '../../port/chartApi';
import type { LiveTip } from '../../port/frames';
import type { MarketDataPort } from '../../port/ports';
import { coerceWorkspaceSetup, defaultWorkspaceSetup, movedIndicator } from '../../tabs/setup';
import type { WorkspaceSetup, WorkspaceSetupPolicy } from '../../tabs/setup';
import { MAX_WORKSPACE_TABS, reduceTabs } from '../../tabs/workspaceTabs';
import type { TabsAction, TabsState } from '../../tabs/workspaceTabs';
import { WorkspaceChromeProvider, useWorkspaceChrome } from '../chrome/ChromeContext';
import type { WorkspaceChromeProviderProps, WorkspaceSection } from '../chrome/ChromeContext';
import { laneNotice, resolveWorkspaceLabels } from '../chrome/labels';
import type { SeriesCatalogueEntry } from '../SeriesMenu';
import type { PaneView, SeriesReader } from '../surface/ChartSurface';
import { CanvasRow } from './CanvasRow';
import { CanvasSurface } from './CanvasSurface';
import { CompactGrid } from './CompactGrid';
import { DrawingRail, DrawingRailProvider, useDrawingRail } from './DrawingRail';
import type { DrawingVocabulary } from './DrawingRail';
import { GridControls } from './GridControls';
import { IntervalRegion } from './IntervalRegion';
import { OverlayTogglesSection } from './OverlayTogglesSection';
import { PaneListSection } from './PaneListSection';
import { CandlePatternsProvider, PatternChipsSection } from './PatternChipsSection';
import type { CandlePatternChoice } from './PatternChipsSection';
import { workspacePaneViews } from './paneViews';
import type { WorkspaceLanes } from './paneViews';
import { PrimaryActions } from './PrimaryActions';
import { SeriesMenuRegion } from './SeriesMenuRegion';
import { StatusFooter } from './StatusFooter';
import { StylePickerRegion, styleChoicesOf } from './StylePickerRegion';
import { SymbolTrigger } from './SymbolTrigger';
import { TabsRegion, workspaceTabPanelAria } from './TabsRegion';
import { WorkspaceSetupProvider } from './setupContext';
import { usePersistedTabs } from './usePersistedTabs';
import type { WorkspaceTabsOptions } from './usePersistedTabs';
import { usePriceAlerts } from './usePriceAlerts';
import type { CandleLaneState } from '../useCandleLane';

/**
 * The data seam: where the bars come from, which market they are, and how a chart is made. It also
 * carries what the seam produced that this package cannot compute.
 * See docs/explanation/react-workspace.md#the-data-seam-carries-what-the-package-cannot-compute
 */
export interface WorkspaceDataSource {
  readonly port: MarketDataPort;
  /** How to make a chart. The one value the port cannot carry — see `port/chartApi.ts`. */
  readonly engine: ChartEngine;
  readonly symbol: string;
  /** The other two scope coordinates. Empty is a legitimate answer for a host that has only one. */
  readonly venue?: string;
  readonly market?: string;
  readonly convention?: PriceScaleConvention;
  /** Where a computed series' values come from. Absent, only the candles are drawn. */
  readonly read?: SeriesReader;
  readonly barCount?: number;
  /** Columns of room right of the last bar, so a drawing can project. `0` turns it off; default 12.
   * See docs/explanation/domain.md#the-future-room-is-whitespace-not-candles */
  readonly futureBars?: number;
  readonly onSymbolRequest?: (symbol: string) => void;
  /** The interval the user moved to. The consumer scopes its own pipeline by the same axis. */
  readonly onTimeframeRequest?: (timeframe: string) => void;
  /** The field drawn BEHIND the price action, already adapted. Absent, the map draws nothing. */
  readonly density?: readonly DensitySlice[];
  /** Marks on the price series, minted from the bars this package seeded and the patterns switched on. */
  readonly marks?: (bars: readonly Bar[], active: readonly string[]) => readonly SeriesMarkerPoint[];
  /** What the load delivered, ALREADY formatted — it is a sentence, not a structure to render. */
  readonly report?: string;
  /** The live reading of the bar in progress, per series. History says the rest. */
  readonly tip?: LiveTip;
  /** A level was walked through. Once per crossing, never once per bar. */
  readonly onAlertCrossed?: (crossed: readonly PriceAlert[]) => void;
}

/** The vertical budget the host offers, and the report of what was done with it. Never the viewport. */
export interface WorkspaceLayoutBudget {
  readonly heightPx: number;
  readonly onLayout?: (application: StackApplication) => void;
}

/** Theme, the five chrome roles, labels and host sections — everything that never changes per tick. */
export type WorkspaceChromeOptions = Omit<WorkspaceChromeProviderProps, 'children'>;

/** The drawing seam. Absent, the rail draws and every control on it is inert. */
export interface WorkspaceDrawingOptions {
  readonly vocabulary?: DrawingVocabulary;
  readonly binding?: DrawingBinding;
  /** How close the magnet reaches, in SCREEN pixels. Absent is 8. The MODE is deliberately not a
   * prop: the library writes it too, and two owners of one value disagree the moment a shortcut
   * arms it. See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement */
  readonly snapThresholdPx?: number;
  readonly onDeleteSelection?: () => void;
}

/** The studies on offer, and the ones already resolved. Both are the host's vocabulary. */
export interface WorkspaceStudies {
  readonly catalogue?: readonly SeriesCatalogueEntry[];
  /** Resolved by the HOST once, for a composition that holds the list somewhere else. */
  readonly views?: readonly ResolvedSourceView[];
  /** Resolved by the HOST on demand. See docs/explanation/react-workspace.md#why-resolve-is-a-function */
  readonly resolve?: (ids: readonly string[], bars: readonly Bar[]) => SourceResolution;
  readonly capacity?: number;
  /** How the pre-created lanes are drawn. Absent, no lane exists and a study has nowhere to go. */
  readonly lanes?: WorkspaceLanes;
}

export interface ChartWorkspaceProps {
  /** What this build offers, and how a stored payload is coerced onto it. */
  readonly catalogue: WorkspaceSetupPolicy;
  readonly data: WorkspaceDataSource;
  readonly layout: WorkspaceLayoutBudget;
  readonly chrome?: WorkspaceChromeOptions;
  /** The authored panes, drawn. Absent, each catalogue entry is drawn as a titled empty pane. */
  readonly panes?: readonly PaneSpec[];
  readonly studies?: WorkspaceStudies;
  readonly drawing?: WorkspaceDrawingOptions;
  readonly patterns?: readonly CandlePatternChoice[];
  /** Where the tab set is kept between visits, and how it leaves the machine. */
  readonly tabs?: WorkspaceTabsOptions;
  /** Rendered below the workspace, inside both providers. */
  readonly children?: ReactNode;
}

/** ONE hoisted empty of each kind. See docs/explanation/react-workspace.md#one-hoisted-empty-of-each-kind */
const NONE: readonly never[] = [];
const NO_GROUP: Readonly<Record<string, never>> = {};
const NO_TOOLS: DrawingVocabulary = { tools: NONE };
/** Nothing computed. A host drawing only candles never has to say so. */
const NO_READINGS: SeriesReader = () => NONE;
const noop = (): void => undefined;
const DEFAULT_STUDY_CAPACITY = 6;
/** Western default; a host reading red-is-up hands over its own. */
const DEFAULT_CONVENTION: PriceScaleConvention = {
  upColor: '#26a69a', downColor: '#ef5350', encodeDirectionBy: ['color', 'position'],
};

const COLUMN: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 };
/**
 * The overlay anchor: the studies menu positions against THIS box, never against the viewport.
 * See docs/explanation/react-workspace.md#the-shell-is-a-stripped-fieldset
 */
const SHELL: CSSProperties = {
  ...COLUMN, flex: 'none', position: 'relative', outline: 'none',
  border: 'none', margin: 0, padding: 0, minInlineSize: 0,
};
const HEADER: CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '0 4px 4px',
};

/** Editing keys are never hijacked from a field somebody is typing in. */
function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || element?.isContentEditable === true;
}

interface WorkspaceBodyProps {
  readonly of: ChartWorkspaceProps;
  readonly tabs: TabsState<WorkspaceSetup>;
  readonly act: (action: TabsAction<WorkspaceSetup>) => void;
  /** Which patterns are marking right now. Session state, held above so both readers see one set. */
  readonly active: readonly string[];
  /** The channel, and the only handle on it a region ever sees. */
  readonly notice: { readonly message: string | null; readonly report: (text: string | null) => void };
}

/** Everything below the providers, in one piece. See docs/explanation/react-workspace.md#the-body-is-one-piece */
function WorkspaceBody({ of, tabs, act, active, notice }: WorkspaceBodyProps): ReactElement {
  const { theme, components, labels, testIdPrefix } = useWorkspaceChrome();
  const { vocabulary, activeTool, arm, deleteSelection } = useDrawingRail();
  const { Notice } = components;
  const { catalogue, data, layout, panes, studies = NO_GROUP, children } = of;
  const { catalogue: offered = NONE } = studies;
  const setup = tabs.tabs[tabs.active]?.setup ?? defaultWorkspaceSetup(catalogue);
  const [application, setApplication] = useState<StackApplication | null>(null);
  // Both cross regions. See docs/explanation/react-workspace.md#alerts-cross-regions
  const { levels, onLevels, onCrossed, fired, addLevel } = usePriceAlerts(data.onAlertCrossed);
  const [lane, setLane] = useState<CandleLaneState | null>(null);
  const bars = lane?.bars ?? NONE;
  const lastClose = bars.length === 0 ? null : bars[bars.length - 1].close;

  const specs = useMemo(() => panes ?? catalogue.catalogue.map(mintedPaneSpec), [panes, catalogue]);
  const timeframe = setup.timeframe ?? catalogue.servedTimeframes[0] ?? '';
  const capacity = studies.capacity ?? DEFAULT_STUDY_CAPACITY;
  const resolved = useMemo(
    () => studies.resolve?.(setup.indicators, bars),
    [studies, setup.indicators, bars],
  );
  const chosen = resolved?.views ?? studies.views ?? NONE;
  const views: readonly PaneView[] = useMemo(
    () => workspacePaneViews({ specs, panes: setup.panes, studies: chosen, capacity,
      lanes: studies.lanes, labels: resolved?.labels, laneTitle: labels.laneTitle }),
    [specs, setup.panes, chosen, capacity, studies.lanes, resolved, labels],
  );
  // See docs/explanation/react-workspace.md#the-tip-fills-the-bar-in-progress
  const read: SeriesReader = (pane, series) =>
    readingWithTip(series.id, resolved?.readings.get(series.id) ?? (data.read ?? NO_READINGS)(pane, series), data.tip);
  const write = (patch: Partial<WorkspaceSetup>): void =>
    act({ kind: 'update-active', setup: { ...setup, ...patch } });
  const footerId = `${testIdPrefix}-state`;
  const aria = workspaceTabPanelAria(testIdPrefix, tabs.tabs[tabs.active]?.id ?? '');
  const convention = data.convention ?? DEFAULT_CONVENTION;
  const scope = { instrument: data.symbol, venue: data.venue ?? '', market: data.market ?? '' };
  const applied = application?.kind === 'applied' ? application.outcome : null;

  /**
   * The container's keymap, and the container's alone.
   * See docs/explanation/react-workspace.md#the-keymap-is-container-scoped
   */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLFieldSetElement>): void => {
    if (event.key === 'Escape') {
      // With a tool armed, escape cancels the TOOL; without one the event is left to bubble.
      if (activeTool === null) return;
      arm(null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isTextEntry(event.target)) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (!event.altKey) return;
    const tool = vocabulary.shortcuts?.[event.code];
    if (tool === undefined) return;
    event.preventDefault();
    arm(activeTool === tool ? null : tool);
  };

  return (
    <fieldset
      data-testid={`${testIdPrefix}-root`}
      aria-label={labels.workspace(data.symbol)}
      // Focusable so the container receives the keys it scopes; -1 keeps it out of the tab order.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ ...SHELL, height: layout.heightPx }}
    >
      <TabsRegion
        state={tabs}
        onAction={act}
        onExport={of.tabs?.onExport}
        naming={{
          mint: (index) => ({ id: `tab-${index + 1}`, name: labels.tabName(index) }),
          defaultName: labels.tabName,
          coerceSetup: (raw) => coerceWorkspaceSetup(raw, catalogue),
        }}
      />
      {/* The body IS the active tab's panel: switching tabs swaps exactly what is inside it. */}
      <div {...aria} role="tabpanel" style={COLUMN}>
        <div style={HEADER}>
          <SymbolTrigger symbol={data.symbol} onSymbolRequest={data.onSymbolRequest ?? noop} />
          <IntervalRegion
            options={catalogue.servedTimeframes}
            onRequest={data.onTimeframeRequest}
          />
          <GridControls
            grid={{
              maxCells: catalogue.maxGridCells,
              onToggleMode: () => write({ layoutMode: setup.layoutMode === 'grade' ? 'foco' : 'grade' }),
              onAddCell: () => write({ gridCells: [...setup.gridCells, timeframe] }),
            }}
          />
          <PrimaryActions
            onAutoFitToggle={() => write({ autoFit: !setup.autoFit })}
            priceLine={{ lastClose, onAdd: addLevel }}
          />
          <SeriesMenuRegion
            catalogue={offered}
            indicators={{
              views: chosen,
              capacity,
              onRemove: (id) => write({ indicators: setup.indicators.filter((held) => held !== id) }),
              onMove: (id, step) => write({ indicators: movedIndicator(setup.indicators, id, step) }),
            }}
            onSelect={(entry) => {
              if (setup.indicators.length >= capacity) return notice.report(labels.notices.studyLimit(capacity));
              write({ indicators: [...setup.indicators, entry.label] });
            }}
          />
          <StylePickerRegion
            choices={styleChoicesOf(specs)}
            onChange={(key, shape) => write({ seriesStyles: { ...setup.seriesStyles, [key]: shape } })}
          />
        </div>
        {notice.message === null ? null : (
          <Notice severity="warning" theme={theme} dismissLabel={labels.dismiss} onDismiss={() => notice.report(null)}>
            {notice.message}
          </Notice>
        )}
        <CanvasRow
          heightPx={layout.heightPx}
          onLayout={(applies) => {
            setApplication(applies);
            layout.onLayout?.(applies);
            if (applies.kind === 'degenerate') notice.report(labels.notices.degenerate(applies.totalPx));
          }}
        >
          {(surfacePx) => (
            <>
              <DrawingRail heightPx={surfacePx} />
              <CanvasSurface
                engine={data.engine}
                convention={convention}
                data={{
                  panes: views, read, priceCaption: data.symbol,
                  pricePane: specs.find((spec) => String(spec.id) === PRICE_PANE_ID),
                  seriesStyles: setup.seriesStyles as Readonly<Record<string, SeriesShape>>,
                  autoFit: setup.autoFit, datasetId: `${data.symbol}·${timeframe}`,
                  futureBars: data.futureBars,
                  priceMarkers: data.marks?.(bars, active),
                }}
                layout={{ heightPx: surfacePx }}
                a11y={{ label: labels.canvas(data.symbol), describedBy: footerId }}
                appearance={{ theme, testIdPrefix }}
                // The tag on the axis is a sentence like every other, so it comes from the same
                // channel. See docs/explanation/alerts.md#the-axis-label-is-text-never-the-id
                alerts={{ levels, onChange: onLevels, onCrossed,
                  style: { ...DEFAULT_PRICE_ALERT_STYLE, label: labels.priceAlert } }}
                lane={{
                  scope: data.symbol === '' ? null : { ...scope, resolution: timeframe },
                  port: data.port, barCount: data.barCount ?? 0,
                }}
                fields={{ tuning: setup.density, density: data.density,
                  showDensity: setup.showDensity, showProfile: setup.showProfile }}
                snapThresholdPx={of.drawing?.snapThresholdPx}
                onLane={(state) => {
                  setLane(state);
                  notice.report(laneNotice(labels.notices, state.bars.length, state.outcome, data.symbol));
                }}
              />
              <CompactGrid
                source={{ engine: data.engine, port: data.port, scope, convention }}
                timeframes={catalogue.servedTimeframes}
                heightPx={surfacePx}
              />
            </>
          )}
        </CanvasRow>
        <StatusFooter
          id={footerId}
          state={labels.state(data.symbol, timeframe, views.filter((view) => view.visible).length)}
          reading={{
            paneScale: applied?.scaled,
            evicted: applied?.kind === 'evicted' ? applied.evicted.map(String) : undefined,
            firedAlerts: fired, report: data.report,
          }}
        />
        {children}
      </div>
    </fieldset>
  );
}

export const ChartWorkspace = memo(function ChartWorkspace(props: ChartWorkspaceProps): ReactElement {
  const { catalogue, data, chrome, drawing = NO_GROUP, patterns = NONE } = props;
  // Destructured before the memo. See docs/explanation/react-workspace.md#labels-resolved-above-the-provider
  const { theme, components, labels, sections, testIdPrefix } = chrome ?? NO_GROUP;
  // RESOLVED HERE TOO, because this half sits ABOVE the provider it feeds.
  const text = useMemo(() => resolveWorkspaceLabels(labels), [labels]);
  const [message, report] = useState<string | null>(null);
  const unreadable = (): void => report(text.notices.unreadableTabs);
  const [tabs, setTabs] = usePersistedTabs(catalogue, props.tabs, text.tabName, unreadable);
  const [active, setActive] = useState<readonly string[]>([]);

  // Reduced OUTSIDE the updater. See docs/explanation/react-workspace.md#reduced-outside-the-updater
  const act = (action: TabsAction<WorkspaceSetup>): void => {
    const next = reduceTabs(tabs, action);
    // The reducer answers a refused duplication with the SAME state, and reading that is a sentence.
    if (next === tabs && action.kind === 'duplicate-active') report(text.notices.tabLimit(MAX_WORKSPACE_TABS));
    setTabs(next);
  };

  const setup = tabs.tabs[tabs.active]?.setup ?? defaultWorkspaceSetup(catalogue);
  const visible = setup.panes.filter((pane) => pane.visible).length;
  const overlays = (setup.showDensity ? 1 : 0) + (setup.showProfile ? 1 : 0);
  const merged = useMemo<readonly WorkspaceSection[]>(
    () => [
      { id: 'panes', label: text.sections.panes, count: visible, Body: PaneListSection },
      { id: 'overlays', label: text.sections.overlays, count: overlays, Body: OverlayTogglesSection },
      { id: 'patterns', label: text.sections.patterns, count: active.length, Body: PatternChipsSection },
      ...(sections ?? NONE),
    ],
    [text, visible, overlays, active.length, sections],
  );

  return (
    <WorkspaceChromeProvider
      theme={theme} components={components} labels={text}
      sections={merged} testIdPrefix={testIdPrefix}
    >
      <WorkspaceSetupProvider
        setup={setup}
        onChange={(patch) => act({ kind: 'update-active', setup: { ...setup, ...patch } })}
      >
        <CandlePatternsProvider patterns={patterns} onActiveChange={setActive}>
          <DrawingRailProvider
            vocabulary={drawing.vocabulary ?? NO_TOOLS} binding={drawing.binding}
            market={drawingScopeKey(data)} onDeleteSelection={drawing.onDeleteSelection}
          >
            <WorkspaceBody of={props} tabs={tabs} act={act} active={active} notice={{ message, report }} />
          </DrawingRailProvider>
        </CandlePatternsProvider>
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
});
