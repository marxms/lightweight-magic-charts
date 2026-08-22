/**
 * THE LAST FOUR CHANNELS, DRAWN BY THE HOST — background shading, labels, drawn lines and boxes.
 *
 * They ride a door that was already paid for. `Overlay.anchor` and `WorkspaceStudies.overlays` cost
 * the package 30 B and 86 B when the fill needed them; these four add ZERO, because everything they
 * need is a primitive and the vendor's vocabulary — `bgcolor`, `label.new`, `line.new`, `box.new`,
 * and the words that decorate them (`style`, `size`, `extend`, `textHAlign`) — stays out here where
 * it belongs. That is the whole argument for the seam, measured twice now.
 *
 * MEASURED ON THE 320 OFFERED ROWS, at their own defaults, over the proof's fixture A:
 *
 *   bgColors   20 rows   13,572 items, one colour per bar, a full-height column each
 *   labels      7 rows   1,023 items: a price, a text and a style; 810 in one row alone
 *   lines       4 rows   151 items, two endpoints each in time and price
 *   boxes       3 rows   99 items, two opposite corners each
 *
 * TWO LAYERS, NOT ONE, AND THE SPLIT IS THE READING. Shading and boxes are ground: they go BEHIND
 * the lines they sit under, or a box buries the plot it is drawn around. Labels and drawn lines are
 * annotation: they go AHEAD, because text under a line is text nobody can read. `Overlay.zOrder`
 * already carries both values and the reference implementation makes the same split.
 *
 * NOTHING HERE COMPOSES A COLOUR. Unlike the fill — where the vendor hands over `transp` separately
 * and the reference concatenates it into the string and gets the opacity wrong — every colour in
 * these four channels arrives as a finished CSS string: measured, 13,572 of 13,572 background
 * colours are `rgba(...)` with the alpha in place, and the boxes carry `#rrggbbaa`. They are
 * assigned to `fillStyle` verbatim.
 */
import type {
  Overlay,
  OverlayHost,
  Projection,
  RenderTarget,
  SourceResolution,
  UtcSeconds,
} from 'lightweight-magic-charts';
import {
  PRICE_PANE_ID,
  lanePaneId,
  laneSeriesId,
  priceOverlaySeriesId,
  seriesStyleKey,
  utcSeconds,
} from 'lightweight-magic-charts';

import type { StudyPass, VendorResult } from './indicators';

/** `bgcolor()` — one colour for the whole column at that bar. */
export interface VendorBgColor {
  readonly time: number;
  readonly color: string;
}

/** `label.new()`. `style` puts the body above or below the price it names. */
export interface VendorLabel {
  readonly time: number;
  readonly price: number;
  readonly text: string;
  readonly color?: string;
  readonly textColor?: string;
  readonly style?: string;
  readonly size?: string;
}

/** `line.new()` — two endpoints, and `extend` carries it past them. */
export interface VendorLine {
  readonly time1: number;
  readonly price1: number;
  readonly time2: number;
  readonly price2: number;
  readonly color?: string;
  readonly width?: number;
  readonly style?: string;
  readonly extend?: string;
}

/** `box.new()` — two opposite corners, a fill and a border. */
export interface VendorBox {
  readonly time1: number;
  readonly price1: number;
  readonly time2: number;
  readonly price2: number;
  readonly bgColor?: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly borderStyle?: string;
}

/** What one study asks to be drawn beyond its lines, narrowed off the raw result. */
export interface ChannelScene {
  readonly times: readonly UtcSeconds[];
  readonly bgColors: readonly VendorBgColor[];
  readonly labels: readonly VendorLabel[];
  readonly lines: readonly VendorLine[];
  readonly boxes: readonly VendorBox[];
}

const NOTHING: ChannelScene = { times: [], bgColors: [], labels: [], lines: [], boxes: [] };

/** A colour that paints nothing. `'transparent'` is what the vendor writes for a missing border. */
const CLEAR = 'transparent';

const paints = (colour: string | undefined): colour is string =>
  colour !== undefined && colour !== '' && colour !== CLEAR;

/** PineScript's five text sizes, in pixels. Measured: 811 of the 1,023 ask `small` and 199 `tiny`. */
const FONT_PX: Readonly<Record<string, number>> = {
  tiny: 9,
  small: 11,
  normal: 13,
  large: 17,
  huge: 22,
};

/** Dash patterns, in CSS terms. A style the vendor does not name draws solid. */
const DASHES: Readonly<Record<string, readonly number[]>> = {
  dashed: [6, 4],
  dotted: [1, 3],
};

