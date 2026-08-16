/**
 * The extension boundary — design.md §3. Injection of INSTANCES, never registration by name.
 * See docs/explanation/extension.md#instance-injection-not-a-registry
 */

import type { Bar, Point, SeriesId, UtcSeconds } from '../domain/types';

/** The canvas, lent for one draw. See docs/explanation/extension.md#the-canvas-is-lent */
export interface RenderTarget {
  useBitmapSpace(
    fn: (scope: {
      readonly ctx: CanvasRenderingContext2D;
      readonly widthPx: number;
      readonly heightPx: number;
      readonly hRatio: number;
      readonly vRatio: number;
    }) => void,
  ): void;
}

/** Price/time to pixels. See docs/explanation/extension.md#off-scale-is-null-never-clamped */
export interface Projection {
  priceToY(price: number): number | null;
  timeToX(time: UtcSeconds): number | null;
  readonly barSpacing: number;
}

export interface OverlayHost {
  requestRedraw(): void;
  readonly projection: Projection;
}

export interface Overlay {
  readonly zOrder: 'behind' | 'ahead';
  attached(host: OverlayHost): void;
  detached(): void;
  draw(target: RenderTarget, projection: Projection): void;
}

/** A computed series, built by the consumer. See docs/explanation/extension.md#series-arrive-as-instances */
export interface SeriesProvider {
  readonly id: SeriesId;
  compute(bars: readonly Bar[]): readonly Point[];
}

export type DetachOverlay = () => void;

export interface OverlayHostApi {
  attachOverlay(overlay: Overlay): DetachOverlay;
}
