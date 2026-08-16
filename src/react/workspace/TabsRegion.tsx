/**
 * The tab strip, and the ARIA pair that binds it to the panel it controls.
 * See docs/explanation/react-workspace.md#the-aria-pair-is-minted-by-one-function
 */
import { memo } from 'react';
import type { ReactElement } from 'react';

import type { WorkspaceSetup } from '../../tabs/setup';
import { parseTabsPayload } from '../../tabs/workspaceTabs';
import type { TabsAction, TabsState } from '../../tabs/workspaceTabs';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { WorkspaceTabsBar, workspaceTabButtonId } from '../WorkspaceTabsBar';

/** Vocabulary, plus the one mint the set arithmetic declines to perform on its own. */
export interface TabsRegionNaming {
  readonly mint: (index: number) => { readonly id: string; readonly name: string };
  readonly defaultName: (index: number) => string;
  readonly coerceSetup: (raw: unknown) => WorkspaceSetup;
}

/** What a tabpanel element has to carry to be the panel these tabs control. */
export interface TabPanelAria {
  readonly id: string;
  readonly 'aria-labelledby': string;
}

export interface TabsRegionProps {
  readonly state: TabsState<WorkspaceSetup>;
  readonly onAction: (action: TabsAction<WorkspaceSetup>) => void;
  readonly naming: TabsRegionNaming;
  /** Absent = no export button. The file leaves through the host's platform, never through here. */
  readonly onExport?: () => void;
}

const barPrefix = (prefix: string): string => `${prefix}-tabs`;

/** The pair, from one place. The root spreads the result onto its tabpanel element. */
export function workspaceTabPanelAria(prefix: string, tabId: string): TabPanelAria {
  const bar = barPrefix(prefix);
  return { id: `${bar}-panel`, 'aria-labelledby': workspaceTabButtonId(bar, tabId) };
}

export const TabsRegion = memo(function TabsRegion({ state, onAction, naming, onExport }: TabsRegionProps): ReactElement {
  const { theme, labels, testIdPrefix } = useWorkspaceChrome();
  // Empty when the index names no tab — the same silence the bar keeps, marking no tab selected.
  const pair = workspaceTabPanelAria(testIdPrefix, state.tabs[state.active]?.id ?? '');
  const indexOf = (id: string): number => state.tabs.findIndex((tab) => tab.id === id);

  // The picked file is read HERE and crosses the shared gate, so "loads without loss and stops at
  // the cap" is one rule with one owner instead of a promise each host repeats.
  const readImport = (file: File): void => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const tabs = parseTabsPayload(String(reader.result), naming.coerceSetup, naming.defaultName);
      if (tabs !== null) onAction({ kind: 'replace', tabs });
    };
    reader.readAsText(file);
  };

  return (
    <WorkspaceTabsBar
      tabs={state.tabs.map(({ id, name, setup }) => ({
        id, name, caption: setup.timeframe ?? undefined,
      }))}
      activeIndex={state.active}
      panelId={pair.id}
      onSelect={(index) => onAction({ kind: 'select', index })}
      onClose={(index) => onAction({ kind: 'close', index })}
      onDuplicate={() => onAction({ kind: 'duplicate-active', ...naming.mint(state.tabs.length) })}
      onRename={(id, name) => onAction({ kind: 'rename', index: indexOf(id), name })}
      onExport={onExport}
      onImportFile={readImport}
      labels={labels.tabsBar}
      theme={theme}
      testIdPrefix={barPrefix(testIdPrefix)}
    />
  );
});