export function sceneOf(result: VendorResult | null, times: readonly UtcSeconds[]): ChannelScene {
  if (result === null) return NOTHING;
  return {
    times,
    bgColors: (result.bgColors ?? []) as readonly VendorBgColor[],
    labels: (result.labels ?? []) as readonly VendorLabel[],
    lines: (result.lines ?? []) as readonly VendorLine[],
    boxes: (result.boxes ?? []) as readonly VendorBox[],
  };
}

/**
 * The primitive. Same shape as the fill's: data arrives by PUSH, one call per resolve, and the live
 * projection is read inside `draw`. One instance per slot per layer, created at mount.
 */
export class ChannelOverlay implements Overlay {
  private host: OverlayHost | null = null;
  private scene: ChannelScene = NOTHING;

  constructor(
    readonly anchor: string,
    readonly zOrder: 'behind' | 'ahead',
  ) {}

  attached(host: OverlayHost): void {
    this.host = host;
  }

  detached(): void {
    this.host = null;
  }

  setScene(scene: ChannelScene): void {
    this.scene = scene;
    this.host?.requestRedraw();
  }

  draw(target: RenderTarget, projection: Projection): void {
    const { bgColors, labels, lines, boxes } = this.scene;
    if (bgColors.length + labels.length + lines.length + boxes.length === 0) return;
    target.useBitmapSpace(({ ctx, heightPx, hRatio, vRatio }) => {
      if (this.zOrder === 'behind') {
        this.paintShading(ctx, projection, heightPx, hRatio, vRatio);
        this.paintBoxes(ctx, projection, hRatio, vRatio);
        return;
      }
      this.paintLines(ctx, projection, hRatio, vRatio);
      this.paintLabels(ctx, projection, hRatio, vRatio);
    });
  }

  /** A full-height column at the bar, which is what `bgcolor()` paints in PineScript. */
  private paintShading(
    ctx: CanvasRenderingContext2D,
    projection: Projection,
    heightPx: number,
    hRatio: number,
    vRatio: number,
  ): void {
    const width = Math.max(1, projection.barSpacing);
    for (const shade of this.scene.bgColors) {
      if (!paints(shade.color)) continue;
      const x = projection.timeToX(utcSeconds(shade.time));
      if (x === null) continue;
      ctx.fillStyle = shade.color;
      ctx.fillRect(
        Math.round((x - width / 2) * hRatio),
        0,
        Math.max(1, Math.round(width * hRatio)),
        Math.round(heightPx * vRatio),
      );
    }
  }

