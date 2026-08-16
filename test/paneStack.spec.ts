/**
 * One chart, panes stacked, crosshair and time axis shared.
 *
 * The fake chart is not a stub: `moveTo` renumbers the panes below it exactly as the real one does,
 * because that renumbering is the reason the reorder pass has to be all-or-nothing. A stub that just
 * recorded the calls would let a half-applied sequence pass as correct.
 */

import { paneId, type PaneId } from '../src/domain/types';
import { PRICE_PANE_ID, type LayoutBudget } from '../src/layout/computeLayout';
import type { PaneChartHandle, PaneHandle } from '../src/port/chartApi';
import { COLLAPSED_STRETCH, PaneStack } from '../src/render/paneStack';

class FakeChart implements PaneChartHandle {
  readonly order: FakePane[] = [];
  addPaneCalls = 0;

  constructor(paneCount = 1) {
    for (let i = 0; i < paneCount; i += 1) this.order.push(new FakePane(this));
  }

  panes(): readonly PaneHandle[] {
    return this.order;
  }

  addPane(): PaneHandle {
    this.addPaneCalls += 1;
    const pane = new FakePane(this);
    this.order.push(pane);
    return pane;
  }

  /** The stack's view of the world, as pane indices. */
  layout(): readonly FakePane[] {
    return this.order;
  }
}

class FakePane implements PaneHandle {
  readonly stretchWrites: number[] = [];
  readonly moves: number[] = [];
  preserved = false;
  element: HTMLElement | null = {} as HTMLElement;

  constructor(private readonly chart: FakeChart) {}

  paneIndex(): number {
    return this.chart.order.indexOf(this);
  }
  getStretchFactor(): number {
    return this.stretchWrites.length === 0 ? 1 : this.stretchWrites[this.stretchWrites.length - 1];
  }
  setStretchFactor(stretchFactor: number): void {
    this.stretchWrites.push(stretchFactor);
  }
  setPreserveEmptyPane(preserve: boolean): void {
    this.preserved = preserve;
  }
  moveTo(paneIndex: number): void {
    this.moves.push(paneIndex);
    const from = this.chart.order.indexOf(this);
    this.chart.order.splice(from, 1);
    this.chart.order.splice(paneIndex, 0, this);
  }
  getHTMLElement(): HTMLElement | null {
    return this.element;
  }
}

const BUDGET: LayoutBudget = { priceFloorPx: 260, defaultPaneHeightPx: 90 };
const A = paneId('a');
const B = paneId('b');
const C = paneId('c');

function pane(id: PaneId, lastUsedAt: number, visible = true, targetHeightPx = 90) {
  return { id, targetHeightPx, lastUsedAt, visible };
}

function idsOf(chart: FakeChart, stack: PaneStack): readonly (PaneId | 'unmanaged')[] {
  const byHandle = new Map<PaneHandle, PaneId>();
  for (const id of stack.ids()) {
    const handle = stack.handle(id);
    if (handle !== undefined) byHandle.set(handle, id);
  }
  return chart.layout().map((p) => byHandle.get(p) ?? 'unmanaged');
}

describe('task 4.1 — one chart instance, panes stacked', () => {
  it('adopts pane 0 for the price and adds ONE pane per id — never a second chart', () => {
    // The shared crosshair and shared time axis are not features this package implements: they are
    // what you get for free from panes of the SAME chart. The port has no factory, so the only way
    // to end up with two charts is for a consumer to make one — and then this stack is not involved.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);

    stack.apply([pane(A, 3), pane(B, 2), pane(C, 1)], 600);

    expect(chart.addPaneCalls).toBe(3);
    expect(stack.handle(PRICE_PANE_ID)).toBe(chart.layout()[0]);
    expect(chart.layout()).toHaveLength(4);
  });

  it('preserves empty panes, because destroying one renumbers every pane below it', () => {
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);
    stack.apply([pane(A, 1)], 600);
    expect((stack.handle(A) as FakePane).preserved).toBe(true);
  });
});

describe('task 4.1 — the budget is applied in ONE pass', () => {
  it('writes every factor exactly once and gives the price the residual', () => {
    // The defect this guards: `setHeight` rewrites every OTHER pane to absorb the delta, so a loop
    // of per-pane calls undoes itself. One write per pane per apply is the shape that cannot.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);

    const result = stack.apply([pane(A, 3), pane(B, 2), pane(C, 1)], 600);

    expect(result.kind).toBe('applied');
    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.outcome.kind).toBe('fits');
    expect(result.outcome.priceHeightPx).toBe(330);
    for (const id of [PRICE_PANE_ID, A, B, C]) {
      expect((stack.handle(id) as FakePane).stretchWrites).toHaveLength(1);
    }
    expect((stack.handle(A) as FakePane).getStretchFactor()).toBe(90);
    expect((stack.handle(PRICE_PANE_ID) as FakePane).getStretchFactor()).toBe(330);
  });

  it('returns the indicators to their pixel target after a resize; the price absorbs the change', () => {
    // A stretch factor is a RATIO, so a pixel target does not survive a resize on its own. Recomputing
    // from the budget is what makes it survive — and this is the assertion that it was recomputed.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);
    const panes = [pane(A, 3), pane(B, 2), pane(C, 1)];

    stack.apply(panes, 600);
    const grown = stack.apply(panes, 900);

    expect(grown.kind).toBe('applied');
    if (grown.kind !== 'applied') throw new Error('unreachable');
    expect(grown.outcome.priceHeightPx).toBe(630);
    expect((stack.handle(A) as FakePane).getStretchFactor()).toBe(90);
    expect((stack.handle(C) as FakePane).getStretchFactor()).toBe(90);
  });

  it('reports a zero-height container instead of laying out against it', () => {
    // A zero-height container is REPORTED, never laid out against. Factors derived from a zero
    // budget put every pane on the 2px floor, and the recovery on the next resize then reads as a
    // rendering bug.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);

    const result = stack.apply([pane(A, 1)], 0);

    expect(result).toEqual({ kind: 'degenerate', totalPx: 0 });
    expect(stack.handle(A)).toBeUndefined();
  });

  it('refuses the price pane in the indicator list rather than silently dropping it', () => {
    const stack = new PaneStack(new FakeChart(), BUDGET);
    expect(() => stack.apply([pane(PRICE_PANE_ID, 1)], 600)).toThrow(/price pane is implicit/);
  });
});

