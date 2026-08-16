/**
 * The other half of the boundary guard, added by phase 4.
 *
 * WHY THIS FILE EXISTS. `boundary.spec.ts` asserts that `src/` imports nothing — not from `apps/`,
 * not a third-party catalogue, not anything at all, at runtime or otherwise. Phase 4 put a render
 * layer in the package that has to CALL the base library, and that could have been done two ways:
 *
 *   (a) `import type { IPaneApi } from 'lightweight-charts'` in `src/`, and relax the guard's
 *       strongest clause to admit the declared peer;
 *   (b) declare the structural minimum in `src/port/chartApi.ts` and pin it against the real
 *       declarations HERE, in a directory that is never published (`files: ["dist"]`).
 *
 * (b) was chosen because the package's own abstraction layer had already chosen it: `RenderTarget`,
 * `Projection` and
 * `Overlay` exist precisely so that an overlay author never meets the
 * base library's types. A port one level down is the same decision applied consistently, and it
 * keeps `src/` importing nothing.
 *
 * THE COST OF (b) IS PAID HERE. A structural port can drift from the API it stands for and nothing
 * would notice — the consumer would find out at their own call site, which is the worst place. Every
 * assignment below fails to COMPILE if a shape drifts, and ts-jest reports a compile failure as a
 * failing suite. That is the assertion; the runtime `expect` at the end pins the version the
 * assertions were checked against, so a major bump cannot quietly inherit today's verdict.
 *
 * The `null as unknown as T` is deliberate: these values are never read. What is under test is
 * whether the ASSIGNMENT is legal, and constructing a real chart would need a DOM for nothing.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import type {
  IChartApi,
  IPaneApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ITimeScaleApi,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { Overlay, OverlayHost, Projection, RenderTarget } from '../src/extension/plugins';
import type {
  BitmapTarget,
  ChartClickParam,
  ChartLifecycle,
  CrosshairParam,
  PaneChartHandle,
  PaneHandle,
  PriceConverter,
  PriceLineHandle,
  PriceScaleHandle,
  PrimitiveHost,
  ScaleChartHandle,
  SeriesHandle,
  TimeScaleHandle,
} from '../src/port/chartApi';
import { OverlayPrimitive, type BaseZOrder, type OverlayAttachment } from '../src/render/overlayBridge';

type CandleSeries = ISeriesApi<'Candlestick', Time>;

class NoopOverlay implements Overlay {
  readonly zOrder = 'behind' as const;
  attached(_host: OverlayHost): void {}
  detached(): void {}
  draw(_target: RenderTarget, _projection: Projection): void {}
}

// ── the ports accept what the base library actually hands over ────────────────────────────────
const _paneHandle: PaneHandle = null as unknown as IPaneApi<Time>;
const _paneChart: PaneChartHandle = null as unknown as IChartApi;
const _scaleChart: ScaleChartHandle = null as unknown as IChartApi;
const _timeScale: TimeScaleHandle = null as unknown as ITimeScaleApi<Time>;
const _priceConverter: PriceConverter = null as unknown as CandleSeries;
const _attachment: OverlayAttachment = null as unknown as SeriesAttachedParameter<Time, SeriesType>;
// Derived from the contract rather than imported from `fancy-canvas`: the drawing target is whatever
// the base library passes to a renderer, and asking it that question directly cannot go out of date.
const _bitmapTarget: BitmapTarget = null as unknown as Parameters<IPrimitivePaneRenderer['draw']>[0];
const _primitiveHost: PrimitiveHost<OverlayPrimitive> = null as unknown as CandleSeries;

// ── the composed surface's ports, same rule ──────────────────────────────────────────────────
// `SeriesHandle` and `ChartLifecycle` are MIRRORS: a real series and a real chart satisfy them
// unchanged, which is what makes the consumer's adapter a pass-through rather than a translation.
// The one member that is NOT mirrored is `addSeries`, and deliberately: the base library identifies
// a series kind by an imported VALUE, and a value is the one thing a structural port cannot carry.
// So `WorkspaceChartHandle` takes a `SeriesShape` token and the adapter resolves it — the entire
// surface area of "write an adapter" for a consumer, pinned here as the only translated member.
const _seriesHandle: SeriesHandle = null as unknown as CandleSeries;
const _priceScale: PriceScaleHandle = null as unknown as ReturnType<CandleSeries['priceScale']>;
const _priceLine: PriceLineHandle = null as unknown as ReturnType<CandleSeries['createPriceLine']>;
const _lifecycle: ChartLifecycle = null as unknown as IChartApi;
// The crosshair pin runs the OTHER WAY, and that is the direction that matters: what has to hold is
// that a handler written against our narrow payload can be HANDED to the real chart. Pinning it the
// first way demanded that `CrosshairParam` carry every field the real payload has — including the
// per-series data map, which is exactly what this surface refuses to read (a mirrored series' plotted
// value is negated, so the event's copy is not the measured figure).
const _crosshair: Parameters<IChartApi['subscribeCrosshairMove']>[0] = (
  _param: CrosshairParam,
): void => {};
// Same direction, same reason: a click handler written against the narrow payload — the point, the
// pane it landed on, the bar under it — must be HANDABLE to the real chart's `subscribeClick`.
const _click: Parameters<IChartApi['subscribeClick']>[0] = (_param: ChartClickParam): void => {};
// The compact cell's one time-scale command. The real time scale is a superset of the member's
// declared return, so the adapter stays a pass-through (`timeScale: () => chart.timeScale()`).
const _fitContent: ReturnType<
  import('../src/port/chartApi').WorkspaceChartHandle['timeScale']
> = null as unknown as ITimeScaleApi<Time>;

// ── and what we hand back is what the base library accepts ───────────────────────────────────
const _primitive: ISeriesPrimitive<Time> = new OverlayPrimitive(new NoopOverlay());
const _paneView: IPrimitivePaneView = new OverlayPrimitive(new NoopOverlay()).paneViews()[0];
// The three layers are the base library's, spelled out in our own union so an overlay never has to
// import the enum. If it ever gains a fourth, this line stops compiling.
const _zOrder: BaseZOrder = null as unknown as ReturnType<NonNullable<IPrimitivePaneView['zOrder']>>;

describe('render boundary — the structural ports stand for the real declarations', () => {
  it('was pinned against a version the declared peer range still admits', () => {
    // WALKED UP, not counted. Counting directories encodes the layout of ONE checkout: three levels
    // is right inside the monorepo and wrong in the library's own repository, where `node_modules`
    // sits one level up. A test that only passes where it was written is a test about the desk it
    // was written on.
    let root = __dirname;
    while (!existsSync(join(root, 'node_modules', 'lightweight-charts'))) {
      const up = dirname(root);
      if (up === root) throw new Error('lightweight-charts is not installed anywhere above this test');
      root = up;
    }
    const installed = (
      JSON.parse(readFileSync(join(root, 'node_modules', 'lightweight-charts', 'package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
    const peer = (
      JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
        peerDependencies: Record<string, string>;
      }
    ).peerDependencies['lightweight-charts'];

    // A deliberately literal check, not a semver range engine. Widening the peer range is a decision
    // that has to be taken with the assignments above in hand, and this is what forces that meeting:
    // change either number and the test names the other one.
    expect(peer).toBe('>=5.2.0 <6');
    const [major, minor] = installed.split('.').map(Number);
    expect(major).toBe(5);
    expect(minor).toBeGreaterThanOrEqual(2);
  });

  it('holds the assignments above — this suite compiling IS the assertion', () => {
    // Listed so a reader can see what is pinned without reading the module scope, and so deleting a
    // pin is visible in a diff as a deleted name rather than as one fewer silent line.
    expect([
      _paneHandle,
      _paneChart,
      _scaleChart,
      _timeScale,
      _priceConverter,
      _attachment,
      _bitmapTarget,
      _primitiveHost,
      _zOrder,
      _seriesHandle,
      _priceScale,
      _priceLine,
      _lifecycle,
      _crosshair,
      _click,
      _fitContent,
    ]).toHaveLength(16);
    expect(_primitive).toBeInstanceOf(OverlayPrimitive);
    expect(_paneView.zOrder?.()).toBe('bottom');
  });
});
