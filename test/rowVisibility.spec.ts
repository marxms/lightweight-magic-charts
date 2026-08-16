/**
 * @jest-environment jsdom
 *
 * The rainbow strip — a collapsed pane must leave the FLOW, not shrink to a sliver.
 *
 * `setStretchFactor(COLLAPSED_STRETCH)` does not remove a pane: the base library's layout floor is
 * 2px and the separator preceding the pane adds 1px more, so every collapsed pane leaves a ~3px
 * coloured line stacked in the table — a dozen collapsed slots render as a striped band above the
 * time axis. The fix ported from the prototype (`ChartLab.applyRowVisibility`) takes the pane's
 * `<tr>` out of the flow with `display: none`, and the separator row that belongs to it with it.
 *
 * The DOM here is the base library's real shape — a table alternating pane rows and 1px separator
 * rows — with per-row heights stubbed because jsdom lays nothing out.
 */

import { paneId } from '../src/domain/types';
import { PRICE_PANE_ID, type LayoutBudget } from '../src/layout/computeLayout';
import type { PaneChartHandle, PaneHandle } from '../src/port/chartApi';
import { PaneStack } from '../src/render/paneStack';

const BUDGET: LayoutBudget = { priceFloorPx: 180, defaultPaneHeightPx: 90 };
const A = paneId('a');
const B = paneId('b');

