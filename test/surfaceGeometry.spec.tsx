/**
 * @jest-environment jsdom
 *
 * LMC-23 — THE CURSOR AS AN EXTERNAL STORE, and the arithmetic that justifies it.
 *
 * `hoveredTime` used to be surface state. The "once per bar" granularity came for free from the
 * discard in `useState`, and the price came with it: every bar CROSSED re-rendered the component
 * that composes six subsystems to update text only the legend shows.
 *
 * `useSyncExternalStore` has no such discard — it compares the snapshot by `Object.is` and
 * re-renders whenever it changes — so the producer compares BEFORE notifying. And the snapshot has
 * to be PRIMITIVE: an object built on read would return a new reference on every call, React would
 * warn, and in the worst case it would blow the update depth.
 *
 * HOW "ONLY THE LEGEND RE-RENDERS" BECOMES AN ASSERTION. Two independent probes:
 *  - the surface: `encodeDirection` is called twice in ITS BODY, on every render, to derive the two
 *    directional colours. Counting it counts renders of the surface.
 *  - the legend: the formatter declared by the pane is called by the model, and the model is only
 *    computed when the legend renders.
 * Crossing a bar has to move the second and not the first.
 */
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react';

import * as domainTypes from '../src/domain/types';
import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type {
  ChartEngine,
  CrosshairParam,
  PaneHandle,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { ChartHandles } from '../src/react/surface/chartHandles';
import {
  useSurfaceGeometry,
  type SurfaceGeometry,
} from '../src/react/surface/useSurfaceGeometry';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';

interface Wired {
  /** The cursor callback the mount subscribed. It is through it that the producer is exercised. */
  moveCrosshair: (time: number | null) => void;
}

function crosshairEngine(wired: Wired): ChartEngine {
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
    let subscriber: ((param: CrosshairParam) => void) | null = null;
    wired.moveCrosshair = (time) => {
      subscriber?.({ time: time ?? undefined } as CrosshairParam);
    };
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
      subscribeCrosshairMove: (handler) => {
        subscriber = handler;
      },
      unsubscribeCrosshairMove: () => {
        subscriber = null;
      },
      remove: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
    };
    return chart;
  };
}

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });
const T0 = 1_700_000_000;
const BARS: readonly Bar[] = [
  { time: utcSeconds(T0), open: 100, high: 110, low: 95, close: 105 },
  { time: utcSeconds(T0 + 60), open: 105, high: 115, low: 100, close: 112 },
  { time: utcSeconds(T0 + 120), open: 112, high: 120, low: 108, close: 118 },
];

/** Counts the formats: the legend's model calls them, and only when the legend renders. */
interface Formats {
  count: number;
}

function lane(formats: Formats): PaneSpec {
  return {
    id: paneId('lane'),
    title: 'Indicator',
    format: {
      kind: 'custom',
      format: (value: number) => {
        formats.count += 1;
        return value.toFixed(0);
      },
      minMove: 0.01,
    },
    targetHeightPx: 90,
    defaultVisible: true,
    series: [{ id: seriesId('lane-a'), label: 'Lane', shape: 'line', color: '#4fc3f7' }],
  };
}

const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [],
  defaultVisible: true,
};
const read: SeriesReader = () => [1, 2, 3];
const view = (spec: PaneSpec): PaneView => ({ spec, visible: true, heightPx: 90, lastUsedAt: 1 });

