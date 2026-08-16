/**
 * THE LEGEND THAT SUBSCRIBES TO THE CROSSHAIR. It composes and does not draw.
 * See docs/explanation/react-surface.md#why-the-legend-is-its-own-component
 */

import { useMemo, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

import type { Bar, PaneSpec } from '../../domain/types';
import { legendModel } from '../../layout/legendModel';
import type { PaneBox } from '../../layout/paneBoxes';
import { WorkspaceLegend, type LegendLine } from '../WorkspaceLegend';
import type { WorkspaceTheme } from '../theme';
import type { HoveredTimeStore } from './useSurfaceGeometry';
import type { ReadingsByPane } from './useSeriesData';

/** What the legend needs to know about a visible pane. */
export interface LegendPane {
  readonly spec: PaneSpec;
  readonly visible: boolean;
}

export interface SurfaceLegendProps {
  /** Where each pane sits: measured from the DOM when it exists, derived from layout when not. */
  readonly boxes: ReadonlyMap<string, PaneBox>;
  /** Omitted = no price drawn, and no price line. */
  readonly pricePane?: PaneSpec;
  readonly priceCaption?: string;
  readonly panes: readonly LegendPane[];
  readonly bars: readonly Bar[];
  readonly readings: ReadingsByPane;
  readonly upColor: string;
  readonly downColor: string;
  readonly theme: WorkspaceTheme;
  readonly testIdPrefix: string;
  /** The bar under the crosshair, as an external store. Subscribed HERE, and nowhere above. */
  readonly hovered: HoveredTimeStore;
}

export function SurfaceLegend({
  boxes,
  pricePane,
  priceCaption,
  panes,
  bars,
  readings,
  upColor,
  downColor,
  theme,
  testIdPrefix,
  hovered,
}: SurfaceLegendProps): ReactElement {
  // Server snapshot: with no DOM there is no crosshair, so the legend speaks for the last bar.
  const hoveredTime = useSyncExternalStore(hovered.subscribe, hovered.getSnapshot, () => null);

  /** Row index per bar time, so the crosshair's answer becomes a lookup instead of a scan. */
  const indexByTime = useMemo(() => {
    const index = new Map<number, number>();
    bars.forEach((bar, position) => {
      index.set(bar.time, position);
    });
    return index;
  }, [bars]);

  /** The bar the legend speaks for: the one under the crosshair, or the LAST one at rest.
   * See docs/explanation/react-surface.md#the-bar-the-legend-speaks-for */
  const readAt =
    hoveredTime === null ? bars.length - 1 : indexByTime.get(hoveredTime) ?? bars.length - 1;

  const lines = useMemo<LegendLine[]>(
    () =>
      legendModel({
        boxes,
        pricePane,
        priceCaption,
        panes,
        bars,
        readAt,
        readingsByPane: readings,
        upColor,
        downColor,
      }),
    [boxes, pricePane, priceCaption, panes, bars, readAt, readings, upColor, downColor],
  );

  return <WorkspaceLegend lines={lines} theme={theme} testIdPrefix={`${testIdPrefix}-legend`} />;
}
