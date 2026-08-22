/**
 * The flyout panel — a handful of commands that fire and close, and nothing about drawing.
 * See docs/explanation/react-chrome.md#flyoutmenu-the-panel-and-the-trigger-are-siblings
 * See docs/explanation/react-chrome.md#flyoutmenu-mounted-means-open
 * See docs/explanation/react-chrome.md#flyoutmenu-the-keyboard-is-the-duty-of-whoever-takes-the-role
 */
import { memo, useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import { CENTER_ROW, type WorkspaceTheme } from '../theme';
import { nextRovingIndex } from './rovingFocus';
import { useFlyoutPosition } from './useFlyoutPosition';

/** Reading width: name plus shortcut, without breaking the longest name in the catalogue. */
const MIN_WIDTH_PX = 208;
const MAX_HEIGHT_PX = 360;

/** Ids are host strings and may carry a space or an accent; a DOM `id` may not. */
const domSafe = (value: string): string => value.replace(/[^\w-]/g, '-');

export interface FlyoutMenuItem {
  readonly id: string;
  readonly label: string;
  /** Shown to the right of the name. Shortcut, count — the host decides. */
  readonly hint?: string;
  /** Painted as chosen. It does not change the role: a `menuitem` fires and closes. */
  readonly selected?: boolean;
}

export interface FlyoutMenuProps {
  /** The panel's DOM `id`, where the trigger's `aria-controls` points. */
  readonly id: string;
  /** The panel's accessible name, and the heading it draws. */
  readonly label: string;
  readonly items: readonly FlyoutMenuItem[];
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
  /** The positioned root: anchor of the measurement and boundary of the outside click. */
  readonly rootRef: { readonly current: HTMLElement | null };
  /** Where focus returns on the three closing paths. */
  readonly triggerRef: { readonly current: HTMLElement | null };
  readonly theme: WorkspaceTheme;
  /** Opened by the pointer, focus does NOT move. See the focus effect. */
  readonly openedByPointer?: boolean;
  /**
   * The pointer's safe zone, when the caller opens on hover. Absent, the panel ignores the pointer.
   * See docs/explanation/react-chrome.md#flyoutmenu-the-pointers-safe-zone
   */
  readonly hover?: { readonly onEnter: () => void; readonly onLeave: () => void };
  readonly availableHeightPx?: number;
  readonly testIdPrefix: string;
}

function itemStyle(theme: WorkspaceTheme, selected: boolean): CSSProperties {
  return {
    ...CENTER_ROW,
    justifyContent: 'space-between',
    gap: 16,
    width: '100%',
    padding: '6px 8px',
    cursor: 'pointer',
    textAlign: 'left',
    border: `1px solid ${selected ? theme.accent : 'transparent'}`,
    borderRadius: 4,
    background: selected ? theme.accentFill : 'transparent',
    color: selected ? theme.accentText : theme.text,
    fontSize: 12,
    fontFamily: 'inherit',
  };
}

export const FlyoutMenu = memo(function FlyoutMenu({
  id,
  label,
  items,
  onSelect,
  onClose,
  rootRef,
  triggerRef,
  theme,
  openedByPointer,
  hover,
  availableHeightPx,
  testIdPrefix,
}: FlyoutMenuProps): ReactElement {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { topPx, leftPx, reposition } = useFlyoutPosition({
    rootRef,
    triggerRef,
    panelRef,
    availableHeightPx,
  });

  /**
   * A single listener, on the ROOT and in capture.
   * See docs/explanation/react-chrome.md#flyoutmenu-one-scroll-listener-on-the-root-in-capture
   */
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    root.addEventListener('scroll', reposition, true);
    return () => root.removeEventListener('scroll', reposition, true);
  }, [rootRef, reposition]);

  /**
   * Focus on the first item, EXCEPT when the pointer opened it.
   * See docs/explanation/react-chrome.md#flyoutmenu-focus-except-when-the-pointer-opened-it
   */
  useEffect(() => {
    if (openedByPointer === true) return;
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [openedByPointer]);

  /** Focus returns to the trigger BEFORE closing: after unmount there is nowhere to return it. */
  const closeAndRestore = (): void => {
    triggerRef.current?.focus();
    onClose();
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target) === true) return;
      // The check that was missing.
      // See docs/explanation/react-chrome.md#flyoutmenu-restoring-focus-only-when-the-panel-holds-it
      if (panelRef.current?.contains(document.activeElement) === true) triggerRef.current?.focus();
      onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [rootRef, triggerRef, onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      // See docs/explanation/react-chrome.md#flyoutmenu-escape-does-not-leak-and-tab-is-not-stolen
      event.stopPropagation();
      closeAndRestore();
      return;
    }
    if (event.key === 'Tab') {
      onClose();
      return;
    }
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const next = nextRovingIndex(
      event.key,
      nodes.indexOf(document.activeElement as HTMLElement),
      nodes.length,
      'vertical',
    );
    if (next === null) return;
    // Only after knowing the key is ours: cancelling earlier would steal Tab and the host's typing.
    event.preventDefault();
    nodes[next]?.focus();
  };

  return (
    <div
      ref={panelRef}
      id={id}
      role="menu"
      aria-label={label}
      data-testid={`${testIdPrefix}-flyout`}
      onKeyDown={onKeyDown}
      onMouseEnter={hover?.onEnter}
      onMouseLeave={hover?.onLeave}
      style={{
        position: 'absolute',
        top: topPx,
        left: leftPx,
        zIndex: 40,
        minWidth: MIN_WIDTH_PX,
        maxHeight:
          availableHeightPx === undefined
            ? MAX_HEIGHT_PX
            : Math.min(availableHeightPx, MAX_HEIGHT_PX),
        overflowY: 'auto',
        padding: 4,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        boxShadow: theme.legendShadow,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.55,
          padding: '6px 8px 4px',
        }}
      >
        {label}
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-testid={`${testIdPrefix}-option-${domSafe(item.id)}`}
          onClick={() => {
            onSelect(item.id);
            closeAndRestore();
          }}
          style={itemStyle(theme, item.selected === true)}
        >
          <span>{item.label}</span>
          {item.hint === undefined ? null : (
            <span style={{ opacity: 0.45, fontSize: 11 }}>{item.hint}</span>
          )}
        </button>
      ))}
    </div>
  );
});
