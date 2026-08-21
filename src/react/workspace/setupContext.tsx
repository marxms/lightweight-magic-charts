/**
 * Workspace setup, readable only through a selector.
 * See docs/explanation/react-workspace.md#a-stable-handle-never-the-value
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode } from 'react';

import type { WorkspaceSetup } from '../../tabs/setup';
import { outsideProvider } from '../chrome/labels';

interface WorkspaceSetupStore {
  subscribe(listener: () => void): () => void;
  read(): WorkspaceSetup;
  write(patch: Partial<WorkspaceSetup>): void;
}

const WorkspaceSetupContext = createContext<WorkspaceSetupStore | null>(null);

export interface WorkspaceSetupProviderProps {
  /** The active tab's setup. It changes; the handle carrying it does not. */
  readonly setup: WorkspaceSetup;
  /** Where a region's write goes. See docs/explanation/react-workspace.md#read-only-mounting-throws-on-write */
  readonly onChange?: (patch: Partial<WorkspaceSetup>) => void;
  readonly children: ReactNode;
}

export const WorkspaceSetupProvider = memo(function WorkspaceSetupProvider({
  setup,
  onChange,
  children,
}: WorkspaceSetupProviderProps): ReactElement {
  const current = useRef(setup);
  const apply = useRef(onChange);
  apply.current = onChange;
  const listeners = useRef<Set<() => void>>(new Set());

  // See docs/explanation/react-workspace.md#written-during-render-and-again-at-commit
  current.current = setup;

  const store = useMemo<WorkspaceSetupStore>(
    () => ({
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
      read: () => current.current,
      // Read from the ref. See docs/explanation/react-workspace.md#the-write-door-reads-from-a-ref
      write: (patch) => {
        if (apply.current === undefined) {
          throw new Error(
            'WorkspaceSetupProvider was mounted without onChange, and a region tried to write the ' +
              'setup. Pass onChange, or mount regions that only read.',
          );
        }
        apply.current(patch);
      },
    }),
    [],
  );

  // Written again at commit time, and listeners are copied before they are notified.
  useEffect(() => {
    current.current = setup;
    for (const listener of Array.from(listeners.current)) listener();
  }, [setup]);

  return <WorkspaceSetupContext.Provider value={store}>{children}</WorkspaceSetupContext.Provider>;
});

/** The only read door. See docs/explanation/react-workspace.md#one-field-per-call */
export function useWorkspaceSetup<T>(select: (setup: WorkspaceSetup) => T): T {
  const store = useContext(WorkspaceSetupContext);
  if (store === null) {
    throw new Error(outsideProvider('useWorkspaceSetup', 'WorkspaceSetupProvider'));
  }
  const read = (): T => select(store.read());
  return useSyncExternalStore(store.subscribe, read, read);
}

/** The write door, and it is a PATCH. See docs/explanation/react-workspace.md#the-write-door-is-a-patch */
export function useWorkspaceSetupWriter(): (patch: Partial<WorkspaceSetup>) => void {
  const store = useContext(WorkspaceSetupContext);
  if (store === null) {
    throw new Error(outsideProvider('useWorkspaceSetupWriter', 'WorkspaceSetupProvider'));
  }
  return store.write;
}
