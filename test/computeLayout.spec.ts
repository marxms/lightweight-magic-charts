import { paneId } from '../src/domain/types';
import type { PaneId } from '../src/domain/types';
import {
  PRICE_PANE_ID,
  computeLayout,
  renderHeights,
  sinkCollapsed,
  type LayoutBudget,
  type PaneRequest,
} from '../src/layout/computeLayout';

// Tasks 4.2, 4.3, 4.4 — the budget, the floor and the sink.
//
// The four tuples asserted here are the ones MEASURED in the browser experiment that fase 0
// recovered (research.md:185). They are the whole evidential basis for D4 and for the price floor
// existing at all, so they are checked against the transcribed layout arithmetic rather than
// against this function's own opinion of what it produced.

const IND = (id: string, targetHeightPx: number, lastUsedAt = 0): PaneRequest => ({
  id: paneId(id),
  targetHeightPx,
  lastUsedAt,
});

const budget: LayoutBudget = { priceFloorPx: 200, defaultPaneHeightPx: 90 };
const noFloor: LayoutBudget = { priceFloorPx: 0, defaultPaneHeightPx: 90 };

/** The recorded experiment: 4 panes, 3 separators at 1px, a 28px time axis. */
const paneBudgetPx = (containerPx: number, paneCount: number) => containerPx - (paneCount - 1) - 28;

const orderedFactors = (factors: ReadonlyMap<PaneId, number>, ids: readonly string[]): number[] =>
  [PRICE_PANE_ID, ...ids.map(paneId)]
    .filter((id) => factors.has(id))
    .map((id) => factors.get(id) as number);

describe('computeLayout — one pass, and the price takes the residual', () => {
  it('reproduces the measured [299, 90, 90, 90] at a 600px container', () => {
    const total = paneBudgetPx(600, 4);
    const out = computeLayout([IND('a', 90), IND('b', 90), IND('c', 90)], total, noFloor);

    expect(out.kind).toBe('fits');
    expect(out.priceHeightPx).toBe(299);
    expect(renderHeights(orderedFactors(out.factors, ['a', 'b', 'c']), total)).toEqual([
      299, 90, 90, 90,
    ]);
  });

  it('recomputed after a resize, the price absorbs the ENTIRE gain — [599, 90, 90, 90]', () => {
    const grown = paneBudgetPx(900, 4);
    const out = computeLayout([IND('a', 90), IND('b', 90), IND('c', 90)], grown, noFloor);
    expect(renderHeights(orderedFactors(out.factors, ['a', 'b', 'c']), grown)).toEqual([
      599, 90, 90, 90,
    ]);
  });

  it('NOT recomputed, the same factors rescale and every target is lost (this is D4)', () => {
    const small = paneBudgetPx(600, 4);
    const out = computeLayout([IND('a', 90), IND('b', 90), IND('c', 90)], small, noFloor);
    // Identical factors, larger budget — nobody keeps their pixels.
    expect(renderHeights(orderedFactors(out.factors, ['a', 'b', 'c']), paneBudgetPx(900, 4))).toEqual(
      [457, 137, 137, 138],
    );
  });

  it('emits the price pane first and the rest in the CALLER order, not in recency order', () => {
    const out = computeLayout([IND('a', 90, 5), IND('b', 90, 1), IND('c', 90, 3)], 569, noFloor);
    expect(Array.from(out.factors.keys())).toEqual([PRICE_PANE_ID, paneId('a'), paneId('b'), paneId('c')]);
  });

  it('handles no indicator panes at all — the price takes everything', () => {
    const out = computeLayout([], 569, budget);
    expect(out.kind).toBe('fits');
    expect(out.priceHeightPx).toBe(569);
  });
});

