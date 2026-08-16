/**
 * The drawing seam: the INTERFACE a drawing layer implements, injected by the consumer.
 * See docs/explanation/drawing.md#the-drawing-seam
 */

import type { SeriesHandle, WorkspaceChartHandle } from '../port/chartApi';

export interface DrawingSurfaceHost {
  readonly chart: WorkspaceChartHandle;
  readonly series: SeriesHandle;
  readonly container: HTMLElement;
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
  detach(): void;
}

export type DrawingBinding = (host: DrawingSurfaceHost, events: DrawingLayerEvents) => DrawingLayer;
