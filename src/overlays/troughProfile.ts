/**
 * Task 4.6 — a distribution profile drawn in a trough along one edge, never over the live edge.
 * See docs/explanation/overlays.md#the-trough-never-covers-the-live-edge
 */

import type { Bar, PriceScaleConvention, UtcSeconds } from '../domain/types';
import type { Overlay, OverlayHost, Projection, RenderTarget } from '../extension/plugins';

export interface ProfileBucket {
  readonly priceLow: number;
  readonly priceHigh: number;
  readonly weight: number;
  /** 0..1 — the share of `weight` attributed to the up direction. */
  readonly upShare: number;
}

export interface Profile {
  readonly buckets: readonly ProfileBucket[];
  readonly peak: number;
  /** The heaviest bucket's midpoint — the level the distribution is built around. */
  readonly control: number;
  /** The contiguous band around `control` holding `bandShare` of the total weight. */
  readonly bandLow: number;
  readonly bandHigh: number;
  readonly total: number;
}

/**
 * Weight is SPREAD across the buckets a bar spans, in proportion to the overlap. Returns `null`,
 * never an empty profile, when there is nothing to build.
 * See docs/explanation/overlays.md#spreading-weight-across-the-buckets
 */
export function buildProfile(
  bars: readonly Bar[],
  bucketCount: number,
  bandShare = 0.7,
): Profile | null {
  if (bars.length === 0 || bucketCount <= 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    if (bar.low < min) min = bar.low;
    if (bar.high > max) max = bar.high;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  const step = (max - min) / bucketCount;
  const weights = new Array<number>(bucketCount).fill(0);
  const upWeights = new Array<number>(bucketCount).fill(0);

  for (const bar of bars) {
    const volume = bar.volume ?? 0;
    if (volume <= 0) continue;
    // A doji spans zero price; the epsilon keeps the division defined. See docs/explanation/overlays.md#the-doji-epsilon
    const span = Math.max(bar.high - bar.low, step * 0.001);
    const first = Math.max(0, Math.floor((bar.low - min) / step));
    const last = Math.min(bucketCount - 1, Math.floor((bar.high - min) / step));
    const isUp = bar.close >= bar.open;

    for (let i = first; i <= last; i += 1) {
      const bucketLow = min + i * step;
      const overlap = Math.min(bar.high, bucketLow + step) - Math.max(bar.low, bucketLow);
      if (overlap <= 0) continue;
      const share = (overlap / span) * volume;
      weights[i] += share;
      if (isUp) upWeights[i] += share;
    }
  }

  let peak = 0;
  let controlIndex = 0;
  let total = 0;
  for (let i = 0; i < bucketCount; i += 1) {
    total += weights[i];
    if (weights[i] > peak) {
      peak = weights[i];
      controlIndex = i;
    }
  }
  if (peak <= 0) return null;

  // Grown outward from the control level, always taking the heavier of the two neighbours.
  // Termination is by INDEX, not by `covered`. See docs/explanation/overlays.md#growing-the-band-outward
  let lower = controlIndex;
  let upper = controlIndex;
  let covered = weights[controlIndex];
  const target = total * bandShare;
  while (covered < target && (lower > 0 || upper < bucketCount - 1)) {
    const below = lower > 0 ? weights[lower - 1] : -1;
    const above = upper < bucketCount - 1 ? weights[upper + 1] : -1;
    if (above >= below) {
      upper += 1;
      covered += Math.max(0, above);
    } else {
      lower -= 1;
      covered += Math.max(0, below);
    }
  }

  const buckets: ProfileBucket[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    buckets.push({
      priceLow: min + i * step,
      priceHigh: min + (i + 1) * step,
      weight: weights[i],
      upShare: weights[i] > 0 ? upWeights[i] / weights[i] : 0,
    });
  }

  return {
    buckets,
    peak,
    control: min + (controlIndex + 0.5) * step,
    bandLow: min + lower * step,
    bandHigh: min + (upper + 1) * step,
    total,
  };
}

export interface TroughStyle {
  /** Which edge the trough hangs from. */
  readonly side: 'left' | 'right';
  /** 0..1 of the plot width the heaviest bucket would occupy, before the live-edge clamp. */
  readonly widthShare: number;
  /** 0..1, multiplying every fill. */
  readonly opacity: number;
  readonly upColor: string;
  readonly downColor: string;
  readonly controlColor: string;
  /** Buckets outside the band draw at this fraction of `opacity`. */
  readonly outsideBandOpacity: number;
}

/** Everything about the trough that is not the direction pair. */
export type TroughGeometry = Omit<TroughStyle, 'upColor' | 'downColor'>;

const DEFAULT_TROUGH_GEOMETRY: TroughGeometry = {
  side: 'right',
  widthShare: 0.18,
  opacity: 0.55,
  controlColor: '255,193,7',
  outsideBandOpacity: 0.4,
};

/** `#rrggbb` (or `#rgb`) to the `r,g,b` triple the style composes `rgba(...)` from. */
function rgbTriple(hex: string): string {
  const body = hex.trim().replace('#', '');
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`troughStyleFor: not a hex colour: ${hex}`);
  }
  return [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)]
    .map((part) => Number.parseInt(part, 16))
    .join(',');
}

