/**
 * What a tab CONTAINS, and how an untrusted payload is coerced onto it.
 * See docs/explanation/tabs.md#why-this-is-not-generic
 */

import { clampDensityTuning } from '../overlays/densityTuning';
import type { DensityTuning } from '../overlays/densityTuning';
import { reconcilePanes } from '../pane/budget';
import type { PaneCatalogueEntry, PaneConfig } from '../pane/budget';
import { MAX_WORKSPACE_TABS } from './workspaceTabs';
import type { TabsState, WorkspaceTab } from './workspaceTabs';

export type WorkspaceLayoutMode = 'foco' | 'grade';

/** A parameter value the host wrote, stored and NEVER read here. See docs/explanation/tabs.md#the-coercion-gate */
export type StudySettings = unknown;

/** The one mode that is not the default. See docs/explanation/tabs.md#mode-values-are-a-wire-format */
const GRID_MODE: WorkspaceLayoutMode = 'grade';

export interface WorkspaceSetup {
  /** `null` = "no preference the current catalogue can honour"; the workspace decides the default. */
  readonly timeframe: string | null;
  readonly layoutMode: WorkspaceLayoutMode;
  /** Timeframes of the cells, read only in grid mode. */
  readonly gridCells: readonly string[];
  readonly panes: readonly PaneConfig[];
  readonly density: DensityTuning;
  readonly showDensity: boolean;
  readonly showProfile: boolean;
  /** A PER-TAB preference like every other. See docs/explanation/tabs.md#auto-fit-is-per-tab */
  readonly autoFit: boolean;
  /** The active studies, IN ORDER. See docs/explanation/tabs.md#a-list-never-a-pool-of-slots */
  readonly indicators: readonly string[];
  /** series -> shape. */
  readonly seriesStyles: Readonly<Record<string, string>>;
  readonly studySettings?: Readonly<Record<string, StudySettings>>;
}

/** Everything the coercion needs that this package cannot know. No field has a default here. */
export interface WorkspaceSetupPolicy {
  readonly catalogue: readonly PaneCatalogueEntry[];
  readonly servedTimeframes: readonly string[];
  /** Cells to fall back to when nothing saved survives reconciliation. */
  readonly gridFallback: readonly string[];
  readonly maxGridCells: number;
  readonly density: DensityTuning;
  readonly showDensity: boolean;
  readonly showProfile: boolean;
  readonly autoFit: boolean;
  /** INJECTED: reading an indicator list is a MIGRATION question, and migration is the host's.
   * See docs/explanation/tabs.md#why-this-is-not-generic */
  readonly coerceIndicators: (raw: unknown, legacy: unknown) => readonly string[];
  /** SIBLING of the above: reading a parameter VALUE names the host's business, so the host reads it. */
  readonly coerceStudySettings?: (
    raw: unknown,
    indicators: readonly string[],
  ) => Readonly<Record<string, StudySettings>>;
}

/** One study moved by one position, or the SAME list when the move has nowhere to land.
 * See docs/explanation/tabs.md#a-list-never-a-pool-of-slots */
export function movedIndicator(
  ids: readonly string[],
  id: string,
  step: -1 | 1,
): readonly string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Values for the studies that ARE in the list, read as OWN properties only — `in` fabricates one. */
const onlyActive = (
  raw: unknown,
  indicators: readonly string[],
): Readonly<Record<string, StudySettings>> | undefined => {
  const source = asRecord(raw);
  const kept: Record<string, StudySettings> = {};
  for (const id of indicators) {
    if (Object.prototype.hasOwnProperty.call(source, id)) kept[id] = source[id];
  }
  return Object.keys(kept).length === 0 ? undefined : kept;
};

const asFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Cells reconciled against the SERVED catalogue, never empty.
 * See docs/explanation/tabs.md#grid-cells-and-what-is-served */
