/**
 * A list of chosen sources, resolved into drawable lines: lanes, surviving lines and legend names.
 * See docs/explanation/indicator.md#a-list-not-a-pool-of-slots
 */

import { seriesId } from '../domain/types';
import type { Bar, SeriesId } from '../domain/types';
import { lanePaneId, laneSeriesId, priceOverlaySeriesId } from '../catalogue/lanes';
import type { PlottedSeries, ResolutionPolicy, SourceLookup } from '../catalogue/sources';
import {
  alignReadings,
  availabilityOf,
  barPositions,
  firstReadingAt,
  median,
  onPriceScale,
} from './availability';
import type { IndicatorAvailability, Reading } from './availability';

/** One resolved source, as chrome needs to describe it. */
export interface ResolvedSourceView {
  /** The consumer's own identifier — it is what a remove control removes by. */
  readonly id: string;
  /** The lane it is being drawn in — DERIVED from list position, never stored. */
  readonly lane: number;
  readonly paneId: string;
  /** `null` = the lookup does not know this id (yet): chosen, but with no name to show. */
  readonly label: string | null;
  /** Drawn over the price action instead of in its own lane. MEASURED, not merely declared. */
  readonly overlay: boolean;
  /** Lines actually drawn. With `truncated` it forms the "4 of 7" a panel can show. */
  readonly drawn: number;
  /** Lines that did not fit the lane. Declared, never discarded in silence. */
  readonly truncated: number;
  /** The source's neutral guide, when it has a lane of its own to mark it against. */
  readonly guide?: number;
  readonly availability: IndicatorAvailability;
  /** Bars the warm-up consumes before the first reading. */
  readonly warmUpBars: number;
  /** Bars in the whole window, so a notice can say "724 of 800" instead of just "724". */
  readonly windowBars: number;
}

export interface SourceResolution {
  /** One per chosen source, in list order. Empty means none chosen — never "four free slots". */
  readonly views: readonly ResolvedSourceView[];
  /** Series identity -> the reading of each bar, positionally. */
  readonly readings: ReadonlyMap<SeriesId, readonly Reading[]>;
  /** Series identity -> the plot's title, so the legend names the SOURCE and not the lane. */
  readonly labels: ReadonlyMap<SeriesId, string>;
  /** Lanes with something to draw. A source drawn over the price lights no lane at all. */
  readonly activePaneIds: ReadonlySet<string>;
}

const EMPTY_READINGS: ReadonlyMap<SeriesId, readonly Reading[]> = new Map();
const EMPTY_LABELS: ReadonlyMap<SeriesId, string> = new Map();
const EMPTY_PANES: ReadonlySet<string> = new Set();

/** The chosen list, cleaned against the RESOURCE — duplicates out, excess cut from the end. */
export function laneOrder(active: readonly string[], lanes: number): readonly string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of active) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    if (ordered.length === lanes) break;
  }
  return ordered;
}

export function resolveSources(
  active: readonly string[],
  lookup: SourceLookup,
  bars: readonly Bar[],
  policy: ResolutionPolicy,
): SourceResolution {
  const ordered = laneOrder(active, policy.lanes);

  // No grid without bars — the LIST is still the list. See docs/explanation/indicator.md#no-bars-still-a-list
  if (bars.length === 0) {
    return {
      views: ordered.map((id, lane) => {
        const source = lookup(id);
        return {
          id,
          lane,
          paneId: lanePaneId(lane),
          label: source?.label ?? null,
          overlay: source?.placement === 'over-price',
          drawn: 0,
          truncated: 0,
          // Nothing was MEASURED, so nothing is asserted: `'ok'` is the absence of a diagnosis.
          availability: 'ok',
          warmUpBars: 0,
          windowBars: 0,
        };
      }),
      readings: EMPTY_READINGS,
      labels: EMPTY_LABELS,
      activePaneIds: EMPTY_PANES,
    };
  }

  const positionOf = barPositions(bars);
  const readings = new Map<SeriesId, readonly Reading[]>();
  const labels = new Map<SeriesId, string>();
  const activePaneIds = new Set<string>();
  /** The price level of this window, against which a declared overlay's scale is measured. */
  const priceMid = median(bars.map((bar) => bar.close));

  const views = ordered.map((id, lane): ResolvedSourceView => {
    const paneId = lanePaneId(lane);
    const source = lookup(id);
    const unknown = { id, lane, paneId, drawn: 0, truncated: 0, warmUpBars: 0, windowBars: bars.length } as const;
    if (source === undefined) {
      return { ...unknown, label: null, overlay: false, availability: 'empty' };
    }

    let plots: readonly PlottedSeries[] = [];
    try {
      plots = source.series();
    } catch {
      // A third-party computation that throws must cost THIS source and nothing else.
      return { ...unknown, label: source.label, overlay: source.placement === 'over-price', availability: 'empty' };
    }

    // A DEAD LINE OCCUPIES NEITHER LANE NOR LEGEND. See docs/explanation/indicator.md#a-dead-line-draws-nothing
    const computed = plots.map((plot) => {
      try {
        return { plot, values: alignReadings(plot.provider.compute(bars), positionOf, bars.length) };
      } catch {
        return { plot, values: null };
      }
    });
    const alive = computed.flatMap((item) =>
      item.values?.some((value) => value !== null) === true ? [{ ...item, values: item.values }] : [],
    );
    const drawn = alive.slice(0, policy.plotsPerLane);

    // The placement is a REQUEST; the scale is the FACT. See docs/explanation/indicator.md#the-scale-is-the-fact
    const offScale =
      source.placement === 'over-price' && priceMid > 0
        ? alive.filter((item) => !onPriceScale(item.values, priceMid, policy.priceNeighbourhood)).length
        : 0;
    const overlay = source.placement === 'over-price' && offScale * 2 <= alive.length;

    const fieldOf = (plot: number): SeriesId =>
      seriesId(overlay ? priceOverlaySeriesId(lane, plot) : laneSeriesId(lane, plot));

    drawn.forEach((item, at) => {
      const field = fieldOf(at);
      labels.set(field, item.plot.spec.label);
      readings.set(field, item.values);
    });

    if (!overlay && drawn.length > 0) activePaneIds.add(paneId);

    // The lines that exist stay drawn even at `'warmup'`: real measurements are not rubbish.
    const warmUpBars = firstReadingAt(
      drawn.map((item) => item.values),
      bars.length,
    );

    return {
      id,
      lane,
      paneId,
      label: source.label,
      overlay,
      drawn: drawn.length,
      truncated: alive.length - drawn.length,
      // A guide only means anything against the source's OWN axis.
      ...(overlay || source.guide === undefined ? {} : { guide: source.guide }),
      availability: availabilityOf(drawn.length, warmUpBars, bars.length, policy.warmUpShare),
      warmUpBars,
      windowBars: bars.length,
    };
  });

  return { views, readings, labels, activePaneIds };
}
