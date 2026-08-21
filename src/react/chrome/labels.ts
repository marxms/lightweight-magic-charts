/**
 * LMC-84 — every sentence the composition can say, in one channel the host can replace.
 * See docs/explanation/react-chrome.md#labels-english-is-the-default-not-the-only-option
 * See docs/explanation/react-chrome.md#labels-the-default-is-whole
 * See docs/explanation/react-chrome.md#labels-text-that-depends-on-a-value-is-a-function
 * See docs/explanation/react-chrome.md#labels-this-module-imports-nothing-at-runtime
 */
import type { PriceAlert } from '../../alerts/priceAlerts';
import type { CompactCellLabels } from '../CompactCell';
import type { DensityControlLabels } from '../DensityControls';
import type { DrawingToolbarLabels } from '../DrawingToolbar';
import type { SeriesMenuLabels } from '../SeriesMenu';
import type { WorkspaceTabsBarLabels } from '../WorkspaceTabsBar';

/** The rail's three own sections, named. A host adding sections names its own. */
export interface WorkspaceSectionLabels {
  readonly panes: string;
  readonly overlays: string;
  readonly patterns: string;
}

/** One per writer of the error channel. Each names what the reader cannot see on the canvas. */
export interface WorkspaceNoticeLabels {
  readonly noBars: (symbol: string) => string;
  readonly unverifiedSeam: (symbol: string) => string;
  readonly degenerate: (px: number) => string;
  readonly studyLimit: (capacity: number) => string;
  /** OPTIONAL, so a host that typed the whole group before this member existed still compiles. */
  readonly duplicateStudy?: (name: string) => string;
  readonly tabLimit: (capacity: number) => string;
  readonly unreadableTabs: string;
}

/** The authored panes, one row each: a switch, a drag handle and a pair of arrows. */
export interface PaneListLabels {
  readonly group: string;
  readonly show: (pane: string) => string;
  readonly up: (pane: string) => string;
  readonly down: (pane: string) => string;
  readonly row: (pane: string, at: number, of: number) => string;
  readonly handle: string;
}

export interface OverlayTogglesLabels {
  readonly density: string;
  readonly profile: string;
}

export interface PatternChipsLabels {
  readonly group: string;
}

export interface GridControlsLabels {
  readonly mode: string;
  readonly addCell: string;
}

export interface PrimaryActionsLabels {
  readonly autoFit: string;
  readonly addPriceLine: string;
}

export interface SymbolTriggerLabels {
  /** The accessible name. Receives the raw symbol, which is empty when nothing is chosen. */
  readonly trigger: (symbol: string) => string;
  /** The visible face while nothing is chosen — a blank chip offers nothing to aim at. */
  readonly empty: string;
}

export interface StatusFooterLabels {
  readonly loading: string;
  readonly shrunk: (percent: number) => string;
  readonly evicted: (panes: readonly string[]) => string;
  readonly alerts: (names: readonly string[]) => string;
}

export interface StylePickerLabels {
  readonly trigger: string;
  readonly group: (series: string) => string;
  readonly shape: (shape: string, series: string) => string;
}

/** The studies trigger and the panel of what is already chosen — not the catalogue below it. */
export interface StudiesPanelLabels {
  readonly trigger: string;
  readonly panel: (chosen: number, capacity: number) => string;
  readonly none: string;
  readonly remove: (name: string) => string;
  readonly up: (name: string) => string;
  readonly down: (name: string) => string;
  readonly noData: string;
  readonly warmUp: (warmUpBars: number, windowBars: number) => string;
  readonly truncated: (drawn: number, total: number) => string;
}

/** The whole contract, grouped by the component that speaks each group.
 * See docs/explanation/react-chrome.md#labels-why-the-groups-mirror-the-components */
export interface WorkspaceChromeLabels {
  /** Accessible name of the button that dismisses a `Notice`. */
  readonly dismiss: string;
  readonly workspace: (symbol: string) => string;
  readonly canvas: (symbol: string) => string;
  readonly state: (symbol: string, timeframe: string, panes: number) => string;
  readonly tabName: (index: number) => string;
  /** A lane nothing occupies is never visible, so this is the label of last resort. */
  readonly laneTitle: string;
  /** Accessible name of the interval chips. */
  readonly interval: string;
  /** The tag on a level the user placed. Receives the whole alert; NEVER writes `id`.
   * See docs/explanation/alerts.md#the-axis-label-is-text-never-the-id */
  readonly priceAlert: (alert: PriceAlert) => string;
  readonly sections: WorkspaceSectionLabels;
  readonly notices: WorkspaceNoticeLabels;
  readonly panes: PaneListLabels;
  readonly overlays: OverlayTogglesLabels;
  readonly patterns: PatternChipsLabels;
  readonly grid: GridControlsLabels;
  readonly primary: PrimaryActionsLabels;
  readonly symbol: SymbolTriggerLabels;
  readonly status: StatusFooterLabels;
  readonly style: StylePickerLabels;
  readonly studies: StudiesPanelLabels;
  readonly seriesMenu: SeriesMenuLabels;
  readonly tabsBar: WorkspaceTabsBarLabels;
  readonly drawingToolbar: DrawingToolbarLabels;
  readonly compactCell: CompactCellLabels;
  readonly density: DensityControlLabels;
}