export function reconcileGridCells(
  raw: unknown,
  servedTimeframes: readonly string[],
  fallbackCells: readonly string[],
  maxCells: number,
): string[] {
  const saved = Array.isArray(raw)
    ? raw.filter((cell): cell is string => typeof cell === 'string')
    : [];
  const served = (cells: readonly string[]): string[] =>
    servedTimeframes.length === 0
      ? [...cells]
      : cells.filter((cell) => servedTimeframes.includes(cell));
  const kept = served(saved).slice(0, maxCells);
  if (kept.length > 0) return kept;
  const fallback = served(fallbackCells).slice(0, maxCells);
  if (fallback.length > 0) return fallback;
  return servedTimeframes.length > 0 ? [servedTimeframes[0]] : [...fallbackCells];
}

export function defaultWorkspaceSetup(policy: WorkspaceSetupPolicy): WorkspaceSetup {
  return {
    timeframe: null,
    layoutMode: 'foco',
    gridCells: reconcileGridCells(
      policy.gridFallback,
      policy.servedTimeframes,
      policy.gridFallback,
      policy.maxGridCells,
    ),
    panes: reconcilePanes(null, policy.catalogue),
    density: policy.density,
    showDensity: policy.showDensity,
    showProfile: policy.showProfile,
    autoFit: policy.autoFit,
    indicators: [],
    seriesStyles: {},
  };
}

/** The coercion of ONE setup — the gate every payload crosses.
 * See docs/explanation/tabs.md#the-coercion-gate */
export function coerceWorkspaceSetup(raw: unknown, policy: WorkspaceSetupPolicy): WorkspaceSetup {
  const base = defaultWorkspaceSetup(policy);
  if (raw === null || typeof raw !== 'object') return base;
  const item = raw as Record<string, unknown>;

  const savedTimeframe = typeof item.timeframe === 'string' ? item.timeframe : null;
  const density = asRecord(item.density);
  const styles = asRecord(item.seriesStyles);
  const seriesStyles: Record<string, string> = {};
  for (const key of Object.keys(styles)) {
    const value = styles[key];
    if (typeof value === 'string') seriesStyles[key] = value;
  }

  const indicators = policy.coerceIndicators(item.indicators, item.slots);

  return {
    timeframe:
      savedTimeframe !== null && policy.servedTimeframes.includes(savedTimeframe)
        ? savedTimeframe
        : null,
    layoutMode: item.layoutMode === GRID_MODE ? GRID_MODE : 'foco',
    gridCells: reconcileGridCells(
      item.gridCells,
      policy.servedTimeframes,
      policy.gridFallback,
      policy.maxGridCells,
    ),
    panes: reconcilePanes(item.panes, policy.catalogue),
    density: clampDensityTuning({
      floor: asFiniteNumber(density.floor, policy.density.floor),
      gamma: asFiniteNumber(density.gamma, policy.density.gamma),
    }),
    showDensity: item.showDensity === true,
    showProfile: item.showProfile === true,
    autoFit: item.autoFit === true,
    // NOTE WHAT IS ABSENT: no field naming a market. See docs/explanation/tabs.md#the-coercion-gate
    indicators,
    seriesStyles,
    studySettings: onlyActive(
      policy.coerceStudySettings?.(item.studySettings, indicators) ?? item.studySettings,
      indicators,
    ),
  };
}

/**
 * The tab set a virgin workspace starts with — never empty, and CAPPED here as well as on the way
 * in. See docs/explanation/tabs.md#why-the-fallback-is-not-no-tabs
 */
export function seedWorkspaceTabs(
  initialTabs: readonly WorkspaceTab<WorkspaceSetup>[] | undefined,
  policy: WorkspaceSetupPolicy,
  defaultName: (index: number) => string,
): TabsState<WorkspaceSetup> {
  if (initialTabs !== undefined && initialTabs.length > 0) {
    return { tabs: initialTabs.slice(0, MAX_WORKSPACE_TABS), active: 0 };
  }
  return {
    tabs: [{ id: 'tab-1', name: defaultName(0), setup: defaultWorkspaceSetup(policy) }],
    active: 0,
  };
}
