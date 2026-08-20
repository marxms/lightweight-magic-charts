/**
 * @jest-environment jsdom
 *
 * The main canvas region, and the two bindings it absorbed.
 *
 * THE SEED IS HELD TO A RECORDED SEQUENCE, NOT TO ITS RESULT. The same bars are reachable by
 * fetching first and subscribing after, and that ordering is precisely the defect the seed
 * transaction exists to rule out — so what is asserted is the ORDER of port calls, captured from the
 * hook this region absorbs before it was deleted, and kept in `fixtures/candleLaneParity.json`.
 *
 * THE ENGINE IS A FAKE, NOT A MOCKED PACKAGE: the region talks to the base library through
 * `ChartEngine`, so the whole canvas runs without a canvas.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

import { paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec, Scope } from '../src/domain/types';
import { directionConvention } from '../src/domain/types';
import type { DrawingBinding, DrawingLayer } from '../src/drawing/drawingLayer';
import { clearDrawingMemory } from '../src/drawing/drawingMemory';
import type { Overlay } from '../src/extension/plugins';
import type { StackApplication } from '../src/layout/application';
import type {
  ChartEngine,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { FrameSink, HistoryRequest, HistoryResult, MarketDataPort, Unsubscribe } from '../src/port/ports';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { CanvasSurface } from '../src/react/workspace/CanvasSurface';
import type { CandleLaneState } from '../src/react/useCandleLane';
import { DrawingRail, DrawingRailProvider, useDrawingRail } from '../src/react/workspace/DrawingRail';

const PARITY = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'candleLaneParity.json'), 'utf8'),
) as { order: string[]; orderAfterUnmount: string[]; bars: number; seam: string; outcome: string };

const SCOPE: Scope = { instrument: 'BTC/USDT', resolution: '1h', venue: 'binance', market: 'perp' };
const BARS: readonly Bar[] = [
  { time: utcSeconds(1000), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: utcSeconds(2000), open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
];
const PRICE_PANE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [],
  defaultVisible: true,
};
const VOLUME_PANE: PaneSpec = {
  id: paneId('volume'),
  title: 'Volume',
  format: { kind: 'price', minMove: 0.01 },
  series: [{ id: seriesId('vol'), label: 'Vol', shape: 'histogram', color: '#888' }],
  defaultVisible: true,
};
const CONVENTION = directionConvention({ upColor: '#0a0', downColor: '#a00' });

/** The port, recording every call in the order it receives them — the shape the fixture holds. */
function recordingPort(order: string[]): { port: MarketDataPort; sink: () => FrameSink } {
  let captured: FrameSink | null = null;
  return {
    sink: () => captured as FrameSink,
    port: {
      describe: () => [],
      subscribe: (scope: Scope, sink: FrameSink): Unsubscribe => {
        captured = sink;
        order.push(`subscribe ${scope.instrument}·${scope.resolution}@${scope.venue}/${scope.market}`);
        return () => order.push('unsubscribe');
      },
      fetchBars: async (req: HistoryRequest): Promise<HistoryResult> => {
        order.push(
          `fetchBars ${req.scope.instrument}·${req.scope.resolution} from=${req.from} to=${req.to} barCount=${req.barCount} aborted=${req.signal.aborted}`,
        );
        return { bars: BARS, exhausted: true };
      },
    },
  };
}

interface SeriesRecord {
  data: Array<{ readonly time: number }>;
  readonly attached: Overlay[];
}

function fakePane(index: number) {
  return {
    setStretchFactor: () => undefined,
    getStretchFactor: () => 1,
    getHTMLElement: () => null,
    setPreserveEmptyPane: () => undefined,
    moveTo: () => undefined,
    paneIndex: () => index,
  };
}

