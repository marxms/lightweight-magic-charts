/**
 * @jest-environment jsdom
 *
 * FILL-01 / FILL-03 — an overlay that names its anchor is measured on THAT series' scale.
 *
 * A fill drawn between two of a study's lines has to convert prices on the study's axis. A study in
 * its own lane is on a different axis from the candles, so an overlay anchored to pane zero would
 * put the shading at the right times and the wrong prices — the failure mode is a picture that looks
 * plausible and says something the numbers never did.
 *
 * WHAT IS ASSERTED IS THE GEOMETRY THAT CAME OUT, never that a call was made. Each fake series
 * converts price to coordinate with its OWN factor, so the `y` of the rectangle an overlay paints
 * names the scale it was measured on. A test that asserted `attachPrimitive` was called on the right
 * handle would pass against an implementation that then projected through the wrong one.
 *
 * The primitive is driven through the contract the base library drives it through — `paneViews()`,
 * then `renderer().draw(target)` — with the recording context the render suite already uses. There
 * is no canvas in this environment and there does not need to be: what the anchor decides is
 * arithmetic, and a recorded rectangle is a stricter reading of it than a screenshot.
 */
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec, SeriesSpec } from '../src/domain/types';
import type { Overlay, OverlayHost, Projection, RenderTarget } from '../src/extension/plugins';
import type {
  BitmapTarget,
  ChartEngine,
  PaneHandle,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { OverlayPrimitive } from '../src/render/overlayBridge';
import { ChartSurface, seriesStyleKey, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';
import { RecordingContext } from './renderFakes';

/* ---- the two panes and the reader ------------------------------------------------------- */

const spec = (id: string, label: string, color: string): SeriesSpec => ({
  id: seriesId(id),
  label,
  shape: 'line',
  color,
});

const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [spec('ovl1p1', '', '#4c9aff'), spec('ovl1p2', '', '#c792ea')],
  defaultVisible: true,
};

const LANE: PaneSpec = {
  id: paneId('ind1'),
  title: 'Lane',
  format: { kind: 'ratio', decimals: 2 },
  targetHeightPx: 120,
  defaultVisible: true,
  series: [spec('ind1p1', 'First', '#f5a623'), spec('ind1p2', 'Second', '#66bb6a')],
};

const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
  { time: utcSeconds(1_700_000_060), open: 105, high: 120, low: 100, close: 115 },
];

const READINGS: Readonly<Record<string, ReadonlyArray<number | null>>> = {
  ovl1p1: [104, 114],
  ovl1p2: [101, 111],
  ind1p1: [40, 60],
  ind1p2: [20, 30],
};
const read: SeriesReader = (_pane, series) => READINGS[String(series.id)] ?? [];

/* ---- an engine whose every series converts prices by its OWN factor ---------------------- */

/**
 * The factor is keyed by the series COLOUR because that is the only thing the port carries from a
 * `SeriesSpec` into `addSeries`. A converter that answered the same number everywhere would let a
 * wrongly anchored overlay produce the right rectangle.
 */
const FACTOR: Readonly<Record<string, number>> = {
  '#4c9aff': 2,
  '#c792ea': 3,
  '#f5a623': 5,
  '#66bb6a': 7,
  candles: 11,
};

interface Attached {
  readonly factor: number;
  readonly primitive: OverlayPrimitive;
}

/**
 * The base library calls `attached({ chart, series, requestUpdate })` on a primitive the moment it
 * is attached, and the `series` it passes is the one it was attached TO. That handover is the whole
 * mechanism under test, so the fake performs it rather than skipping to the recording.
 */
const SCALE = {
  timeScale: () => ({
    timeToCoordinate: (time: number) => time,
    options: () => ({ barSpacing: 6 }),
    width: () => 400,
  }),
};

function fakeEngine(): { attached: Attached[]; engine: ChartEngine } {
  const attached: Attached[] = [];
  const panesOf = (): PaneHandle[] => panes;
  const panes: PaneHandle[] = [];
  const addPane = (): PaneHandle => {
    const index = panes.length;
    const pane: PaneHandle = {
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      getHTMLElement: () => null,
    };
    panes.push(pane);
    return pane;
  };
  addPane();
  const engine: ChartEngine = (_host, _options) => {
    const chart: WorkspaceChartHandle = {
      addSeries: (_shape, options) => {
        const colour = (options as { color?: string }).color ?? '';
        const factor = FACTOR[colour] ?? FACTOR.candles;
        const handle: SeriesHandle = {
          setData: () => undefined,
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: (price) => price * factor,
          coordinateToPrice: () => null,
          attachPrimitive: (primitive) => {
            const held = primitive as OverlayPrimitive;
            held.attached({ chart: SCALE, series: handle, requestUpdate: () => undefined });
            attached.push({ factor, primitive: held });
          },
          detachPrimitive: () => undefined,
        };
        return handle;
      },
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
      panes: panesOf,
      addPane,
    };
    return chart;
  };
  return { attached, engine };
}

