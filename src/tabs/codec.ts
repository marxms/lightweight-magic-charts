/** The tab set on the wire: written and read back. See docs/explanation/tabs.md#the-codec-is-one-job */

import { MAX_WORKSPACE_TABS, sanitizeTabs } from './workspaceTabs';
import type { TabsState, WorkspaceTab } from './workspaceTabs';

export interface TabsCodecOptions<S> {
  /** The number written on the way out, and required on the way in. */
  readonly version: number;
  readonly coerceSetup: (raw: unknown) => S;
  readonly defaultName: (index: number) => string;
  /** Nothing was ever saved. See docs/explanation/tabs.md#seed-and-fallback */
  readonly seed: () => TabsState<S>;
  /** Something was saved and cannot be read. */
  readonly fallback: () => TabsState<S>;
  /** An earlier format, offered every payload whose version is not the current one. */
  readonly migrate?: (record: Record<string, unknown>) => TabsState<S> | null;
}

/** The payload, written. See docs/explanation/tabs.md#active-travels-with-the-tabs */
export function serializeTabsLayout<S>(state: TabsState<S>, version: number): string {
  return JSON.stringify({ version, active: state.active, tabs: state.tabs });
}

/** The payload, read. NEVER throws. See docs/explanation/tabs.md#an-unreadable-payload-degrades */
export function parseTabsLayout<S>(
  payload: string | null,
  options: TabsCodecOptions<S>,
): TabsState<S> {
  if (payload === null) return options.seed();

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return options.fallback();
  }
  if (parsed === null || typeof parsed !== 'object') return options.fallback();
  const record = parsed as Record<string, unknown>;

  if (record.version !== options.version) {
    const migrated = options.migrate?.(record) ?? null;
    return migrated ?? options.fallback();
  }

  const tabs = sanitizeTabs(record.tabs, options.coerceSetup, options.defaultName);
  if (tabs === null) return options.fallback();
  return { tabs, active: clampActive(record.active, tabs.length) };
}

/** The stored index, made safe. See docs/explanation/tabs.md#a-stored-index-out-of-range */
function clampActive(raw: unknown, length: number): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return 0;
  return Math.min(Math.max(0, raw), length - 1);
}

/** The active studies, tolerant of the PREVIOUS field. See docs/explanation/tabs.md#no-version-bump */
export function coerceIndicatorList(raw: unknown, legacy: unknown, laneCount: number): string[] {
  const source = Array.isArray(raw) ? raw : Array.isArray(legacy) ? legacy : [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of source) {
    if (typeof item !== 'string' || item === '' || seen.has(item)) continue;
    seen.add(item);
    list.push(item);
    if (list.length === laneCount) break;
  }
  return list;
}

/** Re-exported so a consumer reading this module knows what caps a written set. */
export { MAX_WORKSPACE_TABS };
export type { TabsState, WorkspaceTab };
