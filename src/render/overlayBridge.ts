/**
 * `Overlay` (design.md §3) -> the base library's series-primitive contract, and the only file here
 * that knows the base library has primitives at all.
 * See docs/explanation/render.md#the-overlay-bridge and docs/explanation/render.md#anchoring-is-the-point
 */

import type { UtcSeconds } from '../domain/types';
import type { DetachOverlay, Overlay, OverlayHost, Projection, RenderTarget } from '../extension/plugins';
import type { BitmapTarget, PrimitiveHost, PriceConverter, ScaleChartHandle } from '../port/chartApi';

/** The base library's three layers. `behind` is under the price action; `ahead` is over it. */
export type BaseZOrder = 'bottom' | 'normal' | 'top';

const Z_ORDER: Readonly<Record<Overlay['zOrder'], BaseZOrder>> = {
  behind: 'bottom',
  ahead: 'top',
};

/** What the base library hands a primitive on attach. */
export interface OverlayAttachment {
  readonly chart: ScaleChartHandle;
  readonly series: PriceConverter;
  readonly requestUpdate: () => void;
}

interface OverlayRenderer {
  draw(target: BitmapTarget): void;
}

interface OverlayPaneView {
  zOrder(): BaseZOrder;
  renderer(): OverlayRenderer | null;
}

/** Media pixels in, bitmap pixels out. See docs/explanation/render.md#media-pixels-vs-bitmap-pixels */
function toRenderTarget(target: BitmapTarget): RenderTarget {
  return {
    useBitmapSpace(fn): void {
      target.useBitmapCoordinateSpace((scope) => {
        fn({
          ctx: scope.context,
          widthPx: scope.mediaSize.width,
          heightPx: scope.mediaSize.height,
          hRatio: scope.horizontalPixelRatio,
          vRatio: scope.verticalPixelRatio,
        });
      });
    },
  };
}

/** Built once per attachment and read LIVE. See docs/explanation/render.md#live-projection-not-a-snapshot */
function toProjection(attachment: OverlayAttachment): Projection {
  return {
    priceToY: (price: number) => attachment.series.priceToCoordinate(price),
    timeToX: (time: UtcSeconds) => attachment.chart.timeScale().timeToCoordinate(time),
    get barSpacing(): number {
      return attachment.chart.timeScale().options().barSpacing;
    },
  };
}

/** Structurally a series primitive: the four members of that contract it needs, and no more. */
export class OverlayPrimitive {
  /** The ONE piece of attachment state. See docs/explanation/render.md#one-piece-of-attachment-state */
  private projection: Projection | null = null;
  private readonly views: readonly OverlayPaneView[];

  constructor(private readonly overlay: Overlay) {
    // One view object per primitive. See docs/explanation/render.md#one-view-object-per-primitive
    this.views = [
      {
        zOrder: () => Z_ORDER[this.overlay.zOrder],
        renderer: () => this.renderer(),
      },
    ];
  }

  attached(attachment: OverlayAttachment): void {
    const projection = toProjection(attachment);
    this.projection = projection;
    const host: OverlayHost = { requestRedraw: attachment.requestUpdate, projection };
    this.overlay.attached(host);
  }

  detached(): void {
    this.overlay.detached();
    this.projection = null;
  }

  paneViews(): readonly OverlayPaneView[] {
    return this.views;
  }

  /** The renderer reads through to the live projection, so there is nothing to invalidate. */
  updateAllViews(): void {}

  private renderer(): OverlayRenderer | null {
    const projection = this.projection;
    // `null` means "there is nothing to draw". See docs/explanation/render.md#null-renderer-once-detached
    if (projection === null) return null;
    return {
      draw: (target: BitmapTarget) => {
        this.overlay.draw(toRenderTarget(target), projection);
      },
    };
  }
}

/**
 * Attach to the overlay's anchor and get the detach back. Idempotent.
 * See docs/explanation/render.md#attach-and-detach
 */
export function attachOverlay(
  host: PrimitiveHost<OverlayPrimitive>,
  overlay: Overlay,
): DetachOverlay {
  const primitive = new OverlayPrimitive(overlay);
  host.attachPrimitive(primitive);
  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    host.detachPrimitive(primitive);
  };
}
