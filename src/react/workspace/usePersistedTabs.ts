/**
 * The tab set, held across a remount by a store the HOST injects.
 * See docs/explanation/react-workspace.md#nothing-here-touches-platform
 */
import { useEffect, useRef, useState } from 'react';

import { parseTabsLayout, serializeTabsLayout } from '../../tabs/codec';
import { coerceWorkspaceSetup, seedWorkspaceTabs } from '../../tabs/setup';
import type { WorkspaceSetup, WorkspaceSetupPolicy } from '../../tabs/setup';
import type { TabsState, WorkspaceStore } from '../../tabs/workspaceTabs';

/** The format number written on the way out, and demanded on the way in. */
const VERSION = 1;

export interface WorkspaceTabsOptions {
  /** Where the set is kept. Absent, the workspace is memory-only and forgets on unmount. */
  readonly store?: WorkspaceStore;
  /** Override only to share a number with a payload history this package cannot know. */
  readonly version?: number;
  /** An earlier format. See docs/explanation/react-workspace.md#an-earlier-format-may-decline */
  readonly migrate?: (record: Record<string, unknown>) => TabsState<WorkspaceSetup> | null;
  readonly onExport?: () => void;
}

/** The set, and the writer that persists it. Shaped like `useState` because it replaces one. */
export type HeldTabs = readonly [
  TabsState<WorkspaceSetup>,
  (next: TabsState<WorkspaceSetup>) => void,
];

const NO_OPTIONS: WorkspaceTabsOptions = {};

interface Loaded {
  readonly state: TabsState<WorkspaceSetup>;
  /** A payload existed and could not be read. Seeding silently over it would hide the loss. */
  readonly degraded: boolean;
}

function load(
  policy: WorkspaceSetupPolicy,
  options: WorkspaceTabsOptions,
  defaultName: (index: number) => string,
): Loaded {
  let degraded = false;
  const seed = (): TabsState<WorkspaceSetup> => seedWorkspaceTabs(undefined, policy, defaultName);
  const state = parseTabsLayout(options.store?.read() ?? null, {
    version: options.version ?? VERSION,
    coerceSetup: (raw) => coerceWorkspaceSetup(raw, policy),
    defaultName,
    seed,
    fallback: () => {
      degraded = true;
      return seed();
    },
    migrate: options.migrate,
  });
  return { state, degraded };
}

export function usePersistedTabs(
  policy: WorkspaceSetupPolicy,
  options: WorkspaceTabsOptions | undefined,
  defaultName: (index: number) => string,
  onUnreadable: () => void,
): HeldTabs {
  const held = options ?? NO_OPTIONS;
  const [loaded] = useState(() => load(policy, held, defaultName));
  const [state, setState] = useState(loaded.state);

  // By reference. See docs/explanation/react-workspace.md#the-unreadable-report-is-held-by-reference
  const told = useRef(onUnreadable);
  told.current = onUnreadable;
  useEffect(() => {
    if (loaded.degraded) told.current();
  }, [loaded]);

  const set = (next: TabsState<WorkspaceSetup>): void => {
    // A refusal is not a change. See docs/explanation/react-workspace.md#a-refused-edit-is-not-a-change
    if (next === state) return;
    setState(next);
    held.store?.write(serializeTabsLayout(next, held.version ?? VERSION));
  };

  return [state, set];
}
