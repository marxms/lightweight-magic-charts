/**
 * Where a flyout panel lands — measured against the root, clamped on all four sides, no portal.
 * See docs/explanation/react-chrome.md#useflyoutposition-the-panel-is-the-scrollers-sibling-never-its-child
 * See docs/explanation/react-chrome.md#useflyoutposition-why-the-two-axes-have-different-omission-rules
 */
import { useCallback, useLayoutEffect, useState } from 'react';

export interface FlyoutBox {
  readonly topPx: number;
  readonly leftPx: number;
  readonly reposition: () => void;
}

export interface FlyoutPositionInput {
  readonly rootRef: { readonly current: HTMLElement | null };
  readonly triggerRef: { readonly current: HTMLElement | null };
  readonly panelRef: { readonly current: HTMLElement | null };
  readonly availableHeightPx?: number;
  readonly availableWidthPx?: number;
}

const ORIGIN = { topPx: 0, leftPx: 0 };

/** Pins the wanted value between the bottom (or right) edge and the top (or left) one.
 * See docs/explanation/react-chrome.md#useflyoutposition-clamping-without-measurements */
function clamp(wanted: number, available: number | undefined, panelSize: number): number {
  const ceiling =
    available !== undefined && available > 0 && panelSize > 0
      ? Math.max(0, available - panelSize)
      : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(wanted, ceiling));
}

export function useFlyoutPosition(input: FlyoutPositionInput): FlyoutBox {
  const { rootRef, triggerRef, panelRef, availableHeightPx, availableWidthPx } = input;
  const [box, setBox] = useState(ORIGIN);

  const reposition = useCallback(() => {
    const root = rootRef.current;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (root === null || trigger === null || panel === null) return;

    const rootBox = root.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const topPx = clamp(
      trigger.getBoundingClientRect().top - rootBox.top,
      availableHeightPx ?? rootBox.height,
      panelBox.height,
    );
    const leftPx = clamp(rootBox.width, availableWidthPx, panelBox.width);

    setBox((current) =>
      current.topPx === topPx && current.leftPx === leftPx ? current : { topPx, leftPx },
    );
  }, [rootRef, triggerRef, panelRef, availableHeightPx, availableWidthPx]);

  // See docs/explanation/react-chrome.md#useflyoutposition-a-layout-effect-not-an-ordinary-one
  useLayoutEffect(reposition, [reposition]);

  return { topPx: box.topPx, leftPx: box.leftPx, reposition };
}
