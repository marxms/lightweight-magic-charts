/**
 * WHERE THE PANES ARE ONCE THE DOM HAS SPOKEN, and WHICH BAR IS UNDER THE CURSOR.
 * See docs/explanation/react-surface.md#the-geometry-does-not-run-on-a-clock
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { PRICE_PANE_ID } from '../../layout/computeLayout';
import { sameBoxes, type PaneBox } from '../../layout/paneBoxes';
import type { ChartHandles, LiveHandles } from './chartHandles';

/** The pair `useSyncExternalStore` consumes; `getSnapshot` is ALWAYS a primitive.
 * See docs/explanation/react-surface.md#the-cursor-becomes-an-external-store */
export interface HoveredTimeStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => number | null;
}

export interface SurfaceGeometry {
  readonly boxes: ReadonlyMap<string, PaneBox>;
  /** Re-measures and HANDS BACK A DISPOSER: whoever schedules the repair frame is who cancels it. */
  readonly measure: () => () => void;
  readonly hovered: HoveredTimeStore;
  readonly publishHovered: (time: number | null) => void;
}

export function useSurfaceGeometry(
  handles: ChartHandles | null,
  live: LiveHandles,
  hostRef: RefObject<HTMLDivElement | null>,
  anchorDisplayId: string,
): SurfaceGeometry {
  const anchorDisplayIdRef = useRef(anchorDisplayId);
  anchorDisplayIdRef.current = anchorDisplayId;

  const [boxes, setBoxes] = useState<ReadonlyMap<string, PaneBox>>(new Map());

  const measure = useCallback((): (() => void) => {
    // ONE EXIT ONLY, one disposer only: `0` is never a valid frame id, so cancelling it is a no-op.
    let retry = 0;
    const host = hostRef.current;
    if (host !== null && handles !== null) {
      const stack = handles.stack;
      // Collapsed panes leave the FLOW before anything is measured, and exactly one retry rides the
      // next paint. See docs/explanation/react-surface.md#collapsed-panes-leave-the-flow
      if (!stack.applyRowVisibility()) {
        retry = window.requestAnimationFrame(() => {
          live.current?.stack.applyRowVisibility();
        });
      }
      const hostRect = host.getBoundingClientRect();
      const next = new Map<string, PaneBox>();
      for (const id of stack.ids()) {
        const element = stack.handle(id)?.getHTMLElement() ?? null;
        if (element === null) continue;
        const rect = element.getBoundingClientRect();
        if (rect.height === 0) continue;
        const key = id === PRICE_PANE_ID ? anchorDisplayIdRef.current : String(id);
        next.set(key, { top: rect.top - hostRect.top, height: rect.height });
      }
      if (next.size > 0) setBoxes((previous) => (sameBoxes(previous, next) ? previous : next));
    }
    return () => window.cancelAnimationFrame(retry);
  }, [handles, hostRef, live]);

  /** The OTHER thing that moves a pane: the user dragging a separator, read imperatively.
   * See docs/explanation/react-surface.md#the-separator-drag-is-bound-imperatively */
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let dispose: (() => void) | null = null;
    const onSeparatorReleased = (): void => {
      dispose?.();
      dispose = measure();
    };
    host.addEventListener('mouseup', onSeparatorReleased);
    return () => {
      dispose?.();
      host.removeEventListener('mouseup', onSeparatorReleased);
    };
  }, [measure, hostRef]);

  const cell = useRef<number | null>(null);
  const listeners = useRef(new Set<() => void>());

  const publishHovered = useCallback((time: number | null): void => {
    // THE BAILOUT, replicated by hand: same bar, nobody is told.
    // See docs/explanation/react-surface.md#the-bailout-is-replicated-by-hand
    if (time === cell.current) return;
    cell.current = time;
    for (const listener of listeners.current) listener();
  }, []);

  const subscribe = useCallback((listener: () => void): (() => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback((): number | null => cell.current, []);

  return { boxes, measure, hovered: { subscribe, getSnapshot }, publishHovered };
}
