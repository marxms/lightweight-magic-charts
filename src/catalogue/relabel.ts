/**
 * A pane wearing the name — and the guide — of whatever study currently occupies it.
 * See docs/explanation/catalogue.md#relabelling-moves-only-labels
 */

import type { PaneSpec, SeriesSpec } from '../domain/types';

/** A drawn series bound to the field its numbers come from. */
export interface BoundSeries {
  readonly spec: SeriesSpec;
  readonly source: { readonly field: string };
}

export interface RelabellablePane {
  readonly spec: PaneSpec;
  readonly series: readonly BoundSeries[];
}

export function relabelled<P extends RelabellablePane>(
  pane: P,
  labels: ReadonlyMap<string, string>,
  title: string | null,
  guide?: number,
): P {
  const relabels = pane.series.some((bound) => labels.has(bound.source.field));
  if (title === null && !relabels && guide === undefined) return pane;
  const series = pane.series.map((bound) => {
    const label = labels.get(bound.source.field);
    return label === undefined ? bound : { ...bound, spec: { ...bound.spec, label } };
  });
  return {
    ...pane,
    series,
    spec: {
      ...pane.spec,
      title: title ?? pane.spec.title,
      ...(guide === undefined ? {} : { referenceLine: guide }),
      series: series.map((bound) => bound.spec),
    },
  } as P;
}
