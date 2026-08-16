/**
 * Task 4.1 — one chart instance, panes stacked, crosshair and time axis shared. Not a pane
 * implementation: the LAYOUT POLICY the base library has none of, over its native panes.
 * See docs/explanation/render.md#the-pane-stack-policy
 */

import type { PaneId } from '../domain/types';
import type { StackApplication, StackPane } from '../layout/application';
import {
  PRICE_PANE_ID,
  computeLayout,
  sinkCollapsed,
  type LayoutBudget,
  type PaneRequest,
} from '../layout/computeLayout';
import type { PaneChartHandle, PaneHandle } from '../port/chartApi';

/** FORWARDED, not declared. See docs/explanation/render.md#forwarded-not-declared */
export type { StackApplication, StackPane } from '../layout/application';

/** Not zero. See docs/explanation/render.md#why-collapsed-stretch-is-not-zero */
export const COLLAPSED_STRETCH = 0.0001;

/** Anything above this reads as "a real pane", whatever rounding the base library did on the way. */
export const COLLAPSED_STRETCH_CEILING = COLLAPSED_STRETCH * 10;

/** The price pane is index 0. See docs/explanation/render.md#the-price-pane-is-implicit */
export class PaneStack {
  private readonly handles = new Map<PaneId, PaneHandle>();

  constructor(
    private readonly chart: PaneChartHandle,
    private readonly budget: LayoutBudget,
  ) {}

  /** Adopt pane 0, create the rest; idempotent. See docs/explanation/render.md#preserve-empty-pane */
  ensure(id: PaneId): PaneHandle {
    const existing = this.handles.get(id);
    if (existing !== undefined) return existing;

    const pane = id === PRICE_PANE_ID ? this.chart.panes()[0] : this.chart.addPane(true);
    pane.setPreserveEmptyPane(true);
    this.handles.set(id, pane);
    return pane;
  }

  handle(id: PaneId): PaneHandle | undefined {
    return this.handles.get(id);
  }

  /** Managed ids, price first. Exposed because the consumer owns the series inside each pane. */
  ids(): readonly PaneId[] {
    return Array.from(this.handles.keys());
  }

  apply(panes: readonly StackPane[], totalPx: number): StackApplication {
    if (panes.some((pane) => pane.id === PRICE_PANE_ID)) {
      // A caller error, not a data condition. See docs/explanation/render.md#the-price-pane-is-implicit
      throw new Error('PaneStack.apply: the price pane is implicit and must not be listed');
    }
    if (totalPx <= 0) return { kind: 'degenerate', totalPx };

    for (const pane of panes) this.ensure(pane.id);
    const priceHandle = this.ensure(PRICE_PANE_ID);

    const requests: PaneRequest[] = panes
      .filter((pane) => pane.visible)
      .map((pane) => ({
        id: pane.id,
        targetHeightPx: pane.targetHeightPx,
        lastUsedAt: pane.lastUsedAt,
      }));
    const outcome = computeLayout(requests, totalPx, this.budget);

    // ONE PASS, and the price pane is part of it. See docs/explanation/render.md#one-pass
    priceHandle.setStretchFactor(outcome.priceHeightPx);
    const collapsed: PaneId[] = [];
    for (const pane of panes) {
      const factor = outcome.factors.get(pane.id);
      const handle = this.handles.get(pane.id);
      if (handle === undefined) continue;
      if (factor === undefined) {
        collapsed.push(pane.id);
        handle.setStretchFactor(COLLAPSED_STRETCH);
        continue;
      }
      handle.setStretchFactor(factor);
    }

    const order = sinkCollapsed(panes, (pane) => outcome.factors.has(pane.id)).map((p) => p.id);
    return { kind: 'applied', outcome, collapsed, order, ordered: this.reorder(order) };
  }

  /** Take collapsed panes OUT OF THE FLOW; `false` = retry after the next paint.
   * See docs/explanation/render.md#the-rainbow-strip */
  applyRowVisibility(): boolean {
    let resolvedAll = true;
    for (const [id, handle] of this.handles) {
      const element = handle.getHTMLElement();
      if (element === null) {
        resolvedAll = false;
        continue;
      }
      const row = element.closest('tr');
      if (row === null) continue;
      // The price pane is the anchor and is never collapsed by this class.
      const collapsed =
        id !== PRICE_PANE_ID && handle.getStretchFactor() <= COLLAPSED_STRETCH_CEILING;
      (row as HTMLElement).style.display = collapsed ? 'none' : '';
      // The separator that PRECEDES this pane belongs to it. See docs/explanation/render.md#the-rainbow-strip
      const separator = row.previousElementSibling;
      if (
        separator instanceof HTMLElement &&
        separator.tagName === 'TR' &&
        separator.getBoundingClientRect().height <= 2
      ) {
        separator.style.display = collapsed ? 'none' : '';
      }
    }
    return resolvedAll;
  }

  /** Apply the sunk order, or refuse to apply any of it. See docs/explanation/render.md#reorder-or-refuse */
  private reorder(order: readonly PaneId[]): boolean {
    for (const handle of this.handles.values()) {
      if (handle.getHTMLElement() === null) return false;
    }
    order.forEach((id, position) => {
      const handle = this.handles.get(id);
      // 0 is the price pane, which never moves.
      if (handle === undefined || handle.paneIndex() === position + 1) return;
      handle.moveTo(position + 1);
    });
    return true;
  }
}
