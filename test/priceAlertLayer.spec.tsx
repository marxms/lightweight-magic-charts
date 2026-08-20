/**
 * @jest-environment jsdom
 *
 * LMC-23 — the alerts layer, and THE DRAG THAT HAS TO BEAT THE PANNING.
 *
 * WHAT THIS FILE PROVES AND NOBODY WAS PROVING. The chart registers its own panning handler on THIS
 * same canvas element, and wins in the bubble phase. Only the CAPTURE phase lets a click that lands
 * on a level move the level instead of the framing. That word — the `true` at the end of
 * `addEventListener` — has no visible effect at all on mount: removing it leaves the whole suite
 * green and breaks the drag, and only when somebody drags.
 *
 * HOW THE PHASE BECOMES AN ASSERTION. A BUBBLE listener planted on the same element cannot see the
 * event: the capture runs first and stops the propagation. If the same registration were made on
 * bubble, `stopPropagation` does not silence the other listeners of the SAME element — only those
 * above — and the spy would receive the event. That is the difference the case measures, and not
 * the existence of the handler.
 *
 * THE POSITIVE CONTROL is the other side of the promise: a click that does NOT land on a level is
 * not interrupted, so panning keeps working across the rest of the canvas.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react';

import { directionConvention, paneId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type {
  ChartEngine,
  PaneHandle,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { DrawingBinding } from '../src/drawing/drawingLayer';
import { ChartSurface, type SeriesReader } from '../src/react/surface/ChartSurface';

/** Price 100 lives at pixel 100: an identity projection makes the test's geometry legible. */
const PRICE_AT = (price: number): number => price;

interface Ledger {
  /** Every `applyOptions` of the chart, in order — it is where the panning lock shows up. */
  readonly chartOptions: Array<Record<string, unknown>>;
  /** The BUBBLE listener planted on the canvas element: the place of the chart's own handler. */
  bubbled: number;
  /** Lines created and removed on the price series — how "rebuilt" becomes observable. */
  created: number;
  removed: number;
}

function draggableEngine(ledger: Ledger): ChartEngine {
  return () => {
    let nextPane = 1;
    const makePane = (index: number): PaneHandle => ({
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      getHTMLElement: () => null,
    });
    const pane0 = makePane(0);
    const chart: WorkspaceChartHandle = {
      panes: () => [pane0],
      addPane: () => makePane(nextPane++),
      addSeries: (): SeriesHandle => ({
        setData: () => undefined,
        applyOptions: () => undefined,
        setMarkers: () => undefined,
        priceScale: () => ({ applyOptions: () => undefined }),
        createPriceLine: () => {
          ledger.created += 1;
          return { applyOptions: () => undefined };
        },
        removePriceLine: () => {
          ledger.removed += 1;
        },
        priceToCoordinate: (price) => PRICE_AT(price),
        coordinateToPrice: (coordinate) => coordinate,
        attachPrimitive: () => undefined,
        detachPrimitive: () => undefined,
      }),
      applyOptions: (next) => {
        ledger.chartOptions.push(next as Record<string, unknown>);
      },
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
    };
    return chart;
  };
}

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });
const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [],
  defaultVisible: true,
};
const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
];
const read: SeriesReader = () => [];

interface Mounted {
  readonly host: HTMLElement;
  readonly levels: number[][];
  press: (y: number) => void;
  release: (y: number) => void;
  /** The host declaring another set — the path along which reconciliation REALLY has to act. */
  setLevels: (next: readonly number[]) => void;
}

/**
 * A CONTROLLED HOST, and not a spy. The `priceAlerts` prop is the host's state, and the report of a
 * drag updates it — which is how a real consumer wires the two ends together. Without that the
 * reconciliation would never re-run in the test, and the equality clause would pass vacuously.
 */
