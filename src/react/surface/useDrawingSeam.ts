/**
 * THE DRAWING SEAM — the surface ATTACHES the layer, and the consumer IMPLEMENTS it.
 * See docs/explanation/react-surface.md#attached-once-per-binding
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { Bar } from '../../domain/types';
import { attachAxisLock } from '../../drawing/axisLock';
import type { DrawingBinding, DrawingLayer } from '../../drawing/drawingLayer';
import { snapAnchorPrice, type MagnetMode } from '../../drawing/magnet';
import type { ChartHandles } from './chartHandles';

/** The two reports the layer emits to the host. They arrive by reference, never by dependency. */
export interface DrawingSeamEvents {
  readonly onCountChange?: (count: number) => void;
  readonly onToolFinished?: () => void;
}

/** What the snap rule reads at CALL time. A dependency instead would re-attach on every bar.
 * See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement */
export interface DrawingSnapInput {
  readonly magnet: MagnetMode;
  readonly thresholdPx: number;
  readonly bars: readonly Bar[];
}

export function useDrawingSeam(
  handles: ChartHandles | null,
  hostRef: RefObject<HTMLDivElement | null>,
  binding: DrawingBinding | undefined,
  activeTool: string | null | undefined,
  events: DrawingSeamEvents,
  snap: DrawingSnapInput,
): void {
  const layerRef = useRef<DrawingLayer | null>(null);
  const activeToolRef = useRef<string | null>(activeTool ?? null);
  activeToolRef.current = activeTool ?? null;
  /** What the layer last heard. `undefined` = no layer to hear anything — never a valid tool value.
   * See docs/explanation/react-surface.md#the-push-is-deduplicated */
  const sentToolRef = useRef<string | null | undefined>(undefined);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    const host = hostRef.current;
    const chart = handles?.chart ?? null;
    const anchor = handles?.candle ?? null;
    if (binding === undefined || host === null || chart === null || anchor === null) return;
    const layer = binding(
      {
        chart,
        series: anchor,
        container: host,
        // SPREAD, and read at CALL time: `bars` and `thresholdPx` carry their own names across, and
        // `magnet` is the one field the rule spells differently.
        snapPrice: (at) =>
          snapAnchorPrice({
            ...snapRef.current,
            ...at,
            mode: snapRef.current.magnet,
            priceToCoordinate: (price) => anchor.priceToCoordinate(price),
          }),
      },
      {
        onCountChange: (count) => eventsRef.current.onCountChange?.(count),
        onToolFinished: () => eventsRef.current.onToolFinished?.(),
      },
    );
    // A layer that cannot hit-test its anchors simply goes without the lock — panning stays right.
    const unlock =
      typeof layer.anchorAt !== 'function'
        ? null
        : attachAxisLock({
            chart,
            container: host,
            // PANE 0 IS THE PRICE PANE — the same index a binding's own placement guard reads, asked
            // of the chart at press time because a pane added later has no element until it renders.
            pricePane: () => chart.panes()[0]?.getHTMLElement() ?? null,
            anchorAt: (point) => layer.anchorAt?.(point) === true,
          });
    layerRef.current = layer;
    // The tool armed BEFORE the layer attached still arrives — state pushed, not assumed lost.
    sentToolRef.current = activeToolRef.current;
    layer.setActiveTool(activeToolRef.current);
    return () => {
      layerRef.current = null;
      sentToolRef.current = undefined;
      // BEFORE `detach()`: the lock has to stop listening while the chart is still alive.
      unlock?.();
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
