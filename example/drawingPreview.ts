/**
 * The dashed trace between the anchors already placed and the cursor.
 *
 * WITHOUT IT THE GESTURE IS BLIND. A two-anchor tool takes two clicks, and between them nothing
 * moved and nothing appeared — the first anchor was invisible and the drawing arrived as a surprise.
 * The rail looked broken for the same reason the whole package did before the creation layer: the
 * feedback was missing, not the function.
 *
 * PORTED from the streamer's `apps/web/src/config/drawingPreview.ts`, with one deliberate change:
 * the types come from THIS library's port (`BitmapTarget`, `TimeScaleHandle`, `PriceConverter`)
 * rather than from `fancy-canvas`. That package is a transitive of `lightweight-charts`, not a
 * declared dependency here, so importing its types would tie this file to a resolution nobody
 * promised. The library already publishes the same shapes for exactly this purpose.
 *
 * IT IS A PREVIEW, NEVER A DRAWING. It paints and holds no state that outlives the gesture — the
 * real drawing is built by the registry once the last anchor lands.
 */
import type {
  BitmapScope,
  BitmapTarget,
  HorzScaleItem,
  PriceConverter,
  ScaleChartHandle,
} from 'lightweight-magic-charts';

export interface PreviewAnchor {
  readonly time: HorzScaleItem;
  readonly price: number;
}

export interface PreviewState {
  readonly tool: string;
  readonly anchors: readonly PreviewAnchor[];
  readonly cursor: PreviewAnchor | null;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface RendererData {
  readonly points: readonly Point[];
  readonly tool: string;
  /** True when the LAST point is the live cursor rather than a placed anchor. */
  readonly hasCursor: boolean;
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** Tools previewed as a box rather than as a segment. */
const RECT_TOOLS = new Set([
  'rectangle',
  'date-price-range',
  'date-range',
  'price-range',
  'long-position',
  'short-position',
  'gann-box',
  'rotated-rectangle',
]);

const STROKE = 'rgba(41,98,255,0.95)';
const FILL = 'rgba(41,98,255,0.12)';

function paint(scope: BitmapScope, data: RendererData): void {
  const ctx = scope.context;
  const h = scope.horizontalPixelRatio;
  const v = scope.verticalPixelRatio;
  const pts = data.points.map((p) => ({ x: p.x * h, y: p.y * v }));

  ctx.save();
  ctx.strokeStyle = STROKE;
  ctx.fillStyle = FILL;
  ctx.lineWidth = Math.max(1, Math.round(1.5 * h));
  ctx.setLineDash([6 * h, 4 * h]);

  // FIRST to LAST, not first to second: with three or four anchors the shape keeps following the
  // cursor instead of freezing on the pair that is already placed.
  const a = pts[0];
  const b = pts[pts.length - 1];
  const width = scope.mediaSize.width * h;
  const height = scope.mediaSize.height * v;

  if (data.tool === 'horizontal-line' || data.tool === 'horizontal-ray') {
    // A one-anchor tool closes on the FIRST click, so without a ghost here it looks dead from the
    // moment it is armed until the drawing simply exists.
    ctx.beginPath();
    ctx.moveTo(data.tool === 'horizontal-ray' ? b.x : 0, b.y);
    ctx.lineTo(width, b.y);
    ctx.stroke();
  } else if (data.tool === 'vertical-line') {
    ctx.beginPath();
    ctx.moveTo(b.x, 0);
    ctx.lineTo(b.x, height);
    ctx.stroke();
  } else if (pts.length >= 2) {
    if (RECT_TOOLS.has(data.tool)) {
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else if (data.tool === 'fib-retracement') {
      for (const level of FIB_LEVELS) {
        const y = a.y + (b.y - a.y) * level;
        ctx.beginPath();
        ctx.moveTo(Math.min(a.x, b.x), y);
        ctx.lineTo(Math.max(a.x, b.x), y);
        ctx.stroke();
      }
    } else if (data.tool === 'circle' || data.tool === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      // A polyline through EVERY point, so brush, path, triangle and channel all read right.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let index = 1; index < pts.length; index += 1) ctx.lineTo(pts[index].x, pts[index].y);
      ctx.stroke();
    }
  }

  // The anchor dots: placed ones solid, the cursor one hollow.
  ctx.setLineDash([]);
  pts.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4 * h, 0, Math.PI * 2);
    // BY THE FLAG, not by comparing indices — the streamer's first version tested `n > n - 1`,
    // which is always true, so every committed anchor rendered hollow too.
    if (data.hasCursor && index === pts.length - 1) {
      ctx.strokeStyle = '#2962FF';
      ctx.stroke();
    } else {
      ctx.fillStyle = '#2962FF';
      ctx.fill();
    }
  });
  ctx.restore();
}

export class DrawingPreviewPrimitive {
  private state: PreviewState | null = null;
  private series: PriceConverter | null = null;
  private chart: ScaleChartHandle | null = null;
  private requestUpdate?: () => void;
  private readonly views = [
    {
      zOrder: () => 'top' as const,
      renderer: () => ({
        draw: (target: BitmapTarget): void => {
          const data = this.rendererData();
          if (data === null) return;
          target.useBitmapCoordinateSpace((scope) => paint(scope, data));
        },
      }),
    },
  ];

  attached(params: {
    chart: ScaleChartHandle;
    series: PriceConverter;
    requestUpdate: () => void;
  }): void {
    this.chart = params.chart;
    this.series = params.series;
    this.requestUpdate = params.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  /** Two nulls in a row are not a change, and repainting on every idle frame is not free. */
  setState(state: PreviewState | null): void {
    if (this.state === null && state === null) return;
    this.state = state;
    this.requestUpdate?.();
  }

  paneViews(): readonly unknown[] {
    return this.views;
  }

  updateAllViews(): void {
    /* `rendererData` is read live, so there is nothing to cache. */
  }

  private rendererData(): RendererData | null {
    const state = this.state;
    const series = this.series;
    const chart = this.chart;
    if (state === null || series === null || chart === null) return null;

    const all = state.cursor === null ? state.anchors : [...state.anchors, state.cursor];
    const points: Point[] = [];
    let lastIsCursor = state.cursor !== null;
    for (let index = 0; index < all.length; index += 1) {
      const anchor = all[index];
      const x = chart.timeScale().timeToCoordinate(anchor.time);
      const y = series.priceToCoordinate(anchor.price);
      // A point off the visible scale is dropped, and if the DROPPED one was the cursor then the
      // last remaining point is a committed anchor — otherwise it would render hollow and lie.
      if (x === null || y === null) {
        if (index === all.length - 1) lastIsCursor = false;
        continue;
      }
      points.push({ x, y });
    }
    return points.length === 0 ? null : { points, tool: state.tool, hasCursor: lastIsCursor };
  }
}
