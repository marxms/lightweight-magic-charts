/**
 * The bridge from `Overlay` to the base library's primitive contract.
 *
 * The properties under test are the ones the prototype got wrong first: which price scale an overlay
 * is anchored to, and which layer it paints on. Both are decided here and nowhere else, so both are
 * asserted here.
 */

import { utcSeconds } from '../src/domain/types';
import type { Overlay, OverlayHost, Projection, RenderTarget } from '../src/extension/plugins';
import type { BitmapScope, BitmapTarget, PrimitiveHost } from '../src/port/chartApi';
import { OverlayPrimitive, attachOverlay } from '../src/render/overlayBridge';
import { RecordingContext } from './renderFakes';

class SpyOverlay implements Overlay {
  host: OverlayHost | null = null;
  detachCount = 0;
  readonly seen: Array<{ target: RenderTarget; projection: Projection }> = [];

  constructor(readonly zOrder: 'behind' | 'ahead' = 'behind') {}

  attached(host: OverlayHost): void {
    this.host = host;
  }
  detached(): void {
    this.detachCount += 1;
    this.host = null;
  }
  draw(target: RenderTarget, projection: Projection): void {
    this.seen.push({ target, projection });
  }
}

function fakeBitmapTarget(ctx: RecordingContext, scope: Partial<BitmapScope> = {}): BitmapTarget {
  return {
    useBitmapCoordinateSpace(fn): void {
      fn({
        context: ctx.asContext(),
        mediaSize: { width: 800, height: 400 },
        horizontalPixelRatio: 2,
        verticalPixelRatio: 3,
        ...scope,
      });
    },
  };
}

/** A stand-in for the candle series and the chart, each answering with a recognisable number. */
function attachment(options: { priceScale?: number; barSpacing?: number } = {}) {
  const scale = options.priceScale ?? 10;
  let barSpacing = options.barSpacing ?? 7;
  return {
    requestUpdates: 0,
    setBarSpacing(next: number): void {
      barSpacing = next;
    },
    params: {
      series: { priceToCoordinate: (price: number) => price * scale },
      chart: {
        timeScale: () => ({
          timeToCoordinate: (time: number) => time + 1000,
          options: () => ({ barSpacing }),
          width: () => 800,
        }),
      },
      requestUpdate: (): void => {
        /* replaced below */
      },
    },
  };
}

describe('overlay bridge — layer', () => {
  it("maps 'behind' to the base library's bottom layer and 'ahead' to its top", () => {
    // A density field belongs under the price action. The prototype's first attempt was a custom
    // SERIES, and series paint in creation order, so it covered the candles.
    expect(new OverlayPrimitive(new SpyOverlay('behind')).paneViews()[0].zOrder()).toBe('bottom');
    expect(new OverlayPrimitive(new SpyOverlay('ahead')).paneViews()[0].zOrder()).toBe('top');
  });

  it('returns the same view array on every frame, because the base library caches on identity', () => {
    const primitive = new OverlayPrimitive(new SpyOverlay());
    expect(primitive.paneViews()).toBe(primitive.paneViews());
  });
});

describe('overlay bridge — anchoring', () => {
  it("projects prices through the ATTACHED SERIES' converter, not a scale of its own", () => {
    // This is the whole of "anchored to the candles' scale". An overlay price scale auto-scales to
    // its own extent, which is what made the prototype's first heatmap slide away from the candles.
    const overlay = new SpyOverlay();
    const primitive = new OverlayPrimitive(overlay);
    const host = attachment({ priceScale: 10 });
    primitive.attached(host.params);

    primitive.paneViews()[0].renderer()?.draw(fakeBitmapTarget(new RecordingContext()));

    expect(overlay.seen).toHaveLength(1);
    expect(overlay.seen[0].projection.priceToY(42)).toBe(420);
    expect(overlay.seen[0].projection.timeToX(utcSeconds(5))).toBe(1005);
  });

  it('reads bar spacing LIVE, so a zoom between frames is not drawn with last frame’s geometry', () => {
    const overlay = new SpyOverlay();
    const primitive = new OverlayPrimitive(overlay);
    const host = attachment({ barSpacing: 7 });
    primitive.attached(host.params);
    const projection = overlay.host?.projection as Projection;

    expect(projection.barSpacing).toBe(7);
    host.setBarSpacing(23);
    expect(projection.barSpacing).toBe(23);
  });

  it('hands the overlay MEDIA sizes and the two ratios, unmixed', () => {
    // Coordinates from a projection are media pixels; the context is bitmap space. Getting this
    // backwards draws at 1/dpr scale on a retina display and looks like a data bug.
    const overlay = new SpyOverlay();
    const primitive = new OverlayPrimitive(overlay);
    primitive.attached(attachment().params);

    primitive.paneViews()[0].renderer()?.draw(fakeBitmapTarget(new RecordingContext()));

    overlay.seen[0].target.useBitmapSpace((scope) => {
      expect(scope.widthPx).toBe(800);
      expect(scope.heightPx).toBe(400);
      expect(scope.hRatio).toBe(2);
      expect(scope.vRatio).toBe(3);
    });
  });
});

describe('overlay bridge — lifecycle', () => {
  it('has nothing to draw once detached, rather than drawing against a dead projection', () => {
    const overlay = new SpyOverlay();
    const primitive = new OverlayPrimitive(overlay);
    primitive.attached(attachment().params);
    expect(primitive.paneViews()[0].renderer()).not.toBeNull();

    primitive.detached();

    expect(primitive.paneViews()[0].renderer()).toBeNull();
    expect(overlay.detachCount).toBe(1);
    expect(overlay.host).toBeNull();
  });

  it('gives the overlay a redraw handle wired to the host', () => {
    const overlay = new SpyOverlay();
    const primitive = new OverlayPrimitive(overlay);
    let redraws = 0;
    primitive.attached({ ...attachment().params, requestUpdate: () => (redraws += 1) });

    overlay.host?.requestRedraw();

    expect(redraws).toBe(1);
  });

  it('returns an idempotent detach from attachOverlay, symmetric with subscribe (M5)', () => {
    const attached: OverlayPrimitive[] = [];
    const detached: OverlayPrimitive[] = [];
    const host: PrimitiveHost<OverlayPrimitive> = {
      attachPrimitive: (p) => attached.push(p),
      detachPrimitive: (p) => detached.push(p),
    };

    const detach = attachOverlay(host, new SpyOverlay());
    detach();
    detach();

    expect(attached).toHaveLength(1);
    expect(detached).toEqual(attached);
  });
});
