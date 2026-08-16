/** How a pane and its series get assembled. See docs/explanation/catalogue.md#assembly-is-not-authorial */

import type { PaneSpec, SeriesSpec } from '../domain/types';
import { paneId, seriesId } from '../domain/types';

/** A series as the consumer writes it. See docs/explanation/catalogue.md#minting-the-brand */
export type SeriesDraft<TBinding> = Omit<SeriesSpec, 'id'> & {
  readonly id: string;
  readonly binding: TBinding;
};

/** The drawn spec and the consumer's payload, side by side and never merged. */
export interface BoundSeries<TBinding> {
  readonly spec: SeriesSpec;
  readonly binding: TBinding;
}

/** A pane as the consumer writes it. See docs/explanation/catalogue.md#format-arrives-resolved */
export type PaneDraft<TBinding> = Omit<PaneSpec, 'id' | 'series'> & {
  readonly id: string;
  readonly series: readonly SeriesDraft<TBinding>[];
};

export interface BoundPane<TBinding> {
  readonly spec: PaneSpec;
  readonly series: readonly BoundSeries<TBinding>[];
}

export function bindSeries<TBinding>(draft: SeriesDraft<TBinding>): BoundSeries<TBinding> {
  const { binding, ...spec } = draft;
  return { spec: { ...spec, id: seriesId(draft.id) }, binding };
}

/** `spec.series` is BUILT, not declared. See docs/explanation/catalogue.md#derived-so-the-two-cannot-drift */
export function bindPane<TBinding>(draft: PaneDraft<TBinding>): BoundPane<TBinding> {
  const { id, series: drafts, ...rest } = draft;
  const series = drafts.map(bindSeries);
  return {
    series,
    spec: { ...rest, id: paneId(id), series: series.map((bound) => bound.spec) },
  };
}
