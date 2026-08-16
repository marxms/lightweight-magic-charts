/**
 * Workspace tabs — the SET arithmetic, browser-free. A tab is a whole SETUP, generic over what it
 * contains; persistence and export are PORTS.
 * See docs/explanation/tabs.md#set-arithmetic-browser-free and docs/explanation/tabs.md#no-instrument-in-a-tab
 */

/** Where a tab set is kept. The browser is an ADAPTER of this, never a dependency of the rules. */
export interface WorkspaceStore {
  read(): string | null;
  write(payload: string): void;
}

/** How a tab set leaves the machine. Same reason, same shape. */
export interface WorkspaceExporter {
  download(filename: string, payload: string): void;
}

export interface WorkspaceTab<S> {
  readonly id: string;
  readonly name: string;
  /** The whole setup the tab restores. Opaque here; shaped and coerced by the host. */
  readonly setup: S;
}

export interface TabsState<S> {
  readonly tabs: readonly WorkspaceTab<S>[];
  readonly active: number;
}

/** Bounds that keep a hand-edited or hostile file from wedging the UI. */
export const MAX_WORKSPACE_TABS = 24;
export const MAX_TAB_NAME = 40;

export type TabsAction<S> =
  | { readonly kind: 'select'; readonly index: number }
  /** The "+" button: clones the ACTIVE tab's setup. The id is minted by the caller (impure). */
  | { readonly kind: 'duplicate-active'; readonly id: string; readonly name: string }
  | { readonly kind: 'close'; readonly index: number }
  | { readonly kind: 'rename'; readonly index: number; readonly name: string }
  | { readonly kind: 'update-active'; readonly setup: S }
  /** Import: REPLACES rather than merges — merging needs a collision rule nobody stated. */
  | { readonly kind: 'replace'; readonly tabs: readonly WorkspaceTab<S>[] };

const clampIndex = (index: number, length: number): number =>
  Math.min(Math.max(0, index), Math.max(0, length - 1));

export function reduceTabs<S>(state: TabsState<S>, action: TabsAction<S>): TabsState<S> {
  switch (action.kind) {
    case 'select':
      return { ...state, active: clampIndex(action.index, state.tabs.length) };

    case 'duplicate-active': {
      if (state.tabs.length >= MAX_WORKSPACE_TABS) return state;
      const source = state.tabs[state.active];
      if (source === undefined) return state;
      const clone: WorkspaceTab<S> = {
        id: action.id,
        name: action.name.slice(0, MAX_TAB_NAME),
        setup: source.setup,
      };
      return { tabs: [...state.tabs, clone], active: state.tabs.length };
    }

    case 'close': {
      // The last tab is not closable. See docs/explanation/tabs.md#the-last-tab-is-not-closable
      if (state.tabs.length <= 1) return state;
      const index = clampIndex(action.index, state.tabs.length);
      const tabs = state.tabs.filter((_, at) => at !== index);
      // Follow the SAME tab the user was on. See docs/explanation/tabs.md#selection-follows-the-same-tab
      const active =
        index > state.active
          ? state.active
          : index < state.active
            ? state.active - 1
            : Math.min(state.active, tabs.length - 1);
      return { tabs, active };
    }

    case 'rename': {
      const index = clampIndex(action.index, state.tabs.length);
      const target = state.tabs[index];
      if (target === undefined) return state;
      // Trimmed BEFORE the cut: whitespace at the edges must not eat into the name's budget.
      const name = action.name.trim().slice(0, MAX_TAB_NAME);
      // A blank name is a REFUSAL, not an "unnamed tab", and the SAME object is returned on
      // purpose. See docs/explanation/tabs.md#a-blank-rename-is-a-refusal
      if (name === '' || name === target.name) return state;
      const tabs = state.tabs.map((tab, at) => (at === index ? { ...tab, name } : tab));
      return { ...state, tabs };
    }

    case 'update-active': {
      const tabs = state.tabs.map((tab, at) =>
        at === state.active ? { ...tab, setup: action.setup } : tab,
      );
      return { ...state, tabs };
    }

    case 'replace':
      return action.tabs.length === 0
        ? state
        : { tabs: action.tabs.slice(0, MAX_WORKSPACE_TABS), active: 0 };
  }
}

/**
 * The single gate every tab crosses on the way IN; `null` = not a usable list at all.
 * See docs/explanation/tabs.md#the-single-gate-on-the-way-in
 */
export function sanitizeTabs<S>(
  parsed: unknown,
  coerceSetup: (raw: unknown) => S,
  defaultName: (index: number) => string = (index) => `Tab ${index + 1}`,
): WorkspaceTab<S>[] | null {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const seen = new Set<string>();
  return parsed.slice(0, MAX_WORKSPACE_TABS).map((raw, index): WorkspaceTab<S> => {
    const item = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const id = typeof item.id === 'string' && item.id !== '' ? item.id : `tab-${index + 1}`;
    const minted = seen.has(id) ? `tab-dup-${index}-${id}` : id;
    seen.add(minted);
    return {
      id: minted,
      name:
        typeof item.name === 'string' && item.name !== ''
          ? item.name.slice(0, MAX_TAB_NAME)
          : defaultName(index),
      // The whole raw ENTRY, not a `setup` sub-field. See docs/explanation/tabs.md#the-whole-raw-entry
      setup: coerceSetup(item.setup !== undefined ? item.setup : item),
    };
  });
}

/** The export payload: the tabs, pretty-printed — the file is the backup the store is not. */
export function exportTabsPayload<S>(tabs: readonly WorkspaceTab<S>[]): string {
  return JSON.stringify(tabs, null, 2);
}

export function exportTabsToFile<S>(
  tabs: readonly WorkspaceTab<S>[],
  filename: string,
  exporter: WorkspaceExporter,
): void {
  exporter.download(filename, exportTabsPayload(tabs));
}

/** Text -> sanitized tabs, or `null` if unusable. Malformed JSON is a bad file, never a crash. */
export function parseTabsPayload<S>(
  text: string,
  coerceSetup: (raw: unknown) => S,
  defaultName?: (index: number) => string,
): WorkspaceTab<S>[] | null {
  try {
    return sanitizeTabs(JSON.parse(text), coerceSetup, defaultName);
  } catch {
    return null;
  }
}