function stubHeight(row: HTMLTableRowElement, heightPx: number): void {
  row.getBoundingClientRect = () =>
    ({ height: heightPx, width: 600, top: 0, left: 0, right: 600, bottom: heightPx, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

/**
 * A chart whose panes live in a real `<table>`: pane rows carry the pane's element in a cell, and
 * every pane after the first is preceded by a 1px separator row, exactly as the base library lays
 * them out.
 */
class DomChart implements PaneChartHandle {
  readonly table = document.createElement('table');
  private readonly body = document.createElement('tbody');
  readonly order: DomPane[] = [];

  constructor() {
    this.table.appendChild(this.body);
    document.body.appendChild(this.table);
    this.order.push(this.appendPane(true));
  }

  private appendPane(first: boolean): DomPane {
    if (!first) {
      const separator = document.createElement('tr');
      separator.dataset.kind = 'separator';
      stubHeight(separator, 1);
      this.body.appendChild(separator);
    }
    const row = document.createElement('tr');
    row.dataset.kind = 'pane';
    stubHeight(row, 90);
    const cell = document.createElement('td');
    row.appendChild(cell);
    this.body.appendChild(row);
    const pane = new DomPane(this, cell);
    return pane;
  }

  panes(): readonly PaneHandle[] {
    return this.order;
  }

  addPane(): PaneHandle {
    const pane = this.appendPane(false);
    this.order.push(pane);
    return pane;
  }

  rows(): HTMLTableRowElement[] {
    return Array.from(this.body.querySelectorAll('tr'));
  }
}

class DomPane implements PaneHandle {
  private stretch = 1;
  detached = false;

  constructor(
    private readonly chart: DomChart,
    readonly cell: HTMLTableCellElement,
  ) {}

  paneIndex(): number {
    return this.chart.order.indexOf(this);
  }
  getStretchFactor(): number {
    return this.stretch;
  }
  setStretchFactor(stretchFactor: number): void {
    this.stretch = stretchFactor;
  }
  setPreserveEmptyPane(): void {}
  moveTo(): void {}
  getHTMLElement(): HTMLElement | null {
    return this.detached ? null : this.cell;
  }
}

function rowOf(chart: DomChart, index: number): HTMLTableRowElement {
  return (chart.order[index] as DomPane).cell.closest('tr') as HTMLTableRowElement;
}

function separatorBefore(chart: DomChart, index: number): HTMLTableRowElement {
  return rowOf(chart, index).previousElementSibling as HTMLTableRowElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('applyRowVisibility — collapsed panes leave the flow', () => {
  it('hides the collapsed pane row AND the separator that precedes it', () => {
    const chart = new DomChart();
    const stack = new PaneStack(chart, BUDGET);

    stack.apply(
      [
        { id: A, targetHeightPx: 90, lastUsedAt: 2, visible: true },
        { id: B, targetHeightPx: 90, lastUsedAt: 1, visible: false },
      ],
      480,
    );
    expect(stack.applyRowVisibility()).toBe(true);

    // B (index 2: price, A, B) is collapsed: its row and its separator are out of the flow.
    expect(rowOf(chart, 2).style.display).toBe('none');
    expect(separatorBefore(chart, 2).style.display).toBe('none');

    // CONTROL POSITIVE: the visible pane's row and separator are NOT touched — an implementation
    // that hid every row would satisfy the two assertions above and fail these.
    expect(rowOf(chart, 1).style.display).toBe('');
    expect(separatorBefore(chart, 1).style.display).toBe('');
    // The price row has no separator above it and never leaves the flow.
    expect(rowOf(chart, 0).style.display).toBe('');
  });

  it('restores the row and its separator when the pane is switched back on', () => {
    const chart = new DomChart();
    const stack = new PaneStack(chart, BUDGET);
    const panes = (visibleB: boolean) => [
      { id: A, targetHeightPx: 90, lastUsedAt: 2, visible: true },
      { id: B, targetHeightPx: 90, lastUsedAt: 1, visible: visibleB },
    ];

    stack.apply(panes(false), 480);
    stack.applyRowVisibility();
    expect(rowOf(chart, 2).style.display).toBe('none');

    stack.apply(panes(true), 480);
    stack.applyRowVisibility();
    expect(rowOf(chart, 2).style.display).toBe('');
    expect(separatorBefore(chart, 2).style.display).toBe('');
  });

  it('an empty slot is born collapsed: hidden on the very first pass, before any toggle', () => {
    const chart = new DomChart();
    const stack = new PaneStack(chart, BUDGET);

    // The first apply this stack ever runs already lists the slot as invisible — the state a
    // freshly created, unassigned slot pane mounts in.
    stack.apply([{ id: A, targetHeightPx: 90, lastUsedAt: 0, visible: false }], 480);
    stack.applyRowVisibility();

    expect(rowOf(chart, 1).style.display).toBe('none');
    expect(separatorBefore(chart, 1).style.display).toBe('none');
  });

  it('reports when a pane widget has not caught up, so the caller can retry after the paint', () => {
    const chart = new DomChart();
    const stack = new PaneStack(chart, BUDGET);
    stack.apply(
      [
        { id: A, targetHeightPx: 90, lastUsedAt: 2, visible: true },
        { id: B, targetHeightPx: 90, lastUsedAt: 1, visible: false },
      ],
      480,
    );
    (chart.order[2] as DomPane).detached = true;

    // `false` = not every row resolved; the rows that DID resolve were still handled.
    expect(stack.applyRowVisibility()).toBe(false);
    expect(rowOf(chart, 1).style.display).toBe('');

    (chart.order[2] as DomPane).detached = false;
    expect(stack.applyRowVisibility()).toBe(true);
    expect(rowOf(chart, 2).style.display).toBe('none');
  });

  it('never mistakes the previous PANE row for a separator', () => {
    const chart = new DomChart();
    const stack = new PaneStack(chart, BUDGET);
    stack.apply(
      [
        { id: A, targetHeightPx: 90, lastUsedAt: 2, visible: true },
        { id: B, targetHeightPx: 90, lastUsedAt: 1, visible: false },
      ],
      480,
    );
    // Remove B's separator from the table, so B's previous sibling IS pane A's row (a >2px row).
    separatorBefore(chart, 2).remove();

    stack.applyRowVisibility();
    expect(rowOf(chart, 2).style.display).toBe('none');
    // A's row must survive: the 2px guard is what tells a separator from a pane.
    expect(rowOf(chart, 1).style.display).toBe('');
  });

  it('the price pane is never taken out of the flow', () => {
    const chart = new DomChart();
    const stack = new PaneStack(chart, BUDGET);
    stack.apply([{ id: A, targetHeightPx: 90, lastUsedAt: 1, visible: true }], 480);
    // Force the degenerate write a bug elsewhere could produce: even at the collapsed factor, the
    // anchor row stays — a chart whose price row leaves the flow has no chart left.
    stack.handle(PRICE_PANE_ID)?.setStretchFactor(0.0001);

    stack.applyRowVisibility();
    expect(rowOf(chart, 0).style.display).toBe('');
  });
});
