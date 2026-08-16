/** WHERE THE PANES ARE — before there is any DOM to measure. See docs/explanation/layout.md#pane-boxes-before-the-dom */

import type { StackApplication } from './application';
import { renderHeights } from './computeLayout';

/** The band the shared time axis takes at the FOOT of the surface. See docs/explanation/layout.md#the-time-axis-band */
export const TIME_AXIS_PX = 28;

/** The base library draws one pixel of separator between adjacent panes. */
export const SEPARATOR_PX = 1;

/** Where a pane actually sits. Measured, because a stretch factor is not a pixel. */
export interface PaneBox {
  readonly top: number;
  readonly height: number;
}

/** Do two box maps describe the same geometry? See docs/explanation/layout.md#comparing-boxes-by-content */
export function sameBoxes(a: ReadonlyMap<string, PaneBox>, b: ReadonlyMap<string, PaneBox>): boolean {
  if (a.size !== b.size) return false;
  let equal = true;
  a.forEach((box, id) => {
    const other = b.get(id);
    if (other === undefined || other.top !== box.top || other.height !== box.height) equal = false;
  });
  return equal;
}

/** The boxes derived from the applied layout. See docs/explanation/layout.md#deriving-the-boxes */
export function paneBoxes(
  application: StackApplication | null,
  anchorDisplayId: string,
): ReadonlyMap<string, PaneBox> {
  const boxes = new Map<string, PaneBox>();
  if (application === null || application.kind !== 'applied') return boxes;

  const ids = [anchorDisplayId, ...application.order.map(String)];
  // READ from the result, not recomputed. See docs/explanation/layout.md#reading-the-result-not-recomputing-it
  const factors = [
    application.outcome.priceHeightPx,
    ...application.order.map((paneId) => application.outcome.factors.get(paneId) ?? 0),
  ];
  const paneArea = Math.max(
    0,
    factors.reduce((sum, f) => sum + f, 0) - TIME_AXIS_PX - SEPARATOR_PX * (factors.length - 1),
  );
  const heights = renderHeights(factors, paneArea);

  let top = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const height = heights[i];
    if (factors[i] <= 0) continue;
    boxes.set(ids[i], { top, height });
    top += height + SEPARATOR_PX;
  }
  return boxes;
}
