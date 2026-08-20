/**
 * @jest-environment jsdom
 *
 * LMC-23 — the drawing seam, and THE DISCARD BY TOOL IDENTITY.
 *
 * WHAT THIS FILE PROVES AND NOBODY WAS PROVING. The layer hears each armed tool ONCE. It is not
 * thrift: it is what lets an implementation reset the gesture state on every `setActiveTool` without
 * losing the user's gesture. This chart re-renders on every cursor movement, so a seam with no
 * discard would resend the SAME tool dozens of times per second — and the consumer's
 * implementation, which has no way of knowing that nothing changed, would reset the stroke half way
 * through.
 *
 * The existing suite covered attaching once, routing the events, mounting with no binding at all
 * and refusing without the price pane [`test/workspaceSurface.spec.tsx` § "B1/B2 — the drawing
 * seam"]. None of the four re-renders with the same tool, which is the only condition in which the
 * discard shows up.
 */
import { render } from '@testing-library/react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type { DrawingBinding, DrawingSurfaceHost } from '../src/drawing/drawingLayer';
import type {
  ChartEngine,
  PaneHandle,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';
import type { ChartHandles } from '../src/react/surface/chartHandles';
import { useDrawingSeam, type DrawingSnapInput } from '../src/react/surface/useDrawingSeam';

function fakeEngine(): ChartEngine {
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
        createPriceLine: () => ({ applyOptions: () => undefined }),
        removePriceLine: () => undefined,
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        attachPrimitive: () => undefined,
        detachPrimitive: () => undefined,
      }),
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
    };
    return chart;
  };
}

interface Log {
  /** EVERY `setActiveTool` call, in order — the discard is about the count, not about the value. */
  readonly armed: Array<string | null>;
  attaches: number;
}

