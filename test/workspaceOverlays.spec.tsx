/**
 * @jest-environment jsdom
 *
 * FILL-01 / FILL-02 — the host's own overlay reaches the pane of the study it annotates.
 *
 * A band between two of a study's lines is the host's drawing, by design: the package publishes
 * WHERE a primitive anchors and refuses to learn `transp`, `fillgaps` and `label_up`. That decision
 * is only worth anything if the host's array actually arrives — through `WorkspaceStudies`, past the
 * region that builds the package's two field overlays, and onto the series it named.
 *
 * MOUNTED AS A HOST MOUNTS IT — `<ChartWorkspace>` with a catalogue, a port and a study, never a
 * probe of `useOverlayFields`. The socket this closes is exactly the kind a mount assertion cannot
 * see: an overlay that never attaches renders the same DOM as one that did.
 *
 * AND THE ASSERTION IS THE GEOMETRY, not the attachment. Every fake series converts price by its own
 * factor, so the `y` of the rectangle the overlay paints names the series it was anchored to. The
 * primitive is driven the way the base library drives it: attach, ask the pane view for a renderer,
 * draw.
 */
import { act, render } from '@testing-library/react';

import { seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec, Scope } from '../src/domain/types';
import { paneId } from '../src/domain/types';
import { laneSeriesId } from '../src/catalogue/lanes';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { PlottableSource } from '../src/catalogue/sources';
import { resolveSources } from '../src/indicator/resolution';
import type { Overlay, OverlayHost, Projection, RenderTarget } from '../src/extension/plugins';
import type {
  BitmapTarget,
  ChartEngine,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { FrameSink, HistoryResult, MarketDataPort, Unsubscribe } from '../src/port/ports';
import type { OverlayPrimitive } from '../src/render/overlayBridge';
import { seriesStyleKey } from '../src/react/surface/ChartSurface';
import { ChartWorkspace } from '../src/react/workspace/ChartWorkspace';
import type { WorkspaceSetupPolicy } from '../src/tabs/setup';
import { RecordingContext } from './renderFakes';

/* ---- the smallest workspace that draws a study in a lane --------------------------------- */

const BARS: readonly Bar[] = [
  { time: utcSeconds(1000), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: utcSeconds(2000), open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
];

const STUDY_ID = 'lane-study';
const LANE_COLOR = '#f5a623';
const CANDLE_COLOR = 'candles';

const CATALOGUE: WorkspaceSetupPolicy = {
  catalogue: [{ id: 'price', defaultVisible: true, heightPx: 200, title: 'Price' }],
  servedTimeframes: ['1h'],
  gridFallback: ['1h'],
  maxGridCells: 2,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: () => [STUDY_ID],
};

const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [],
  defaultVisible: true,
};

/** Values far from the price, so the resolver files it in a LANE rather than over the candles. */
const STUDY: PlottableSource = {
  id: STUDY_ID,
  label: 'Lane study',
  placement: 'own-pane',
  series: () => [
    {
      spec: { id: seriesId('a'), label: 'A', shape: 'line', color: '#ffffff' },
      provider: { id: seriesId('a'), compute: (bars) => bars.map((bar) => ({ time: bar.time, value: 900 })) },
    },
  ],
};

const port: MarketDataPort = {
  describe: () => [],
  subscribe: (_scope: Scope, _sink: FrameSink): Unsubscribe => () => undefined,
  fetchBars: async (): Promise<HistoryResult> => ({ bars: BARS, exhausted: true }),
};

/* ---- an engine that hands each series its own price scale --------------------------------- */

const FACTOR: Readonly<Record<string, number>> = { [LANE_COLOR]: 5, [CANDLE_COLOR]: 11 };

const SCALE = {
  timeScale: () => ({
    timeToCoordinate: (time: number) => time,
    options: () => ({ barSpacing: 6 }),
    width: () => 400,
  }),
};

interface Anchoring {
  readonly factor: number;
  readonly primitive: OverlayPrimitive;
}

function fakeEngine(): { anchored: Anchoring[]; engine: ChartEngine } {
  const anchored: Anchoring[] = [];
  const engine: ChartEngine = () => {
    let paneCount = 1;
    const pane = (index: number) => ({
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      getHTMLElement: () => null,
    });
    return {
      panes: () => Array.from({ length: paneCount }, (_unused, index) => pane(index)),
      addPane: () => {
        paneCount += 1;
        return pane(paneCount - 1);
      },
      addSeries: (_shape: unknown, options: Record<string, unknown>): SeriesHandle => {
        const factor = FACTOR[String(options.color ?? '')] ?? FACTOR[CANDLE_COLOR];
        const handle = {
          setData: () => undefined,
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: (price: number) => price * factor,
          coordinateToPrice: () => null,
          attachPrimitive: (primitive: unknown) => {
            anchored.push({ factor, primitive: primitive as OverlayPrimitive });
          },
          detachPrimitive: () => undefined,
        } as unknown as SeriesHandle;
        return handle;
      },
      applyOptions: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
    } as unknown as WorkspaceChartHandle;
  };
  return { anchored, engine };
}

/* ---- an overlay that paints one rectangle, at a price it is told -------------------------- */

class ProbeOverlay implements Overlay {
  host: OverlayHost | null = null;
  readonly zOrder = 'behind' as const;

  constructor(readonly anchor: string | undefined) {}

  attached(host: OverlayHost): void {
    this.host = host;
  }
  detached(): void {
    this.host = null;
  }
  draw(target: RenderTarget, projection: Projection): void {
    target.useBitmapSpace(({ ctx }) => {
      const y = projection.priceToY(4);
      if (y === null) return;
      ctx.fillStyle = '#123456';
      ctx.fillRect(0, y, 8, 4);
    });
  }
}

/** Drive the primitive through the handle it was attached to, and read back what it painted. */
function paintedY(entry: Anchoring): number | null {
  const ctx = new RecordingContext();
  const target: BitmapTarget = {
    useBitmapCoordinateSpace: (fn) =>
      fn({
        context: ctx.asContext(),
        mediaSize: { width: 400, height: 200 },
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
      }),
  };
  entry.primitive.attached({
    chart: SCALE,
    series: { priceToCoordinate: (price: number) => price * entry.factor },
    requestUpdate: () => undefined,
  });
  entry.primitive.paneViews()[0].renderer()?.draw(target);
  return ctx.rects[0]?.y ?? null;
}

async function mount(overlays?: readonly Overlay[]): Promise<Anchoring[]> {
  const recording = fakeEngine();
  await act(async () => {
    render(
      <ChartWorkspace
        catalogue={CATALOGUE}
        panes={[PRICE]}
        data={{ port, engine: recording.engine, symbol: 'AAA-BBB' }}
        layout={{ heightPx: 480 }}
        studies={{
          catalogue: [
            {
              id: STUDY_ID,
              label: 'Lane study',
              category: 'Studies',
              provider: { id: seriesId(STUDY_ID), compute: () => [] },
            },
          ],
          resolve: (ids, bars) =>
            resolveSources(ids, (id) => (id === STUDY_ID ? STUDY : undefined), bars, resolutionPolicy({ lanes: 2 })),
          capacity: 2,
          lanes: { plots: 1, colors: [LANE_COLOR], heightPx: 120 },
          ...(overlays === undefined ? {} : { overlays }),
        }}
      />,
    );
  });
  // The seed resolves on a promise, so the effects that attach run on the flush after it.
  await act(async () => undefined);
  return recording.anchored;
}

/* ---- the cases ---------------------------------------------------------------------------- */

describe("FILL-01/02 — a host overlay reaches the study's own pane", () => {
  it('attaches nothing of the host when the host declared nothing', async () => {
    // The package's own two field overlays are switched OFF by this catalogue, so an unfed socket
    // and a fed one are told apart by a count of zero against a count of one.
    const anchored = await mount();

    expect(anchored).toEqual([]);
  });

  it('paints the host overlay on the LANE scale it named, not on the candles', async () => {
    const anchored = await mount([new ProbeOverlay(seriesStyleKey('ind1', laneSeriesId(0, 0)))]);

    // `ind1p1` is the lane's only line, colour `#f5a623`, factor 5: a price of 4 lands at 20.
    // Anchored to the candles it would land at 44 — the answer this returned before the path existed.
    expect(anchored).toHaveLength(1);
    expect(paintedY(anchored[0])).toBe(20);
  });

  it('paints a host overlay that named NOTHING on the pane-zero series', async () => {
    const anchored = await mount([new ProbeOverlay(undefined)]);

    expect(anchored).toHaveLength(1);
    expect(paintedY(anchored[0])).toBe(44);
  });

  it('keeps two host overlays apart, each on the scale it named', async () => {
    const anchored = await mount([
      new ProbeOverlay(seriesStyleKey('ind1', laneSeriesId(0, 0))),
      new ProbeOverlay(undefined),
    ]);

    expect(anchored.map(paintedY)).toEqual([20, 44]);
  });
});