function ControlledHost(props: {
  readonly engine: ChartEngine;
  readonly initial: readonly number[];
  readonly onChange: (levels: readonly number[]) => void;
  readonly onReady: (declare: (next: readonly number[]) => void) => void;
}): ReactElement {
  const [alerts, setAlerts] = useState<readonly number[]>(props.initial);
  props.onReady(setAlerts);
  return (
    <ChartSurface
      engine={props.engine}
      convention={CONVENTION}
      data={{ bars: BARS, panes: [], read, pricePane: PRICE }}
      layout={{ heightPx: 400 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
      alerts={{
        levels: alerts,
        onChange: (next) => {
          setAlerts(next);
          props.onChange(next);
        },
      }}
    />
  );
}

function mounted(ledger: Ledger, alerts: readonly number[]): Mounted {
  const levels: number[][] = [];
  let declare: (next: readonly number[]) => void = () => undefined;
  const view = render(
    <ControlledHost
      engine={draggableEngine(ledger)}
      initial={alerts}
      onChange={(next) => levels.push([...next])}
      onReady={(setter) => {
        declare = setter;
      }}
    />,
  );
  const host = view.container.querySelector('[role="img"]') as HTMLElement;
  // jsdom does no layout: the element's top is zero, so the event's Y is the Y on the canvas.
  host.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height: 400 }) as DOMRect;
  // THE CHART'S PLACE: a BUBBLE listener on the same element, which is where the base library
  // installs drag-panning.
  host.addEventListener('mousedown', () => {
    ledger.bubbled += 1;
  });
  return {
    host,
    levels,
    press: (y) => {
      act(() => {
        host.dispatchEvent(new MouseEvent('mousedown', { clientY: y, bubbles: true, cancelable: true }));
      });
    },
    release: (y) => {
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientY: y, bubbles: true }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
    },
    setLevels: (next) => {
      act(() => {
        declare(next);
      });
    },
  };
}

describe('LMC-23 — the drag on capture beats the chart panning', () => {
  it('a click ON a level does not reach the chart handler, and locks the panning', () => {
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press } = mounted(ledger, [100]);

    press(100);

    // THE CLAUSE THAT FAILS IF THE ORDER INVERTS. Registered on bubble, this listener would see the
    // event: `stopPropagation` does not silence the other listeners of the SAME element.
    expect(ledger.bubbled).toBe(0);
    expect(ledger.chartOptions).toContainEqual({ handleScroll: false, handleScale: false });
  });

  it('POSITIVE CONTROL: a click far from every level still reaches the chart', () => {
    // Without this half, a handler that interrupted EVERYTHING would pass the case above and would
    // kill the panning across the whole canvas.
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press } = mounted(ledger, [100]);

    press(300);

    expect(ledger.bubbled).toBe(1);
    expect(ledger.chartOptions).not.toContainEqual({ handleScroll: false, handleScale: false });
  });

  it('releasing gives the panning back and reports the levels to their owner', () => {
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press, release, levels } = mounted(ledger, [100]);

    press(100);
    release(140);

    expect(ledger.chartOptions).toContainEqual({ handleScroll: true, handleScale: true });
    // The level dragged to pixel 140 is worth 140 under the identity projection, and the one who
    // keeps it is the host: the surface does not own the list.
    expect(levels).toEqual([[140]]);
  });
});

describe('LMC-23 — the reconciliation only happens when the set differs', () => {
  it('the list that comes back from a drag does not rebuild the lines', () => {
    // THE DECIDING CASE. A drag emits the levels it has just produced, the host hands them back as
    // a new prop, and the reconciliation re-runs. Rebuilding here destroys the line under the
    // pointer mid-gesture — and the observable of that is a remove/create pair on the series.
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press, release, levels } = mounted(ledger, [100]);
    expect(ledger.created).toBe(1);
    expect(ledger.removed).toBe(0);

    press(100);
    release(140);

    expect(levels).toEqual([[140]]);
    // The prop changed from [100] to [140], and the drawing is ALREADY at 140 because it was the
    // drag that put it there. Without the equality guard, the effect would clear and recreate.
    expect(ledger.created).toBe(1);
    expect(ledger.removed).toBe(0);
  });

  it('POSITIVE CONTROL: a REALLY different set does rebuild', () => {
    // Without this half, a reconciliation that never did anything would pass the case above.
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { setLevels } = mounted(ledger, [100]);
    expect(ledger.created).toBe(1);

    setLevels([100, 200]);

    expect(ledger.created).toBe(3);
    expect(ledger.removed).toBe(1);
  });
});

