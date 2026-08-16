// THE SURFACE MOUNT — creates everything, subscribes the crosshair, publishes the handles LAST.
// See docs/explanation/react-surface.md#the-mount-runs-exactly-once

import { useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';

import {
  createChartSurface,
  type FactoryPaneView,
  type SeriesFactoryInput,
} from '../../render/seriesFactory';
import type { PublishHandles } from './chartHandles';

/** What creation needs, read at the instant of the mount: the factory's input minus host and panes. */
export type ChartMountSpec = Omit<SeriesFactoryInput, 'host' | 'panes'>;

/** Positional, single caller, mount-only. See docs/explanation/react-surface.md#positional-not-an-options-object */
export function useChartMount(
  hostRef: RefObject<HTMLDivElement | null>,
  specRef: MutableRefObject<ChartMountSpec>,
  panesRef: MutableRefObject<readonly FactoryPaneView[]>,
  publish: PublishHandles,
  onHoveredTime: (time: number | null) => void,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const spec = specRef.current;

    const created = createChartSurface({ ...spec, host, panes: panesRef.current });
    const chart = created.chart;

    const onCrosshair = (param: { time?: unknown }): void => {
      onHoveredTime(typeof param.time === 'number' ? param.time : null);
    };
    chart.subscribeCrosshairMove(onCrosshair);

    publish(created);

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      created.series.clear();
      created.priceScales.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef, specRef, panesRef, publish, onHoveredTime]);
}
