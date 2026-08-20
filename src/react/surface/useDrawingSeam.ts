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
  /** WHAT THE SEAM IS ATTACHED TO, as ONE value: two refs cleared together are one chance to miss. */
  const attachedRef = useRef<{ layer: DrawingLayer; chart: ChartHandles['chart'] } | null>(null);
  /** What the layer last heard. `undefined` = no layer to hear anything, so the push below is what
   * ARMS a fresh layer, the mount included. See docs/explanation/react-surface.md#the-push-is-deduplicated */
  const sentToolRef = useRef<string | null | undefined>(undefined);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  /** What the crosshair was last told. `-1` is no `CrosshairMode`, so a NEW chart is always owed one. */
  const sentModeRef = useRef(-1);

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
    attachedRef.current = { layer, chart };
    return () => {
      attachedRef.current = null;
      sentToolRef.current = undefined;
      sentModeRef.current = -1;
      // BEFORE `detach()`: the lock has to stop listening while the chart is still alive.
      unlock?.();
      layer.detach();
    };
  }, [binding, handles, hostRef]);

  /**
   * ONE PUSH FOR BOTH: the layer hears each armed tool once, the chart each magnet mode once. No
   * dependency list — both are read off live refs, and a dependency on the snap group is one on
   * `bars`, new every tick, which re-attaches the layer and throws away every drawing.
   * THE CURSOR FOLLOWS THE MODE, so what the user aims at is what the anchor takes. `CrosshairMode`
   * cannot be imported by a package with no runtime dependency, so the ordinals carry their names:
   * `0` Normal moves freely, `3` MagnetOHLC sticks to open/high/low/close — the four values
   * `snapAnchorPrice` chooses among. NOT `1` Magnet, the base library's DEFAULT, which takes the
   * close alone: a cursor magnetised to a smaller set is the same disagreement in a better disguise.
   *
   * THE LIBRARY'S MODE WINS over a host-supplied `crosshair`: the port publishes no reader, so that
   * value cannot be read, remembered or given back, and an unoverridden default is what shipped the
   * defect. Scoped to an ATTACHED LAYER — with no anchor to place, nothing can disagree.
   * See docs/explanation/react-surface.md#the-push-is-deduplicated
   */
  useEffect(() => {
    const attached = attachedRef.current;
    if (attached === null) return;
    const next = activeTool ?? null;
    if (sentToolRef.current !== next) {
      sentToolRef.current = next;
      attached.layer.setActiveTool(next);
    }
    const mode = snapRef.current.magnet === 'on' ? 3 : 0;
    if (sentModeRef.current !== mode) {
      sentModeRef.current = mode;
      attached.chart.applyOptions({ crosshair: { mode } });
    }
  });
}
