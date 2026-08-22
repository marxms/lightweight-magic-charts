/**
 * The authored panes, in the order they stack: a switch, a drag handle and arrows per row.
 * See docs/explanation/react-workspace.md#drag-is-the-pointer-shortcut-and-the-arrows-are-the-keyboard-path
 */
import { memo, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, ReactElement } from 'react';

import type { PaneConfig } from '../../pane/budget';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { CENTER_ROW, STACK } from '../theme';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from './setupContext';

/** The set element the platform already has, stripped of the chrome it paints by default. */
const BARE_SET: CSSProperties = { border: 'none', margin: 0, padding: 0 };

const LIST: CSSProperties = { ...BARE_SET, ...STACK };

const ROW: CSSProperties = {
  ...BARE_SET,
  ...CENTER_ROW,
  gap: 8,
  cursor: 'grab',
};

/**
 * The list with one pane moved, or the same list when the move has nowhere to land.
 * See docs/explanation/react-workspace.md#the-guard-against-a-stale-drop
 */
function reordered(panes: readonly PaneConfig[], from: number, to: number): readonly PaneConfig[] {
  if (from < 0 || to < 0 || to >= panes.length || from === to) return panes;
  const next = [...panes];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const PaneListSection = memo(function PaneListSection(): ReactElement {
  const { theme, components, labels, testIdPrefix } = useWorkspaceChrome();
  const text = labels.panes;
  const { Toggle, IconButton } = components;
  const panes = useWorkspaceSetup((setup) => setup.panes);
  const write = useWorkspaceSetupWriter();
  const [dragging, setDragging] = useState<string | null>(null);

  const at = (id: string): number => panes.findIndex((pane) => pane.id === id);

  const move = (id: string, step: -1 | 1): void => {
    write({ panes: reordered(panes, at(id), at(id) + step) });
  };

  const toggle = (id: string, visible: boolean): void => {
    write({ panes: panes.map((pane) => (pane.id === id ? { ...pane, visible } : pane)) });
  };

  const drop = (event: ReactDragEvent<HTMLFieldSetElement>, onto: string): void => {
    event.preventDefault();
    // The state is the reliable half, the payload the fallback for a drag reported without one.
    const source = dragging ?? event.dataTransfer.getData('text/plain');
    setDragging(null);
    write({ panes: reordered(panes, at(source), at(onto)) });
  };

  return (
    // A REAL `fieldset`. See docs/explanation/react-workspace.md#a-real-fieldset
    <fieldset
      aria-label={text.group}
      data-testid={`${testIdPrefix}-panes`}
      style={{ ...LIST, color: theme.text, fontFamily: theme.fontFamily, fontSize: 11 }}
    >
      {panes.map((pane, position) => {
        const named = pane.title ?? pane.id;
        return (
        <fieldset
          key={pane.id}
          aria-label={text.row(named, position + 1, panes.length)}
          data-testid={`${testIdPrefix}-pane-row-${pane.id}`}
          draggable
          onDragStart={(event) => {
            setDragging(pane.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', pane.id);
          }}
          onDragEnd={() => setDragging(null)}
          onDragOver={(event) => {
            // Without this the browser refuses the drop and `onDrop` never runs at all.
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => drop(event, pane.id)}
          style={{
            ...ROW,
            borderTop: `2px solid ${
              dragging !== null && dragging !== pane.id ? theme.accent : 'transparent'
            }`,
            opacity: dragging === pane.id ? 0.4 : 1,
          }}
        >
          {/* Decoration: whoever has no mouse reorders by the arrows, so this glyph must not be
              announced as one more control. */}
          <span aria-hidden="true" title={text.handle} style={{ opacity: 0.35 }}>
            ⠿
          </span>
          <Toggle
            theme={theme}
            label={text.show(named)}
            checked={pane.visible}
            onChange={(next) => toggle(pane.id, next)}
          />
          <span style={{ flex: 1 }}>{named}</span>
          {/* "Move up" alone does not say up WHAT, and there is a pair of these per pane. */}
          <IconButton
            theme={theme}
            label={text.up(named)}
            disabled={position === 0}
            onSelect={() => move(pane.id, -1)}
          >
            ▲
          </IconButton>
          <IconButton
            theme={theme}
            label={text.down(named)}
            disabled={position === panes.length - 1}
            onSelect={() => move(pane.id, 1)}
          >
            ▼
          </IconButton>
        </fieldset>
        );
      })}
    </fieldset>
  );
});