/** `scale` prices the fake axis. Absent, the axis answers nothing, which is what most cases want. */
function fakeEngine(
  framing?: { calls: Array<{ from: number; to: number }> },
  scale?: (price: number) => number | null,
) {
  const series: SeriesRecord[] = [];
  const engine: ChartEngine = () => {
    let paneCount = 1;
    const chart: WorkspaceChartHandle = {
      panes: () => Array.from({ length: paneCount }, (_unused, index) => fakePane(index)),
      addPane: () => {
        paneCount += 1;
        return fakePane(paneCount - 1);
      },
      addSeries: (): SeriesHandle => {
        const record: SeriesRecord = { data: [], attached: [] };
        series.push(record);
        return {
          setData: (data: unknown) => {
            record.data = [...(data as SeriesRecord['data'])];
          },
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: (price: number) => scale?.(price) ?? null,
          coordinateToPrice: () => null,
          attachPrimitive: (primitive: unknown) => record.attached.push(primitive as Overlay),
          detachPrimitive: () => undefined,
          setMarkers: () => undefined,
        } as unknown as SeriesHandle;
      },
      applyOptions: () => undefined,
      timeScale: () => ({
        // Records that the surface framed at all. Framing by logical index used to be recorded here
        // too; it was measured on the deploy at 0.00 fill on every interval change and removed.
        fitContent: () => framing?.calls.push({ from: 0, to: 0 }),
      }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
    } as unknown as WorkspaceChartHandle;
    return chart;
  };
  return { engine, series };
}

class FakeLayer implements DrawingLayer {
  readonly armed: (string | null)[] = [];
  setActiveTool(toolId: string | null): void {
    this.armed.push(toolId);
  }
  deleteSelection(): void {}
  clearAll(): void {}
  detach(): void {}
}

/** The host's own control, standing where the demo's toggle stands: it holds no copy of the mode. */
function MagnetSwitch(): ReactElement {
  const { setMagnet } = useDrawingRail();
  return (
    <button type="button" data-testid="magnet" onClick={() => setMagnet('on')}>
      magnet
    </button>
  );
}

interface HarnessProps {
  readonly port: MarketDataPort;
  readonly binding?: DrawingBinding;
  readonly magnetSwitch?: boolean;
  readonly snapThresholdPx?: number;
  readonly onLayout?: (application: StackApplication) => void;
  readonly onLane?: (state: CandleLaneState) => void;
  readonly showDensity?: boolean;
  readonly showProfile?: boolean;
  readonly engine: ChartEngine;
  readonly heightPx?: number;
}

function Harness({
  port,
  binding,
  magnetSwitch,
  snapThresholdPx,
  onLayout,
  onLane,
  showDensity,
  showProfile,
  engine,
  heightPx = 600,
}: HarnessProps): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <DrawingRailProvider
        vocabulary={{ tools: [{ id: 'trend-line', label: 'Trend', glyph: '/' }] }}
        binding={binding}
        market="BTC/USDT"
      >
        <DrawingRail heightPx={heightPx} />
        {magnetSwitch === true ? <MagnetSwitch /> : null}
        <CanvasSurface
          engine={engine}
          convention={CONVENTION}
          data={{
            panes: [{ spec: VOLUME_PANE, visible: true, heightPx: 90, lastUsedAt: 1 }],
            read: () => [],
            pricePane: PRICE_PANE,
            priceCaption: 'BTC/USDT · 1h',
            datasetId: 'BTC/USDT·1h',
          }}
          layout={{ heightPx, onLayout }}
          a11y={{ label: 'BTC/USDT · 1h', describedBy: 'state' }}
          lane={{ scope: SCOPE, port, barCount: 800 }}
          fields={{ showDensity, showProfile }}
          snapThresholdPx={snapThresholdPx}
          onLane={onLane}
        />
      </DrawingRailProvider>
    </WorkspaceChromeProvider>
  );
}

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

function seed(sink: FrameSink): void {
  act(() => {
    sink.onStatus('open');
    sink.onFrame({
      kind: 'snapshot',
      gen: 1,
      seq: 1,
      scope: SCOPE,
      state: new Map(),
      baseline: 1,
      baselineTime: 2000,
    });
  });
}

beforeEach(() => {
  clearDrawingMemory();
});