/**
 * What a host may bring: any member, at either level, and never all of them.
 * See docs/explanation/react-chrome.md#labels-why-each-group-is-partial
 */
export type WorkspaceLabelOverrides = {
  readonly [K in keyof WorkspaceChromeLabels]?: WorkspaceChromeLabels[K] extends (
    ...args: never[]
  ) => unknown
    ? WorkspaceChromeLabels[K]
    : WorkspaceChromeLabels[K] extends object
      ? Partial<WorkspaceChromeLabels[K]>
      : WorkspaceChromeLabels[K];
};

/**
 * ICU FORMATTING, FROM THE PLATFORM — the defect this fixes is grammar, not vocabulary.
 * See docs/explanation/react-chrome.md#labels-icu-formatting-comes-from-the-platform
 */
const plural = (locale: string | undefined, count: number, one: string, other: string): string =>
  `${count} ${new Intl.PluralRules(locale).select(count) === 'one' ? one : other}`;

const listed = (locale: string | undefined, items: readonly string[]): string =>
  new Intl.ListFormat(locale).format(items);

const decimal = (locale: string | undefined, value: number, digits: number): string =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

/** The whole default, built for one locale. Absent means the runtime's own. */
/**
 * The magnet's word, held apart because `DrawingToolbarLabels.magnet` is OPTIONAL: a rail written
 * before the magnet existed hands over a FULL `DrawingToolbarLabels` and must still compile, so the
 * toolbar falls back to this rather than drawing a control with no name.
 * See docs/explanation/react.md#the-optional-close-label
 */
export const DEFAULT_MAGNET_LABEL = 'Magnet';

/**
 * THE ONE SENTENCE FOR A HOOK MOUNTED OUTSIDE ITS PROVIDER — a diagnostic, not a label.
 *
 * Four contexts each spelled it their own way, and one rule in four places is four to keep in step.
 * See docs/explanation/react-workspace.md#the-rail-throws-outside-its-provider
 */
export const duplicateStudyNotice = (name: string): string =>
  `${name} is already on the chart.`;

export const outsideProvider = (hook: string, provider: string): string =>
  `${hook} was called outside ${provider}. Mount the provider above the regions that read it.`;