/* ---- an overlay that paints exactly one rectangle, at a price it is told ----------------- */

class ProbeOverlay implements Overlay {
  host: OverlayHost | null = null;
  readonly zOrder = 'behind' as const;

  constructor(
    readonly anchor: string | undefined,
    private readonly price: number,
  ) {}

  attached(host: OverlayHost): void {
    this.host = host;
  }
  detached(): void {
    this.host = null;
  }
  draw(target: RenderTarget, projection: Projection): void {
    target.useBitmapSpace(({ ctx }) => {
      const y = projection.priceToY(this.price);
      if (y === null) return;
      ctx.fillStyle = '#123456';
      ctx.fillRect(0, y, 10, 4);
    });
  }
}

const bitmapTarget = (ctx: RecordingContext): BitmapTarget => ({
  useBitmapCoordinateSpace(fn): void {
    fn({
      context: ctx.asContext(),
      mediaSize: { width: 400, height: 200 },
      horizontalPixelRatio: 1,
      verticalPixelRatio: 1,
    });
  },
});

/** Drive the primitive the way the base library does, and read back what it painted. */
function paintedY(primitive: OverlayPrimitive): number | null {
  const ctx = new RecordingContext();
  const renderer = primitive.paneViews()[0]?.renderer();
  if (renderer === null || renderer === undefined) return null;
  renderer.draw(bitmapTarget(ctx));
  return ctx.rects[0]?.y ?? null;
}

function mount(overlays: readonly Overlay[]): Attached[] {
  const recording = fakeEngine();
  const panes: readonly PaneView[] = [{ spec: LANE, visible: true, heightPx: 120, lastUsedAt: 1 }];
  render(
    <ChartSurface
      engine={recording.engine}
      convention={directionConvention({ upColor: '#26a69a', downColor: '#ef5350' })}
      data={{ bars: BARS, panes, read, pricePane: PRICE, priceCaption: 'ABC' }}
      layout={{ heightPx: 600 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
      overlays={overlays}
    />,
  );
  return recording.attached;
}

/* ---- the cases -------------------------------------------------------------------------- */

describe('FILL-01 — an overlay is measured on the scale it names', () => {
  it('projects a named lane series through THAT series scale, not the pane-zero one', () => {
    const anchored = new ProbeOverlay(seriesStyleKey('ind1', 'ind1p2'), 6);
    const attached = mount([anchored]);

    // `#66bb6a` is `ind1p2`, whose factor is 7: a price of 6 lands at 42. Anchored to the candles it
    // would land at 66, and to `ind1p1` at 30 — three distinguishable answers for one input.
    expect(attached).toHaveLength(1);
    expect(paintedY(attached[0].primitive)).toBe(42);
  });

  it('projects an overlay that names NOTHING through the pane-zero series, as it always did', () => {
    const attached = mount([new ProbeOverlay(undefined, 6)]);

    expect(attached).toHaveLength(1);
    expect(paintedY(attached[0].primitive)).toBe(66);
  });

  it('keeps both kinds side by side, each on its own scale', () => {
    const attached = mount([
      new ProbeOverlay(undefined, 6),
      new ProbeOverlay(seriesStyleKey('price', 'ovl1p2'), 6),
      new ProbeOverlay(seriesStyleKey('ind1', 'ind1p1'), 6),
    ]);

    expect(attached.map((entry) => paintedY(entry.primitive))).toEqual([66, 18, 30]);
  });

  it('falls back to pane zero when the named series does not exist, rather than drawing nothing', () => {
    const attached = mount([new ProbeOverlay(seriesStyleKey('ind9', 'ind9p1'), 6)]);

    expect(attached).toHaveLength(1);
    expect(paintedY(attached[0].primitive)).toBe(66);
  });
});

describe('FILL-03 — an anchored overlay still paints beneath the lines it spans', () => {
  it('declares the base library bottom layer, which is painted before any series in the pane', () => {
    const attached = mount([new ProbeOverlay(seriesStyleKey('ind1', 'ind1p1'), 6)]);

    expect(attached[0].primitive.paneViews()[0].zOrder()).toBe('bottom');
  });

  // CONTROL POSITIVE: the member is a real choice, not a constant. An implementation that returned
  // `'bottom'` for everything would pass the case above and fail this one.
  it('still declares the top layer for an overlay that asks to be ahead', () => {
    const ahead: Overlay = {
      zOrder: 'ahead',
      anchor: seriesStyleKey('ind1', 'ind1p1'),
      attached: () => undefined,
      detached: () => undefined,
      draw: () => undefined,
    };
    const attached = mount([ahead]);

    expect(attached[0].primitive.paneViews()[0].zOrder()).toBe('top');
  });
});