function mounted(formats: Formats): Wired {
  const wired: Wired = { moveCrosshair: () => undefined };
  render(
    <ChartSurface
      engine={crosshairEngine(wired)}
      convention={CONVENTION}
      data={{ bars: BARS, panes: [view(lane(formats))], read, pricePane: PRICE }}
      layout={{ heightPx: 400 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
    />,
  );
  // The producer runs OUTSIDE React — it is a callback from the base library — so the notification
  // is wrapped here, and not in each case.
  const emit = wired.moveCrosshair;
  return {
    moveCrosshair: (time) => {
      act(() => {
        emit(time);
      });
    },
  };
}

describe('LMC-23 — crossing a bar re-renders the legend, not the surface', () => {
  it('the body of the surface does not run again; the model of the legend does', () => {
    const formats: Formats = { count: 0 };
    const surfaceRenders = jest.spyOn(domainTypes, 'encodeDirection');
    try {
      const wired = mounted(formats);
      const surfaceBefore = surfaceRenders.mock.calls.length;
      const legendBefore = formats.count;
      expect(surfaceBefore).toBeGreaterThan(0);
      expect(legendBefore).toBeGreaterThan(0);

      wired.moveCrosshair(T0 + 60);

      // THE CENTRAL CLAUSE. The legend speaks of another bar; the surface was not touched.
      expect(formats.count).toBeGreaterThan(legendBefore);
      expect(surfaceRenders.mock.calls.length).toBe(surfaceBefore);
    } finally {
      surfaceRenders.mockRestore();
    }
  });

  it('the SAME bar notifies nobody — the discard of the state, replicated by hand', () => {
    const formats: Formats = { count: 0 };
    const wired = mounted(formats);

    wired.moveCrosshair(T0 + 60);
    const afterFirst = formats.count;

    // Dozens of pixels over the same candle: the cursor emits on every move, and the bar is the same.
    wired.moveCrosshair(T0 + 60);
    wired.moveCrosshair(T0 + 60);
    wired.moveCrosshair(T0 + 60);

    expect(formats.count).toBe(afterFirst);
  });

  it('POSITIVE CONTROL: leaving the bar and going back to rest still arrives', () => {
    // Without this half, a producer that never notified would pass the case above.
    const formats: Formats = { count: 0 };
    const wired = mounted(formats);

    wired.moveCrosshair(T0 + 60);
    const afterHover = formats.count;
    wired.moveCrosshair(null);

    expect(formats.count).toBeGreaterThan(afterHover);
  });
});

describe('LMC-23 — the snapshot never wraps in an object', () => {
  /** A minimal probe, to exercise the store directly: the producer/consumer pair is not public. */
  function Probe({ onReady }: { readonly onReady: (g: SurfaceGeometry) => void }): ReactElement {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const live = useRef<ChartHandles | null>(null);
    onReady(useSurfaceGeometry(null, live, hostRef, 'price'));
    return <div ref={hostRef} />;
  }

  function probed(): SurfaceGeometry {
    let geometry: SurfaceGeometry | null = null;
    render(
      <Probe
        onReady={(g) => {
          geometry = g;
        }}
      />,
    );
    return geometry as unknown as SurfaceGeometry;
  }

  it('two readings in a row with no movement return the SAME reference', () => {
    // The guarantee `useSyncExternalStore` demands. A number satisfies it by construction; a
    // `{ time, x, y }` built on read would break it in the same commit where somebody found it
    // useful to expose the coordinate alongside — and the symptom would be a React warning, or a
    // blown update depth, never a red test.
    const geometry = probed();

    expect(Object.is(geometry.hovered.getSnapshot(), geometry.hovered.getSnapshot())).toBe(true);

    act(() => {
      geometry.publishHovered(T0 + 60);
    });

    const first = geometry.hovered.getSnapshot();
    const second = geometry.hovered.getSnapshot();
    expect(Object.is(first, second)).toBe(true);
    expect(first).toBe(T0 + 60);
    // And the FORM, not just the equality: an object would pass `Object.is` while it was cached,
    // and would fail the day somebody built it on read.
    expect(typeof first === 'number' || first === null).toBe(true);
  });

  it('the producer notifies on the CHANGE, and only on it', () => {
    const geometry = probed();
    let notifications = 0;
    const unsubscribe = geometry.hovered.subscribe(() => {
      notifications += 1;
    });

    act(() => {
      geometry.publishHovered(T0);
      geometry.publishHovered(T0);
      geometry.publishHovered(T0);
    });
    expect(notifications).toBe(1);

    act(() => {
      geometry.publishHovered(T0 + 60);
      geometry.publishHovered(null);
    });
    expect(notifications).toBe(3);

    // And unsubscribing stops notifying — otherwise the unmounted legend would keep waking up.
    unsubscribe();
    act(() => {
      geometry.publishHovered(T0 + 120);
    });
    expect(notifications).toBe(3);
    expect(geometry.hovered.getSnapshot()).toBe(T0 + 120);
  });
});