/**
 * The consumer's declared convention, applied to the trough — the COLOUR channel only.
 * See docs/explanation/overlays.md#resolving-the-direction-pair
 */
export function troughStyleFor(
  convention: PriceScaleConvention,
  geometry: TroughGeometry = DEFAULT_TROUGH_GEOMETRY,
): TroughStyle {
  return {
    ...geometry,
    upColor: rgbTriple(convention.upColor),
    downColor: rgbTriple(convention.downColor),
  };
}

/**
 * The western pair, ALREADY RESOLVED — written out rather than computed, for a measured reason.
 * See docs/explanation/overlays.md#why-the-default-pair-is-written-out
 */
export const DEFAULT_TROUGH_STYLE: TroughStyle = {
  ...DEFAULT_TROUGH_GEOMETRY,
  upColor: '38,166,154',
  downColor: '239,83,80',
};

export interface TroughFrameStats {
  /** Buckets that produced a fill. */
  readonly drawn: number;
  /** Media px actually available after the live-edge clamp. Zero means the trough was suppressed. */
  readonly availablePx: number;
}

const NO_STATS: TroughFrameStats = { drawn: 0, availablePx: 0 };

/** Below this there is no trough left to draw, only a smear against the edge. */
const MIN_TROUGH_PX = 2;

export class TroughProfileOverlay implements Overlay {
  /** Behind the price action — context for the candles. See docs/explanation/overlays.md#behind-and-clamped */
  readonly zOrder = 'behind' as const;

  private profile: Profile | null = null;
  private liveEdge: UtcSeconds | null = null;
  private style: TroughStyle = DEFAULT_TROUGH_STYLE;
  private stats: TroughFrameStats = NO_STATS;
  private host: OverlayHost | null = null;

  attached(host: OverlayHost): void {
    this.host = host;
  }

  detached(): void {
    this.host = null;
    this.stats = NO_STATS;
  }

  setProfile(profile: Profile | null): void {
    this.profile = profile;
    this.host?.requestRedraw();
  }

  /** The time of the newest bar. See docs/explanation/overlays.md#without-a-live-edge-the-trough-is-unclamped */
  setLiveEdge(time: UtcSeconds | null): void {
    this.liveEdge = time;
    this.host?.requestRedraw();
  }

  setStyle(style: TroughStyle): void {
    this.style = style;
    this.host?.requestRedraw();
  }

  frameStats(): TroughFrameStats {
    return this.stats;
  }