// REWRITTEN FOR THE REGISTERED PARITY DELTA (parity-prototipo.md, 2026-08-11). The first policy
// answered a crossed price floor by evicting the LRU indicator outright; the prototype compressed
// every pane together and nobody disappeared. The cases below assert the DECLARED replacement:
// shrink all indicators proportionally down to the per-pane legibility floor, and only when even
// the floor does not fit, evict LRU. The old expectations were not wrong — the policy changed.
describe('the price floor — shrink proportionally first, evict LRU only past the legibility floor', () => {
  it('without a floor the price collapses to the measured 119px at 420px', () => {
    const tight = paneBudgetPx(420, 4);
    const out = computeLayout([IND('a', 90), IND('b', 90), IND('c', 90)], tight, noFloor);
    expect(out.kind).toBe('fits'); // no floor declared, so nothing stops it
    expect(out.scaled).toBe(1); // and nothing shrank on the way
    expect(renderHeights(orderedFactors(out.factors, ['a', 'b', 'c']), tight)).toEqual([
      119, 90, 90, 90,
    ]);
  });

  it('with a floor, the SAME container shrinks every pane together and evicts nobody', () => {
    // Under the old policy this container evicted `b`. Now: 389px budget, price pinned at its 200
    // floor, and the 189 left is shared by the same 0.7 factor — 63px each, above the 56 floor.
    const tight = paneBudgetPx(420, 4);
    const out = computeLayout(
      [IND('a', 90, 30), IND('b', 90, 10), IND('c', 90, 20)],
      tight,
      budget,
    );
    expect(out.kind).toBe('fits');
    if (out.kind !== 'fits') return;
    expect(out.scaled).toBeCloseTo(0.7, 10);
    expect(out.priceHeightPx).toBe(budget.priceFloorPx);
    expect(renderHeights(orderedFactors(out.factors, ['a', 'b', 'c']), tight)).toEqual([
      200, 63, 63, 63,
    ]);
  });

  it('evicts the LRU pane only when even the legibility floor does not fit — and only as many as it takes', () => {
    // 320px: three floors (3×56 = 168) leave 152 for the price — under its 200 floor, so ONE pane
    // must go (the old policy took two). With `b` out, two floors leave 208 ≥ 200, and the two
    // survivors shrink from 90 to 60 — above the floor, so no second eviction.
    const out = computeLayout(
      [IND('a', 90, 30), IND('b', 90, 10), IND('c', 90, 20)],
      320,
      budget,
    );
    expect(out.kind).toBe('evicted');
    if (out.kind !== 'evicted') return;
    expect(out.evicted).toEqual([paneId('b')]); // lastUsedAt 10 — the oldest
    expect(out.factors.has(paneId('b'))).toBe(false);
    expect(out.priceHeightPx).toBe(budget.priceFloorPx);
    expect(out.scaled).toBeCloseTo(60 / 90, 10);
    expect(renderHeights(orderedFactors(out.factors, ['a', 'c']), 320)).toEqual([200, 60, 60]);
  });

  it('shrinks the survivors TO the legibility floor while the LRU eviction still happens', () => {
    // The two-stage boundary in one case: 312px evicts exactly one pane (three floors = 168 leave
    // 144 < 200; two floors = 112 leave 200), and the survivors land exactly ON the 56px floor.
    const out = computeLayout(
      [IND('a', 90, 30), IND('b', 90, 10), IND('c', 90, 20)],
      312,
      budget,
    );
    expect(out.kind).toBe('evicted');
    if (out.kind !== 'evicted') return;
    expect(out.evicted).toEqual([paneId('b')]);
    expect(out.priceHeightPx).toBe(budget.priceFloorPx);
    expect(out.scaled).toBeCloseTo(56 / 90, 10);
    expect(renderHeights(orderedFactors(out.factors, ['a', 'c']), 312)).toEqual([200, 56, 56]);
  });

  it('breaks a recency tie on id, so the layout does not depend on array order', () => {
    const forwards = computeLayout([IND('a', 90, 1), IND('b', 90, 1), IND('c', 90, 1)], 320, budget);
    const backwards = computeLayout([IND('c', 90, 1), IND('b', 90, 1), IND('a', 90, 1)], 320, budget);
    expect(forwards.kind).toBe('evicted');
    if (forwards.kind !== 'evicted' || backwards.kind !== 'evicted') return;
    expect(forwards.evicted).toEqual(backwards.evicted);
  });

  it('evicts everything rather than breach the floor, and says so', () => {
    const out = computeLayout([IND('a', 300, 1), IND('b', 300, 2)], 250, budget);
    expect(out.kind).toBe('evicted');
    if (out.kind !== 'evicted') return;
    expect(out.evicted).toHaveLength(2);
    expect(out.priceHeightPx).toBe(250);
  });

  it('honours a pane sized below the legibility floor: its own target is its floor, and it never grows', () => {
    // `a` was deliberately sized at 40px — under the 56px legibility floor. Shrinking must pin it
    // at 40 (its own size), never lift it to 56; the larger pane absorbs the rest of the deficit.
    const out = computeLayout([IND('a', 40, 2), IND('b', 200, 1)], 300, budget);
    expect(out.kind).toBe('fits');
    if (out.kind !== 'fits') return;
    expect(out.priceHeightPx).toBe(budget.priceFloorPx);
    expect(out.factors.get(paneId('a'))).toBeLessThanOrEqual(40);
    // CONTROL POSITIVE: real shrink happened — the pair's targets (240) exceed the 100 available.
    expect(out.scaled).toBeLessThan(1);
  });

  it('never reports a negative price height, however hostile the container', () => {
    const out = computeLayout([IND('a', 90, 1)], 10, noFloor);
    expect(out.priceHeightPx).toBeGreaterThanOrEqual(0);
  });
});

describe('sinkCollapsed — no separator is ever left with a collapsed partner', () => {
  const visible = new Set(['a', 'c']);
  const panes = ['a', 'b', 'c', 'd'];
  const isVisible = (p: string) => visible.has(p);

  it('moves every collapsed pane below every visible one', () => {
    expect(sinkCollapsed(panes, isVisible)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('keeps the collapsed group contiguous at the end', () => {
    const sunk = sinkCollapsed(panes, isVisible);
    const firstHidden = sunk.findIndex((p) => !isVisible(p));
    expect(sunk.slice(firstHidden).every((p) => !isVisible(p))).toBe(true);
  });

  it('preserves relative order inside each group, so re-showing restores position', () => {
    expect(sinkCollapsed(['d', 'c', 'b', 'a'], isVisible)).toEqual(['c', 'a', 'd', 'b']);
  });
});

describe('renderHeights — the arithmetic computeLayout is checked against', () => {
  it('gives the LAST pane the residual, never its own factor', () => {
    const heights = renderHeights([1, 1, 1], 100);
    expect(heights).toEqual([33, 33, 34]);
    expect(heights.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('floors every pane at 2px, so collapsed panes can overshoot the budget', () => {
    const heights = renderHeights([100, 0.0001, 0.0001], 200);
    expect(heights[1]).toBe(2);
    expect(heights.reduce((a, b) => a + b, 0)).toBeGreaterThan(200);
  });
});