describe('the canvas surface region', () => {
  it('makes the same sequence of port calls the absorbed hook made', async () => {
    const order: string[] = [];
    const { port, sink } = recordingPort(order);
    const { engine } = fakeEngine();
    const view = render(<Harness port={port} engine={engine} />);
    seed(sink());
    await settle();
    expect(order).toEqual(PARITY.order);
    view.unmount();
    expect(order).toEqual(PARITY.orderAfterUnmount);
  });

  it('reaches the same seed verdict the absorbed hook reached, on the same frames', async () => {
    const order: string[] = [];
    const { port, sink } = recordingPort(order);
    const { engine } = fakeEngine();
    const reported: CandleLaneState[] = [];
    render(<Harness port={port} engine={engine} onLane={(state) => reported.push(state)} />);
    seed(sink());
    await settle();
    const last = reported[reported.length - 1];
    expect({ bars: last.bars.length, seam: last.seam, outcome: last.outcome }).toEqual({
      bars: PARITY.bars,
      seam: PARITY.seam,
      outcome: PARITY.outcome,
    });
  });

  it('draws the seeded bars on the canvas rather than an empty window', async () => {
    const order: string[] = [];
    const { port, sink } = recordingPort(order);
    const { engine, series } = fakeEngine();
    render(<Harness port={port} engine={engine} />);
    seed(sink());
    await settle();
    // The PRICED points are the bars and nothing else. Asserting on every point would now conflate
    // the candles with the future room, and a test that cannot tell them apart would pass just as
    // happily if the room started inventing prices.
    const priced = series[0].data.filter((point) => 'close' in point);
    expect(priced.map((point) => point.time)).toEqual([1000, 2000]);
  });

  it('reserves a tenth of the history as future room, and puts no price in it', async () => {
    const order: string[] = [];
    const { port, sink } = recordingPort(order);
    const { engine, series } = fakeEngine();
    render(<Harness port={port} engine={engine} />);
    seed(sink());
    await settle();
    // Seeded at 1000 and 2000: step 1000. A tenth of two floors at the short margin, so twelve
    // columns. `fitContent` frames the room WITH the candles, which is why the room is a tenth and
    // not the whole history — measured on the deploy.
    const room = series[0].data.filter((point) => !('close' in point));
    expect(room).toHaveLength(12);
    expect(room[0]).toEqual({ time: 3000 });
    expect(room[11]).toEqual({ time: 14000 });
    for (const point of room) expect(Object.keys(point)).toEqual(['time']);
  });

  it('reports what the layout did with the budget instead of leaving it unsaid', async () => {
    const order: string[] = [];
    const { port } = recordingPort(order);
    const { engine } = fakeEngine();
    const applied: StackApplication[] = [];
    render(<Harness port={port} engine={engine} onLayout={(a) => applied.push(a)} />);
    await settle();
    expect(applied.length).toBeGreaterThan(0);
  });

  it('attaches only the fields that are switched on', async () => {
    const order: string[] = [];
    const { port } = recordingPort(order);
    const off = fakeEngine();
    const view = render(<Harness port={port} engine={off.engine} />);
    await settle();
    expect(off.series[0].attached).toHaveLength(0);
    view.unmount();

    const on = fakeEngine();
    render(<Harness port={port} engine={on.engine} showDensity showProfile />);
    await settle();
    expect(on.series[0].attached).toHaveLength(2);
  });

  it('takes the drawing seam from the rail above it, not from a prop of its own', async () => {
    const order: string[] = [];
    const { port } = recordingPort(order);
    const { engine } = fakeEngine();
    const layer = new FakeLayer();
    render(<Harness port={port} engine={engine} binding={() => layer} />);
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: 'Trend' }));
    expect(layer.armed).toContain('trend-line');
  });

  /**
   * THE MODE IS ASSERTED THROUGH ITS EFFECT, not through the prop it travelled on.
   *
   * A region that declared the field and never passed it renders identically, which is why the
   * question asked here is the one the binding asks: what price does the seam hand back? The axis
   * is priced linearly by the fake so the answer is arithmetic and not a guess — the second bar's
   * high sits one pixel from the pointer, and its close four.
   */
  const linear = (price: number): number => 100 - price * 10;

  function snapper(captured: { at: ((price: number) => number) | null }): DrawingBinding {
    return (host) => {
      captured.at = (price) => host.snapPrice({ time: utcSeconds(2000), price });
      return new FakeLayer();
    };
  }

  it('hands the seam the rail magnet: OFF keeps the pointer price, ON reaches the bar value', async () => {
    const order: string[] = [];
    const { port } = recordingPort(order);
    const { engine } = fakeEngine(undefined, linear);
    const captured: { at: ((price: number) => number) | null } = { at: null };
    render(<Harness port={port} engine={engine} binding={snapper(captured)} magnetSwitch />);
    await settle();

    // Default: the library never starts on the behaviour the magnet exists to escape.
    expect(captured.at?.(2.9)).toBe(2.9);
    fireEvent.click(screen.getByTestId('magnet'));
    // The second bar's high, exactly — not the close four pixels further away.
    expect(captured.at?.(2.9)).toBe(3);
  });

  it('hands the seam the threshold the host set, so a reach of zero snaps to nothing', async () => {
    const order: string[] = [];
    const { port } = recordingPort(order);
    const { engine } = fakeEngine(undefined, linear);
    const captured: { at: ((price: number) => number) | null } = { at: null };
    render(
      <Harness
        port={port}
        engine={engine}
        binding={snapper(captured)}
        magnetSwitch
        snapThresholdPx={0}
      />,
    );
    await settle();

    fireEvent.click(screen.getByTestId('magnet'));
    expect(captured.at?.(2.9)).toBe(2.9);
  });
});