function fakeBinding(log: Log): DrawingBinding {
  return () => {
    log.attaches += 1;
    return {
      setActiveTool: (id) => log.armed.push(id),
      deleteSelection: () => undefined,
      clearAll: () => undefined,
      detach: () => undefined,
    };
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
const RATE: PaneSpec = {
  id: paneId('rate'),
  title: 'Rate',
  format: { kind: 'percent', decimals: 4 },
  targetHeightPx: 90,
  defaultVisible: true,
  series: [{ id: seriesId('r'), label: 'R', shape: 'line', color: '#abc' }],
};
const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
];
/** The same bar with its high moved, and one that arrives later — the two live-data stimuli. */
const MOVED_BAR: Bar = { time: utcSeconds(1_700_000_000), open: 100, high: 112, low: 95, close: 105 };
const LATER_BAR: Bar = { time: utcSeconds(1_700_003_600), open: 105, high: 115, low: 104, close: 114 };
const read: SeriesReader = () => [1];
const view = (spec: PaneSpec): PaneView => ({ spec, visible: true, heightPx: 90, lastUsedAt: 1 });

function mounted(log: Log, tool: string | null) {
  // The SAME binding on every render: a new identity would re-attach the layer, and re-attaching is
  // losing the user's drawings — another contract, covered by the surface suite.
  const binding = fakeBinding(log);
  const engine = fakeEngine();
  const props = {
    engine,
    convention: CONVENTION,
    data: { bars: BARS, panes: [view(RATE)], read, pricePane: PRICE },
    a11y: { label: 'workspace', describedBy: 'state' },
  };
  const draw = (b: DrawingBinding, tool: string | null, heightPx = 480) => (
    <ChartSurface {...props} layout={{ heightPx }} drawing={{ binding: b, activeTool: tool }} />
  );
  const rendered = render(draw(binding, tool));
  return {
    rerender: (next: string | null, heightPx = 480): void => {
      rendered.rerender(draw(binding, next, heightPx));
    },
    /** NEW binding and new tool in the same render — the commit where attach and push coincide. */
    reattachWith: (nextBinding: DrawingBinding, next: string | null): void => {
      rendered.rerender(draw(nextBinding, next));
    },
  };
}

describe('LMC-23 — the layer hears each armed tool ONCE', () => {
  it('re-arming the SAME tool does not speak to the layer again', () => {
    const log: Log = { armed: [], attaches: 0 };
    const { rerender } = mounted(log, 'trend-line');
    expect(log.armed).toEqual(['trend-line']);

    rerender('trend-line');
    rerender('trend-line');

    // THE DECISIVE CASE. Without the discard, every render would resend — and the consumer's
    // implementation, which does not know that nothing changed, would reset the gesture in progress.
    expect(log.armed).toEqual(['trend-line']);
    expect(log.attaches).toBe(1);
  });

  it('a render that does not touch the tool does not speak to the layer either', () => {
    // The real condition: the chart re-renders for anything at all — here, the height budget.
    const log: Log = { armed: [], attaches: 0 };
    const { rerender } = mounted(log, 'trend-line');

    rerender('trend-line', 500);

    expect(log.armed).toEqual(['trend-line']);
  });

  it('POSITIVE CONTROL: switching tools still arrives, and disarming too', () => {
    // Without this half, a seam that never spoke after the attach would pass the two cases above —
    // and "hears once" would become "never hears again".
    const log: Log = { armed: [], attaches: 0 };
    const { rerender } = mounted(log, 'trend-line');

    rerender('ruler');
    rerender('ruler');
    rerender(null);
    rerender(null);

    expect(log.armed).toEqual(['trend-line', 'ruler', null]);
  });

  it('the tool armed BEFORE the attach arrives once, and not twice', () => {
    // The attach pushes whatever was armed; the push effect runs right after, in the same commit,
    // and has to recognise that the layer has already heard it.
    const log: Log = { armed: [], attaches: 0 };
    mounted(log, 'trend-line');

    expect(log.armed).toEqual(['trend-line']);
  });

  it('a NEW binding and a new tool in the same render deliver the tool only once', () => {
    // THE CASE WHERE THE RECORD OF "WHAT WAS SENT" IS THE ONLY THING HOLDING. In this commit BOTH
    // effects run: the attach, because the binding's identity changed, and the push, because the
    // tool changed. The attach already delivered the new tool; without the record, the push
    // delivers it again, and the consumer's implementation resets the gesture that has just begun.
    const log: Log = { armed: [], attaches: 0 };
    const { reattachWith } = mounted(log, 'trend-line');
    expect(log.attaches).toBe(1);

    reattachWith(fakeBinding(log), 'ruler');

    expect(log.attaches).toBe(2);
    expect(log.armed).toEqual(['trend-line', 'ruler']);
  });
});

/**
 * THE LOCK AND THE SNAP CLOSURE, driven through the hook itself rather than through the surface.
 *
 * The mode is not yet a surface prop, and the criteria here are about what the HOOK does with the
 * mode it is handed: attach the lock only for a layer that can hit-test, stop listening before the
 * layer detaches, and read the magnet at call time rather than at attach time. A harness that owns
 * those three inputs is the only place all of them can be varied.
 */

interface SeamLog {
  readonly attaches: { count: number };
  readonly hosts: DrawingSurfaceHost[];
  readonly applied: Array<Record<string, unknown>>;
  readonly duringDetach: string[];
}

const emptyLog = (): SeamLog => ({
  attaches: { count: 0 },
  hosts: [],
  applied: [],
  duringDetach: [],
});

/** One pixel per price unit, so a threshold in pixels reads as a price difference. */
const lockSeries = (): SeriesHandle => ({
  setData: () => undefined,
  applyOptions: () => undefined,
  priceScale: () => ({ applyOptions: () => undefined }),
  createPriceLine: () => ({ applyOptions: () => undefined }),
  removePriceLine: () => undefined,
  priceToCoordinate: (price) => 200 - price,
  coordinateToPrice: () => null,
  attachPrimitive: () => undefined,
  detachPrimitive: () => undefined,
});

function seamHandles(log: SeamLog): ChartHandles {
  const series = lockSeries();
  const chart = {
    panes: () => [],
    addPane: () => undefined,
    addSeries: () => series,
    applyOptions: (options: Record<string, unknown>) => log.applied.push(options),
    subscribeCrosshairMove: () => undefined,
    unsubscribeCrosshairMove: () => undefined,
    remove: () => undefined,
    timeScale: () => ({ fitContent: () => undefined }),
  };
  return { chart, candle: series, anchor: series } as unknown as ChartHandles;
}

/** `anchorAt` absent means the layer cannot hit-test, which is the no-lock case. */
function seamBinding(log: SeamLog, anchorAt: (() => boolean) | null): DrawingBinding {
  return (host) => {
    log.attaches.count += 1;
    log.hosts.push(host);
    return {
      setActiveTool: () => undefined,
      deleteSelection: () => undefined,
      clearAll: () => undefined,
      ...(anchorAt === null ? {} : { anchorAt }),
      detach: () => {
        // THE ORDERING PROBE. If the lock were still listening at this moment, this release would
        // reach a chart the base library is about to dispose. The count says whether it did.
        window.dispatchEvent(new MouseEvent('mouseup'));
        log.duringDetach.push(`applied=${log.applied.length}`);
      },
    };
  };
}

function SeamHarness({
  binding,
  snap,
  handles,
}: {
  binding: DrawingBinding;
  snap: DrawingSnapInput;
  handles: ChartHandles;
}): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<ChartHandles | null>(null);
  useEffect(() => {
    setLive(handles);
  }, [handles]);
  useDrawingSeam(live, hostRef, binding, null, {}, snap);
  return <div ref={hostRef} data-testid="seam-host" />;
}

