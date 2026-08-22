/**
 * Headless doubles for the render tests.
 *
 * NO BROWSER, AND NO CANVAS. Everything an overlay does is arithmetic over a projection followed by
 * calls on a 2D context, so a context that RECORDS instead of rasterising turns "does it look right"
 * into "are these the rectangles it claimed". That is a stronger assertion than a screenshot, not a
 * weaker one: a screenshot cannot tell a 1px seam caused by overlap from one caused by rounding.
 */

import type { UtcSeconds } from '../src/domain/types';
import type { Projection, RenderTarget } from '../src/extension/plugins';

export interface RecordedRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The literal fill style at the time of the call — a colour string, or `gradient#n`. */
  readonly fill: string;
}

export interface RecordedGradient {
  readonly id: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly stops: ReadonlyArray<readonly [number, string]>;
}

class FakeGradient {
  readonly stops: Array<readonly [number, string]> = [];
  constructor(
    readonly id: string,
    readonly from: readonly [number, number],
    readonly to: readonly [number, number],
  ) {}
  addColorStop(offset: number, colour: string): void {
    this.stops.push([offset, colour]);
  }
}

/** A stroked segment, with the pen as it stood at the call: colour, width and dash pattern. */
export interface RecordedStroke {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly stroke: string;
  readonly width: number;
  readonly dash: readonly number[];
}

/** A run of text, with the point it was drawn at and the fill that painted it. */
export interface RecordedText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly font: string;
}

export class RecordingContext {
  readonly rects: RecordedRect[] = [];
  readonly strokes: RecordedStroke[] = [];
  readonly texts: RecordedText[] = [];
  private readonly gradients: FakeGradient[] = [];
  private pen: readonly [number, number] = [0, 0];
  fillStyle: string | FakeGradient = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  private dash: readonly number[] = [];
  /** The bitmap an overlay reads to decide how far an extended line runs. */
  readonly canvas = { width: 1000, height: 400 };

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): FakeGradient {
    const gradient = new FakeGradient(`gradient#${this.gradients.length}`, [x0, y0], [x1, y1]);
    this.gradients.push(gradient);
    return gradient;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const fill = this.fillStyle;
    this.rects.push({ x, y, w, h, fill: typeof fill === 'string' ? fill : fill.id });
  }

  setLineDash(pattern: readonly number[]): void {
    this.dash = [...pattern];
  }

  beginPath(): void {
    this.pen = [0, 0];
  }

  moveTo(x: number, y: number): void {
    this.pen = [x, y];
  }

  private pending: readonly [number, number] | null = null;

  lineTo(x: number, y: number): void {
    this.pending = [x, y];
  }

  stroke(): void {
    if (this.pending === null) return;
    this.strokes.push({
      from: this.pen,
      to: this.pending,
      stroke: this.strokeStyle,
      width: this.lineWidth,
      dash: this.dash,
    });
    this.pending = null;
  }

  /** A rectangle's outline, recorded as its four corners' box so a case can assert on the frame. */
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.strokes.push({
      from: [x, y],
      to: [x + w, y + h],
      stroke: this.strokeStyle,
      width: this.lineWidth,
      dash: this.dash,
    });
  }

  fillText(text: string, x: number, y: number): void {
    const fill = this.fillStyle;
    this.texts.push({ text, x, y, fill: typeof fill === 'string' ? fill : fill.id, font: this.font });
  }

  /** Monospace-ish, so a width assertion is arithmetic rather than a font metric. */
  measureText(text: string): { width: number } {
    return { width: text.length * 6 };
  }

  recordedGradients(): readonly RecordedGradient[] {
    return this.gradients.map((g) => ({ id: g.id, from: g.from, to: g.to, stops: g.stops }));
  }

  /** The context an overlay is handed. Only the two methods above are ever reached. */
  asContext(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }
}

export interface FakeTargetSize {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly hRatio?: number;
  readonly vRatio?: number;
}

export function fakeTarget(ctx: RecordingContext, size: FakeTargetSize): RenderTarget {
  return {
    useBitmapSpace(fn): void {
      fn({
        ctx: ctx.asContext(),
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        hRatio: size.hRatio ?? 1,
        vRatio: size.vRatio ?? 1,
      });
    },
  };
}

/**
 * A price scale must INVERT: a higher price is a SMALLER y, because y grows downward. An identity
 * fake would look tidy and would let a renderer that flipped the field pass every test — the top and
 * the bottom of a column would simply swap and every span stay positive.
 */
export const PRICE_ORIGIN = 1000;

export interface FakeProjectionSpec {
  readonly priceToY?: (price: number) => number | null;
  /** Default: identity, so a time reads back as the x an assertion was written with. */
  readonly timeToX?: (time: number) => number | null;
  readonly barSpacing?: number;
}

export function fakeProjection(spec: FakeProjectionSpec = {}): Projection {
  return {
    priceToY: (price: number) => (spec.priceToY ? spec.priceToY(price) : PRICE_ORIGIN - price),
    timeToX: (time: UtcSeconds) => (spec.timeToX ? spec.timeToX(time) : time),
    barSpacing: spec.barSpacing ?? 10,
  };
}

/** Alpha of an `rgba(r,g,b,a)` string, so a test can assert on visibility without matching strings. */
export function alphaOf(rgba: string): number {
  const match = /rgba\([^)]*,\s*([0-9.]+)\s*\)$/.exec(rgba);
  if (match === null) throw new Error(`not an rgba string: ${rgba}`);
  return Number(match[1]);
}
