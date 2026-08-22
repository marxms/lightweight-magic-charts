/**
 * The main canvas: the composed surface, plus the two bindings that feed it.
 *
 * IT RECEIVES THE GROUPS THE SURFACE ALREADY EXPOSES and hands them straight on. The flat
 * translation of twenty-one names that used to sit between host and surface is not recreated here —
 * what this region adds is the seed transaction that produces the bars and the attachment of the
 * fields drawn behind them, both of which the composition file above it used to own.
 */
import { memo, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import type { PriceScaleConvention } from '../../domain/types';
import type { ChartEngine } from '../../port/chartApi';
import { ChartSurface } from '../surface/ChartSurface';
import type {
  SurfaceAlerts,
  SurfaceAppearance,
  SurfaceData,
  SurfaceLabels,
  SurfaceLayout,
} from '../surface/ChartSurface';
import { useDrawingRail } from './DrawingRail';
import { useCandleLane } from '../useCandleLane';
import type { CandleLane, CandleLaneState } from '../useCandleLane';
import { useOverlayFields } from '../useOverlayFields';
import type { OverlayFields } from '../useOverlayFields';

export interface CanvasSurfaceProps {
  /** How to make a chart. The one value the port cannot carry. */
  readonly engine: ChartEngine;
  readonly convention: PriceScaleConvention;
  /** Everything the chart draws EXCEPT the bars: seeding those is this region's own work. */
  readonly data: Omit<SurfaceData, 'bars'>;
  readonly layout: SurfaceLayout;
  readonly a11y: SurfaceLabels;
  readonly appearance?: SurfaceAppearance;
  readonly alerts?: SurfaceAlerts;
  /** Which market, from which port, how deep. */
  readonly lane: CandleLane;
  /** The fields drawn behind the price action, minus the scale this region does not carry yet. */
  readonly fields?: Omit<OverlayFields, 'bars' | 'scale'>;
  /** How close a pointer has to come, in SCREEN pixels, before the magnet takes it. Absent is 8.
   * The MODE is not here: it is session state the library also writes, so it travels by context.
   * See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement */
  readonly snapThresholdPx?: number;
  /** What the seed decided, so the host can say it out loud instead of showing a short chart. */
  readonly onLane?: (state: CandleLaneState) => void;
}

const NO_FIELDS: Omit<OverlayFields, 'bars' | 'scale'> = {};

export const CanvasSurface = memo(function CanvasSurface({
  engine,
  convention,
  data,
  layout,
  a11y,
  appearance,
  alerts,
  lane,
  fields = NO_FIELDS,
  snapThresholdPx,
  onLane,
}: CanvasSurfaceProps): ReactElement {
  const drawing = useDrawingRail();
  const state = useCandleLane(lane);
  const { density, tuning, showDensity, showProfile } = fields;
  const overlays = useOverlayFields({ bars: state.bars, density, tuning, showDensity, showProfile });

  // By reference: a host writing the report inline hands over a new function on every render.
  const told = useRef(onLane);
  told.current = onLane;
  useEffect(() => {
    told.current?.(state);
  }, [state]);

  return (
    <ChartSurface
      engine={engine}
      convention={convention}
      data={{ ...data, bars: state.bars }}
      layout={layout}
      a11y={a11y}
      appearance={appearance}
      alerts={alerts}
      overlays={overlays}
      drawing={{
        binding: drawing.bind,
        activeTool: drawing.activeTool,
        magnet: drawing.magnet,
        snapThresholdPx,
        onCountChange: drawing.onCount,
        onToolFinished: () => drawing.arm(null),
      }}
    />
  );
});
