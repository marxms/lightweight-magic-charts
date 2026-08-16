/**
 * The height budget — design.md §5. Pure, synchronous, no browser.
 * See docs/explanation/layout.md#the-height-budget
 */

import type { PaneId } from '../domain/types';
// The legibility floor is a PANE fact. See docs/explanation/layout.md#where-the-legibility-floor-lives
import { DEFAULT_INDICATOR_FLOOR_PX } from '../pane/budget';

export interface LayoutBudget {
  /** The price pane never goes below this. Crossing it shrinks the indicators, then evicts. */
  readonly priceFloorPx: number;
  readonly defaultPaneHeightPx: number;
  /** No indicator pane is shrunk below this ({@link DEFAULT_INDICATOR_FLOOR_PX} when absent). */
  readonly indicatorFloorPx?: number;
}

export interface PaneRequest {
  readonly id: PaneId;
  readonly targetHeightPx: number;
  /** Higher is more recent. The lowest is evicted first. */
  readonly lastUsedAt: number;
}

export type LayoutOutcome =
  | {
      readonly kind: 'fits';
      readonly factors: ReadonlyMap<PaneId, number>;
      readonly priceHeightPx: number;
      /** The proportional shrink factor applied to the indicator panes. 1 = nobody shrank. */
      readonly scaled: number;
    }
  | {
      readonly kind: 'evicted';
      readonly factors: ReadonlyMap<PaneId, number>;
      readonly evicted: readonly PaneId[];
      readonly priceHeightPx: number;
      /** Survivors may sit shrunk at the legibility floor even after the eviction. 1 = at target. */
      readonly scaled: number;
    };

/** Factors are in PIXELS; the price pane is the residual. See docs/explanation/layout.md#factors-in-pixels */
export const PRICE_PANE_ID = 'price' as PaneId;

export function computeLayout(
  panes: readonly PaneRequest[],
  totalPx: number,
  budget: LayoutBudget,
): LayoutOutcome {
  // Least recently used first, ties broken on id. See docs/explanation/layout.md#deterministic-eviction-order
  const byRecency = [...panes].sort((a, b) =>
    a.lastUsedAt === b.lastUsedAt ? (a.id < b.id ? -1 : 1) : a.lastUsedAt - b.lastUsedAt,
  );

  const targetOf = (p: PaneRequest): number => Math.max(0, p.targetHeightPx);
  // A pane already below the floor keeps its own target as its floor. See docs/explanation/layout.md#shrink-never-grows
  const floorOf = (p: PaneRequest): number =>
    Math.min(budget.indicatorFloorPx ?? DEFAULT_INDICATOR_FLOOR_PX, targetOf(p));
  const sumBy = (list: readonly PaneRequest[], of: (p: PaneRequest) => number): number =>
    list.reduce((sum, p) => sum + of(p), 0);

  // STAGE 2 GATE, decided first. See docs/explanation/layout.md#the-height-budget
  const evicted: PaneId[] = [];
  let kept = [...byRecency];
  while (kept.length > 0 && totalPx - sumBy(kept, floorOf) < budget.priceFloorPx) {
    const victim = kept[0];
    evicted.push(victim.id);
    kept = kept.slice(1);
  }

  const residualPx = totalPx - sumBy(kept, targetOf);
  const granted = new Map<PaneId, number>();
  let priceHeightPx: number;

  if (kept.length === 0 || residualPx >= budget.priceFloorPx) {
    for (const pane of kept) granted.set(pane.id, targetOf(pane));
    priceHeightPx = Math.max(residualPx, 0);
  } else {
    // STAGE 1 — proportional shrink. See docs/explanation/layout.md#stage-1-proportional-shrink
    const availablePx = totalPx - budget.priceFloorPx;
    const pinned = new Set<PaneId>();
    let factor = 1;
    for (let round = 0; round <= kept.length; round += 1) {
      const free = kept.filter((p) => !pinned.has(p.id));
      const pinnedPx = sumBy(kept.filter((p) => pinned.has(p.id)), floorOf);
      const freeTargetPx = sumBy(free, targetOf);
      factor = freeTargetPx > 0 ? (availablePx - pinnedPx) / freeTargetPx : 0;
      const crossing = free.filter((p) => targetOf(p) * factor < floorOf(p));
      if (crossing.length === 0) break;
      for (const pane of crossing) pinned.add(pane.id);
    }
    for (const pane of kept) {
      granted.set(pane.id, pinned.has(pane.id) ? floorOf(pane) : targetOf(pane) * factor);
    }
    priceHeightPx = budget.priceFloorPx;
  }

  // The factor divulged is the DEEPEST one actually applied. See docs/explanation/layout.md#the-reported-shrink-factor
  const scaled = kept.reduce((min, pane) => {
    const target = targetOf(pane);
    return target > 0 ? Math.min(min, (granted.get(pane.id) as number) / target) : min;
  }, 1);

  const factors = new Map<PaneId, number>();
  factors.set(PRICE_PANE_ID, priceHeightPx);
  // Emitted in the caller's original order, not in recency order. See docs/explanation/layout.md#emission-order
  for (const pane of panes) {
    const height = granted.get(pane.id);
    if (height !== undefined) factors.set(pane.id, height);
  }

  return evicted.length === 0
    ? { kind: 'fits', factors, priceHeightPx, scaled }
    : { kind: 'evicted', factors, evicted, priceHeightPx, scaled };
}

/** The base library's layout pass, transcribed. See docs/explanation/layout.md#renderheights-transcribed */
export function renderHeights(
  factors: readonly number[],
  totalPaneHeightPx: number,
  pixelRatio = 1,
): number[] {
  if (factors.length === 0) return [];
  const totalStretch = factors.reduce((sum, f) => sum + f, 0);
  // A zero total would make every height NaN. See docs/explanation/layout.md#the-zero-stretch-case
  const stretchPixels = totalStretch > 0 ? totalPaneHeightPx / totalStretch : 0;

  const heights: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < factors.length; i += 1) {
    const calculated =
      i === factors.length - 1
        ? Math.ceil((totalPaneHeightPx - accumulated) * pixelRatio) / pixelRatio
        : Math.round(factors[i] * stretchPixels * pixelRatio) / pixelRatio;
    const height = Math.max(calculated, 2);
    heights.push(height);
    accumulated += height;
  }
  return heights;
}

/** Collapsed panes SINK to the end, order preserved. See docs/explanation/layout.md#why-collapsed-panes-sink */
export function sinkCollapsed<T>(panes: readonly T[], isVisible: (pane: T) => boolean): T[] {
  return [...panes.filter(isVisible), ...panes.filter((p) => !isVisible(p))];
}