export function workspaceChromeLabels(locale?: string): WorkspaceChromeLabels {
  return {
    dismiss: 'Dismiss',
    workspace: (symbol) => `Chart workspace — ${symbol === '' ? 'no market' : symbol}`,
    canvas: (symbol) => `Chart of ${symbol === '' ? 'no market' : symbol}`,
    state: (symbol, timeframe, panes) =>
      `${symbol === '' ? 'No market' : symbol} · ${timeframe === '' ? 'no interval' : timeframe} · ${plural(locale, panes, 'pane', 'panes')}`,
    tabName: (index) => `Tab ${index + 1}`,
    laneTitle: 'Study',
    interval: 'Timeframe',
    priceAlert: (alert) => (alert.triggered ? 'Alert ✓' : 'Alert'),
    sections: { panes: 'Panes', overlays: 'Overlays', patterns: 'Patterns' },
    notices: {
      noBars: (symbol) => `No bars for ${symbol}.`,
      unverifiedSeam: (symbol) =>
        `History could not be proven aligned to the live feed for ${symbol}.`,
      degenerate: (px) => `The height budget leaves ${px}px for the chart, which cannot hold one.`,
      studyLimit: (capacity) => `Study limit of ${capacity} reached — remove one first.`,
      duplicateStudy: duplicateStudyNotice,
      tabLimit: (capacity) => `Tab limit of ${capacity} reached.`,
      unreadableTabs: 'The saved layout could not be read, so this workspace opened on the defaults.',
    },
    panes: {
      group: 'Visible panes',
      show: (pane) => `Show ${pane}`,
      up: (pane) => `Move ${pane} up`,
      down: (pane) => `Move ${pane} down`,
      row: (pane, at, of) => `${pane}, position ${at} of ${of}`,
      handle: 'drag to reorder',
    },
    overlays: { density: 'Liquidation heatmap', profile: 'Profile' },
    patterns: { group: 'Candle patterns' },
    grid: { mode: 'Grid', addCell: 'Add a cell' },
    primary: { autoFit: 'Auto-fit', addPriceLine: 'Add line' },
    symbol: {
      trigger: (symbol) => (symbol === '' ? 'Choose a market' : `Market: ${symbol}`),
      empty: 'Market',
    },
    status: {
      loading: 'Loading… ',
      shrunk: (percent) => ` · panes reduced to ${decimal(locale, percent, 0)}%`,
      evicted: (panes) => ` · panes collapsed for want of height: ${listed(locale, panes)}`,
      alerts: (names) => ` · alert fired: ${listed(locale, names)}`,
    },
    style: {
      trigger: 'Series style',
      group: (series) => `Style of ${series}`,
      shape: (shape, series) => `Draw ${series} as ${shape}`,
    },
    studies: {
      trigger: 'Studies',
      panel: (chosen, capacity) => `Active studies ${chosen}/${capacity}`,
      none: 'Nothing chosen — pick one below to draw it.',
      remove: (name) => `Remove ${name}`,
      up: (name) => `Move ${name} up`,
      down: (name) => `Move ${name} down`,
      noData: 'no data in this window',
      warmUp: (warmUpBars, windowBars) =>
        `warms up after ${warmUpBars} of ${plural(locale, windowBars, 'bar', 'bars')}`,
      truncated: (drawn, total) => `${drawn} of ${plural(locale, total, 'line', 'lines')}`,
    },
    seriesMenu: {
      title: 'Series',
      search: 'Search series',
      searchResults: 'Search results',
      categories: 'Categories',
      chosenCount: (chosen, capacity) =>
        capacity === null ? `${chosen}` : `${chosen}/${capacity}`,
      atCapacity: 'at capacity — remove one before adding another',
      empty: 'nothing matches',
      close: 'Close',
    },
    tabsBar: {
      group: 'Workspace tabs',
      duplicate: 'Duplicate the current tab',
      close: (name) => `Close ${name}`,
      lastTabClose: 'The last tab cannot be closed',
      exportAction: 'export',
      importAction: 'import',
      importTitle: 'Load a JSON file — REPLACES the current tabs',
      rename: (name) => `Rename ${name}`,
      renameHint: 'Double-click to rename',
    },
    drawingToolbar: {
      group: 'Drawing tools',
      cursor: 'Cursor',
      deleteSelection: 'Delete selected',
      clearAll: 'Clear all',
      magnet: DEFAULT_MAGNET_LABEL,
      allTools: 'All tools',
      otherTools: 'Other tools',
      count: (drawings) => `${drawings}`,
    },
    compactCell: {
      timeframeGroup: (title) => `Timeframe of ${title}`,
      remove: (title) => `Remove the ${title} cell`,
      status: (bars, changePct) =>
        `${plural(locale, bars, 'bar', 'bars')} · ${changePct >= 0 ? '+' : ''}${decimal(locale, changePct, 2)}%`,
      chart: (title, timeframe) => `${title} · ${timeframe}`,
      empty: 'no bars',
      error: 'error',
      loading: '…',
    },
    density: {
      floor: 'floor',
      boost: 'boost',
      reset: 'default',
      group: 'Density field',
      readout: (gamma) => `γ ${decimal(locale, gamma, 1)}`,
    },
  };
}

export const DEFAULT_WORKSPACE_CHROME_LABELS: WorkspaceChromeLabels = workspaceChromeLabels();

/**
 * The default, with whatever the host brought written over it — member by member, at both levels.
 * See docs/explanation/react-chrome.md#labels-filled-merges-member-by-member-never-by-spread
 */
function filled<T extends object>(defaults: T, given: Readonly<Record<string, unknown>>): T {
  const merged: Record<string, unknown> = { ...(defaults as Readonly<Record<string, unknown>>) };
  for (const key of Object.keys(given)) {
    const value = given[key];
    if (value === undefined) continue;
    const fallback = merged[key];
    merged[key] =
      typeof value === 'object' && value !== null && typeof fallback === 'object' && fallback !== null
        ? filled(fallback, value as Readonly<Record<string, unknown>>)
        : value;
  }
  return merged as T;
}

export function resolveWorkspaceLabels(
  overrides?: WorkspaceLabelOverrides,
  locale?: string,
): WorkspaceChromeLabels {
  const base =
    locale === undefined ? DEFAULT_WORKSPACE_CHROME_LABELS : workspaceChromeLabels(locale);
  return overrides === undefined ? base : filled(base, overrides);
}

/** What the seed decided, in words — or `null`, which clears the channel it writes to. */
/**
 * The notice reads the SEED OUTCOME, not the seam state. Those are two vocabularies — `SeamState` is
 * `none | anchored | unanchored`, `SeedVerdict` is `verified | stale | unverifiable` — and comparing
 * one against a member of the other is a test no value can pass.
 * See docs/explanation/react-chrome.md#the-notice-reads-the-outcome-not-the-seam
 */
export function laneNotice(
  notices: WorkspaceNoticeLabels,
  bars: number,
  outcome: string | null,
  symbol: string,
): string | null {
  if (bars === 0) return notices.noBars(symbol);
  // ONE outcome earns the warning: seeded, live, and the producer sent a cursor with no anchor.
  return outcome === 'seeded-unverified' ? notices.unverifiedSeam(symbol) : null;
}
