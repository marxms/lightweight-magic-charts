/**
 * THE BUDGET APPLIED — chart height, target heights for the stack, and the re-measured geometry.
 * See docs/explanation/react-surface.md#the-orphaned-frame
 */

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

import type { StackApplication, StackPane } from '../../layout/application';
import type { ChartHandles } from './chartHandles';

/** What the budget needs to know of a pane: the target, the recency and the consumer's switch. */
export interface LayoutPaneView {
  readonly spec: { readonly id: StackPane['id'] };
  readonly heightPx: number;
  readonly lastUsedAt: number;
  readonly visible: boolean;
}

/** Positional; `measure` returns a disposer and `onLayoutRef` reports the layout BY REFERENCE. */
export function useLayoutApply(
  handles: ChartHandles | null,
  panes: readonly LayoutPaneView[],
  heightPx: number,
  showPrice: boolean,
  measure: () => () => void,
  onApplied: (application: StackApplication) => void,
  onLayoutRef: MutableRefObject<((application: StackApplication) => void) | undefined>,
): void {
  useEffect(() => {
    if (handles === null) return;
    handles.chart.applyOptions({ height: heightPx });
    // The anchor is withheld from `apply`: it takes the residual and is never in the eviction order.
    const applied = handles.stack.apply(
      (showPrice ? panes : panes.slice(1)).map(
        (view): StackPane => ({
          id: view.spec.id,
          targetHeightPx: view.heightPx,
          lastUsedAt: view.lastUsedAt,
          visible: view.visible,
        }),
      ),
      heightPx,
    );
    onApplied(applied);
    onLayoutRef.current?.(applied);

    let dispose: (() => void) | null = null;
    const frame = window.requestAnimationFrame(() => {
      dispose = measure();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      // THE RE-MEASUREMENT'S DISPOSER, cancelled here and nowhere else.
      dispose?.();
    };
  }, [handles, panes, heightPx, showPrice, measure, onApplied, onLayoutRef]);
}
