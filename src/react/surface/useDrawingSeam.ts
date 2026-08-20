/**
 * THE DRAWING SEAM — the surface ATTACHES the layer, and the consumer IMPLEMENTS it.
 * See docs/explanation/react-surface.md#attached-once-per-binding
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { DrawingBinding, DrawingLayer } from '../../drawing/drawingLayer';
import type { ChartHandles } from './chartHandles';

/** The two reports the layer emits to the host. They arrive by reference, never by dependency. */
export interface DrawingSeamEvents {
  readonly onCountChange?: (count: number) => void;
  readonly onToolFinished?: () => void;
}

export function useDrawingSeam(
  handles: ChartHandles | null,
  hostRef: RefObject<HTMLDivElement | null>,
  binding: DrawingBinding | undefined,
  activeTool: string | null | undefined,
  events: DrawingSeamEvents,
): void {
  const layerRef = useRef<DrawingLayer | null>(null);
  const activeToolRef = useRef<string | null>(activeTool ?? null);
  activeToolRef.current = activeTool ?? null;
  /** What the layer last heard. `undefined` = no layer to hear anything — never a valid tool value.
   * See docs/explanation/react-surface.md#the-push-is-deduplicated */
  const sentToolRef = useRef<string | null | undefined>(undefined);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const host = hostRef.current;
    const chart = handles?.chart ?? null;
    const anchor = handles?.candle ?? null;
    if (binding === undefined || host === null || chart === null || anchor === null) return;
    const layer = binding(
      { chart, series: anchor, container: host, snapPrice: (at) => at.price },
      {
        onCountChange: (count) => eventsRef.current.onCountChange?.(count),
        onToolFinished: () => eventsRef.current.onToolFinished?.(),
      },
    );
    layerRef.current = layer;
    // The tool armed BEFORE the layer attached still arrives — state pushed, not assumed lost.
    sentToolRef.current = activeToolRef.current;
    layer.setActiveTool(activeToolRef.current);
    return () => {
      layerRef.current = null;
      sentToolRef.current = undefined;
      layer.detach();
    };
  }, [binding, handles, hostRef]);

  useEffect(() => {
    const next = activeTool ?? null;
    if (layerRef.current === null || sentToolRef.current === next) return;
    sentToolRef.current = next;
    layerRef.current.setActiveTool(next);
  }, [activeTool]);
}