const OFF: DrawingSnapInput = { magnet: 'off', thresholdPx: 8, bars: BARS };
const ON: DrawingSnapInput = { magnet: 'on', thresholdPx: 8, bars: BARS };

const pressHost = (view: { getByTestId: (id: string) => HTMLElement }): void => {
  view.getByTestId('seam-host').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
};

describe('DRAG-05 — the surface attaches the lock and releases it before the layer goes', () => {
  it('a layer that can hit-test its anchors gets the lock', () => {
    const log = emptyLog();
    const view = render(
      <SeamHarness binding={seamBinding(log, () => true)} snap={OFF} handles={seamHandles(log)} />,
    );

    pressHost(view);

    expect(log.applied).toEqual([{ handleScroll: false, handleScale: false }]);
  });

  it('a layer with no hit-test is left alone, so panning stays the default gesture', () => {
    // CONTROL. `anchorAt` is optional precisely so an older binding keeps working unchanged.
    const log = emptyLog();
    const view = render(
      <SeamHarness binding={seamBinding(log, null)} snap={OFF} handles={seamHandles(log)} />,
    );

    pressHost(view);

    expect(log.applied).toEqual([]);
  });

  it('the cleanup stops the lock listening BEFORE the layer detaches', () => {
    const log = emptyLog();
    const view = render(
      <SeamHarness binding={seamBinding(log, () => true)} snap={OFF} handles={seamHandles(log)} />,
    );
    pressHost(view);
    expect(log.applied).toHaveLength(1);

    view.unmount();

    // The release the layer fired on its way out reached nothing: one call in the log, the lock.
    expect(log.duringDetach).toEqual(['applied=1']);
    expect(log.applied).toEqual([{ handleScroll: false, handleScale: false }]);
  });
});

describe('MAGNET-06 — the mode is read when the anchor is placed, not when the layer attached', () => {
  it('a new bar, a new mode and a new threshold do not re-attach the layer', () => {
    // THE WHOLE REASON THE HOST CARRIES A CLOSURE AND NOT THE DATA. Re-attaching is losing every
    // drawing the user has made, and bars arrive on every tick.
    const log = emptyLog();
    const handles = seamHandles(log);
    const binding = seamBinding(log, () => true);
    const view = render(<SeamHarness binding={binding} snap={OFF} handles={handles} />);
    expect(log.attaches.count).toBe(1);

    view.rerender(
      <SeamHarness
        binding={binding}
        snap={{ magnet: 'on', thresholdPx: 20, bars: [...BARS, LATER_BAR] }}
        handles={handles}
      />,
    );

    expect(log.attaches.count).toBe(1);
  });

  it('the same host snaps by the mode in force at the call, and moves nothing already placed', () => {
    const log = emptyLog();
    const handles = seamHandles(log);
    const binding = seamBinding(log, () => true);
    const view = render(<SeamHarness binding={binding} snap={OFF} handles={handles} />);
    const host = log.hosts[0];
    const placed = host.snapPrice({ time: BARS[0].time, price: 109 });

    view.rerender(<SeamHarness binding={binding} snap={ON} handles={handles} />);

    // Off gave the pointer its own price; on gives the high. The anchor already resolved keeps the
    // value it was given, because the rule returns a number and never reaches back for one.
    expect(placed).toBe(109);
    expect(host.snapPrice({ time: BARS[0].time, price: 109 })).toBe(110);
  });

  it('the bars the snap measures against are the live ones, not the ones present at attach', () => {
    const log = emptyLog();
    const handles = seamHandles(log);
    const binding = seamBinding(log, () => true);
    const view = render(<SeamHarness binding={binding} snap={ON} handles={handles} />);
    const host = log.hosts[0];

    view.rerender(
      <SeamHarness binding={binding} snap={{ ...ON, bars: [MOVED_BAR] }} handles={handles} />,
    );

    // The high moved, and the same closure answers with the moved one.
    expect(host.snapPrice({ time: BARS[0].time, price: 109 })).toBe(112);
  });

  it('the threshold is read at the call too, so a narrower one stops snapping', () => {
    const log = emptyLog();
    const handles = seamHandles(log);
    const binding = seamBinding(log, () => true);
    const view = render(<SeamHarness binding={binding} snap={ON} handles={handles} />);
    const host = log.hosts[0];
    expect(host.snapPrice({ time: BARS[0].time, price: 109 })).toBe(110);

    view.rerender(
      <SeamHarness binding={binding} snap={{ ...ON, thresholdPx: 0 }} handles={handles} />,
    );

    expect(host.snapPrice({ time: BARS[0].time, price: 109 })).toBe(109);
  });
});
