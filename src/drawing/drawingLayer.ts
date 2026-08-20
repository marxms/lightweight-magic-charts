/**
 * The drawing seam: the INTERFACE a drawing layer implements, injected by the consumer.
 * See docs/explanation/drawing.md#the-drawing-seam
 */

import type { UtcSeconds } from '../domain/types';
import type { SeriesHandle, WorkspaceChartHandle } from '../port/chartApi';

export interface DrawingSurfaceHost {
  readonly chart: WorkspaceChartHandle;
  readonly series: SeriesHandle;
  readonly container: HTMLElement;
  /** The snap rule, already bound to the live mode, threshold and bars — never the raw data.
   * See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement */
  readonly snapPrice: (at: { readonly time: UtcSeconds; readonly price: number }) => number;
}

export interface DrawingLayerEvents {
  readonly onCountChange: (count: number) => void;
  readonly onToolFinished: () => void;
}

export type DrawingSnapshot = unknown;

export interface DrawingLayer {
  setActiveTool(toolId: string | null): void;
  deleteSelection(): void;
  clearAll(): void;
  serialize?(): DrawingSnapshot;
  restore?(state: DrawingSnapshot): void;
  /** OPTIONAL: a layer that cannot hit-test its anchors simply does not lock the axes.
   * See docs/explanation/drawing.md#the-axis-lock-is-the-librarys-half-of-the-drag */
  anchorAt?(point: { readonly x: number; readonly y: number }): boolean;
  detach(): void;
}

export type DrawingBinding = (host: DrawingSurfaceHost, events: DrawingLayerEvents) => DrawingLayer;