describe('task 4.1 — the price floor shrinks the indicators first, then evicts', () => {
  // REWRITTEN FOR THE REGISTERED PARITY DELTA (parity-prototipo.md, 2026-08-11): the old policy
  // evicted B and C here; shrink-before-evict keeps B at a shrunk height and evicts only C.
  it('shrinks the survivors and collapses the least recently used pane only past the legibility floor', () => {
    // 420px, three 90px indicators against a 260 price floor: even three panes AT the 56px floor
    // leave the price 252px, so C (oldest) is evicted; A and B then shrink 90 -> 80 together.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);

    const result = stack.apply([pane(A, 3), pane(B, 2), pane(C, 1)], 420);

    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.outcome.kind).toBe('evicted');
    expect(result.collapsed).toEqual([C]);
    expect(result.outcome.priceHeightPx).toBe(BUDGET.priceFloorPx);
    expect(result.outcome.scaled).toBeCloseTo(80 / 90, 10);
    expect((stack.handle(C) as FakePane).getStretchFactor()).toBe(COLLAPSED_STRETCH);
    // CONTROL POSITIVE for the shrink: both survivors carry the SAME shrunk pixel factor.
    expect((stack.handle(A) as FakePane).getStretchFactor()).toBeCloseTo(80, 10);
    expect((stack.handle(B) as FakePane).getStretchFactor()).toBeCloseTo(80, 10);
  });

  it('collapses a pane the consumer switched off, and it costs no budget', () => {
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);

    const result = stack.apply([pane(A, 3), pane(B, 2, false), pane(C, 1)], 600);

    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.outcome.kind).toBe('fits');
    expect(result.collapsed).toEqual([B]);
    expect(result.outcome.priceHeightPx).toBe(420);
  });
});

describe('task 4.1 — collapsed panes sink, so no separator has a collapsed partner', () => {
  it('puts every collapsed pane below every visible one, preserving order within each group', () => {
    // Not cosmetic. A separator clamps BOTH its panes to 30px on drag, so a collapsed neighbour is
    // resurrected by the first pixel of drag and the dragged pane is rewritten to about half.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);

    const result = stack.apply([pane(A, 3), pane(B, 2, false), pane(C, 1)], 600);

    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.order).toEqual([A, C, B]);
    expect(result.ordered).toBe(true);
    expect(idsOf(chart, stack)).toEqual([PRICE_PANE_ID, A, C, B]);
  });

  it('skips the move for a pane already in place, so a settled stack costs comparisons only', () => {
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);
    const panes = [pane(A, 3), pane(B, 2), pane(C, 1)];

    stack.apply(panes, 600);
    const before = [A, B, C].map((id) => (stack.handle(id) as FakePane).moves.length);
    stack.apply(panes, 600);
    const after = [A, B, C].map((id) => (stack.handle(id) as FakePane).moves.length);

    expect(after).toEqual(before);
  });

  it('applies NONE of the reorder while a pane widget is missing — and still writes the factors', () => {
    // `moveTo` asserts against the count of WIDGETS, which lags the model by a paint, and it also
    // renumbers everything below it. Stopping midway would leave an order nobody chose.
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);
    stack.apply([pane(A, 3), pane(B, 2), pane(C, 1)], 600);
    (stack.handle(C) as FakePane).element = null;

    const result = stack.apply([pane(A, 3), pane(B, 2, false), pane(C, 1)], 600);

    if (result.kind !== 'applied') throw new Error('unreachable');
    expect(result.ordered).toBe(false);
    expect(idsOf(chart, stack)).toEqual([PRICE_PANE_ID, A, B, C]);
    expect((stack.handle(B) as FakePane).getStretchFactor()).toBe(COLLAPSED_STRETCH);
  });

  it('applies the pending order once the widgets catch up', () => {
    const chart = new FakeChart();
    const stack = new PaneStack(chart, BUDGET);
    stack.apply([pane(A, 3), pane(B, 2), pane(C, 1)], 600);
    (stack.handle(C) as FakePane).element = null;
    const panes = [pane(A, 3), pane(B, 2, false), pane(C, 1)];
    expect((stack.apply(panes, 600) as { ordered: boolean }).ordered).toBe(false);

    (stack.handle(C) as FakePane).element = {} as HTMLElement;
    const retry = stack.apply(panes, 600);

    if (retry.kind !== 'applied') throw new Error('unreachable');
    expect(retry.ordered).toBe(true);
    expect(idsOf(chart, stack)).toEqual([PRICE_PANE_ID, A, C, B]);
  });
});
