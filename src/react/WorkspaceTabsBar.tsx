/**
 * The tab strip over a workspace — presentation only; the set arithmetic lives in
 * `tabs/workspaceTabs.ts`. See docs/explanation/react.md#what-the-bar-declares-and-what-it-does-not
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import { DEFAULT_WORKSPACE_CHROME_LABELS } from './chrome/labels';
import { nextRovingIndex } from './chrome/rovingFocus';
import { CENTER_ROW, DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from './theme';

/** What the bar needs to draw one tab. The setup itself never reaches this component. */
export interface WorkspaceTabsBarItem {
  readonly id: string;
  readonly name: string;
  /** Small dimmed suffix after the name — the host typically states the tab's timeframe. */
  readonly caption?: string;
}

export interface WorkspaceTabsBarLabels {
  readonly group: string;
  readonly duplicate: string;
  readonly close: (name: string) => string;
  readonly lastTabClose: string;
  readonly exportAction: string;
  readonly importAction: string;
  readonly importTitle: string;
  /** Accessible name of the rename field. A bare text box says nothing about WHICH tab it edits. */
  readonly rename: (name: string) => string;
  /** Double click is invisible affordance; the tooltip is the only place it is announced. */
  readonly renameHint: string;
}

/** The same object the whole contract carries — a second copy would drift on the first edit. */
export const DEFAULT_WORKSPACE_TABS_BAR_LABELS: WorkspaceTabsBarLabels =
  DEFAULT_WORKSPACE_CHROME_LABELS.tabsBar;

export interface WorkspaceTabsBarProps {
  readonly tabs: readonly WorkspaceTabsBarItem[];
  readonly activeIndex: number;
  /** The id of the tabpanel element the tabs control — the host renders that panel. */
  readonly panelId: string;
  readonly onSelect: (index: number) => void;
  readonly onClose: (index: number) => void;
  readonly onDuplicate: () => void;
  /**
   * A confirmed new name for a tab. OPTIONAL, by ID and never blank.
   * See docs/explanation/react.md#renaming-by-id-and-never-by-index
   */
  readonly onRename?: (id: string, name: string) => void;
  /** Export/import are omitted together with their buttons when the host wires neither. */
  readonly onExport?: () => void;
  readonly onImportFile?: (file: File) => void;
  readonly labels?: WorkspaceTabsBarLabels;
  readonly theme?: WorkspaceTheme;
  readonly testIdPrefix?: string;
}

/** The id the host points `aria-labelledby` at from its tabpanel. */
export function workspaceTabButtonId(testIdPrefix: string, tabId: string): string {
  return `${testIdPrefix}-tab-btn-${tabId}`;
}

/** The rename field's OWN id — never the tab's. See the editor block for why that matters. */
function workspaceTabRenameId(testIdPrefix: string, tabId: string): string {
  return `${testIdPrefix}-rename-input-${tabId}`;
}