  private paintBoxes(
    ctx: CanvasRenderingContext2D,
    projection: Projection,
    hRatio: number,
    vRatio: number,
  ): void {
    for (const box of this.scene.boxes) {
      const left = projection.timeToX(utcSeconds(box.time1));
      const right = projection.timeToX(utcSeconds(box.time2));
      const top = projection.priceToY(box.price1);
      const bottom = projection.priceToY(box.price2);
      if (left === null || right === null || top === null || bottom === null) continue;
      const x = Math.round(Math.min(left, right) * hRatio);
      const y = Math.round(Math.min(top, bottom) * vRatio);
      const w = Math.max(1, Math.round(Math.abs(right - left) * hRatio));
      const h = Math.max(1, Math.round(Math.abs(bottom - top) * vRatio));
      if (paints(box.bgColor)) {
        ctx.fillStyle = box.bgColor;
        ctx.fillRect(x, y, w, h);
      }
      if (!paints(box.borderColor)) continue;
      ctx.strokeStyle = box.borderColor;
      ctx.lineWidth = Math.max(1, (box.borderWidth ?? 1) * vRatio);
      ctx.setLineDash([...(DASHES[box.borderStyle ?? ''] ?? [])]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  /**
   * `extend` carries the segment past its endpoints ALONG ITS OWN SLOPE, which is what PineScript
   * means by it: the run is extended to the edge of the bitmap and the rise follows the gradient,
   * so an extended horizontal stays horizontal and an extended diagonal keeps its angle.
   */
  private paintLines(
    ctx: CanvasRenderingContext2D,
    projection: Projection,
    hRatio: number,
    vRatio: number,
  ): void {
    for (const line of this.scene.lines) {
      const x1 = projection.timeToX(utcSeconds(line.time1));
      const x2 = projection.timeToX(utcSeconds(line.time2));
      const y1 = projection.priceToY(line.price1);
      const y2 = projection.priceToY(line.price2);
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
      const [from, to] = extended(
        { x: x1 * hRatio, y: y1 * vRatio },
        { x: x2 * hRatio, y: y2 * vRatio },
        line.extend,
        ctx.canvas.width,
      );
      ctx.strokeStyle = line.color ?? CLEAR;
      if (!paints(line.color)) continue;
      ctx.lineWidth = Math.max(1, (line.width ?? 1) * vRatio);
      ctx.setLineDash([...(DASHES[line.style ?? ''] ?? [])]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * A label is a bubble in `color` and its text in `textColor`, and the vendor writes either alone —
   * measured, 4 of the 7 emitters carry no `color` on any label, so the text IS the label there.
   */
  private paintLabels(
    ctx: CanvasRenderingContext2D,
    projection: Projection,
    hRatio: number,
    vRatio: number,
  ): void {
    const wasFont = ctx.font;
    for (const label of this.scene.labels) {
      const x = projection.timeToX(utcSeconds(label.time));
      const y = projection.priceToY(label.price);
      if (x === null || y === null) continue;
      const size = (FONT_PX[label.size ?? ''] ?? FONT_PX.normal) * vRatio;
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      // `label_up` points its tip AT the price and hangs the body below it; `label_down` is its
      // mirror. Anything else is centred on the price, which is what `label_center` asks for.
      const above = label.style === 'label_down';
      const lines = label.text.split('\n');
      const box = { w: widestOf(ctx, lines) + size, h: lines.length * size * 1.35 + size / 2 };
      const left = x * hRatio - box.w / 2;
      const top = above ? y * vRatio - box.h - size / 2 : y * vRatio + size / 2;
      if (paints(label.color)) {
        ctx.fillStyle = label.color;
        ctx.fillRect(left, top, box.w, box.h);
      }
      ctx.fillStyle = paints(label.textColor) ? label.textColor : CLEAR;
      if (!paints(label.textColor)) continue;
      ctx.textBaseline = 'top';
      lines.forEach((piece, at) => {
        ctx.fillText(piece, x * hRatio, top + size / 4 + at * size * 1.35);
      });
    }
    ctx.font = wasFont;
  }
}

interface Pixel {
  readonly x: number;
  readonly y: number;
}

const widestOf = (ctx: CanvasRenderingContext2D, lines: readonly string[]): number =>
  lines.reduce((widest, piece) => Math.max(widest, ctx.measureText(piece).width), 0);

/** The segment, carried to the bitmap edge on whichever sides `extend` names. */
export function extended(
  from: Pixel,
  to: Pixel,
  extend: string | undefined,
  widthPx: number,
): readonly [Pixel, Pixel] {
  if (extend === undefined || extend === 'none' || from.x === to.x) return [from, to];
  const slope = (to.y - from.y) / (to.x - from.x);
  const at = (x: number): Pixel => ({ x, y: from.y + (x - from.x) * slope });
  const left = extend === 'left' || extend === 'both' ? at(0) : from;
  const right = extend === 'right' || extend === 'both' ? at(widthPx) : to;
  return from.x <= to.x ? [left, right] : [right, left];
}

/**
 * THE CHANNEL: two primitives per slot — ground and annotation — created once and fed once per
 * resolve, exactly as the fill's channel is. A slot nobody occupies is CLEARED rather than left
 * holding the last study's shading, because removing a study detaches no series.
 */
export interface ChannelChannel {
  readonly overlays: readonly ChannelOverlay[];
  readonly record: (pass: StudyPass) => void;
  readonly apply: (resolution: SourceResolution) => void;
}

export function channelChannel(capacity: number): ChannelChannel {
  const slotsFor = (anchorOf: (lane: number) => string): readonly (readonly ChannelOverlay[])[] =>
    Array.from({ length: capacity }, (_unused, lane) => [
      new ChannelOverlay(anchorOf(lane), 'behind'),
      new ChannelOverlay(anchorOf(lane), 'ahead'),
    ]);
  const overPrice = slotsFor((lane) => seriesStyleKey(PRICE_PANE_ID, priceOverlaySeriesId(lane, 0)));
  const inLane = slotsFor((lane) => seriesStyleKey(lanePaneId(lane), laneSeriesId(lane, 0)));
  const passes = new Map<string, StudyPass>();
  const every = [...overPrice, ...inLane].flat();
  return {
    overlays: every,
    record: (pass) => {
      passes.set(pass.id, pass);
    },
    apply: (resolution) => {
      const fed = new Set<ChannelOverlay>();
      for (const view of resolution.views) {
        const held = passes.get(view.id);
        const slot = (view.overlay ? overPrice : inLane)[view.lane];
        if (slot === undefined || held === undefined) continue;
        const scene = sceneOf(held.result, held.grid.map((bar) => utcSeconds(bar.time)));
        for (const layer of slot) {
          layer.setScene(scene);
          fed.add(layer);
        }
      }
      for (const layer of every) if (!fed.has(layer)) layer.setScene(NOTHING);
    },
  };
}