  draw(target: RenderTarget, projection: Projection): void {
    const profile = this.profile;
    if (profile === null || profile.peak <= 0) {
      this.stats = NO_STATS;
      return;
    }
    const style = this.style;

    // FALSE POSITIVE — a canvas method, not a React hook. See docs/explanation/overlays.md#the-lint-false-positive
    // biome-ignore lint/correctness/useHookAtTopLevel: base lib canvas method, not a hook
    target.useBitmapSpace(({ ctx, widthPx, hRatio, vRatio }) => {
      const liveX = this.liveEdge === null ? null : projection.timeToX(this.liveEdge);
      const halfBar = Math.max(projection.barSpacing, 1) / 2;
      const wanted = Math.max(0, widthPx * style.widthShare);

      // `outer` = the edge it hangs from, `inner` = where it grows to. See docs/explanation/overlays.md#the-live-edge-clamp
      const outer = style.side === 'right' ? widthPx : 0;
      let inner = style.side === 'right' ? widthPx - wanted : wanted;
      if (liveX !== null) {
        inner =
          style.side === 'right'
            ? Math.max(inner, liveX + halfBar)
            : Math.min(inner, liveX - halfBar);
      }
      // SIGNED, not `Math.abs`. See docs/explanation/overlays.md#why-the-available-width-is-signed
      const available = style.side === 'right' ? outer - inner : inner - outer;
      if (available < MIN_TROUGH_PX) {
        this.stats = { drawn: 0, availablePx: 0 };
        return;
      }

      const alpha = (inBand: boolean): number =>
        style.opacity * (inBand ? 1 : style.outsideBandOpacity);
      let drawn = 0;

      for (const bucket of profile.buckets) {
        if (bucket.weight <= 0) continue;
        const top = projection.priceToY(bucket.priceHigh);
        const bottom = projection.priceToY(bucket.priceLow);
        if (top === null || bottom === null) continue;

        const y = Math.round(top * vRatio);
        // Minus one bitmap pixel. See docs/explanation/overlays.md#buckets-lose-a-bitmap-row
        const height = Math.max(1, Math.round((bottom - top) * vRatio) - 1);
        const length = (bucket.weight / profile.peak) * available;
        const inBand = bucket.priceLow >= profile.bandLow && bucket.priceHigh <= profile.bandHigh;
        const upLength = length * bucket.upShare;

        // Growth runs from the outer edge inward. See docs/explanation/overlays.md#growth-runs-inward
        const startUp = style.side === 'right' ? outer - upLength : outer;
        const startDown = style.side === 'right' ? outer - length : outer + upLength;
        const upPx = Math.round(upLength * hRatio);
        const downPx = Math.round((length - upLength) * hRatio);
        // A zero-width segment is never rounded up to one pixel. See docs/explanation/overlays.md#no-hairlines
        if (upPx <= 0 && downPx <= 0) continue;
        const fillAlpha = alpha(inBand).toFixed(3);

        if (upPx > 0) {
          ctx.fillStyle = `rgba(${style.upColor},${fillAlpha})`;
          ctx.fillRect(Math.round(startUp * hRatio), y, upPx, height);
        }
        if (downPx > 0) {
          ctx.fillStyle = `rgba(${style.downColor},${fillAlpha})`;
          ctx.fillRect(Math.round(startDown * hRatio), y, downPx, height);
        }
        drawn += 1;
      }

      this.drawControlLine(ctx, projection, profile.control, {
        widthPx,
        hRatio,
        vRatio,
        liveX,
        halfBar,
      });
      this.stats = { drawn, availablePx: available };
    });
  }

  /**
   * A level, so it spans the plot — MINUS the live column, which it steps over.
   * See docs/explanation/overlays.md#the-control-line-steps-over-the-live-column
   */
  private drawControlLine(
    ctx: CanvasRenderingContext2D,
    projection: Projection,
    control: number,
    geometry: {
      widthPx: number;
      hRatio: number;
      vRatio: number;
      liveX: number | null;
      halfBar: number;
    },
  ): void {
    const y = projection.priceToY(control);
    if (y === null) return;
    const { widthPx, hRatio, vRatio, liveX, halfBar } = geometry;

    const thickness = Math.max(1, Math.round(vRatio));
    const top = Math.round(y * vRatio);
    ctx.fillStyle = `rgba(${this.style.controlColor},${this.style.opacity.toFixed(3)})`;

    const segments: readonly (readonly [number, number])[] =
      liveX === null
        ? [[0, widthPx]]
        : [
            [0, liveX - halfBar],
            [liveX + halfBar, widthPx],
          ];
    for (const [from, to] of segments) {
      const left = Math.max(0, from);
      const right = Math.min(widthPx, to);
      if (right - left < 1) continue;
      ctx.fillRect(Math.round(left * hRatio), top, Math.round((right - left) * hRatio), thickness);
    }
  }
}