export function WorkspaceTabsBar({
  tabs,
  activeIndex,
  panelId,
  onSelect,
  onClose,
  onDuplicate,
  onRename,
  onExport,
  onImportFile,
  labels = DEFAULT_WORKSPACE_TABS_BAR_LABELS,
  theme = DEFAULT_WORKSPACE_THEME,
  testIdPrefix = 'workspace-tabs',
}: WorkspaceTabsBarProps): ReactElement {
  /** The real file picker; the visible import button forwards its click. */
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const lastTab = tabs.length <= 1;

  /** Which tab is under edit, by ID — an index would follow a close onto the wrong tab. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * "This edit session is already decided." Stops the trailing blur from committing twice.
   * See docs/explanation/react.md#the-settled-mark-that-stops-a-double-commit
   */
  const settledRef = useRef(false);

  useEffect(() => {
    if (editingId === null) return;
    const node = renameInputRef.current;
    if (node === null) return;
    node.focus();
    // Selected whole: renaming is usually REPLACING.
    node.select();
    // Keyed on the SESSION, not the draft: per keystroke it would re-select what was just typed.
  }, [editingId]);

  const startEditing = (tab: WorkspaceTabsBarItem): void => {
    if (onRename === undefined) return;
    settledRef.current = false;
    setEditingId(tab.id);
    setDraft(tab.name);
  };

  const commitEditing = (tab: WorkspaceTabsBarItem): void => {
    settledRef.current = true;
    setEditingId(null);
    const name = draft.trim();
    // Blank is REFUSED, never "a tab with no name". Same for a name that did not change.
    if (name === '' || name === tab.name) return;
    onRename?.(tab.id, name);
  };

  const cancelEditing = (): void => {
    settledRef.current = true;
    setEditingId(null);
  };

  /**
   * The traversal `role="tablist"` promised, with MANUAL activation: the arrow moves the FOCUS and
   * does not switch the tab. See docs/explanation/react.md#the-traversal-the-role-promised
   */
  const listRef = useRef<HTMLDivElement | null>(null);
  const onTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const next = nextRovingIndex(
      event.key,
      nodes.indexOf(document.activeElement as HTMLElement),
      nodes.length,
      'horizontal',
    );
    if (next === null) return;
    // Only after knowing the key is ours: a rename field and a chart read keys of their own.
    event.preventDefault();
    nodes[next]?.focus();
  };

  const actionStyle: CSSProperties = {
    padding: '5px 8px',
    cursor: 'pointer',
    fontSize: 10.5,
    border: 'none',
    background: 'transparent',
    color: theme.text,
    opacity: 0.7,
  };

  return (
    <div
      data-testid={testIdPrefix}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        fontFamily: theme.fontFamily,
      }}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label={labels.group}
        aria-orientation="horizontal"
        onKeyDown={onTabsKeyDown}
        style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}
      >
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            role="presentation"
            data-testid={`${testIdPrefix}-tab-${index}`}
            style={{
              ...CENTER_ROW,
              borderBottom: `2px solid ${index === activeIndex ? theme.accent : 'transparent'}`,
              background: index === activeIndex ? theme.accentFill : 'transparent',
            }}
          >
            {/* THE TAB IS NEVER REPLACED BY THE FIELD — the field is laid OVER it.
                See docs/explanation/react.md#the-field-is-laid-over-the-tab-and-never-replaces-it */}
            <span style={{ position: 'relative', display: 'flex' }}>
              <button
                type="button"
                role="tab"
                id={workspaceTabButtonId(testIdPrefix, tab.id)}
                aria-selected={index === activeIndex}
                aria-controls={panelId}
                // The list has ONE tab stop, and it is the active tab.
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => onSelect(index)}
                onDoubleClick={onRename === undefined ? undefined : () => startEditing(tab)}
                title={onRename === undefined ? undefined : labels.renameHint}
                style={{
                  padding: '6px 4px 6px 12px',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  border: 'none',
                  background: 'transparent',
                  color: index === activeIndex ? theme.accentText : theme.text,
                }}
              >
                {tab.name}
                {tab.caption !== undefined && (
                  <span style={{ opacity: 0.55, marginLeft: 6 }}>{tab.caption}</span>
                )}
              </button>
              {editingId === tab.id && (
                <input
                  ref={renameInputRef}
                  type="text"
                  id={workspaceTabRenameId(testIdPrefix, tab.id)}
                  data-testid={`${testIdPrefix}-rename-${index}`}
                  aria-label={labels.rename(tab.name)}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitEditing(tab);
                    } else if (event.key === 'Escape') {
                      // STOPPED HERE, not decoration. See docs/explanation/react.md#escape-stops-here
                      event.preventDefault();
                      event.stopPropagation();
                      cancelEditing();
                    }
                  }}
                  onBlur={() => {
                    if (settledRef.current) return;
                    commitEditing(tab);
                  }}
                  style={{
                    // Covers the LABEL only, so the close button beside it stays reachable.
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '6px 4px 6px 11px',
                    fontSize: 11.5,
                    fontFamily: 'inherit',
                    // Opaque: the button underneath is still painted.
                    background: theme.surface,
                    color: theme.accentText,
                    border: `1px solid ${theme.accent}`,
                    // NO `outline: none`. See docs/explanation/react.md#no-outline-none-on-the-rename-field
                  }}
                />
              )}
            </span>
            <button
              type="button"
              data-testid={`${testIdPrefix}-close-${index}`}
              disabled={lastTab}
              // "Close tab" repeated N times does not say WHICH tab closes, and × is all there is.
              aria-label={lastTab ? labels.lastTabClose : labels.close(tab.name)}
              title={lastTab ? labels.lastTabClose : labels.close(tab.name)}
              onClick={() => onClose(index)}
              style={{
                padding: '6px 8px 6px 3px',
                cursor: lastTab ? 'default' : 'pointer',
                fontSize: 12,
                lineHeight: 1,
                border: 'none',
                background: 'transparent',
                color: theme.text,
                opacity: lastTab ? 0.18 : 0.5,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-testid={`${testIdPrefix}-add`}
        onClick={onDuplicate}
        aria-label={labels.duplicate}
        title={labels.duplicate}
        style={{ ...actionStyle, fontSize: 13, opacity: 1 }}
      >
        +
      </button>

      {(onExport !== undefined || onImportFile !== undefined) && (
        <span style={{ marginLeft: 'auto', ...CENTER_ROW, gap: 2 }}>
          {onExport !== undefined && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-export`}
              onClick={onExport}
              style={actionStyle}
            >
              {labels.exportAction}
            </button>
          )}
          {onImportFile !== undefined && (
            <>
              <button
                type="button"
                data-testid={`${testIdPrefix}-import`}
                onClick={() => importInputRef.current?.click()}
                title={labels.importTitle}
                style={actionStyle}
              >
                {labels.importAction}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                data-testid={`${testIdPrefix}-import-input`}
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Cleared so picking the SAME file twice fires change again.
                  event.target.value = '';
                  if (file !== undefined) onImportFile(file);
                }}
              />
            </>
          )}
        </span>
      )}
    </div>
  );
}

export default WorkspaceTabsBar;
