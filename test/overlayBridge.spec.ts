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

  /**
   * EDGE CASE spec.md:194 — two overlays claiming the same z-order keep their order across redraws.
   *
   * WHAT THIS REPOSITORY OWNS, AND WHAT IT DELEGATES. The base library sorts pane views by z-order
   * and its sort is `Array.prototype.sort`, which the language specification requires to be STABLE:
   * a tie keeps input order. That is the base library's property, not this one's, and it is modelled
   * below rather than re-implemented. What this repository owns is the two things that make the tie
   * survive a frame — every primitive answering the SAME layer on every call, and `paneViews()`
   * handing back the same objects each time. Either of those varying per frame is how a stable sort
   * still comes out reordered, and neither was asserted anywhere before.
   *
   * The 'ahead' overlay is the positive control: without it, a modelled sort that never moved
   * anything would satisfy the case and prove nothing.
   */
  it('keeps two overlays that tie on z-order in attach order across three redraws', () => {
    const first = new SpyOverlay('behind');
    const second = new SpyOverlay('behind');
    const over = new SpyOverlay('ahead');
    const attached: OverlayPrimitive[] = [];
    const host: PrimitiveHost<OverlayPrimitive> = {
      attachPrimitive: (p) => attached.push(p),
      detachPrimitive: () => undefined,
    };
    const labels = new Map<SpyOverlay, string>([[first, 'first'], [second, 'second'], [over, 'over']]);

    for (const overlay of [first, second, over]) {
      attachOverlay(host, overlay);
      attached[attached.length - 1].attached(attachment().params);
    }

    const LAYERS: readonly string[] = ['bottom', 'normal', 'top'];
    const frames: string[][] = [];
    const identities = attached.map((primitive) => primitive.paneViews());
    for (let frame = 0; frame < 3; frame += 1) {
      // Every primitive still hands back the SAME view objects — the base library caches on them.
      attached.forEach((primitive, at) => expect(primitive.paneViews()).toBe(identities[at]));

      const painted = [...attached]
        .sort((a, b) => LAYERS.indexOf(a.paneViews()[0].zOrder()) - LAYERS.indexOf(b.paneViews()[0].zOrder()));
      painted.forEach((primitive) => primitive.paneViews()[0].renderer()?.draw(fakeBitmapTarget(new RecordingContext())));
      frames.push(painted.map((primitive) => labels.get([first, second, over][attached.indexOf(primitive)])!));
    }

    // The tie is REAL: the two 'behind' overlays answer the same layer, so nothing but the sort's
    // stability decides which of them paints first.
    expect(attached.slice(0, 2).map((primitive) => primitive.paneViews()[0].zOrder())).toEqual(['bottom', 'bottom']);
    // And the control moved: 'ahead' sorts after both, on every one of the three frames.
    expect(frames).toEqual([
      ['first', 'second', 'over'],
      ['first', 'second', 'over'],
      ['first', 'second', 'over'],
    ]);
    expect([first.seen, second.seen, over.seen].map((seen) => seen.length)).toEqual([3, 3, 3]);
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
