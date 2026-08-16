/**
 * How tall a pane may be, and what a saved pane list means against the catalogue of today.
 * See docs/explanation/pane.md#the-reconciliation-policy-was-hidden-in-a-hook
 * See docs/explanation/pane.md#what-the-consumer-still-owns
 */

import { paneId } from '../domain/types';
import type { PaneSpec } from '../domain/types';

/** A saved height below this is unreadable; above it, a pane eats the price. Bounds on STORAGE. */
export const MIN_PANE_HEIGHT_PX = 40;
export const MAX_PANE_HEIGHT_PX = 400;

/** The per-pane legibility floor, not the storage clamp. See docs/explanation/pane.md#two-floors-and-why-they-differ */
export const DEFAULT_INDICATOR_FLOOR_PX = 56;

/** What the current build actually offers. Reconciliation is against THIS, never against the file. */
export interface PaneCatalogueEntry {
  readonly id: string;
  readonly defaultVisible: boolean;
  readonly heightPx: number;
  /** What the pane is CALLED. Absent, the identifier answers. See docs/explanation/pane.md#the-honest-fallback-title */
  readonly title?: string;
}

/** What a pane asks for when it declares no target height of its own. */
export const DEFAULT_CATALOGUE_HEIGHT_PX = 90;

/** The shape a catalogue entry is minted FROM: any pane whose spec declares these three. */
export interface CataloguedPane {
  readonly spec: {
    readonly id: string | number;
    readonly defaultVisible: boolean;
    readonly targetHeightPx?: number;
    readonly title?: string;
  };
}

/** INVARIANT: the entry lives here, not in `catalogue/`. See docs/explanation/pane.md#the-entry-is-a-pane-fact */
export function toCatalogueEntry(pane: CataloguedPane): PaneCatalogueEntry {
  return {
    id: String(pane.spec.id),
    defaultVisible: pane.spec.defaultVisible,
    heightPx: pane.spec.targetHeightPx ?? DEFAULT_CATALOGUE_HEIGHT_PX,
    title: pane.spec.title,
  };
}

/** No series at all, hoisted: a minted spec is a new object, the emptiness inside it is not. */
const NO_SERIES: readonly never[] = [];

/** The pane an entry DESCRIBES when the host declared no spec. See docs/explanation/pane.md#an-empty-labelled-strip */
export function mintedPaneSpec(entry: PaneCatalogueEntry): PaneSpec {
  return {
    id: paneId(entry.id), title: entry.title ?? entry.id, series: NO_SERIES,
    format: { kind: 'price', minMove: 0.01 },
    targetHeightPx: entry.heightPx, defaultVisible: entry.defaultVisible,
  };
}

/** One pane, as the payload stores it. */
export interface PaneConfig {
  readonly id: string;
  readonly visible: boolean;
  readonly heightPx: number;
  /** Carried from TODAY'S catalogue, never off the payload. See docs/explanation/pane.md#the-title-never-travels */
  readonly title?: string;
}

export interface PaneLayout {
  readonly version: number;
  readonly panes: readonly PaneConfig[];
  /** `null` = "no preference the current catalogue can honour"; the caller decides the default. */
  readonly timeframe: string | null;
}

/** A stored height is a REQUEST: non-numeric or out of bounds falls back rather than throwing. */
export function clampPaneHeight(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(MAX_PANE_HEIGHT_PX, Math.max(MIN_PANE_HEIGHT_PX, Math.round(raw)));
}

export function defaultPaneLayout(
  catalogue: readonly PaneCatalogueEntry[],
  version: number,
): PaneLayout {
  return {
    version,
    panes: catalogue.map((entry) => ({
      id: entry.id,
      visible: entry.defaultVisible,
      heightPx: clampPaneHeight(entry.heightPx, entry.heightPx),
      title: entry.title,
    })),
    timeframe: null,
  };
}

/** The pane half of the reconciliation. See docs/explanation/pane.md#known-kept-unknown-dropped-new-appended */
export function reconcilePanes(
  raw: unknown,
  catalogue: readonly PaneCatalogueEntry[],
): PaneConfig[] {
  const savedPanes = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, PaneCatalogueEntry>(catalogue.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const panes: PaneConfig[] = [];

  for (const entry of savedPanes) {
    if (typeof entry !== 'object' || entry === null) continue;
    const saved = entry as Record<string, unknown>;
    const id = typeof saved.id === 'string' ? saved.id : null;
    // An id the build no longer has, or a second copy of one it does: dropped.
    if (id === null || seen.has(id)) continue;
    const known = byId.get(id);
    if (known === undefined) continue;
    seen.add(id);
    panes.push({
      id,
      visible: typeof saved.visible === 'boolean' ? saved.visible : known.defaultVisible,
      heightPx: clampPaneHeight(saved.heightPx, known.heightPx),
      // From `known`, never from `saved`: the catalogue names the pane, the payload only remembers it.
      title: known.title,
    });
  }

  // Whatever the catalogue gained since the save is APPENDED, on its own default.
  for (const entry of catalogue) {
    if (seen.has(entry.id)) continue;
    panes.push({
      id: entry.id,
      visible: entry.defaultVisible,
      heightPx: clampPaneHeight(entry.heightPx, entry.heightPx),
      title: entry.title,
    });
  }

  return panes;
}

/** Coerce an arbitrary payload onto the CURRENT catalogue. See docs/explanation/pane.md#refused-whole-never-migrated */
export function reconcilePaneLayout(
  raw: unknown,
  catalogue: readonly PaneCatalogueEntry[],
  servedTimeframes: readonly string[],
  version: number,
): PaneLayout {
  const fallback = defaultPaneLayout(catalogue, version);
  if (typeof raw !== 'object' || raw === null) return fallback;
  const record = raw as Record<string, unknown>;
  if (record.version !== version) return fallback;

  const panes = reconcilePanes(record.panes, catalogue);

  // NOTE WHAT IS NOT READ: a field naming a market. See docs/explanation/pane.md#no-field-naming-a-market
  const savedTimeframe = typeof record.timeframe === 'string' ? record.timeframe : null;
  const timeframe =
    savedTimeframe !== null && servedTimeframes.includes(savedTimeframe) ? savedTimeframe : null;

  return { version, panes, timeframe };
}

/** Same rules, over a JSON string. Malformed input is a missing configuration, never a crash. */
export function parsePaneLayout(
  payload: string | null,
  catalogue: readonly PaneCatalogueEntry[],
  servedTimeframes: readonly string[],
  version: number,
): PaneLayout {
  if (payload === null) return reconcilePaneLayout(null, catalogue, servedTimeframes, version);
  try {
    return reconcilePaneLayout(JSON.parse(payload), catalogue, servedTimeframes, version);
  } catch {
    return reconcilePaneLayout(null, catalogue, servedTimeframes, version);
  }
}