/** A layer that claims an anchor everywhere, so a missing lock is never the hit-test's doing. */
const alwaysAnchored: DrawingBinding = () => ({
  setActiveTool: () => undefined,
  deleteSelection: () => undefined,
  clearAll: () => undefined,
  anchorAt: () => true,
  detach: () => undefined,
});

/** Only the writes that touch the panning pair; the surface applies plenty of other options. */
const axisWrites = (ledger: Ledger): Array<Record<string, unknown>> =>
  ledger.chartOptions.filter((options) => 'handleScroll' in options);

const LOCKED = { handleScroll: false, handleScale: false };
const FREE = { handleScroll: true, handleScale: true };

function locksOn(
  ledger: Ledger,
  binding: DrawingBinding | undefined,
): { press: (y: number) => void; release: () => void } {
  const view = render(
    <ChartSurface
      engine={draggableEngine(ledger)}
      convention={CONVENTION}
      data={{ bars: BARS, panes: [], read, pricePane: PRICE }}
      layout={{ heightPx: 400 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
      alerts={{ levels: [100] }}
      drawing={{ binding }}
    />,
  );
  const host = view.container.querySelector('[role="img"]') as HTMLElement;
  host.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height: 400 }) as DOMRect;
  return {
    press: (y) => {
      act(() => {
        host.dispatchEvent(
          new MouseEvent('mousedown', { clientY: y, bubbles: true, cancelable: true }),
        );
      });
    },
    release: () => {
      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
    },
  };
}

/**
 * DRAG-02 — THE TWO AXIS LOCKS, MEASURED TOGETHER RATHER THAN ASSUMED APART.
 *
 * THE QUESTION. `usePriceAlertLayer` and `attachAxisLock` both register `mousedown` in CAPTURE on
 * the same element — the canvas host — and both write the same `handleScroll`/`handleScale` pair.
 * The alert handler calls `stopPropagation`, which reads like an answer and is not one: it stops
 * the event reaching other NODES and has no effect on a second listener of the SAME node. Only
 * `stopImmediatePropagation` would do that, and nothing here calls it.
 *
 * THE MEASURED ANSWER: they DO overlap. A press that is both within grabbing distance of an alert
 * and on a drawing anchor engages both locks, and that is reachable — nothing stops a user drawing
 * a trendline whose anchor sits at the price they already alerted on. The control below isolates
 * the second write: drop the binding and the same press locks once.
 *
 * AND THE OVERLAP IS BENIGN, which is the part worth writing down. Both handlers write the SAME
 * two values, so locking twice is locking. Both hang their release off the same `window` mouseup,
 * so one release event ends both — and because both write `FREE`, the terminal state does not
 * depend on which of the two listeners runs first. There is no ordering to get wrong here.
 *
 * WHAT IS STILL ASYMMETRIC, named so the next reader does not have to find it again: the axis lock
 * also releases on `blur` and the alert layer does not. A tab switch mid-gesture therefore frees
 * the axes while an alert drag is still in flight. That is the ALERT layer missing a release, not
 * the two locks disagreeing, and it is reachable with no drawing layer present at all — so it is
 * its own defect and its own task, not this one.
 */
describe('DRAG-02 — the two axis locks, measured together', () => {
  it('BOTH engage on one press: stopPropagation does not silence a sibling on the same element', () => {
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press } = locksOn(ledger, alwaysAnchored);

    press(100);

    expect(axisWrites(ledger)).toEqual([LOCKED, LOCKED]);
  });

  it('CONTROL: with no drawing binding the same press locks ONCE, so the second write is the lock', () => {
    // Without this half the case above would pass just as well if the alert layer had written
    // twice, and the whole question would have been answered about the wrong handler.
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press } = locksOn(ledger, undefined);

    press(100);

    expect(axisWrites(ledger)).toEqual([LOCKED]);
  });

  it('one mouseup frees the chart, because both releases hang off the same window event', () => {
    const ledger: Ledger = { chartOptions: [], bubbled: 0, created: 0, removed: 0 };
    const { press, release } = locksOn(ledger, alwaysAnchored);

    press(100);
    release();

    expect(axisWrites(ledger)).toEqual([LOCKED, LOCKED, FREE, FREE]);
  });
});
